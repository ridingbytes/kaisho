# kai kb

Browse, search, tag, summarize, and edit the knowledge base. Every
HTTP endpoint has a CLI counterpart. All metadata writes go to the
central index at `<profile>/kb_meta.yaml`. KB files on disk are
never modified by these commands except for the explicit content
operations (`write`, `rename`, `move`, `delete`, `mkdir`).

## Reading

### `kb list`

List KB files with metadata (title, tags, status).

```bash
kai kb list [--tag TAG] [--status STATUS] [--json]
```

```bash
kai kb list --tag research --status active
```

### `kb show`

Print the contents of a KB file.

```bash
kai kb show PATH
```

```bash
kai kb show "runbooks/deploy-checklist.md"
```

### `kb search`

Full-text search across all KB sources. Returns file path, line
number, and a snippet for each match.

```bash
kai kb search QUERY... [--path PATH] [--tag TAG] [--max N] [--json]
```

```bash
kai kb search "connection pooling" --tag postgres --max 10
```

### `kb list-tags`

List every tag in use across the index, with counts.

```bash
kai kb list-tags [--json]
```

## Metadata

### `kb get-metadata`

Print the index record for a single file.

```bash
kai kb get-metadata PATH [--json]
```

### `kb set-metadata`

Update one or more metadata fields. Pass `-` as a value to clear a
field. Tag edits accept a comma-separated replacement list, or
incremental add and remove.

```bash
kai kb set-metadata PATH [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--title` | Set display title |
| `--tags` | Replace tags (comma-separated) |
| `--add-tag` | Add a single tag (repeatable) |
| `--remove-tag` | Remove a single tag (repeatable) |
| `--customer` | Linked customer name |
| `--task-id` | Linked task ID |
| `--type` | User-defined type |
| `--status` | Status (e.g. `active`, `archived`) |
| `--created` | Creation date `YYYY-MM-DD` |

```bash
kai kb set-metadata "research/pg.md" \
    --title "Postgres tuning" \
    --add-tag postgres --add-tag perf \
    --customer "Acme Corp" --status active
kai kb set-metadata "research/pg.md" --customer -   # clear
```

### `kb list-tags`

See above under Reading.

### `kb retag`

Rename a tag across every record in the metadata index.
Records that already carry the new tag drop the old one
without duplicating (merge semantics).

```bash
kai kb retag OLD_TAG NEW_TAG [--json]
```

```bash
kai kb retag postgress postgres   # fix typo across all files
kai kb retag perf performance     # merge into a canonical tag
```

The output reports two counts: `renamed` for records where
the tag was swapped, `merged` for records where the new
tag was already present and the old one was simply dropped.

## Index maintenance

### `kb reindex`

Hash files (cached by mtime and size), detect renames (missing
path with a uniquely matching hash reattaches its metadata),
prune records for files that have disappeared. Default is a dry
run; `--apply` writes changes to `kb_meta.yaml`.

```bash
kai kb reindex [--apply]
```

```bash
kai kb reindex             # show what would change
kai kb reindex --apply     # commit changes
```

### `kb import-frontmatter`

One-shot migration helper for users who had YAML frontmatter
blocks in their `.md` files from earlier Kaisho versions. Reads
each frontmatter block and copies canonical keys into the index.
Existing index values win on conflict. Files are not modified.

```bash
kai kb import-frontmatter [--apply]
```

## Summaries

### `kb summarize`

Generate or refresh the cached summary for a file. The summarizer
calls the configured advisor model, falling back to the cron model
and finally to `kaisho:advisor`. Results are cached in the index
keyed by file content hash.

```bash
kai kb summarize PATH [--force] [--no-cache] \
    [--model PROVIDER:NAME] [--json]
```

| Option | Description |
|--------|-------------|
| `--force` | Re-summarize even if cache is fresh |
| `--no-cache` | Do not read or write the cache |
| `--model` | Override model (`provider:name`) |
| `--json` | JSON output |

```bash
kai kb summarize "research/postgres-tuning.md"
kai kb summarize "research/postgres-tuning.md" --force \
    --model openai:gpt-4o-mini
```

### `kb forget-summary`

Drop the cached summary for a file.

```bash
kai kb forget-summary PATH
```

## Files

### `kb write`

Create or overwrite a KB file. Content can come from `-c` or from
stdin.

```bash
kai kb write LABEL PATH [-c CONTENT]
```

```bash
kai kb write Personal "runbooks/deploy.md" -c "# Deploy"
echo "# Deploy" | kai kb write Personal "runbooks/deploy.md"
```

### `kb mkdir`

Create an empty directory inside a source.

```bash
kai kb mkdir LABEL PATH
```

### `kb rename`

Rename a file within its current source. Metadata follows the file
through the rename.

```bash
kai kb rename OLD_PATH NEW_PATH
```

### `kb move`

Move a file to a different source, optionally renaming it in the
process.

```bash
kai kb move PATH --to LABEL [--as NEW_PATH]
```

```bash
kai kb move "drafts/notes.md" --to "Company Docs" \
    --as "shared/notes.md"
```

### `kb delete`

Delete a file from disk and drop its index record.

```bash
kai kb delete PATH [--yes, -y]
```
