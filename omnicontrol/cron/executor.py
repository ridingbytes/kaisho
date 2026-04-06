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

from .tools import TOOL_DEFS, execute_tool, openai_tools


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
                    "User-Agent": "omnicontrol-cron/1.0",
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
        except Exception as exc:
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
    """Write cron output to the active backend's inbox.

    output_dest: "inbox" or a KB source label. All outputs go
    to inbox via the backend (respects org/markdown/json).
    """
    from ..backends import get_backend

    # Always create an inbox item via the active backend
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


def _execute_tool_calls(
    tool_calls: list[dict], include_id: bool = True,
) -> list[dict]:
    """Execute tool calls and return tool-result messages."""
    results = []
    for call in tool_calls:
        fn = call.get("function", {})
        result = execute_tool(
            fn.get("name", ""),
            fn.get("arguments", {}),
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

def run_prompt_claude(
    model: str, prompt: str, api_key: str = ""
) -> str:
    """Run an agentic Claude session with tools."""
    try:
        import anthropic
    except ImportError as exc:
        raise ExecutorError(
            "anthropic package not installed"
        ) from exc

    client = anthropic.Anthropic(api_key=api_key or None)
    messages: list[dict] = [
        {"role": "user", "content": prompt},
    ]

    while True:
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
        tool_results = []
        for block in resp.content:
            if block.type != "tool_use":
                continue
            result = execute_tool(block.name, block.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": json.dumps(result, default=str),
            })
        if not tool_results:
            return _extract_claude_text(resp.content)
        messages.append({
            "role": "user", "content": tool_results,
        })


# ---------------------------------------------------------------------------
# Ollama agentic loop  (uses /api/chat with tools)
# ---------------------------------------------------------------------------

def run_prompt_ollama(
    model: str, prompt: str, base_url: str,
) -> str:
    """Run an agentic Ollama session with tools."""
    tools = openai_tools()
    messages: list[dict] = [
        {"role": "user", "content": prompt},
    ]
    url = base_url.rstrip("/") + "/api/chat"
    headers = {"Content-Type": "application/json"}

    while True:
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "tools": tools,
            "stream": False,
        }).encode()
        try:
            data = _http_post(url, payload, headers)
        except Exception as exc:
            raise ExecutorError(
                f"Ollama request failed: {exc}"
            ) from exc

        msg = data.get("message", {})
        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            return msg.get("content", "")

        messages.append(msg)
        messages.extend(
            _execute_tool_calls(tool_calls, include_id=False)
        )


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

    while True:
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "tools": tools,
        }).encode()
        try:
            data = _http_post(url, payload, headers)
        except Exception as exc:
            raise ExecutorError(
                f"Request to {base_url} failed: {exc}"
            ) from exc

        msg = data["choices"][0]["message"]
        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            return msg.get("content", "")

        messages.append(msg)
        messages.extend(
            _execute_tool_calls(tool_calls, include_id=True)
        )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def _run_claude_cli(model: str, prompt: str) -> str:
    """Call Claude CLI using subscription login token."""
    import shutil
    import subprocess

    claude_bin = shutil.which("claude")
    if not claude_bin:
        raise ExecutorError("claude CLI not found")
    result = subprocess.run(
        [claude_bin, "-p", "-", "--model", model],
        input=prompt,
        capture_output=True, text=True, timeout=300,
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
        except Exception:
            return f"Ollama not reachable at {ollama_base_url}"

    if provider == "lm_studio":
        if not lm_studio_base_url:
            return "LM Studio URL not configured"
        url = lm_studio_base_url.rstrip("/") + "/v1/models"
        try:
            with urllib.request.urlopen(url, timeout=3):
                return None
        except Exception:
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


def execute_job(
    job: dict,
    project_root: Path,
    ollama_base_url: str,
    lm_studio_base_url: str = "",
    claude_api_key: str = "",
    openrouter_base_url: str = "",
    openrouter_api_key: str = "",
    openai_base_url: str = "",
    openai_api_key: str = "",
) -> str:
    """Run a job definition end-to-end. Returns the output text."""
    # Verify model is accessible
    err = verify_model(
        job.get("model", ""),
        ollama_base_url=ollama_base_url,
        lm_studio_base_url=lm_studio_base_url,
        claude_api_key=claude_api_key,
        openrouter_api_key=openrouter_api_key,
        openai_api_key=openai_api_key,
    )
    if err:
        raise ExecutorError(f"Model not accessible: {err}")
    prompt = load_prompt(job["prompt_file"], project_root)
    provider, model_name = _parse_model(job.get("model", ""))
    if provider == "claude_cli":
        output_text = _run_claude_cli(model_name, prompt)
    elif provider == "claude":
        output_text = run_prompt_claude(
            model_name, prompt, api_key=claude_api_key,
        )
    elif provider == "lm_studio":
        url = lm_studio_base_url.rstrip("/") + "/v1"
        output_text = run_prompt_openai_compatible(
            model_name, prompt, url,
        )
    elif provider in ("openrouter", "openai"):
        base = (
            openrouter_base_url if provider == "openrouter"
            else openai_base_url
        )
        key = (
            openrouter_api_key if provider == "openrouter"
            else openai_api_key
        )
        output_text = run_prompt_openai_compatible(
            model_name, prompt, base, key,
        )
    else:
        output_text = run_prompt_ollama(
            model_name, prompt, ollama_base_url,
        )
    write_output(
        job.get("output", "inbox"),
        output_text,
        job_name=job.get("name", "AI Report"),
    )
    return output_text
