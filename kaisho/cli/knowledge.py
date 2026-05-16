import json
import sys

import click

from ..config import get_config
from ..services import kb_index, summarize
from ..services import knowledge as kb_service
from ..services import settings as settings_svc
from ..services.settings import current_kb_sources


def _sources():
    return current_kb_sources()


def _profile_dir():
    return get_config().PROFILE_DIR


def _load_ai_settings():
    """Return the active profile's AI + cloud-sync
    settings as a (ai_dict, cloud_url, cloud_api_key)
    tuple. Used by every command that calls a model."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    ai = settings_svc.get_ai_settings(data)
    sync = data.get("cloud_sync", {})
    return ai, sync.get("url", ""), sync.get("api_key", "")


def _resolve_label_or_exit(path: str) -> tuple[str, list]:
    """Resolve ``path`` under the configured KB sources or
    exit with a friendly error. Returns ``(label,
    sources)``."""
    sources = _sources()
    label = kb_service.resolve_label(sources, path)
    if label is None:
        click.echo(f"File not found: {path}", err=True)
        sys.exit(1)
    return label, sources


@click.group("kb")
def knowledge():
    """Search and browse the knowledge base."""


@knowledge.command("list")
@click.option(
    "--tag", "tags",
    multiple=True,
    help=(
        "Restrict to files whose metadata tags include "
        "ALL given values. Repeat the flag for multiple "
        "tags (AND semantics)."
    ),
)
@click.option(
    "--status",
    default=None,
    help="Restrict to files with this metadata status.",
)
@click.option("--json", "as_json", is_flag=True)
def kb_list(tags, status, as_json):
    """List all files in the knowledge base.

    The text output includes title / tags / status when
    set in the metadata index. JSON output always
    includes every enriched field.
    """
    entries = kb_service.file_tree(
        _sources(), _profile_dir(),
    )
    required_tags = set(tags)
    if required_tags or status:
        entries = [
            e for e in entries
            if e.get("kind") == "file"
            and required_tags.issubset(set(e.get("tags") or []))
            and (status is None or e.get("status") == status)
        ]
    if as_json:
        click.echo(json.dumps(entries, default=str))
        return
    if not entries:
        click.echo("No knowledge base files found.")
        return
    for e in entries:
        if e.get("kind") == "folder":
            click.echo(
                f"[{e['label']}]  {e['path']}/  (folder)",
            )
            continue
        size_kb = e["size"] / 1024
        title = e.get("title") or ""
        chips = []
        if e.get("tags"):
            chips.append("#" + " #".join(e["tags"]))
        if e.get("status"):
            chips.append(f"[{e['status']}]")
        meta = " ".join(chips)
        line = (
            f"[{e['label']}]  {e['path']:<50}"
            f"  {size_kb:>5.1f} KB"
        )
        if title:
            line += f"  -- {title}"
        if meta:
            line += f"  {meta}"
        click.echo(line)


@knowledge.command("show")
@click.argument("path")
def kb_show(path):
    """Show the contents of a knowledge base file."""
    content = kb_service.read_file(_sources(), path)
    if content is None:
        click.echo(f"File not found: {path}", err=True)
        sys.exit(1)
    click.echo(content, nl=False)


@knowledge.command("search")
@click.argument("query", nargs=-1, required=True)
@click.option(
    "--max", "max_files", default=50, show_default=True,
    help="Maximum number of distinct files to surface.",
)
@click.option(
    "--max-per-file", "max_hits_per_file",
    default=20, show_default=True,
    help="Maximum hits surfaced per file.",
)
@click.option(
    "--path", "paths",
    multiple=True,
    help=(
        "Restrict the search to these relative file paths. "
        "Repeat to add more. Combines with --tag."
    ),
)
@click.option(
    "--tag", "tags",
    multiple=True,
    help=(
        "Restrict the search to files whose metadata tags "
        "include ALL given values."
    ),
)
@click.option("--json", "as_json", is_flag=True)
def kb_search(
    query, max_files, max_hits_per_file,
    paths, tags, as_json,
):
    """Search knowledge base files for a query.

    With --path and/or --tag the search is scoped to a
    pre-filtered subset, mirroring the "filter then
    search" pattern in the UI.
    """
    q = " ".join(query)
    scope = list(paths) if paths else None
    if tags:
        # Resolve the tag filter against the file tree
        # so the service-level ``paths`` filter sees a
        # concrete list of relative paths.
        required = set(tags)
        tree = kb_service.file_tree(
            _sources(), _profile_dir(),
        )
        tagged = [
            e["path"] for e in tree
            if e.get("kind") == "file"
            and required.issubset(set(e.get("tags") or []))
        ]
        scope = (
            [p for p in scope if p in tagged]
            if scope is not None else tagged
        )
        if not scope:
            if as_json:
                click.echo("[]")
            else:
                click.echo(f"No results for: {q}")
            return
    results = kb_service.search(
        _sources(), q,
        max_files=max_files,
        max_hits_per_file=max_hits_per_file,
        paths=scope,
    )
    if as_json:
        click.echo(json.dumps(results, default=str))
        return
    if not results:
        click.echo(f"No results for: {q}")
        return
    for r in results:
        click.echo(
            f"[{r['label']}]  {r['path']}:{r['line_number']}"
        )
        click.echo(f"  {r['snippet']}")


@knowledge.command("reindex")
@click.option(
    "--apply", is_flag=True,
    help="Persist the index to disk (default is dry-run).",
)
def kb_reindex(apply):
    """Sync the metadata index with the KB on disk.

    Hashes each file, detects renames (path changed but
    content matches), and prunes records for files that
    have disappeared. Source files are never modified.
    When ``--apply`` is set, the PDF text cache is also
    pre-warmed so the next content search is fast.
    """
    sources = _sources()
    _records, report = kb_index.reindex(
        _profile_dir(),
        kb_service.iter_kb_files(sources),
        apply=apply,
    )
    if apply:
        warmed, pruned_cache = kb_service.refresh_pdf_cache(
            sources,
        )
        if warmed or pruned_cache:
            click.echo(
                f"PDF cache: warmed {warmed}, "
                f"pruned {pruned_cache}",
            )
    click.echo(
        f"Scanned {report.scanned} file(s): "
        f"+{report.added} added, "
        f"~{report.updated} updated, "
        f"⇌{report.renamed} renamed, "
        f"-{report.pruned} pruned, "
        f"={report.unchanged} unchanged."
    )
    if not apply:
        click.echo("Dry run. Re-run with --apply to write.")


@knowledge.group("cache")
def kb_cache():
    """Manage the on-disk PDF text cache."""


@kb_cache.command("info")
def kb_cache_info():
    """Show cache directory size and entry count."""
    info = kb_service.pdf_cache_info()
    if info["path"] is None:
        click.echo("PDF cache not initialised.")
        return
    mb = info["size_bytes"] / 1024 / 1024
    click.echo(f"Path:    {info['path']}")
    click.echo(f"Entries: {info['entries']}")
    click.echo(f"Size:    {mb:.1f} MB")


@kb_cache.command("clear")
def kb_cache_clear():
    """Wipe the on-disk PDF text cache."""
    n = kb_service.clear_pdf_cache()
    click.echo(f"Removed {n} cache file(s).")


@kb_cache.command("warm")
def kb_cache_warm():
    """Pre-extract every PDF's text into the cache so
    subsequent searches stay fast."""
    warmed, pruned = kb_service.refresh_pdf_cache(
        _sources(),
    )
    click.echo(f"Warmed {warmed}, pruned {pruned}.")


@knowledge.command("import-frontmatter")
@click.option(
    "--apply", is_flag=True,
    help="Persist the merged index (default is dry-run).",
)
def kb_import_frontmatter(apply):
    """One-shot: copy YAML frontmatter from markdown files
    into the metadata index.

    Files on disk are not modified. Existing index values
    win when both sides set the same key, so running this
    after manual UI tagging is safe.
    """
    _records, count = kb_index.import_frontmatter(
        _profile_dir(),
        kb_service.iter_markdown_files(_sources()),
        apply=apply,
    )
    click.echo(
        f"Imported frontmatter from {count} markdown "
        f"file(s)."
    )
    if not apply:
        click.echo("Dry run. Re-run with --apply to write.")


@knowledge.command("summarize")
@click.argument("path")
@click.option(
    "--force", is_flag=True,
    help=(
        "Re-run the model even when a fresh cached "
        "summary exists."
    ),
)
@click.option(
    "--no-cache", is_flag=True,
    help=(
        "Skip persisting the result. Useful for "
        "one-off ad-hoc summaries."
    ),
)
@click.option(
    "--model",
    default=None,
    help=(
        "Override the model string (provider:name). "
        "Defaults to the configured advisor model."
    ),
)
@click.option("--json", "as_json", is_flag=True)
def kb_summarize(path, force, no_cache, model, as_json):
    """Summarize a single KB file via the configured AI
    model. Prints the summary as Markdown to stdout."""
    label, sources = _resolve_label_or_exit(path)
    ai, cloud_url, cloud_api_key = _load_ai_settings()

    cached = kb_index.get_summary(
        _profile_dir(), label, path,
    )
    summary_text = ""
    summary_model = ""
    used_cache = False
    stale = False

    if (
        not force
        and cached is not None
        and not cached["stale"]
    ):
        summary_text = cached["summary"]
        summary_model = cached["model"]
        used_cache = True
    else:
        model_str = (
            model or summarize.resolve_summarize_model(ai)
        )
        try:
            summary_text, file_hash = (
                summarize.summarize_kb_file(
                    sources=sources,
                    rel_path=path,
                    model_str=model_str,
                    ai=ai,
                    cloud_url=cloud_url,
                    cloud_api_key=cloud_api_key,
                )
            )
        except ValueError as e:
            click.echo(str(e), err=True)
            sys.exit(1)
        summary_model = model_str
        stale = (
            cached is not None and cached["stale"]
        )
        if not no_cache:
            kb_index.save_summary(
                _profile_dir(), label, path,
                summary=summary_text,
                model=summary_model,
                file_hash=file_hash,
            )

    if as_json:
        click.echo(json.dumps({
            "path": path,
            "model": summary_model,
            "cached": used_cache,
            "stale": stale,
            "summary": summary_text,
        }, default=str))
        return
    click.echo(summary_text, nl=not summary_text.endswith("\n"))


@knowledge.command("forget-summary")
@click.argument("path")
def kb_forget_summary(path):
    """Remove the cached summary for a single KB file."""
    label, _ = _resolve_label_or_exit(path)
    cleared = kb_index.clear_summary(
        _profile_dir(), label, path,
    )
    if cleared:
        click.echo(f"Cleared cached summary for {path}.")
    else:
        click.echo(
            f"No cached summary for {path}.", err=True,
        )


# ---------------------------------------------------------------------------
# Metadata index inspection / editing
# ---------------------------------------------------------------------------


@knowledge.command("list-tags")
@click.option("--json", "as_json", is_flag=True)
def kb_list_tags(as_json):
    """List every free-text tag used across the KB."""
    tags = kb_service.list_tags(_profile_dir())
    if as_json:
        click.echo(json.dumps(tags))
        return
    for tag in tags:
        click.echo(tag)


@knowledge.command("retag")
@click.argument("old_tag")
@click.argument("new_tag")
@click.option("--json", "as_json", is_flag=True)
def kb_retag(old_tag, new_tag, as_json):
    """Rename a tag across every record in the metadata
    index. Records already carrying NEW_TAG drop the old
    one without duplicating (merge semantics)."""
    try:
        result = kb_index.rename_tag(
            _profile_dir(), old_tag, new_tag,
        )
    except ValueError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(result))
        return
    click.echo(
        f"Renamed {result['renamed']} record(s); "
        f"merged into existing tag on "
        f"{result['merged']} record(s)."
    )


@knowledge.command("get-metadata")
@click.argument("path")
@click.option("--json", "as_json", is_flag=True)
def kb_get_metadata(path, as_json):
    """Show the indexed metadata for a single KB file."""
    sources = _sources()
    meta = kb_service.get_metadata(
        sources, _profile_dir(), path,
    )
    if meta is None:
        click.echo(f"File not found: {path}", err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(meta, default=str))
        return
    if not meta.get("title") and not meta.get("tags"):
        click.echo("(no metadata set)")
        return
    if meta.get("title"):
        click.echo(f"title:    {meta['title']}")
    if meta.get("tags"):
        click.echo(f"tags:     {', '.join(meta['tags'])}")
    for key in ("created", "customer", "task_id",
                "type", "status"):
        if meta.get(key):
            click.echo(f"{key + ':':<10}{meta[key]}")


def _normalize_optional(value: str | None) -> str | None:
    """Treat the literal ``-`` as "clear this key"; empty
    string as "leave alone"; anything else as the value."""
    if value is None:
        return None
    if value == "-":
        return None
    return value or None


@knowledge.command("set-metadata")
@click.argument("path")
@click.option("--title", default=None,
              help="Pass ``-`` to clear.")
@click.option(
    "--tags",
    default=None,
    help=(
        "Comma-separated tag list. Pass an empty string "
        "to clear all tags."
    ),
)
@click.option(
    "--add-tag", "add_tags",
    multiple=True,
    help="Append a tag without touching existing tags.",
)
@click.option(
    "--remove-tag", "remove_tags",
    multiple=True,
    help="Remove a tag without touching the rest.",
)
@click.option("--customer", default=None,
              help="Pass ``-`` to clear.")
@click.option("--task-id", default=None,
              help="Pass ``-`` to clear.")
@click.option("--type", "type_", default=None,
              help="Pass ``-`` to clear.")
@click.option("--status", default=None,
              help="Pass ``-`` to clear.")
@click.option("--created", default=None,
              help="ISO date; pass ``-`` to clear.")
@click.option("--json", "as_json", is_flag=True)
def kb_set_metadata(
    path, title, tags, add_tags, remove_tags,
    customer, task_id, type_, status, created, as_json,
):
    """Patch a KB file's metadata in the index.

    Files on disk are never modified -- writes go to
    ``<profile>/kb_meta.yaml``.
    """
    label, sources = _resolve_label_or_exit(path)
    patch: dict[str, object] = {}
    if title is not None:
        patch["title"] = "" if title == "-" else title
    if tags is not None:
        patch["tags"] = [
            t.strip() for t in tags.split(",") if t.strip()
        ]
    if add_tags or remove_tags:
        # Apply add/remove on top of whatever is already
        # in the index so partial edits compose.
        current = kb_service.get_metadata(
            sources, _profile_dir(), path,
        ) or {}
        existing = list(
            patch.get("tags", current.get("tags", []))
        )
        for t in add_tags:
            if t not in existing:
                existing.append(t)
        for t in remove_tags:
            existing = [x for x in existing if x != t]
        patch["tags"] = existing
    for key, value in (
        ("customer", customer),
        ("task_id", task_id),
        ("type", type_),
        ("status", status),
        ("created", created),
    ):
        if value is not None:
            patch[key] = _normalize_optional(value)
    if not patch:
        click.echo(
            "Nothing to update -- pass at least one "
            "field flag.", err=True,
        )
        sys.exit(2)
    updated = kb_service.update_metadata(
        sources, _profile_dir(), path, patch,
    )
    if as_json:
        click.echo(json.dumps(updated, default=str))
        return
    click.echo(f"Updated metadata for {path}.")


# ---------------------------------------------------------------------------
# File-management commands
# ---------------------------------------------------------------------------


@knowledge.command("write")
@click.argument("label")
@click.argument("path")
@click.option(
    "-c", "--content",
    default=None,
    help=(
        "Inline content. When omitted the command reads "
        "from stdin so you can pipe Markdown in."
    ),
)
def kb_write(label, path, content):
    """Create or overwrite a KB file under ``label``."""
    sources = _sources()
    labels = {s["label"] for s in sources}
    if label not in labels:
        click.echo(
            f"Unknown KB source: {label!r}", err=True,
        )
        sys.exit(1)
    if content is None:
        content = sys.stdin.read()
    result = kb_service.write_file(
        sources, label, path, content,
    )
    click.echo(f"Wrote [{result['label']}] {result['path']}")


@knowledge.command("mkdir")
@click.argument("label")
@click.argument("path")
def kb_mkdir(label, path):
    """Create a folder under ``label``."""
    sources = _sources()
    labels = {s["label"] for s in sources}
    if label not in labels:
        click.echo(
            f"Unknown KB source: {label!r}", err=True,
        )
        sys.exit(1)
    result = kb_service.create_folder(sources, label, path)
    click.echo(
        f"Created [{result['label']}] {result['path']}/",
    )


@knowledge.command("rename")
@click.argument("old_path")
@click.argument("new_path")
def kb_rename(old_path, new_path):
    """Rename / relocate a file inside its KB source."""
    try:
        result = kb_service.rename_file(
            _sources(), old_path, new_path,
        )
    except ValueError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    click.echo(
        f"Renamed to [{result['label']}] {result['path']}",
    )


@knowledge.command("move")
@click.argument("path")
@click.option(
    "--to", "new_label", required=True,
    help="Target source label.",
)
@click.option(
    "--as", "new_path",
    default=None,
    help=(
        "Optional new relative path under the target "
        "label. Defaults to the original path."
    ),
)
def kb_move(path, new_label, new_path):
    """Move a file to a different KB source label."""
    sources = _sources()
    label = kb_service.resolve_label(sources, path)
    if label is None:
        click.echo(f"File not found: {path}", err=True)
        sys.exit(1)
    try:
        result = kb_service.move_file(
            sources, path, label, new_label, new_path,
        )
    except ValueError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    click.echo(
        f"Moved to [{result['label']}] {result['path']}",
    )


@knowledge.command("delete")
@click.argument("path")
@click.option(
    "--yes", "-y", "confirmed", is_flag=True,
    help="Skip the confirmation prompt.",
)
def kb_delete(path, confirmed):
    """Delete a KB file. Irreversible."""
    sources = _sources()
    if not confirmed:
        if not click.confirm(
            f"Really delete {path}?", default=False,
        ):
            click.echo("Aborted.")
            sys.exit(1)
    found = kb_service.delete_file(sources, path)
    if not found:
        click.echo(f"File not found: {path}", err=True)
        sys.exit(1)
    click.echo(f"Deleted {path}.")
