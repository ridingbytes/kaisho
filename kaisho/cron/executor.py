"""Job executor.

Resolves the prompt file, calls the configured model inside an agentic
loop (tool calling), and writes output to the configured destination.

Model string format:
  "ollama:<model>"     -- call local Ollama instance
  "claude:<model>"     -- call Anthropic API via anthropic package
  "lm_studio:<model>"  -- call LM Studio (OpenAI-compatible)
  "<model>"            -- treated as Ollama model

The executor passes a set of tools (list/add tasks, inbox, clocks, …)
to models that support tool calling so that jobs can read and write
app data autonomously.
"""
import json
import logging
import threading
from datetime import date
from pathlib import Path

from ..ai_utils import (
    extract_claude_text as _extract_claude_text,
    http_post as _http_post,
    parse_model as _parse_model,
)
from .tool_defs import TOOL_DEFS  # noqa: F401 — used by external imports
from .tools import (
    cron_safe_tool_defs,
    cron_safe_tools,
    execute_tool,
)

log = logging.getLogger(__name__)


class ExecutorError(Exception):
    pass


def resolve_model_label(job: dict) -> str:
    """Return the model identifier this job will run with.

    Now a thin pass-through: the job's ``model`` field is
    the single source of truth. To use Kaisho AI for a
    cron job, set ``model: kaisho:cron`` in the job
    definition.
    """
    return job.get("model", "")


# ---------------------------------------------------------------------------
# Prompt loading
# ---------------------------------------------------------------------------

def _resolve_path(path_str: str) -> Path:
    """Expand ~ and env vars, return absolute Path."""
    return Path(path_str).expanduser().resolve()


def load_prompt(prompt_file: str, project_root: Path) -> str:
    """Read prompt file, resolve relative to project root.

    Supports YAML frontmatter with a ``fetch`` key listing URLs
    to pre-fetch. The fetched content is injected as
    ``{fetch_results}`` into the prompt body::

        ---
        fetch:
          - https://hn.algolia.com/api/v1/search_by_date?...
          - https://example.com/data.json
        ---
        Analyze the following data:
        {fetch_results}
    """
    import yaml as _yaml
    p = Path(prompt_file)
    if not p.is_absolute():
        p = project_root / p
    p = p.expanduser()
    if not p.exists():
        raise ExecutorError(f"prompt file not found: {p}")
    raw = p.read_text(encoding="utf-8")

    # Parse optional YAML frontmatter
    body = raw
    urls: list[str] = []
    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) >= 3:
            try:
                fm = _yaml.safe_load(parts[1]) or {}
                urls = fm.get("fetch", [])
                body = parts[2].strip()
            except _yaml.YAMLError:
                pass

    # Pre-fetch URLs
    if urls:
        fetch_results = _prefetch_urls(urls)
        body = body.replace("{fetch_results}", fetch_results)

    # Replace {date} placeholder
    today = date.today().isoformat()
    body = body.replace("{date}", today)
    return body


def _prefetch_urls(urls: list[str]) -> str:
    """Fetch each URL and return combined content."""
    import urllib.request
    from .tools import _is_domain_allowed, _extract_domain

    parts = []
    for url in urls:
        domain = _extract_domain(url)
        if not _is_domain_allowed(domain):
            parts.append(
                f"--- {url} ---\n"
                f"[BLOCKED: domain '{domain}' not in URL "
                f"allowlist. Add it in Settings > AI > "
                f"URL Allowlist]\n"
            )
            continue
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "kaisho-cron/1.0",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(
                req, timeout=15
            ) as resp:
                raw = resp.read(100_000)
                charset = (
                    resp.headers.get_content_charset()
                    or "utf-8"
                )
                text = raw.decode(charset, errors="replace")
            parts.append(f"--- {url} ---\n{text}\n")
        except (OSError, ValueError) as exc:
            parts.append(
                f"--- {url} ---\n[ERROR: {exc}]\n"
            )
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Output destination
# ---------------------------------------------------------------------------

def _render_output_path(output: str) -> str:
    """Replace {date} placeholder with today's ISO date."""
    today = date.today().isoformat()
    return output.replace("{date}", today)


