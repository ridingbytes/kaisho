"""AI Advisor service.

Gathers context from all OmniControl data sources and assembles a
prompt for a language model. Dispatches to Ollama or the Claude API.
All logic lives here; the CLI is a thin caller.
"""
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Context builders (pure functions: data in, text out)
# ---------------------------------------------------------------------------

def _format_tasks(tasks: list[dict]) -> str:
    if not tasks:
        return "  (none)\n"
    lines = []
    for t in tasks[:20]:
        status = (t.get("status") or "").ljust(12)
        customer = t.get("customer") or "-"
        title = t.get("title") or ""
        lines.append(f"  [{status}] [{customer}] {title}")
    if len(tasks) > 20:
        lines.append(f"  ... and {len(tasks) - 20} more")
    return "\n".join(lines) + "\n"


def _format_clocks(entries: list[dict]) -> str:
    if not entries:
        return "  (none)\n"
    lines = []
    for e in entries[:15]:
        date = (e.get("start") or "")[:10]
        customer = e.get("customer") or "-"
        desc = e.get("description") or ""
        hours = e.get("hours") or ""
        lines.append(f"  {date}  [{customer}]  {desc}  {hours}h")
    return "\n".join(lines) + "\n"


def _format_inbox(items: list[dict]) -> str:
    if not items:
        return "  (none)\n"
    lines = []
    for item in items[:10]:
        item_type = (item.get("type") or "NOTIZ").ljust(6)
        customer = item.get("customer") or "-"
        title = item.get("title") or ""
        lines.append(f"  [{item_type}] [{customer}] {title}")
    if len(items) > 10:
        lines.append(f"  ... and {len(items) - 10} more")
    return "\n".join(lines) + "\n"


def _format_budgets(customers: list[dict]) -> str:
    lines = []
    for c in customers:
        k = c.get("kontingent", 0)
        if not k:
            continue
        r = c.get("rest", 0)
        v = c.get("verbraucht", 0)
        pct = c.get("percent", 0)
        lines.append(
            f"  {c['name']:<22} {v:.0f}h / {k:.0f}h"
            f"  ({100 - pct:.0f}% used,  {r:.0f}h left)"
        )
    return ("\n".join(lines) + "\n") if lines else "  (none)\n"


def _format_github_issues(issue_groups: list[dict]) -> str:
    if not issue_groups:
        return "  (none)\n"
    lines = []
    for group in issue_groups:
        customer = group["customer"]
        for issue in group.get("issues", []):
            num = issue.get("number", "")
            title = issue.get("title", "")
            lines.append(f"  [{customer}] #{num} {title}")
    return ("\n".join(lines) + "\n") if lines else "  (none)\n"


# ---------------------------------------------------------------------------
# Prompt assembly
# ---------------------------------------------------------------------------

def build_context_prompt(
    question: str,
    tasks: list[dict],
    clock_entries: list[dict],
    inbox_items: list[dict],
    customers: list[dict],
    github_issues: list[dict],
) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    sections = [
        f"# OmniControl Context  ({now})\n",
        "## Open Tasks\n" + _format_tasks(tasks),
        "## Recent Clock Entries\n" + _format_clocks(clock_entries),
        "## Inbox\n" + _format_inbox(inbox_items),
        "## Customer Budgets\n" + _format_budgets(customers),
        "## GitHub Issues\n" + _format_github_issues(github_issues),
        f"\n## Question\n{question}\n",
    ]
    return "\n".join(sections)


# ---------------------------------------------------------------------------
# Model execution (same dispatch logic as cron/executor.py)
# ---------------------------------------------------------------------------

def _parse_model(model_str: str) -> tuple[str, str]:
    if ":" in model_str:
        provider, name = model_str.split(":", 1)
        if provider in ("ollama", "claude", "lm_studio"):
            return provider, name
    return "ollama", model_str


def ask_ollama(model: str, prompt: str, base_url: str) -> str:
    import json
    import urllib.request

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
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read())
    except Exception as exc:
        raise RuntimeError(f"Ollama request failed: {exc}") from exc
    return data.get("response", "")


def ask_lm_studio(model: str, prompt: str, base_url: str) -> str:
    """Send prompt to LM Studio (OpenAI-compatible) and return text."""
    import json
    import urllib.request

    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    url = base_url.rstrip("/") + "/v1/chat/completions"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read())
    except Exception as exc:
        raise RuntimeError(
            f"LM Studio request failed: {exc}"
        ) from exc
    return data["choices"][0]["message"]["content"]


def ask_claude(
    model: str, prompt: str, api_key: str = ""
) -> str:
    try:
        import anthropic
    except ImportError as exc:
        raise RuntimeError(
            "anthropic package not installed"
        ) from exc
    client = anthropic.Anthropic(api_key=api_key or None)
    message = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def ask(
    question: str,
    model_str: str,
    tasks: list[dict],
    clock_entries: list[dict],
    inbox_items: list[dict],
    customers: list[dict],
    github_issues: list[dict],
    ollama_base_url: str,
    lm_studio_base_url: str = "",
    claude_api_key: str = "",
) -> str:
    """Assemble context, call model, return answer text."""
    prompt = build_context_prompt(
        question, tasks, clock_entries, inbox_items,
        customers, github_issues,
    )
    provider, model_name = _parse_model(model_str)
    if provider == "claude":
        return ask_claude(model_name, prompt, api_key=claude_api_key)
    if provider == "lm_studio":
        return ask_lm_studio(model_name, prompt, lm_studio_base_url)
    return ask_ollama(model_name, prompt, ollama_base_url)
