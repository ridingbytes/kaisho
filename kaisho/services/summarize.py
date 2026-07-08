"""Summarize a single KB file with the configured AI
model.

Reuses the provider switch from ``advisor.ask()`` but
skips the agentic context (tasks / clocks / customers /
GitHub issues / tools) -- a summary just needs the
document text and a small system prompt.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from .advisor import (
    _parse_model,
    ask_claude,
    ask_claude_cli,
    ask_ollama,
    ask_openai_compatible,
)
from .knowledge import read_file


# Cap the input size to keep latency and cost predictable.
# Long documents are truncated with a clear marker so the
# model stays grounded in the actual text rather than
# fabricating from partial context.
MAX_CHARS = 40_000

SYSTEM_PROMPT = (
    "You are a concise document summarizer. Return a "
    "tight, factual overview of the document below in "
    "Markdown. Lead with a one-sentence TL;DR, then 3-7 "
    "bullet points covering the most important content, "
    "and finish with any actionable items or open "
    "questions if present. Stay under 250 words. Do not "
    "invent content; if the document is short or sparse, "
    "say so explicitly."
)

CHAT_SYSTEM_PROMPT = (
    "You are answering questions about a single "
    "document. Treat the document as the primary source "
    "and quote short passages when they directly answer "
    "the question. When the document does not cover the "
    "question, you may draw on the web search results "
    "provided below (cite the source URL) or on your own "
    "general knowledge -- just make clear when you are "
    "going beyond the document. If a 'Web search' section "
    "says the capability is unavailable and the question "
    "needs external or current information, tell the user "
    "plainly that web search is off and how to enable it, "
    "instead of pretending the document should contain the "
    "answer. Keep answers brief unless the user asks for "
    "depth -- 4 sentences or fewer by default. Markdown is "
    "fine."
)


def summarize_kb_file(
    sources: list[dict],
    rel_path: str,
    model_str: str,
    ai: dict,
    *,
    cloud_url: str = "",
    cloud_api_key: str = "",
) -> tuple[str, str]:
    """Read ``rel_path`` from the KB and return its
    summary along with the md5 of the file's contents at
    summarization time. The hash lets callers cache the
    result and detect staleness on a later edit.

    :raises ValueError: When the file is missing or
        empty.
    """
    content = read_file(sources, rel_path)
    if content is None:
        raise ValueError(f"File not found: {rel_path}")
    if not content.strip():
        raise ValueError("File is empty")
    truncated = content[:MAX_CHARS]
    suffix = (
        "\n\n[Truncated; document continues beyond "
        f"{MAX_CHARS} characters.]"
        if len(content) > MAX_CHARS else ""
    )
    prompt = (
        f"Document path: {rel_path}\n\n"
        f"---\n\n{truncated}{suffix}"
    )
    summary = _complete(
        prompt=prompt,
        model_str=model_str,
        ai=ai,
        cloud_url=cloud_url,
        cloud_api_key=cloud_api_key,
    )
    # Match kb_index._hash_file: md5 of the raw bytes on
    # disk so the staleness check against record.hash is
    # apples-to-apples.
    file_hash = _hash_file_bytes(sources, rel_path)
    return summary, file_hash


def chat_about_kb_file(
    sources: list[dict],
    rel_path: str,
    question: str,
    history: list[dict],
    model_str: str,
    ai: dict,
    *,
    cached_summary: str = "",
    cloud_url: str = "",
    cloud_api_key: str = "",
) -> str:
    """Answer a follow-up question about a KB file.

    The full file content (truncated like the summarize
    path), the cached summary if any, and the running
    Q/A history are stitched into a single prompt and
    routed through ``_complete``.

    :param history: List of ``{role: "user"|"assistant",
        content: str}`` dicts from earlier turns.
    """
    content = read_file(sources, rel_path)
    if content is None:
        raise ValueError(f"File not found: {rel_path}")
    truncated = content[:MAX_CHARS]
    suffix = (
        "\n\n[Truncated; document continues beyond "
        f"{MAX_CHARS} characters.]"
        if len(content) > MAX_CHARS else ""
    )
    sections = [
        f"# Document: {rel_path}",
        "",
        truncated + suffix,
    ]
    if cached_summary.strip():
        sections.extend([
            "",
            "---",
            "",
            "## Existing summary (for context only)",
            "",
            cached_summary.strip(),
        ])
    if history:
        sections.extend([
            "",
            "---",
            "",
            "## Conversation so far",
            "",
        ])
        for turn in history:
            role = turn.get("role", "user")
            text = (turn.get("content") or "").strip()
            if not text:
                continue
            label = (
                "User" if role == "user" else "Assistant"
            )
            sections.append(f"**{label}:** {text}")
    sections.extend(_web_context_section(question))
    sections.extend([
        "",
        "---",
        "",
        f"**Question:** {question.strip()}",
    ])
    prompt = "\n".join(sections)
    return _complete(
        prompt=prompt,
        model_str=model_str,
        ai=ai,
        cloud_url=cloud_url,
        cloud_api_key=cloud_api_key,
        system_prompt=CHAT_SYSTEM_PROMPT,
    )


def _web_context_section(question: str) -> list[str]:
    """Build the ``## Web search`` prompt section.

    Always attempts a search so the chat can answer beyond
    the document: Brave/Tavily when a key is configured,
    otherwise a keyless DuckDuckGo fetch. On failure the
    section states the capability is unavailable and how to
    enable it, so the model can relay an actionable message
    instead of pretending the document is the only source.
    """
    from . import websearch
    result = websearch.web_search(question, max_results=5)
    results = result.get("results") or []
    if results:
        lines = [
            "", "---", "",
            "## Web search results",
            "(Use these for anything the document does not "
            "cover; cite the source URL.)",
            "",
        ]
        for hit in results:
            title = hit.get("title", "").strip()
            url = hit.get("url", "").strip()
            snippet = (hit.get("snippet") or "").strip()
            lines.append(f"- **{title}** — {url}")
            if snippet:
                lines.append(f"  {snippet}")
        return lines

    hint = (
        " Adding a Brave or Tavily API key under "
        "Settings -> AI enables higher-quality search."
        if not websearch.has_search_keys() else ""
    )
    return [
        "", "---", "",
        "## Web search",
        "Web search is currently unavailable, so external "
        "or current information cannot be looked up." + hint,
    ]


def _hash_file_bytes(
    sources: list[dict], rel_path: str,
) -> str:
    """Return the md5 of the on-disk bytes of a KB file.
    Resolved through the same source pipeline as
    ``read_file`` so source labels stay authoritative.
    """
    from .knowledge import resolve_path
    abs_path = resolve_path(sources, rel_path)
    if abs_path is None:
        return ""
    digest = hashlib.md5()  # noqa: S324
    try:
        with open(abs_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                digest.update(chunk)
    except OSError:
        return ""
    return digest.hexdigest()


def _complete(
    *,
    prompt: str,
    model_str: str,
    ai: dict,
    cloud_url: str,
    cloud_api_key: str,
    system_prompt: str = SYSTEM_PROMPT,
) -> str:
    """Single-shot completion routed to whichever provider
    the model string points at. Mirrors the dispatch in
    ``advisor.ask`` but without the agentic loop."""
    provider, model_name = _parse_model(model_str)
    if provider == "claude_cli":
        full = f"{system_prompt}\n\n---\n\n{prompt}"
        return ask_claude_cli(model_name, full)
    if provider == "claude":
        return ask_claude(
            model_name, prompt,
            api_key=ai.get("claude_api_key", ""),
            system_prompt=system_prompt,
        )
    if provider == "lm_studio":
        url = ai.get(
            "lm_studio_base_url", "",
        ).rstrip("/") + "/v1"
        return ask_openai_compatible(
            model_name, prompt,
            base_url=url,
            system_prompt=system_prompt,
        )
    if provider == "openrouter":
        return ask_openai_compatible(
            model_name, prompt,
            base_url=ai.get("openrouter_base_url", ""),
            api_key=ai.get("openrouter_api_key", ""),
            system_prompt=system_prompt,
        )
    if provider == "openai":
        return ask_openai_compatible(
            model_name, prompt,
            base_url=ai.get("openai_base_url", ""),
            api_key=ai.get("openai_api_key", ""),
            system_prompt=system_prompt,
        )
    if provider == "kaisho":
        return _ask_kaisho_cloud(
            model_name=model_name,
            prompt=prompt,
            cloud_url=cloud_url,
            cloud_api_key=cloud_api_key,
            system_prompt=system_prompt,
        )
    if provider == "ollama_cloud":
        return ask_ollama(
            model_name, prompt,
            ai.get("ollama_cloud_url", ""),
            api_key=ai.get("ollama_cloud_api_key", ""),
            system_prompt=system_prompt,
        )
    # Default to local Ollama.
    return ask_ollama(
        model_name, prompt,
        ai.get(
            "ollama_base_url", "http://localhost:11434",
        ),
        api_key=ai.get("ollama_api_key", ""),
        system_prompt=system_prompt,
    )


def _ask_kaisho_cloud(
    *,
    model_name: str,
    prompt: str,
    cloud_url: str,
    cloud_api_key: str,
    system_prompt: str = SYSTEM_PROMPT,
) -> str:
    """Bare Kaisho-cloud completion -- no agentic tools.
    Lazy-imports cloud_sync to avoid a circular import."""
    from .cloud_sync import cloud_ai_agentic
    return cloud_ai_agentic(
        cloud_url=cloud_url,
        api_key=cloud_api_key,
        mode=model_name or "default",
        system=system_prompt,
        prompt=prompt,
        tools=[],
        tool_executor=None,
    )


# ---------------------------------------------------------------------------
# Settings helpers
# ---------------------------------------------------------------------------


def resolve_summarize_model(ai: dict) -> str:
    """Pick the best available model for summaries.

    The advisor model is the natural fit -- it's the
    user's "thinking" model. Falls back to the cron
    model, then to a sensible default if neither is set.
    """
    return (
        ai.get("advisor_model")
        or ai.get("cron_model")
        or "kaisho:advisor"
    )


def build_inbox_text(rel_path: str) -> str:
    """Title-style headline for an inbox entry created
    from a summary. Uses the filename without extension
    so the inbox row reads naturally."""
    name = Path(rel_path).stem
    return f"Summary: {name}"
