"""AI Advisor service.

Gathers context from all OmniControl data sources and assembles a
prompt for a language model. Dispatches to Ollama or the Claude API.
All logic lives here; the CLI is a thin caller.

The advisor uses an agentic loop: models that support tool calling can
read and write app data (tasks, inbox, clocks, customers) while
answering the question.

Personality and user context are loaded from optional markdown files:
  data/soul.md  -- advisor personality, tone, behavioral rules
  data/user.md  -- user profile, role, preferences
  data/skills/  -- reusable prompt templates (*.md)
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from ..cron.tools import TOOL_DEFS, execute_tool, openai_tools


# ---------------------------------------------------------------------------
# Personality, user profile, and skills
# ---------------------------------------------------------------------------


def _read_optional(path: Path) -> str:
    """Read a file if it exists, return empty string otherwise."""
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    return ""


def load_soul(data_dir: Path) -> str:
    """Load the advisor personality from SOUL.md."""
    return _read_optional(data_dir / "SOUL.md")


def load_user(data_dir: Path) -> str:
    """Load the user profile from USER.md."""
    return _read_optional(data_dir / "USER.md")


def list_skills(data_dir: Path) -> list[dict]:
    """List available skills from SKILLS/*.md.

    Each dict: {"name": str, "content": str}.
    """
    skills_dir = data_dir / "SKILLS"
    if not skills_dir.is_dir():
        return []
    return [
        {
            "name": f.stem,
            "content": f.read_text(encoding="utf-8").strip(),
        }
        for f in sorted(skills_dir.glob("*.md"))
    ]


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
        (
            f"\n## Request\n{question}\n\n"
            "## Action required\n"
            "If the request above involves writing, creating, or modifying "
            "data (booking time, adding a task, capturing to inbox, etc.) "
            "you MUST call execute_cli or another tool BEFORE writing any "
            "response. Do NOT describe the result until the tool has been "
            "called and returned successfully.\n"
        ),
    ]
    return "\n".join(sections)


# ---------------------------------------------------------------------------
# Model execution (same dispatch logic as cron/executor.py)
# ---------------------------------------------------------------------------

_BASE_SYSTEM_PROMPT = (
    "You are OmniControl Advisor, a personal assistant with direct "
    "access to the user's tasks, clock entries, inbox, customers, "
    "knowledge base, and other data through the provided tools.\n\n"
    "CRITICAL RULES:\n"
    "1. When asked to perform an action, call the appropriate tool "
    "FIRST. Only describe the result AFTER the tool has succeeded.\n"
    "2. Never claim you have performed an action without a preceding "
    "tool call.\n"
    "3. Report tool errors honestly.\n"
    "4. For write actions, confirm the exact values.\n"
    "5. Use search_knowledge and read_knowledge_file to look up "
    "documentation, notes, and research when the question requires "
    "domain knowledge beyond the structured data."
)


def build_system_prompt(data_dir: Path) -> str:
    """Build the full system prompt from base + soul + user."""
    parts = [_BASE_SYSTEM_PROMPT]
    soul = load_soul(data_dir)
    if soul:
        parts.append(f"\n## Personality\n{soul}")
    user = load_user(data_dir)
    if user:
        parts.append(f"\n## User Profile\n{user}")
    skills = list_skills(data_dir)
    if skills:
        names = ", ".join(s["name"] for s in skills)
        parts.append(
            f"\n## Available Skills\n"
            f"The user can invoke these skill templates: "
            f"{names}. When a skill is invoked, follow its "
            f"instructions precisely."
        )
    return "\n".join(parts)


_MAX_TURNS = 10

# Phrases that indicate the model is describing a completed action without
# having called a tool — i.e. a hallucination that must trigger a retry.
_ACTION_PHRASES = (
    "successfully booked", "have booked", "i booked",
    "successfully added", "have added", "i added",
    "successfully created", "have created", "i created",
    "has been added", "has been recorded", "has been booked",
    "been added to your", "been recorded in",
    "time entry", "clock entry", "booking has been",
    "successfully moved", "successfully updated",
    "task has been", "item has been", "entry has been",
)

_TOOL_REMINDER = (
    "You described performing an action but did not call any tool. "
    "Your previous message is incorrect — nothing has been written yet. "
    "You MUST call execute_cli or another available tool to actually "
    "perform the action. Call the tool now without further explanation."
)


def _claims_action(text: str) -> bool:
    """Return True if the text describes a completed write action."""
    lower = text.lower()
    return any(phrase in lower for phrase in _ACTION_PHRASES)


def _parse_model(model_str: str) -> tuple[str, str]:
    if ":" in model_str:
        provider, name = model_str.split(":", 1)
        if provider in (
            "ollama", "claude", "claude_cli", "lm_studio",
            "openrouter", "openai",
        ):
            return provider, name
    return "ollama", model_str


def ask_ollama(
    model: str, prompt: str, base_url: str,
    system_prompt: str = "",
) -> str:
    """Run an agentic Ollama session with tools; return final text."""
    import urllib.request

    tools = openai_tools()
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    tools_called = False
    for _ in range(_MAX_TURNS):
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "tools": tools,
            "think": False,
            "stream": False,
        }).encode()
        url = base_url.rstrip("/") + "/api/chat"
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

        msg = data.get("message", {})
        tool_calls = msg.get("tool_calls") or []

        if not tool_calls:
            content = msg.get("content", "")
            if not tools_called and _claims_action(content):
                messages.append({"role": "assistant", "content": content})
                messages.append({"role": "user", "content": _TOOL_REMINDER})
                continue
            return content

        tools_called = True
        messages.append(msg)
        for call in tool_calls:
            fn = call.get("function", {})
            result = execute_tool(
                fn.get("name", ""), fn.get("arguments", {})
            )
            messages.append({
                "role": "tool",
                "content": json.dumps(result, default=str),
            })

    return messages[-1].get("content", "")


def ask_lm_studio(
    model: str, prompt: str, base_url: str,
    system_prompt: str = "",
) -> str:
    """Run an agentic LM Studio session with tools; return final text."""
    import urllib.request

    tools = openai_tools()
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    tools_called = False
    for _ in range(_MAX_TURNS):
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
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.loads(resp.read())
        except Exception as exc:
            raise RuntimeError(
                f"LM Studio request failed: {exc}"
            ) from exc

        choice = data["choices"][0]
        msg = choice["message"]
        tool_calls = msg.get("tool_calls") or []

        if not tool_calls:
            content = msg.get("content", "")
            if not tools_called and _claims_action(content):
                messages.append({"role": "assistant", "content": content})
                messages.append({"role": "user", "content": _TOOL_REMINDER})
                continue
            return content

        tools_called = True
        messages.append(msg)
        for call in tool_calls:
            fn = call.get("function", {})
            result = execute_tool(
                fn.get("name", ""), fn.get("arguments", "{}")
            )
            messages.append({
                "role": "tool",
                "tool_call_id": call.get("id", ""),
                "content": json.dumps(result, default=str),
            })

    return messages[-1].get("content", "")


def ask_claude(
    model: str, prompt: str, api_key: str = "",
    system_prompt: str = "",
) -> str:
    """Run an agentic Claude session with tools; return final text."""
    try:
        import anthropic
    except ImportError as exc:
        raise RuntimeError(
            "anthropic package not installed"
        ) from exc

    client = anthropic.Anthropic(api_key=api_key or None)
    messages: list[dict] = [{"role": "user", "content": prompt}]
    tools_called = False

    while True:
        resp = client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            tools=TOOL_DEFS,
            messages=messages,
        )

        if resp.stop_reason == "end_turn":
            for block in resp.content:
                if hasattr(block, "text"):
                    content = block.text
                    if not tools_called and _claims_action(content):
                        messages.append({
                            "role": "assistant",
                            "content": resp.content,
                        })
                        messages.append({
                            "role": "user",
                            "content": _TOOL_REMINDER,
                        })
                        break
                    return content
            else:
                return ""
            continue

        messages.append({
            "role": "assistant",
            "content": resp.content,
        })
        tools_called = True
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
            for block in resp.content:
                if hasattr(block, "text"):
                    return block.text
            return ""
        messages.append({"role": "user", "content": tool_results})

    return ""


def ask_openai_compatible(
    model: str,
    prompt: str,
    base_url: str,
    api_key: str = "",
    system_prompt: str = "",
) -> str:
    """Run an agentic OpenAI-compatible session with tools.

    Works with OpenRouter, OpenAI, and any provider that implements
    the /v1/chat/completions endpoint.
    """
    import urllib.request

    tools = openai_tools()
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    headers: dict[str, str] = {
        "Content-Type": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    tools_called = False
    for _ in range(_MAX_TURNS):
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "tools": tools,
        }).encode()
        url = base_url.rstrip("/") + "/chat/completions"
        req = urllib.request.Request(
            url, data=payload, headers=headers,
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.loads(resp.read())
        except Exception as exc:
            raise RuntimeError(
                f"OpenAI-compatible request failed: {exc}"
            ) from exc

        choice = data["choices"][0]
        msg = choice["message"]
        tool_calls = msg.get("tool_calls") or []

        if not tool_calls:
            content = msg.get("content", "")
            if not tools_called and _claims_action(content):
                messages.append(
                    {"role": "assistant", "content": content}
                )
                messages.append(
                    {"role": "user", "content": _TOOL_REMINDER}
                )
                continue
            return content

        tools_called = True
        messages.append(msg)
        for call in tool_calls:
            fn = call.get("function", {})
            result = execute_tool(
                fn.get("name", ""),
                fn.get("arguments", "{}"),
            )
            messages.append({
                "role": "tool",
                "tool_call_id": call.get("id", ""),
                "content": json.dumps(result, default=str),
            })

    return messages[-1].get("content", "")


def ask_claude_cli(model: str, prompt: str) -> str:
    """Call the Claude CLI using the local login token.

    Requires ``claude login`` to have been run. Uses the user's
    Anthropic subscription, no API key needed.
    """
    import shutil
    import subprocess

    claude_bin = shutil.which("claude")
    if not claude_bin:
        raise RuntimeError(
            "claude CLI not found. Install it and run "
            "'claude login' first."
        )
    cmd = [claude_bin, "-p", prompt, "--model", model]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Claude CLI timed out after 300s")
    if result.returncode != 0:
        err = result.stderr.strip() or "unknown error"
        raise RuntimeError(f"Claude CLI failed: {err}")
    return result.stdout.strip()


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
    openrouter_base_url: str = "",
    openrouter_api_key: str = "",
    openai_base_url: str = "",
    openai_api_key: str = "",
    data_dir: str = "data",
) -> str:
    """Assemble context, call model in agentic loop, return answer."""
    prompt = build_context_prompt(
        question, tasks, clock_entries, inbox_items,
        customers, github_issues,
    )
    sp = build_system_prompt(Path(data_dir))
    provider, model_name = _parse_model(model_str)
    if provider == "claude_cli":
        # CLI gets prompt + system prompt concatenated
        full = f"{sp}\n\n---\n\n{prompt}"
        return ask_claude_cli(model_name, full)
    if provider == "claude":
        return ask_claude(
            model_name, prompt,
            api_key=claude_api_key, system_prompt=sp,
        )
    if provider == "lm_studio":
        return ask_lm_studio(
            model_name, prompt,
            lm_studio_base_url, system_prompt=sp,
        )
    if provider == "openrouter":
        return ask_openai_compatible(
            model_name, prompt,
            base_url=openrouter_base_url,
            api_key=openrouter_api_key,
            system_prompt=sp,
        )
    if provider == "openai":
        return ask_openai_compatible(
            model_name, prompt,
            base_url=openai_base_url,
            api_key=openai_api_key,
            system_prompt=sp,
        )
    return ask_ollama(
        model_name, prompt, ollama_base_url,
        system_prompt=sp,
    )