def write_output(
    output_dest: str,
    content: str,
    job_name: str = "AI Report",
) -> None:
    """Write cron output to the configured destination.

    output_dest:
      "none"  — keep output in history only, write nowhere
      "inbox" — create an inbox item
      <label> — create an inbox item AND append to KB source
    """
    if output_dest == "none":
        return

    from ..backends import get_backend

    get_backend().inbox.add_item(
        text=job_name,
        item_type="AI",
        body=content.strip(),
        channel="cron",
        direction="in",
    )

    # Optionally also write to a KB source
    if output_dest and output_dest != "inbox":
        from ..config import get_config
        from ..services.settings import (
            get_kb_sources, load_settings,
        )
        from ..services import knowledge as kb_svc
        cfg = get_config()
        data = load_settings(cfg.SETTINGS_FILE)
        sources = get_kb_sources(data, cfg)
        labels = {s["label"] for s in sources}
        if output_dest in labels:
            today = date.today().isoformat()
            slug = (
                job_name.lower()
                .replace(" ", "-")
                .replace("/", "-")
            )
            filename = f"{today}-{slug}.md"
            kb_svc.write_file(
                sources, output_dest, filename, content,
            )


# ---------------------------------------------------------------------------
# Model dispatch
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Agentic loop helpers
# ---------------------------------------------------------------------------


MAX_TOOL_ITERATIONS = 30

# Tools that modify data — limited to prevent runaway writes
_WRITE_TOOLS = {
    "add_inbox_item", "add_task", "move_task",
    "update_task", "set_task_tags",
    "start_clock", "stop_clock", "book_time",
    "write_kb_file", "add_note", "update_note",
    "update_clock_entry", "batch_invoice",
    "create_skill", "approve_url_domain",
    "create_backup", "trigger_cron_job",
}
MAX_WRITES_PER_RUN = 3

# Per-thread write counter. Each cron run lives in its
# own thread (scheduler firing OR the advisor's
# trigger_cron_job spawning a daemon thread), so a
# threading.local() gives each run an isolated counter
# without explicit plumbing through every helper. Avoids
# the previous module-global race where a concurrent run
# could reset or inflate another's count.
_thread_state = threading.local()


def _writes_count() -> int:
    return getattr(_thread_state, "writes", 0)


def _reset_write_counter():
    _thread_state.writes = 0


def _bump_write(name: str) -> dict | None:
    """Increment the per-run write counter and return an
    error dict when the cap is exceeded, else None."""
    _thread_state.writes = _writes_count() + 1
    if _thread_state.writes > MAX_WRITES_PER_RUN:
        return {
            "error": (
                f"Write limit reached "
                f"({MAX_WRITES_PER_RUN} per run)"
            ),
        }
    return None


def _execute_tool_calls(
    tool_calls: list[dict], include_id: bool = True,
) -> list[dict]:
    """Execute tool calls and return tool-result messages."""
    results = []
    for call in tool_calls:
        fn = call.get("function", {})
        name = fn.get("name", "")
        if name in _WRITE_TOOLS:
            limit_err = _bump_write(name)
            result = limit_err or execute_tool(
                name, fn.get("arguments", {}),
            )
        else:
            result = execute_tool(
                name, fn.get("arguments", {}),
            )
        msg: dict = {
            "role": "tool",
            "content": json.dumps(result, default=str),
        }
        if include_id:
            msg["tool_call_id"] = call.get("id", "")
        results.append(msg)
    return results


# ---------------------------------------------------------------------------
# Claude agentic loop
# ---------------------------------------------------------------------------


def _execute_tool_block(name: str, input_data: dict) -> dict:
    """Execute a single tool call, enforcing write limits."""
    if name in _WRITE_TOOLS:
        limit_err = _bump_write(name)
        if limit_err:
            return limit_err
    return execute_tool(name, input_data)


def _bounded_execute(name: str, args) -> dict:
    """Tool executor that honors the per-run write cap.

    Used by the kaisho-cloud agentic path
    (cloud_ai_agentic) which invokes tool_executor
    directly without going through _execute_tool_calls /
    _execute_tool_block. Without this wrapper, cloud cron
    would be silently uncapped — fine today (cron tools
    are read-only) but a latent footgun if the allowlist
    grows.
    """
    if name in _WRITE_TOOLS:
        limit_err = _bump_write(name)
        if limit_err:
            return limit_err
    return execute_tool(name, args)


