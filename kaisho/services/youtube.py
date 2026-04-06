"""YouTube transcript service.

Fetches subtitles / auto-generated captions for a YouTube video and
returns them as plain text. Uses youtube-transcript-api >= 1.0, which
requires no API key and works with both manual and auto-generated
captions.

API (1.x):
    api = YouTubeTranscriptApi()
    transcript_list = api.list(video_id)        -> TranscriptList
    transcript = transcript_list.find_transcript(['en', 'de'])
    fetched = transcript.fetch()                -> FetchedTranscript
    for snippet in fetched:
        snippet.text, snippet.start, snippet.duration
"""
import re


# ---------------------------------------------------------------------------
# Video ID extraction
# ---------------------------------------------------------------------------

_PATTERNS = [
    r"youtu\.be/([A-Za-z0-9_-]{11})",
    r"youtube\.com/(?:watch\?.*?v=|shorts/)([A-Za-z0-9_-]{11})",
    r"youtube\.com/embed/([A-Za-z0-9_-]{11})",
    r"^([A-Za-z0-9_-]{11})$",
]


def extract_video_id(url_or_id: str) -> str:
    """Return the 11-character YouTube video ID from a URL or bare ID.

    Raises ValueError if the input cannot be parsed.
    """
    url_or_id = url_or_id.strip()
    for pattern in _PATTERNS:
        m = re.search(pattern, url_or_id)
        if m:
            return m.group(1)
    raise ValueError(f"Cannot extract video ID from: {url_or_id!r}")


# ---------------------------------------------------------------------------
# Transcript fetching
# ---------------------------------------------------------------------------

def get_transcript(
    video_id: str,
    languages: list[str] | None = None,
):
    """Return a FetchedTranscript for the video.

    ``languages`` is a preference list tried in order; falls back to
    auto-generated captions when no manual match is found.
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    langs = languages or ["en", "de"]
    api = YouTubeTranscriptApi()
    transcript_list = api.list(video_id)
    transcript = transcript_list.find_transcript(langs)
    return transcript.fetch()


def format_transcript(fetched, include_timestamps: bool = False) -> str:
    """Format a FetchedTranscript as readable plain text."""
    lines = []
    for snippet in fetched:
        text = snippet.text.strip()
        if not text:
            continue
        if include_timestamps:
            start = int(snippet.start)
            minutes, seconds = divmod(start, 60)
            lines.append(f"[{minutes:02d}:{seconds:02d}] {text}")
        else:
            lines.append(text)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Available languages
# ---------------------------------------------------------------------------

def list_available_languages(video_id: str) -> list[dict]:
    """Return available transcript languages for a video.

    Each item: {"code": str, "name": str, "is_generated": bool}
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    api = YouTubeTranscriptApi()
    result = []
    for t in api.list(video_id):
        result.append({
            "code": t.language_code,
            "name": t.language,
            "is_generated": t.is_generated,
        })
    return result


# ---------------------------------------------------------------------------
# High-level helper
# ---------------------------------------------------------------------------

def transcribe(
    url_or_id: str,
    languages: list[str] | None = None,
    include_timestamps: bool = False,
) -> dict:
    """Extract video ID, fetch transcript, return formatted text + metadata.

    Returns:
        {
            "video_id": str,
            "url": str,
            "transcript": str,
            "entry_count": int,
        }
    """
    video_id = extract_video_id(url_or_id)
    fetched = get_transcript(video_id, languages=languages)
    text = format_transcript(fetched, include_timestamps=include_timestamps)
    return {
        "video_id": video_id,
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "transcript": text,
        "entry_count": len(fetched),
    }
