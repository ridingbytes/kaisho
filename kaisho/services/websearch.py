"""Web search, provider-agnostic.

One entry point, :func:`web_search`, tries the configured
providers in priority order (Brave > Tavily) and falls back
to scraping DuckDuckGo when no API key is set. Extracted from
the cron tool layer so both the advisor/cron tools and other
services (e.g. the KB document chat) share one implementation
instead of duplicating provider quirks.
"""
import gzip
import json
import re
import urllib.parse
import urllib.request

from ..config import get_config
from .settings import get_ai_settings, load_settings


def search_keys() -> dict[str, str]:
    """Return the configured search API keys."""
    cfg = get_config()
    ai = get_ai_settings(load_settings(cfg.SETTINGS_FILE))
    return {
        "brave": ai.get("brave_api_key", ""),
        "tavily": ai.get("tavily_api_key", ""),
    }


def has_search_keys() -> bool:
    """True when at least one real search provider (Brave or
    Tavily) is configured. DuckDuckGo needs no key but is a
    scraping fallback, so it does not count as "configured"."""
    keys = search_keys()
    return bool(keys["brave"] or keys["tavily"])


def search_brave(
    query: str, api_key: str, max_results: int,
) -> dict:
    """Search via the Brave Search API."""
    url = (
        "https://api.search.brave.com/res/v1/web/search?"
        + urllib.parse.urlencode({
            "q": query, "count": max_results,
        })
    )
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": api_key,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        data = json.loads(raw)
    results = []
    for item in (data.get("web", {}).get("results") or []):
        results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("description", ""),
        })
        if len(results) >= max_results:
            break
    return {"results": results, "provider": "brave"}


def search_tavily(
    query: str, api_key: str, max_results: int,
) -> dict:
    """Search via the Tavily Search API."""
    payload = json.dumps({
        "query": query,
        "max_results": max_results,
        "include_answer": False,
    }).encode()
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    results = []
    for item in (data.get("results") or []):
        results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("content", ""),
        })
        if len(results) >= max_results:
            break
    return {"results": results, "provider": "tavily"}


def search_duckduckgo(query: str, max_results: int) -> dict:
    """Fallback: scrape DuckDuckGo HTML results."""
    url = (
        "https://html.duckduckgo.com/html/?q="
        + urllib.parse.quote_plus(query)
    )
    req = urllib.request.Request(url, headers={
        "User-Agent": (
            "Mozilla/5.0 (compatible; kaisho/1.0)"
        ),
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read(200_000).decode(
            "utf-8", errors="replace",
        )

    results = []
    for m in re.finditer(
        r'<a rel="nofollow" class="result__a"'
        r' href="([^"]+)"[^>]*>(.*?)</a>',
        html,
    ):
        href = m.group(1)
        title = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if not title or "duckduckgo" in href.lower():
            continue
        results.append({"title": title, "url": href})
        if len(results) >= max_results:
            break

    snippet_blocks = re.findall(
        r'<a class="result__snippet"[^>]*>(.*?)</a>',
        html,
    )
    for i, snip in enumerate(snippet_blocks):
        if i < len(results):
            results[i]["snippet"] = re.sub(
                r"<[^>]+>", "", snip,
            ).strip()

    return {"results": results, "provider": "duckduckgo"}


def web_search(query: str, max_results: int = 5) -> dict:
    """Search the web using the best available provider.

    Priority: Brave > Tavily > DuckDuckGo (fallback). Returns
    ``{"results": [...], "provider": name}`` or
    ``{"error": ...}`` when every provider fails.
    """
    keys = search_keys()
    providers = []
    if keys["brave"]:
        providers.append(
            lambda: search_brave(
                query, keys["brave"], max_results,
            )
        )
    if keys["tavily"]:
        providers.append(
            lambda: search_tavily(
                query, keys["tavily"], max_results,
            )
        )
    providers.append(
        lambda: search_duckduckgo(query, max_results)
    )

    last_error = ""
    for search_fn in providers:
        try:
            return search_fn()
        except (OSError, ValueError) as exc:
            last_error = str(exc)
    if not (keys["brave"] or keys["tavily"]):
        return {
            "error": (
                "Web search is unavailable: no Brave or "
                "Tavily API key is configured and the "
                "keyless fallback failed. Add a Brave or "
                "Tavily API key under Settings -> AI to "
                "enable web search. "
                f"(last error: {last_error})"
            ),
        }
    return {
        "error": f"All search providers failed: {last_error}",
    }
