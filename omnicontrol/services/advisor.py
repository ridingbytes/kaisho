"""AI Advisor service.

Gathers context from all OmniControl data sources and assembles a
prompt for a language model. Dispatches to Ollama or the Claude API.
All logic lives here; the CLI is a thin caller.

The advisor uses an agentic loop: models that support tool calling can
read and write app data (tasks, inbox, clocks, customers) while
answering the question.
"""
import json
from datetime import datetime, timezone

from ..cron.tools import TOOL_DEFS, execute_tool, openai_tools


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

_SYSTEM_PROMPT = (
    "You are OmniControl Advisor, a personal assistant with direct access "
    "to the user's tasks, clock entries, inbox, customers, and other data "
    "through the provided tools.\n\n"
    "CRITICAL RULES — follow these without exception:\n"
    "1. When the user asks you to perform an action (book time, add a task, "
    "capture to inbox, move a task, etc.) you MUST call the appropriate tool "
    "or execute_cli command FIRST. Only describe the result AFTER the tool "
    "call has succeeded.\n"
    "2. Never claim, imply, or summarise that you have performed an action "
    "that you have not yet executed via a tool call. Saying 'I have booked "
    "X hours' without a preceding tool call is forbidden.\n"
    "3. If a tool call fails or returns an error, report the error honestly "
    "instead of pretending the action succeeded.\n"
    "4. For write actions (book time, add task, etc.) always confirm the "
    "exact values you are about to write before or after the tool call, "
    "so the user can verify correctness."
)


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
            "ollama", "claude", "lm_studio",
            "openrouter", "openai",
        ):
            return provider, name
    return "ollama", model_str


def ask_ollama(model: str, prompt: str, base_url: str) -> str:
    """Run an agentic Ollama session with tools; return final text."""
    import urllib.request

    tools = openai_tools()
    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
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


def ask_lm_studio(model: str, prompt: str, base_url: str) -> str:
    """Run an agentic LM Studio session with tools; return final text."""
    import urllib.request

    tools = openai_tools()
    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
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
    model: str, prompt: str, api_key: str = ""
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
            system=_SYSTEM_PROMPT,
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
) -> str:
    """Run an agentic OpenAI-compatible session with tools.

    Works with OpenRouter, OpenAI, and any provider that implements
    the /v1/chat/completions endpoint.
    """
    import urllib.request

    tools = openai_tools()
    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
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
) -> str:
    """Assemble context, call model in agentic loop, return answer."""
    prompt = build_context_prompt(
        question, tasks, clock_entries, inbox_items,
        customers, github_issues,
    )
    provider, model_name = _parse_model(model_str)
    if provider == "claude":
        return ask_claude(
            model_name, prompt, api_key=claude_api_key,
        )
    if provider == "lm_studio":
        return ask_lm_studio(
            model_name, prompt, lm_studio_base_url,
        )
    if provider == "openrouter":
        return ask_openai_compatible(
            model_name, prompt,
            base_url=openrouter_base_url,
            api_key=openrouter_api_key,
        )
    if provider == "openai":
        return ask_openai_compatible(
            model_name, prompt,
            base_url=openai_base_url,
            api_key=openai_api_key,
        )
    return ask_ollama(model_name, prompt, ollama_base_url)
