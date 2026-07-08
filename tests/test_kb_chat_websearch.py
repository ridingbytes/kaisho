"""Tests for web-search augmentation of the KB document
chat, and the actionable no-key error from the shared web
search service."""
from kaisho.services import summarize
from kaisho.services import websearch


def _join(section):
    return "\n".join(section)


def test_web_section_injects_results(monkeypatch):
    monkeypatch.setattr(
        websearch, "web_search",
        lambda q, max_results=5: {
            "results": [
                {
                    "title": "npm vs npx",
                    "url": "https://example.com/x",
                    "snippet": "npx runs binaries.",
                },
            ],
            "provider": "brave",
        },
    )
    text = _join(summarize._web_context_section("npx vs npm"))
    assert "Web search results" in text
    assert "npm vs npx" in text
    assert "https://example.com/x" in text
    assert "npx runs binaries." in text


def test_web_section_no_keys_points_to_settings(
    monkeypatch,
):
    monkeypatch.setattr(
        websearch, "web_search",
        lambda q, max_results=5: {"error": "boom"},
    )
    monkeypatch.setattr(
        websearch, "has_search_keys",
        lambda: False,
    )
    text = _join(summarize._web_context_section("q"))
    assert "unavailable" in text.lower()
    assert "Settings" in text
    assert "Brave" in text or "Tavily" in text


def test_web_section_with_keys_omits_setup_hint(
    monkeypatch,
):
    monkeypatch.setattr(
        websearch, "web_search",
        lambda q, max_results=5: {"error": "boom"},
    )
    monkeypatch.setattr(
        websearch, "has_search_keys",
        lambda: True,
    )
    text = _join(summarize._web_context_section("q"))
    assert "unavailable" in text.lower()
    assert "Settings -> AI enables" not in text


def test_web_search_no_key_error_is_actionable(
    monkeypatch,
):
    """When all providers fail and no key is set, the shared
    web_search returns an error naming the missing key and
    where to configure it (so the advisor can relay it)."""
    monkeypatch.setattr(
        websearch, "search_keys",
        lambda: {"brave": "", "tavily": ""},
    )

    def boom(*a, **kw):
        raise OSError("network down")

    monkeypatch.setattr(websearch, "search_brave", boom)
    monkeypatch.setattr(websearch, "search_tavily", boom)
    monkeypatch.setattr(websearch, "search_duckduckgo", boom)

    out = websearch.web_search("anything")
    assert "error" in out
    assert "Brave" in out["error"]
    assert "Settings" in out["error"]
