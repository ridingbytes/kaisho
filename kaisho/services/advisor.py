"""AI Advisor service.

Gathers context from all Kaisho data sources and assembles a
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
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..cron.tools import TOOL_DEFS, execute_tool, openai_tools

# Optional callback: (event_type, data_dict) -> None
EventCallback = Callable[[str, dict[str, Any]], None] | None


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


def save_skill(data_dir: Path, name: str, content: str) -> dict:
    """Write a skill file to SKILLS/{name}.md."""
    skills_dir = data_dir / "SKILLS"
    skills_dir.mkdir(parents=True, exist_ok=True)
    path = skills_dir / f"{name}.md"
    path.write_text(content, encoding="utf-8")
    return {"name": name, "content": content}


def delete_skill(data_dir: Path, name: str) -> None:
    """Delete SKILLS/{name}.md if it exists."""
    path = data_dir / "SKILLS" / f"{name}.md"
    if path.exists():
        path.unlink()


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
        item_type = (item.get("type") or "NOTE").ljust(6)
        customer = item.get("customer") or "-"
        title = item.get("title") or ""
        lines.append(f"  [{item_type}] [{customer}] {title}")
    if len(items) > 10:
        lines.append(f"  ... and {len(items) - 10} more")
    return "\n".join(lines) + "\n"


def _format_budgets(customers: list[dict]) -> str:
    lines = []
    for c in customers:
        k = c.get("budget", 0)
        if not k:
            continue
        r = c.get("rest", 0)
        v = c.get("used", k - r)
        pct_remaining = c.get("percent", round((r / k) * 100) if k else 0)
        lines.append(
            f"  {c['name']:<22} {v:.0f}h / {k:.0f}h"
            f"  ({100 - pct_remaining:.0f}% used,"
            f"  {r:.0f}h left)"
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
        f"# Kaisho Context  ({now})\n",
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
    "You are Kaisho Advisor, a personal assistant with direct "
    "access to the user's tasks, clock entries, inbox, customers, "
    "knowledge base, and other data through the provided tools.\n\n"
    "This application is called Kaisho. Never refer to it as "
    "'omnicontrol' or any other name.\n\n"
    "CRITICAL RULES:\n"
    "1. When asked to perform an action, call the appropriate tool "
    "FIRST. Only describe the result AFTER the tool has succeeded.\n"
    "2. Never claim you have performed an action without a preceding "
    "tool call.\n"
    "3. Report tool errors honestly.\n"
    "4. For write actions, confirm the exact values.\n"
    "5. ALWAYS call search_knowledge before answering any question "
    "about a technical topic, software project, customer domain, or "
    "anything that might be documented in the knowledge base. Do NOT "
    "say you lack information before searching first. If the search "
    "returns results, read the relevant files with "
    "read_knowledge_file before answering.\n"
    "6. Cron prompt files support YAML frontmatter with a 'fetch' "
    "key listing URLs to pre-fetch before sending to the model:\n"
    "   ---\n"
    "   fetch:\n"
    "     - https://example.com/api/data\n"
    "   ---\n"
    "   Analyze: {fetch_results}\n\n"
    "   Domains must be in the URL allowlist (Settings > AI). "
    "   Use approve_url_domain to add missing domains."
)


def build_system_prompt(
    data_dir: Path,
    user_meta: dict | None = None,
) -> str:
    """Build system prompt from base + soul + user + skills.

    user_meta: {"name": ..., "bio": ...} from user.yaml.
    """
    parts = [_BASE_SYSTEM_PROMPT]
    # Inject user identity
    if user_meta and user_meta.get("name"):
        bio = user_meta.get("bio", "")
        identity = f"\n## Active User\nName: {user_meta['name']}"
        if bio:
            identity += f"\nBio: {bio}"
        parts.append(identity)
    soul = load_soul(data_dir)
    if soul:
        parts.append(f"\n## Personality\n{soul}")
    user = load_user(data_dir)
    if user:
        parts.append(f"\n## User Profile\n{user}")
    # TODO: All skills are injected into every prompt.
    # Consider selective loading via a use_skill() tool
    # when the number of skills grows. See
    # docs/IMPROVEMENTS.md for details.
    skills = list_skills(data_dir)
    if skills:
        skill_block = "\n## Skills\n\n"
        skill_block += (
            "When the user's request matches one of these "
            "skills, follow its instructions automatically. "
            "The user does not need to name the skill "
            "explicitly.\n\n"
        )
        for s in skills:
            skill_block += f"### {s['name']}\n{s['content']}\n\n"
        parts.append(skill_block)
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
            "ollama", "claude", "claude_cli",
            "lm_studio", "openrouter", "openai",
            "kaisho",
        ):
            return provider, name
    return "ollama", model_str


def _execute_tool_calls(
    tool_calls: list[dict],
    include_id: bool = True,
    on_event: EventCallback = None,
) -> list[dict]:
    """Execute tool calls and return tool-result messages."""
    results = []
    for call in tool_calls:
        fn = call.get("function", {})
        name = fn.get("name", "")
        args = fn.get("arguments", {})
        if on_event:
            on_event("tool_call", {
                "name": name, "args": args,
            })
        result = execute_tool(name, args)
        if on_event:
            on_event("tool_result", {
                "name": name, "result": result,
            })
        msg: dict = {
            "role": "tool",
            "content": json.dumps(result, default=str),
        }
        if include_id:
            msg["tool_call_id"] = call.get("id", "")
        results.append(msg)
    return results


def _check_hallucination(
    content: str,
    tools_called: bool,
    messages: list[dict],
) -> bool:
    """Return True if the response claims an action without tools.

    Appends a reminder to messages so the model retries.
    """
    if not tools_called and _claims_action(content):
        messages.append(
            {"role": "assistant", "content": content}
        )
        messages.append(
            {"role": "user", "content": _TOOL_REMINDER}
        )
        return True
    return False


def _http_post(url: str, payload: bytes, headers: dict) -> dict:
    """POST JSON and return parsed response."""
    import urllib.request
    req = urllib.request.Request(
        url, data=payload, headers=headers,
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read())


def ask_ollama(
    model: str, prompt: str, base_url: str,
    system_prompt: str = "",
    on_event: EventCallback = None,
) -> str:
    """Run an agentic Ollama session with tools."""
    tools = openai_tools()
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]
    url = base_url.rstrip("/") + "/api/chat"
    headers = {"Content-Type": "application/json"}

    tools_called = False
    for _ in range(_MAX_TURNS):
        if on_event:
            on_event("thinking", {})
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "tools": tools,
            "think": False,
            "stream": False,
        }).encode()
        try:
            data = _http_post(url, payload, headers)
        except Exception as exc:
            raise RuntimeError(
                f"Ollama request failed: {exc}"
            ) from exc

        msg = data.get("message", {})
        tool_calls = msg.get("tool_calls") or []

        if not tool_calls:
            content = msg.get("content", "")
            if _check_hallucination(
                content, tools_called, messages
            ):
                continue
            return content

        tools_called = True
        messages.append(msg)
        messages.extend(
            _execute_tool_calls(
                tool_calls, include_id=False,
                on_event=on_event,
            )
        )

    return messages[-1].get("content", "")


def ask_openai_compatible(
    model: str,
    prompt: str,
    base_url: str,
    api_key: str = "",
    system_prompt: str = "",
    on_event: EventCallback = None,
) -> str:
    """Run an agentic OpenAI-compatible session with tools.

    Works with LM Studio, OpenRouter, OpenAI, and any provider
    that implements the /v1/chat/completions endpoint.
    """
    tools = openai_tools()
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]
    url = base_url.rstrip("/") + "/chat/completions"
    headers: dict[str, str] = {
        "Content-Type": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    tools_called = False
    for _ in range(_MAX_TURNS):
        if on_event:
            on_event("thinking", {})
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "tools": tools,
        }).encode()
        try:
            data = _http_post(url, payload, headers)
        except Exception as exc:
            raise RuntimeError(
                f"Request to {base_url} failed: {exc}"
            ) from exc

        msg = data["choices"][0]["message"]
        tool_calls = msg.get("tool_calls") or []

        if not tool_calls:
            content = msg.get("content", "")
            if _check_hallucination(
                content, tools_called, messages
            ):
                continue
            return content

        tools_called = True
        messages.append(msg)
        messages.extend(
            _execute_tool_calls(
                tool_calls, include_id=True,
                on_event=on_event,
            )
        )

    return messages[-1].get("content", "")


def ask_claude(
    model: str, prompt: str, api_key: str = "",
    system_prompt: str = "",
    on_event: EventCallback = None,
) -> str:
    """Run an agentic Claude session with tools."""
    try:
        import anthropic
    except ImportError as exc:
        raise RuntimeError(
            "anthropic package not installed"
        ) from exc

    client = anthropic.Anthropic(api_key=api_key or None)
    messages: list[dict] = [
        {"role": "user", "content": prompt},
    ]
    tools_called = False

    for _ in range(_MAX_TURNS):
        if on_event:
            on_event("thinking", {})
        resp = client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            tools=TOOL_DEFS,
            messages=messages,
        )

        if resp.stop_reason == "end_turn":
            text = _extract_claude_text(resp.content)
            if _check_hallucination(
                text, tools_called, messages
            ):
                messages[-2] = {
                    "role": "assistant",
                    "content": resp.content,
                }
                continue
            return text

        messages.append({
            "role": "assistant",
            "content": resp.content,
        })
        tools_called = True
        tool_results = _execute_claude_tools(
            resp.content, on_event=on_event,
        )
        if not tool_results:
            return _extract_claude_text(resp.content)
        messages.append({
            "role": "user",
            "content": tool_results,
        })

    return ""


def _extract_claude_text(content) -> str:
    """Extract text from Claude response content blocks."""
    for block in content:
        if hasattr(block, "text"):
            return block.text
    return ""


def _execute_claude_tools(
    content, on_event: EventCallback = None,
) -> list[dict]:
    """Execute tool_use blocks and return tool_result dicts."""
    results = []
    for block in content:
        if block.type != "tool_use":
            continue
        if on_event:
            on_event("tool_call", {
                "name": block.name,
                "args": block.input,
            })
        result = execute_tool(block.name, block.input)
        if on_event:
            on_event("tool_result", {
                "name": block.name, "result": result,
            })
        results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": json.dumps(result, default=str),
        })
    return results


def ask_claude_cli(model: str, prompt: str) -> str:
    """Call the Claude CLI using the local login token.

    Since April 2025, Claude CLI subscription does not
    support tool calls without extra usage activated.
    This runs as simple prompt-in/text-out without
    agentic tool calling. Use Ollama or the Claude API
    for full advisor functionality.
    """
    import shutil
    import subprocess

    claude_bin = shutil.which("claude")
    if not claude_bin:
        raise RuntimeError(
            "claude CLI not found. Install it and run "
            "'claude login' first."
        )
    cmd = [claude_bin, "-p", "-", "--model", model]
    try:
        result = subprocess.run(
            cmd,
            input=prompt,
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


def _strip_model_prefix(text: str, model: str) -> str:
    """Remove model name prefix that some models prepend
    to their output (e.g. 'claude-sonnet-4-6\\n...')."""
    for prefix in (model, model.split(":")[0]):
        if text.startswith(prefix):
            text = text[len(prefix):].lstrip(": \n")
    return text


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
    cloud_url: str = "",
    cloud_api_key: str = "",
    data_dir: str = "data",
    user_meta: dict | None = None,
    on_event: EventCallback = None,
) -> str:
    """Assemble context, call model in agentic loop, return answer."""
    prompt = build_context_prompt(
        question, tasks, clock_entries, inbox_items,
        customers, github_issues,
    )
    sp = build_system_prompt(Path(data_dir), user_meta)
    provider, model_name = _parse_model(model_str)
    if provider == "claude_cli":
        full = f"{sp}\n\n---\n\n{prompt}"
        return ask_claude_cli(model_name, full)
    if provider == "claude":
        return ask_claude(
            model_name, prompt,
            api_key=claude_api_key, system_prompt=sp,
            on_event=on_event,
        )
    if provider == "lm_studio":
        url = lm_studio_base_url.rstrip("/") + "/v1"
        return ask_openai_compatible(
            model_name, prompt,
            base_url=url, system_prompt=sp,
            on_event=on_event,
        )
    if provider == "openrouter":
        return ask_openai_compatible(
            model_name, prompt,
            base_url=openrouter_base_url,
            api_key=openrouter_api_key,
            system_prompt=sp, on_event=on_event,
        )
    if provider == "openai":
        return ask_openai_compatible(
            model_name, prompt,
            base_url=openai_base_url,
            api_key=openai_api_key,
            system_prompt=sp, on_event=on_event,
        )
    if provider == "kaisho":
        from .cloud_sync import cloud_ai_agentic
        # Only expose the kai CLI tool — the advisor
        # can create tasks, book time, etc. via CLI
        # commands but cannot fetch URLs or access
        # the filesystem directly.
        cli_tool = [{
            "type": "function",
            "function": {
                "name": "execute_cli",
                "description": (
                    "Run a kai CLI command. Examples: "
                    "task add CUSTOMER \"Title\", "
                    "clock start CUSTOMER, "
                    "clock stop, "
                    "clock book 2h CUSTOMER \"desc\", "
                    "note add \"Title\""
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": (
                                "The kai subcommand "
                                "and arguments"
                            ),
                        },
                    },
                    "required": ["command"],
                },
            },
        }]
        return cloud_ai_agentic(
            cloud_url=cloud_url,
            api_key=cloud_api_key,
            system=sp,
            prompt=prompt,
            tools=cli_tool,
            tool_executor=execute_tool,
            max_tokens=4096,
            on_event=on_event,
        )
    answer = ask_ollama(
        model_name, prompt, ollama_base_url,
        system_prompt=sp, on_event=on_event,
    )
    return _strip_model_prefix(answer, model_name)
