"""Cron prompt assistant.

Rewrites a cron job's prompt from a natural-language
instruction, using the advisor model configured in settings.

Deliberately tool-less: a single completion, no agentic loop.
The model's whole job is to return the improved prompt text,
which the UI then shows as a diff for the user to accept,
reject, or hand-edit -- a pair-programming feel, not an
autonomous agent.
"""
import json

from ..ai_utils import (
    extract_claude_text,
    http_post,
    parse_model,
)

_SYSTEM = (
    "You are an expert prompt engineer. You improve prompts "
    "that drive an automated Kaisho cron job -- a language "
    "model that runs unattended on a schedule and whose "
    "output is delivered to the user.\n\n"
    "Rules:\n"
    "- Rewrite the given prompt to satisfy the instruction.\n"
    "- Preserve every ${...} placeholder verbatim; they are "
    "substituted at runtime.\n"
    "- Keep the author's intent, structure, and voice unless "
    "the instruction says otherwise.\n"
    "- Output ONLY the rewritten prompt: no preamble, no "
    "explanation, no code fences."
)


def _build_user(instruction: str, current_prompt: str) -> str:
    """Assemble the user turn from the prompt + instruction."""
    return (
        f"## Current prompt\n\n{current_prompt}\n\n"
        f"## Instruction\n\n{instruction}\n\n"
        "Rewrite the prompt accordingly. Output only the new "
        "prompt."
    )


def _strip_fences(text: str) -> str:
    """Drop a wrapping ``` code fence if the model added one."""
    stripped = text.strip()
    if not stripped.startswith("```"):
        return text
    lines = stripped.split("\n")
    # Drop the opening fence (``` or ```markdown) ...
    lines = lines[1:]
    # ... and the closing fence if present.
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines)


def _complete_ollama(
    model: str, system: str, user: str,
    base_url: str, api_key: str = "",
) -> str:
    """Single (non-agentic) Ollama chat completion."""
    url = base_url.rstrip("/") + "/api/chat"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "think": False,
        "stream": False,
    }).encode()
    data = http_post(url, payload, headers)
    return data.get("message", {}).get("content", "")


def _complete_openai(
    model: str, system: str, user: str,
    base_url: str, api_key: str = "",
) -> str:
    """Single OpenAI-compatible chat completion."""
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }).encode()
    data = http_post(url, payload, headers)
    return data["choices"][0]["message"]["content"]


def _complete_claude(
    model: str, system: str, user: str, api_key: str,
) -> str:
    """Single Claude message completion."""
    import anthropic
    client = anthropic.Anthropic(api_key=api_key or None)
    msg = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return extract_claude_text(msg.content)


def rewrite_cron_prompt(
    instruction: str,
    current_prompt: str,
    model_str: str,
    *,
    ollama_base_url: str = "",
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
    on_event=None,
) -> str:
    """Rewrite a cron prompt per an instruction and return it.

    Dispatches to the same providers as the advisor, but with
    a single tool-less completion. ``model_str`` is normally
    the ``advisor_model`` from settings.

    :returns: The rewritten prompt text (fences stripped).
    """
    provider, model_name = parse_model(model_str)
    user = _build_user(instruction, current_prompt)

    if provider == "claude":
        out = _complete_claude(
            model_name, _SYSTEM, user, claude_api_key,
        )
    elif provider == "lm_studio":
        out = _complete_openai(
            model_name, _SYSTEM, user,
            lm_studio_base_url.rstrip("/") + "/v1",
        )
    elif provider == "openrouter":
        out = _complete_openai(
            model_name, _SYSTEM, user,
            openrouter_base_url, openrouter_api_key,
        )
    elif provider == "openai":
        out = _complete_openai(
            model_name, _SYSTEM, user,
            openai_base_url, openai_api_key,
        )
    elif provider == "ollama_cloud":
        out = _complete_ollama(
            model_name, _SYSTEM, user,
            ollama_cloud_url, ollama_cloud_api_key,
        )
    elif provider == "kaisho":
        from .cloud_sync import cloud_ai_agentic
        out = cloud_ai_agentic(
            cloud_url=cloud_url,
            api_key=cloud_api_key,
            system=_SYSTEM,
            prompt=user,
            tools=[],
            tool_executor=lambda *a, **k: "",
            max_tokens=4096,
            on_event=on_event,
            mode=model_name or "default",
        )
    else:
        out = _complete_ollama(
            model_name, _SYSTEM, user, ollama_base_url,
            ollama_api_key,
        )

    return _strip_fences(out)
