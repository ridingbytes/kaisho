"""Shared AI provider utilities.

Used by both the advisor service and the cron executor.
"""
import json

# Known AI provider prefixes
_PROVIDERS = {
    "ollama", "ollama_cloud", "claude",
    "claude_cli", "lm_studio", "openrouter",
    "openai", "kaisho",
}


def parse_model(model_str: str) -> tuple[str, str]:
    """Return (provider, model_name) from a model string.

    :param model_str: Model identifier like
        ``ollama:qwen3:14b`` or ``claude:claude-sonnet-4``.
    :returns: Tuple of (provider, model_name).
        Falls back to ``("ollama", model_str)`` if no
        known provider prefix is found.
    """
    if ":" in model_str:
        provider, name = model_str.split(":", 1)
        if provider in _PROVIDERS:
            return provider, name
    return "ollama", model_str


def http_post(
    url: str,
    payload: bytes,
    headers: dict,
    timeout: int = 300,
) -> dict:
    """POST JSON and return parsed response.

    :param url: Target URL.
    :param payload: JSON-encoded request body.
    :param headers: HTTP headers dict.
    :param timeout: Request timeout in seconds.
    :returns: Parsed JSON response.
    """
    import urllib.request
    req = urllib.request.Request(
        url, data=payload, headers=headers,
    )
    with urllib.request.urlopen(
        req, timeout=timeout,
    ) as resp:
        return json.loads(resp.read())


def extract_claude_text(content) -> str:
    """Extract text from Claude response content blocks.

    :param content: List of content blocks from the
        Anthropic API response.
    :returns: Text from the first text block, or empty
        string if none found.
    """
    for block in content:
        if hasattr(block, "text"):
            return block.text
    return ""