def _collect_tool_results(content) -> list[dict]:
    """Process tool_use blocks from a Claude response.

    Returns a list of tool_result dicts to send back,
    or an empty list if no tool calls were found.
    """
    results = []
    for block in content:
        if block.type != "tool_use":
            continue
        result = _execute_tool_block(
            block.name, block.input,
        )
        results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": json.dumps(
                result, default=str,
            ),
        })
    return results


def run_prompt_claude(
    model: str, prompt: str, api_key: str = "",
) -> str:
    """Run an agentic Claude session with tools."""
    _reset_write_counter()
    try:
        import anthropic
    except ImportError as exc:
        raise ExecutorError(
            "anthropic package not installed",
        ) from exc

    client = anthropic.Anthropic(api_key=api_key or None)
    messages: list[dict] = [
        {"role": "user", "content": prompt},
    ]

    for _ in range(MAX_TOOL_ITERATIONS):
        resp = client.messages.create(
            model=model,
            max_tokens=4096,
            tools=cron_safe_tool_defs(),
            messages=messages,
        )

        if resp.stop_reason == "end_turn":
            return _extract_claude_text(resp.content)

        messages.append({
            "role": "assistant",
            "content": resp.content,
        })
        tool_results = _collect_tool_results(
            resp.content,
        )
        if not tool_results:
            return _extract_claude_text(resp.content)
        messages.append({
            "role": "user", "content": tool_results,
        })
    return _extract_claude_text(resp.content)


# ---------------------------------------------------------------------------
# Ollama agentic loop  (uses /api/chat with tools)
# ---------------------------------------------------------------------------

def run_prompt_ollama(
    model: str, prompt: str, base_url: str,
    api_key: str = "",
    timeout: int = 600,
) -> str:
    """Run an agentic Ollama session with tools.

    Supports Ollama Cloud via the api_key parameter. The
    ``timeout`` is per HTTP turn; an agentic run may make
    several calls and total wall time can exceed it.
    """
    _reset_write_counter()
    tools = cron_safe_tools()
    messages: list[dict] = [
        {"role": "user", "content": prompt},
    ]
    url = base_url.rstrip("/") + "/api/chat"
    headers: dict[str, str] = {
        "Content-Type": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    for _ in range(MAX_TOOL_ITERATIONS):
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "tools": tools,
            "stream": False,
        }).encode()
        try:
            data = _http_post(
                url, payload, headers, timeout=timeout,
            )
        except (OSError, ValueError) as exc:
            raise ExecutorError(
                f"Ollama request failed: {exc}"
            ) from exc

        msg = data.get("message", {})
        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            return msg.get("content", "")

        messages.append(msg)
        messages.extend(
            _execute_tool_calls(
                tool_calls, include_id=False,
            )
        )
    return messages[-1].get("content", "")


# ---------------------------------------------------------------------------
# OpenAI-compatible agentic loop (LM Studio, OpenRouter, OpenAI)
# ---------------------------------------------------------------------------

