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
from datetime import date
from pathlib import Path

from .tool_defs import TOOL_DEFS
from .tools import execute_tool, openai_tools


class ExecutorError(Exception):
    pass


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

def _parse_model(model_str: str) -> tuple[str, str]:
    """Return (provider, model_name) from model string."""
    if ":" in model_str:
        provider, name = model_str.split(":", 1)
        if provider in (
            "ollama", "claude", "claude_cli",
            "lm_studio", "openrouter", "openai",
            "kaisho",
        ):
            return provider, name
    return "ollama", model_str


# ---------------------------------------------------------------------------
# Agentic loop helpers
# ---------------------------------------------------------------------------

def _http_post(url: str, payload: bytes, headers: dict) -> dict:
    """POST JSON and return parsed response."""
    import urllib.request
    req = urllib.request.Request(
        url, data=payload, headers=headers,
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read())


MAX_TOOL_ITERATIONS = 30

# Tools that modify data — limited to prevent runaway writes
_WRITE_TOOLS = {
    "capture_inbox", "add_task", "move_task",
    "update_task", "set_task_tags",
    "start_clock", "stop_clock", "quick_book",
    "write_kb_file",
}
MAX_WRITES_PER_RUN = 3

_state = {"writes": 0}


def _reset_write_counter():
    _state["writes"] = 0


def _execute_tool_calls(
    tool_calls: list[dict], include_id: bool = True,
) -> list[dict]:
    """Execute tool calls and return tool-result messages."""
    results = []
    for call in tool_calls:
        fn = call.get("function", {})
        name = fn.get("name", "")
        if name in _WRITE_TOOLS:
            _state["writes"] += 1
            if _state["writes"] > MAX_WRITES_PER_RUN:
                result = {
                    "error": (
                        f"Write limit reached "
                        f"({MAX_WRITES_PER_RUN} per run)"
                    ),
                }
            else:
                result = execute_tool(
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


def _extract_claude_text(content) -> str:
    """Extract text from Claude response content blocks."""
    for block in content:
        if hasattr(block, "text"):
            return block.text
    return ""


# ---------------------------------------------------------------------------
# Claude agentic loop
# ---------------------------------------------------------------------------

def _execute_tool_block(name: str, input_data: dict) -> dict:
    """Execute a single tool call, enforcing write limits."""
    if name in _WRITE_TOOLS:
        _state["writes"] += 1
        if _state["writes"] > MAX_WRITES_PER_RUN:
            return {"error": "Write limit reached"}
    return execute_tool(name, input_data)


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
            tools=TOOL_DEFS,
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
) -> str:
    """Run an agentic Ollama session with tools.

    Supports Ollama Cloud via the api_key parameter.
    """
    _reset_write_counter()
    tools = openai_tools()
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
            data = _http_post(url, payload, headers)
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
    tools = openai_tools()
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

def _inject_context(prompt: str) -> str:
    """Prepend business data context to a prompt.

    Claude CLI runs in a sandbox and cannot read org
    files directly. This injects the current state of
    tasks, clocks, customers, and inbox so the prompt
    has all the data it needs.
    """
    from ..backends import get_backend
    from ..services.advisor import (
        _format_budgets,
        _format_clocks,
        _format_tasks,
    )
    from datetime import datetime, timezone

    backend = get_backend()
    now = datetime.now(timezone.utc).strftime(
        "%Y-%m-%d %H:%M UTC"
    )
    tasks = backend.tasks.list_tasks(include_done=True)
    clocks = backend.clocks.list_entries(period="week")
    customers = backend.customers.get_budget_summary()

    context = (
        f"# Current Data ({now})\n\n"
        f"## Tasks\n{_format_tasks(tasks)}\n\n"
        f"## Clock Entries (This Week)\n"
        f"{_format_clocks(clocks)}\n\n"
        f"## Customer Budgets\n"
        f"{_format_budgets(customers)}\n\n"
        f"---\n\n"
    )
    return context + prompt


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
            return f"Ollama not reachable at {ollama_base_url}"

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
            cloud_ai_complete,
        )
        resp = cloud_ai_complete(
            cloud_url, cloud_api_key,
            system=(
                "You are the Kaisho AI advisor. "
                "Answer based on the context in the "
                "prompt. Be concise and actionable."
            ),
            messages=[{
                "role": "user",
                "content": prompt,
            }],
            max_tokens=4096,
        )
        return resp.get("text", "")
    if provider == "claude_cli":
        return _run_claude_cli(
            model_name,
            _inject_context(prompt),
            timeout=timeout,
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
    # Default: Ollama
    return run_prompt_ollama(
        model_name, prompt, ollama_base_url, ollama_api_key,
    )


def execute_job(
    job: dict,
    project_root: Path,
    ollama_base_url: str,
    ollama_api_key: str = "",
    lm_studio_base_url: str = "",
    claude_api_key: str = "",
    openrouter_base_url: str = "",
    openrouter_api_key: str = "",
    openai_base_url: str = "",
    openai_api_key: str = "",
    cloud_url: str = "",
    cloud_api_key: str = "",
    use_cloud_ai: bool = False,
) -> str:
    """Run a cron job end-to-end and return the output.

    When ``use_cloud_ai`` is True globally *and* the job
    has ``use_kaisho_ai`` enabled, AI requests route
    through the kaisho-cloud gateway. Jobs without this
    flag always use their configured local model.
    """
    prompt = load_prompt(
        job["prompt_file"], project_root,
    )

    # Per-job Kaisho AI: only route through the cloud
    # when both the global toggle and the job flag are on.
    job_wants_kaisho = job.get("use_kaisho_ai", False)
    if (
        job_wants_kaisho
        and use_cloud_ai
        and cloud_url
        and cloud_api_key
    ):
        provider = "kaisho"
        model_name = ""
    else:
        err = verify_model(
            job.get("model", ""),
            ollama_base_url=ollama_base_url,
            lm_studio_base_url=lm_studio_base_url,
            claude_api_key=claude_api_key,
            openrouter_api_key=openrouter_api_key,
            openai_api_key=openai_api_key,
        )
        if err:
            raise ExecutorError(
                f"Model not accessible: {err}",
            )
        provider, model_name = _parse_model(
            job.get("model", ""),
        )

    output_text = _dispatch_prompt(
        provider, model_name, prompt,
        timeout=job.get("timeout", 300),
        claude_api_key=claude_api_key,
        ollama_base_url=ollama_base_url,
        ollama_api_key=ollama_api_key,
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
