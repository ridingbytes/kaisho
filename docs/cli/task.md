# kai task

Task management: create, move, tag, archive, and list tasks on the
kanban board.

## Commands

### `task add`

Create a new task.

```bash
kai task add CUSTOMER TITLE... [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--tag` | Add tag (repeatable) |
| `--status` | Initial status (default: TODO) |
| `--body`, `-b` | Task description |
| `--github-url` | GitHub issue/PR URL |
| `--json` | JSON output |

```bash
kai task add "Acme Corp" "Design landing page"
kai task add "Acme Corp" "Fix auth bug" --tag urgent --tag backend \
    --body "Login fails with special characters"
```

### `task list`

List tasks with optional filtering.

```bash
kai task list [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--customer` | Filter by customer |
| `--status` | Filter by status |
| `--tag` | Filter by tag |
| `--all` | Include DONE and CANCELLED |
| `--json` | JSON output |

### `task show`

Show full details for a task.

```bash
kai task show TASK_ID [--json]
```

### `task move`

Change task status.

```bash
kai task move TASK_ID NEW_STATUS
```

### `task done` / `task next` / `task wait` / `task cancel`

Shorthand status changes.

```bash
kai task done abc123
kai task next abc123      # mark as priority
kai task wait abc123      # mark as blocked
kai task cancel abc123
```

### `task update`

Update task fields.

```bash
kai task update TASK_ID [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--title` | New title |
| `--customer` | New customer |
| `--body`, `-b` | New description |
| `--github-url` | New GitHub URL |

### `task tag`

Set or modify tags. Prefix with `+` to add, `-` to remove, or
provide bare names to replace all tags.

```bash
kai task tag TASK_ID TAGS...
```

```bash
kai task tag abc123 urgent backend       # replace all
kai task tag abc123 +frontend            # add one
kai task tag abc123 -urgent              # remove one
```

### `task delete`

Delete (archive) a task.

```bash
kai task delete TASK_ID [--yes, -y]
```

### `task archive`

Archive a task.

```bash
kai task archive TASK_ID
```

### `task edit`

Open the tasks file in `$EDITOR`.

```bash
kai task edit
```