def run_prompt_openai_compatible(
    model: str,
    prompt: str,
    base_url: str,
    api_key: str = "",
) -> str:
    """Run an agentic OpenAI-compatible session with tools."""
    _reset_write_counter()
    tools = cron_safe_tools()
    messages: list[dict] = [
        {"role": "user", "content": prompt},
    ]
    url = base_url.rstrip("/") + "/chat/completions"
    headers: dict[str, str] = {
        "Content-Type": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    for _ in range(MAX_TOOL_ITERATIONS):
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "tools": tools,
        }).encode()
        try:
            data = _http_post(url, payload, headers)
        except (OSError, ValueError) as exc:
            raise ExecutorError(
                f"Request to {base_url} failed: {exc}"
            ) from exc

        msg = data["choices"][0]["message"]
        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            return msg.get("content", "")

        messages.append(msg)
        messages.extend(
            _execute_tool_calls(
                tool_calls, include_id=True,
            )
        )
    return messages[-1].get("content", "")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def _run_claude_cli(
    model: str, prompt: str, timeout: int = 300,
) -> str:
    """Call Claude CLI (no tool calling support).

    Since April 2025, Claude CLI subscription does not
    support tool calls without extra usage. Jobs using
    claude_cli run as simple prompt-in/text-out.
    """
    import shutil
    import subprocess

    claude_bin = shutil.which("claude")
    if not claude_bin:
        raise ExecutorError("claude CLI not found")
    result = subprocess.run(
        [claude_bin, "-p", "-", "--model", model],
        input=prompt,
        capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode != 0:
        raise ExecutorError(
            f"Claude CLI failed: {result.stderr.strip()}"
        )
    return result.stdout.strip()


def verify_model(
    model_str: str,
    ollama_base_url: str = "",
    ollama_cloud_url: str = "",
    ollama_cloud_api_key: str = "",
    lm_studio_base_url: str = "",
    claude_api_key: str = "",
    openrouter_api_key: str = "",
    openai_api_key: str = "",
) -> str | None:
    """Check if the model provider is reachable.

    Returns None if OK, or an error message string.
    """
    import shutil
    import urllib.request

    provider, _name = _parse_model(model_str)

    if provider == "ollama":
        url = ollama_base_url.rstrip("/") + "/api/tags"
        try:
            with urllib.request.urlopen(url, timeout=3):
                return None
        except (urllib.error.URLError, OSError):
            return (
                f"Ollama not reachable at "
                f"{ollama_base_url}"
            )

    if provider == "ollama_cloud":
        if not ollama_cloud_url:
            return "Ollama Cloud URL not configured"
        if not ollama_cloud_api_key:
            return "Ollama Cloud API key not configured"
        return None

    if provider == "lm_studio":
        if not lm_studio_base_url:
            return "LM Studio URL not configured"
        url = lm_studio_base_url.rstrip("/") + "/v1/models"
        try:
            with urllib.request.urlopen(url, timeout=3):
                return None
        except (urllib.error.URLError, OSError):
            return (
                f"LM Studio not reachable at "
                f"{lm_studio_base_url}"
            )

    if provider == "claude_cli":
        if not shutil.which("claude"):
            return "Claude CLI not installed"
        return None

    if provider == "claude":
        if not claude_api_key:
            return "Claude API key not configured"
        return None

    if provider == "openrouter":
        if not openrouter_api_key:
            return "OpenRouter API key not configured"
        return None

    if provider == "openai":
        if not openai_api_key:
            return "OpenAI API key not configured"
        return None

    return f"Unknown provider: {provider}"


def _dispatch_prompt(
    provider: str,
    model_name: str,
    prompt: str,
    timeout: int = 300,
    claude_api_key: str = "",
    ollama_base_url: str = "",
    ollama_api_key: str = "",
    ollama_cloud_url: str = "",
    ollama_cloud_api_key: str = "",
    lm_studio_base_url: str = "",
    openrouter_base_url: str = "",
    openrouter_api_key: str = "",
    openai_base_url: str = "",
    openai_api_key: str = "",
    cloud_url: str = "",
    cloud_api_key: str = "",
) -> str:
    """Route a prompt to the correct AI provider.

    The ``cloud`` provider sends the prompt through the
    kaisho-cloud AI gateway (``POST /ai/complete``),
    which proxies to Claude and meters usage against
    the user's sync_ai quota.
    """
    if provider == "kaisho":
        from ..services.cloud_sync import (
            cloud_ai_agentic,
        )
        # Run an agentic loop so cron prompts that need
        # tools (transcribe_youtube, fetch_url, etc.) work
        # via the cloud gateway. Prompts that don't call
        # tools terminate after one turn — same wire cost
        # as cloud_ai_complete used to be.
        #
        # The tool executor goes through _bounded_execute
        # so the per-run write cap (MAX_WRITES_PER_RUN)
        # applies on the cloud path too. Today this is
        # belt-and-braces — cron_safe_tools is read-only
        # — but if the allowlist ever expands the cap
        # already covers it.
        _reset_write_counter()
        return cloud_ai_agentic(
            cloud_url=cloud_url,
            api_key=cloud_api_key,
            system=(
                "You are the Kaisho AI cron advisor. "
                "Generate a concise, actionable report "
                "based on the Kaisho Context block at "
                "the top of the prompt (when present). "
                "Use the provided tools only if the "
                "prompt explicitly instructs you to "
                "fetch additional data."
            ),
            prompt=prompt,
            tools=cron_safe_tools(),
            tool_executor=_bounded_execute,
            max_tokens=4096,
            mode=model_name or "cron",
        )
    if provider == "claude_cli":
        # Context (when enabled by inject_context) is
        # already prepended by execute_job — no need to
        # double-wrap here.
        return _run_claude_cli(
            model_name, prompt, timeout=timeout,
        )
    if provider == "claude":
        return run_prompt_claude(
            model_name, prompt, api_key=claude_api_key,
        )
    if provider == "lm_studio":
        url = lm_studio_base_url.rstrip("/") + "/v1"
        return run_prompt_openai_compatible(
            model_name, prompt, url,
        )
    if provider in ("openrouter", "openai"):
        base = (
            openrouter_base_url
            if provider == "openrouter"
            else openai_base_url
        )
        key = (
            openrouter_api_key
            if provider == "openrouter"
            else openai_api_key
        )
        return run_prompt_openai_compatible(
            model_name, prompt, base, key,
        )
    if provider == "ollama_cloud":
        return run_prompt_ollama(
            model_name, prompt,
            ollama_cloud_url, ollama_cloud_api_key,
            timeout=timeout,
        )
    # Default: local Ollama
    return run_prompt_ollama(
        model_name, prompt,
        ollama_base_url, ollama_api_key,
        timeout=timeout,
    )


def execute_job(
    job: dict,
    project_root: Path,
    ollama_base_url: str,
    ollama_api_key: str = "",
    ollama_cloud_url: str = "",
    ollama_cloud_api_key: str = "",
    lm_studio_base_url: str = "",
    claude_api_key: str = "",
    openrouter_base_url: str = "",
    openrouter_api_key: str = "",
    openai_base_url: str = "",
    openai_api_key: str = "",
    cloud_url: str = "",
    cloud_api_key: str = "",
) -> str:
    """Run a cron job end-to-end and return the output.

    The job's ``model`` field is the single source of
    truth — including ``kaisho:cron`` to route through
    the Kaisho AI cloud gateway.
    """
    prompt = load_prompt(
        job["prompt_file"], project_root,
    )

    # Pre-fetch local Kaisho data (tasks, inbox, time
    # insights, customer budgets) and prepend as a markdown
    # block. Opt-in per job — only the briefing/summary
    # templates need it. News/research templates (HN
    # digest, weekly-scout) wouldn't use it anyway, and
    # injecting it ships customer/budget data to the
    # upstream LLM provider unnecessarily.
    #
    # Default true preserves existing user behavior; new
    # templates set inject_context: false explicitly.
    if job.get("inject_context", True):
        from .context import build_cron_context
        try:
            context_block = build_cron_context()
            prompt = (
                context_block + "\n\n---\n\n" + prompt
            )
        except Exception as exc:  # noqa: BLE001
            # Don't kill the run if context-building hits
            # a transient backend error. Log and continue
            # with the raw prompt body.
            log.warning(
                "build_cron_context failed: %s", exc,
            )

    model_str = job.get("model", "")
    provider, model_name = _parse_model(model_str)
    if provider != "kaisho":
        err = verify_model(
            model_str,
            ollama_base_url=ollama_base_url,
            ollama_cloud_url=ollama_cloud_url,
            ollama_cloud_api_key=ollama_cloud_api_key,
            lm_studio_base_url=lm_studio_base_url,
            claude_api_key=claude_api_key,
            openrouter_api_key=openrouter_api_key,
            openai_api_key=openai_api_key,
        )
        if err:
            raise ExecutorError(
                f"Model not accessible: {err}",
            )
    elif not (cloud_url and cloud_api_key):
        raise ExecutorError(
            "Kaisho AI requires a connected Sync+AI plan",
        )

    output_text = _dispatch_prompt(
        provider, model_name, prompt,
        timeout=job.get("timeout", 300),
        claude_api_key=claude_api_key,
        ollama_base_url=ollama_base_url,
        ollama_api_key=ollama_api_key,
        ollama_cloud_url=ollama_cloud_url,
        ollama_cloud_api_key=ollama_cloud_api_key,
        lm_studio_base_url=lm_studio_base_url,
        openrouter_base_url=openrouter_base_url,
        openrouter_api_key=openrouter_api_key,
        openai_base_url=openai_base_url,
        openai_api_key=openai_api_key,
        cloud_url=cloud_url,
        cloud_api_key=cloud_api_key,
    )

    write_output(
        job.get("output", "inbox"),
        output_text,
        job_name=job.get("name", "AI Report"),
    )
    return output_text
