import sys

import click

from ..services.youtube import list_available_languages, transcribe


@click.group("youtube")
def youtube_cmd():
    """YouTube video tools (transcription, language listing)."""


@youtube_cmd.command("transcribe")
@click.argument("url")
@click.option(
    "--lang", "-l",
    default="en,de",
    show_default=True,
    help="Comma-separated language preference list, e.g. en,de,fr",
)
@click.option(
    "--timestamps", "-t",
    is_flag=True,
    default=False,
    help="Include [MM:SS] timestamps in the output",
)
def transcribe_cmd(url, lang, timestamps):
    """Fetch and print the transcript of a YouTube video.

    URL can be a full YouTube URL or a bare 11-character video ID.
    """
    languages = [code.strip() for code in lang.split(",") if code.strip()]
    click.echo(f"Fetching transcript for {url} …", err=True)
    try:
        result = transcribe(
            url,
            languages=languages,
            include_timestamps=timestamps,
        )
    except ValueError as exc:
        click.echo(f"Error: {exc}", err=True)
        sys.exit(1)
    except OSError as exc:
        click.echo(
            f"Error fetching transcript: {exc}",
            err=True,
        )
        sys.exit(1)

    click.echo(
        f"Video: {result['url']}  ({result['entry_count']} segments)",
        err=True,
    )
    click.echo("")
    click.echo(result["transcript"])


@youtube_cmd.command("languages")
@click.argument("url")
def languages_cmd(url):
    """List available transcript languages for a YouTube video."""
    from ..services.youtube import extract_video_id

    try:
        video_id = extract_video_id(url)
        langs = list_available_languages(video_id)
    except ValueError as exc:
        click.echo(f"Error: {exc}", err=True)
        sys.exit(1)
    except OSError as exc:
        click.echo(f"Error: {exc}", err=True)
        sys.exit(1)

    if not langs:
        click.echo("No transcripts available for this video.")
        return

    for lang in langs:
        generated = " (auto-generated)" if lang["is_generated"] else ""
        click.echo(f"  {lang['code']:8s}  {lang['name']}{generated}")
