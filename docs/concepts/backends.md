# Storage Backends

Kaisho stores data through pluggable backends. Each backend
implements the same interface for tasks, clocks, customers, inbox,
and notes. You pick the format that fits your workflow.

## Available Backends

### Org-mode (Default)

Stores data as Emacs org-mode files. This is the original and most
mature backend.

```
org/
  todos.org       # Tasks with status keywords
  clocks.org      # CLOCK logbook entries
  customers.org   # Customer headings with PROPERTIES
  inbox.org       # Captured items
  notes.org       # Notes
  archive.org     # Archived tasks
```

Org files are human-readable and editable in Emacs, VS Code (with
org-mode extensions), or any text editor. Kaisho watches for external
changes and reloads automatically.

Task status is tracked through org-mode keywords:

```org
* TODO Design landing page
  :PROPERTIES:
  :CUSTOMER: Acme Corp
  :CREATED: 2026-04-20T09:00:00
  :END:
```

### Markdown

Stores data as Markdown files with YAML frontmatter:

```markdown
---
id: abc123
customer: Acme Corp
status: TODO
tags: [design, frontend]
created: 2026-04-20T09:00:00
---

# Design landing page

Task description goes here.
```

### JSON

Stores data as JSON arrays. Good for programmatic access:

```
json/
  tasks.json
  clocks.json
  customers.json
  inbox.json
  notes.json
```

### SQL

Uses SQLAlchemy with any supported database. Configure via DSN:

```yaml
# settings.yaml
sql_dsn: "sqlite:///~/.kaisho/profiles/work/kaisho.db"
```

PostgreSQL and other databases work too:

```yaml
sql_dsn: "postgresql://user:pass@localhost/kaisho"
```

## Switching Backends

Change the backend in **Settings > Paths** or edit `settings.yaml`:

```yaml
backend: org        # org, markdown, json, sql
org_dir: ~/org      # Custom path for org files
```

## Converting Between Formats

The `convert` command migrates data between backends:

```bash
kai convert \
    --from org --source ~/.kaisho/profiles/work/org \
    --to markdown --target ~/.kaisho/profiles/work/markdown
```

The converter handles dependency ordering: customers first, then
tasks, then clocks. It preserves IDs, timestamps, and references.

## Backend Interface

All backends implement these operations:

**Tasks:** list, add, update, move status, set tags, archive,
unarchive, reorder, delete

**Clocks:** list entries, get active timer, start, stop, quick-book,
update, delete, summary

**Customers:** list, get, add, update, delete, list contracts, add
contract, update contract, delete contract

**Inbox:** list, get, add, update, delete

**Notes:** list, get, add, update, delete

The backend is selected once at startup based on the active profile's
settings. The rest of the application is backend-agnostic.
