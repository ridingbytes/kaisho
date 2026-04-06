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
    """Read prompt file, resolve relative to project root."""
    p = Path(prompt_file)
    if not p.is_absolute():
        p = project_root / p
    p = p.expanduser()
    if not p.exists():
        raise ExecutorError(f"prompt file not found: {p}")
    return p.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Output destination
# ---------------------------------------------------------------------------

def _render_output_path(output: str) -> str:
    """Replace {date} placeholder with today's ISO date."""
    today = date.today().isoformat()
    return output.replace("{date}", today)


def write_output(
    content: str,
    inbox_file: Path,
    job_name: str = "AI Report",
    model: str = "",
) -> None:
    """Write cron output to the inbox.

    All cron outputs go to inbox with channel=cron, direction=in.
    The output is also preserved in cron_history.json.
    """
    from ..services import inbox as inbox_svc
    inbox_svc.add_item(
        inbox_file=inbox_file,
        text=job_name,
        item_type="AI",
        body=content.strip(),
        channel="cron",
        direction="in",
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
# Claude agentic loop
# ---------------------------------------------------------------------------

def run_prompt_claude(
    model: str, prompt: str, api_key: str = ""
) -> str:
    """Run an agentic Claude session with tools; return final text."""
    try:
        import anthropic
    except ImportError as exc:
        raise ExecutorError(
            "anthropic package not installed"
        ) from exc

    client = anthropic.Anthropic(api_key=api_key or None)
    messages: list[dict] = [{"role": "user", "content": prompt}]

    while True:
        resp = client.messages.create(
            model=model,
            max_tokens=4096,
            tools=TOOL_DEFS,
            messages=messages,
        )

        if resp.stop_reason == "end_turn":
            for block in resp.content:
                if hasattr(block, "text"):
                    return block.text
            return ""

        # Collect tool calls and execute them
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
            # No tool calls despite non-end_turn; extract whatever text exists
            for block in resp.content:
                if hasattr(block, "text"):
                    return block.text
            return ""
        messages.append({"role": "user", "content": tool_results})


# ---------------------------------------------------------------------------
# Ollama agentic loop  (uses /api/chat with tools)
# ---------------------------------------------------------------------------

def run_prompt_ollama(model: str, prompt: str, base_url: str) -> str:
    """Run an agentic Ollama session with tools; return final text.

    Uses the /api/chat endpoint so tool calling is supported.
    Falls back gracefully if the model does not emit tool calls.
    """
    import urllib.request

    tools = openai_tools()
    messages: list[dict] = [{"role": "user", "content": prompt}]

    while True:
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "tools": tools,
            "stream": False,
        }).encode()
        url = base_url.rstrip("/") + "/api/chat"
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                data = json.loads(resp.read())
        except Exception as exc:
            raise ExecutorError(f"Ollama request failed: {exc}") from exc

        msg = data.get("message", {})
        tool_calls = msg.get("tool_calls") or []

        if not tool_calls:
            return msg.get("content", "")

        messages.append(msg)
        for call in tool_calls:
            fn = call.get("function", {})
            result = execute_tool(fn.get("name", ""), fn.get("arguments", {}))
            messages.append({
                "role": "tool",
                "content": json.dumps(result, default=str),
            })


# ---------------------------------------------------------------------------
# LM Studio agentic loop  (OpenAI-compatible)
# ---------------------------------------------------------------------------

def run_prompt_lm_studio(
    model: str, prompt: str, base_url: str
) -> str:
    """Run an agentic LM Studio session with tools; return final text."""
    import urllib.request

    tools = openai_tools()
    messages: list[dict] = [{"role": "user", "content": prompt}]

    while True:
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "tools": tools,
        }).encode()
        url = base_url.rstrip("/") + "/v1/chat/completions"
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                data = json.loads(resp.read())
        except Exception as exc:
            raise ExecutorError(
                f"LM Studio request failed: {exc}"
            ) from exc

        choice = data["choices"][0]
        msg = choice["message"]
        tool_calls = msg.get("tool_calls") or []

        if not tool_calls:
            return msg.get("content", "")

        messages.append(msg)
        for call in tool_calls:
            fn = call.get("function", {})
            result = execute_tool(fn.get("name", ""), fn.get("arguments", "{}"))
            messages.append({
                "role": "tool",
                "tool_call_id": call.get("id", ""),
                "content": json.dumps(result, default=str),
            })


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
        [claude_bin, "-p", prompt, "--model", model],
        capture_output=True, text=True, timeout=300,
    )
    if result.returncode != 0:
        raise ExecutorError(
            f"Claude CLI failed: {result.stderr.strip()}"
        )
    return result.stdout.strip()


def _run_openai_compatible(
    model: str, prompt: str, base_url: str, api_key: str,
) -> str:
    """Call an OpenAI-compatible API (OpenRouter, OpenAI)."""
    import urllib.request
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "user", "content": prompt},
        ],
    }).encode()
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(
        url, data=payload, headers=headers,
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


def execute_job(
    job: dict,
    project_root: Path,
    ollama_base_url: str,
    inbox_file: Path,
    lm_studio_base_url: str = "",
    claude_api_key: str = "",
    openrouter_base_url: str = "",
    openrouter_api_key: str = "",
    openai_base_url: str = "",
    openai_api_key: str = "",
) -> str:
    """Run a job definition end-to-end. Returns the output text."""
    prompt = load_prompt(job["prompt_file"], project_root)
    provider, model_name = _parse_model(job.get("model", ""))
    if provider == "claude_cli":
        output_text = _run_claude_cli(model_name, prompt)
    elif provider == "claude":
        output_text = run_prompt_claude(
            model_name, prompt, api_key=claude_api_key
        )
    elif provider == "lm_studio":
        output_text = run_prompt_lm_studio(
            model_name, prompt, lm_studio_base_url
        )
    elif provider == "openrouter":
        output_text = _run_openai_compatible(
            model_name, prompt,
            openrouter_base_url, openrouter_api_key,
        )
    elif provider == "openai":
        output_text = _run_openai_compatible(
            model_name, prompt,
            openai_base_url, openai_api_key,
        )
    else:
        output_text = run_prompt_ollama(
            model_name, prompt, ollama_base_url
        )
    write_output(
        output_text, inbox_file,
        job_name=job.get("name", "AI Report"),
        model=job.get("model", ""),
    )
    return output_text
