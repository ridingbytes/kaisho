# kai convert

Convert data between storage backends.

## Usage

```bash
kai convert --from FORMAT --source PATH --to FORMAT --target PATH
```

| Option | Description |
|--------|-------------|
| `--from` | Source format: `org`, `markdown`, `json`, `sql` |
| `--to` | Target format: `org`, `markdown`, `json`, `sql` |
| `--source` | Source directory or DSN |
| `--target` | Target directory or DSN |

## Examples

```bash
# Org-mode to Markdown
kai convert --from org --source ./data/org \
    --to markdown --target ./data/md

# Markdown to SQLite
kai convert --from markdown --source ./data/md \
    --to sql --target "sqlite:///./kaisho.db"
```

The converter handles dependency ordering: customers first, then
tasks, then clocks, inbox, and notes. IDs, timestamps, and
references are preserved. Task states and tags are auto-populated
in the target settings.
