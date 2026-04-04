"""Job executor.

Resolves the prompt file, calls the configured model (Ollama or
Claude API), and writes output to the configured destination.

Model string format:
  "ollama:<model>"   — call local Ollama instance
  "claude:<model>"   — call Anthropic API via anthropic package
  "<model>"          — treated as Ollama model
"""
import re
import subprocess
from datetime import date
from pathlib import Path


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


def write_output(output_dest: str, content: str, inbox_file: Path) -> str:
    """Write content to the resolved destination.

    If output_dest is "inbox", append to inbox org file.
    Otherwise write to the (possibly date-interpolated) file path.

    Returns a description of where output was written.
    """
    dest = _render_output_path(output_dest)
    if dest == "inbox":
        _append_to_inbox(content, inbox_file)
        return str(inbox_file)
    out_path = _resolve_path(dest)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content, encoding="utf-8")
    return str(out_path)


def _append_to_inbox(content: str, inbox_file: Path) -> None:
    """Append content as a new org heading to the inbox file."""
    today = date.today().isoformat()
    heading = f"* AI Report {today}\n\n{content.strip()}\n"
    with open(inbox_file, "a", encoding="utf-8") as f:
        f.write("\n" + heading)


# ---------------------------------------------------------------------------
# Model dispatch
# ---------------------------------------------------------------------------

def _parse_model(model_str: str) -> tuple[str, str]:
    """Return (provider, model_name) from model string."""
    if ":" in model_str:
        provider, name = model_str.split(":", 1)
        if provider in ("ollama", "claude"):
            return provider, name
    return "ollama", model_str


def run_prompt_ollama(model: str, prompt: str, base_url: str) -> str:
    """Send prompt to local Ollama and return response text."""
    import urllib.request
    import json

    payload = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
    }).encode()
    url = base_url.rstrip("/") + "/api/generate"
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
    return data.get("response", "")


def run_prompt_claude(model: str, prompt: str) -> str:
    """Send prompt to Anthropic Claude API and return response text."""
    try:
        import anthropic
    except ImportError as exc:
        raise ExecutorError(
            "anthropic package not installed"
        ) from exc
    client = anthropic.Anthropic()
    message = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def execute_job(job: dict, project_root: Path, ollama_base_url: str,
                inbox_file: Path) -> str:
    """Run a job definition end-to-end. Returns the output text."""
    prompt = load_prompt(job["prompt_file"], project_root)
    provider, model_name = _parse_model(job.get("model", ""))
    if provider == "claude":
        output_text = run_prompt_claude(model_name, prompt)
    else:
        output_text = run_prompt_ollama(
            model_name, prompt, ollama_base_url
        )
    write_output(job["output"], output_text, inbox_file)
    return output_text
