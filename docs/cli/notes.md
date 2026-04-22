# kai notes

Create and manage notes with customer and task links.

## Commands

### `notes add`

```bash
kai notes add TITLE... [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--body`, `-b` | Note body text |
| `--customer`, `-c` | Customer association |
| `--tag` | Tags (repeatable) |
| `--task` | Link to task ID |
| `--json` | JSON output |

```bash
kai notes add "Sprint retro findings" --customer "Acme Corp" \
    --body "Deploy pipeline stable, need more test coverage"
```

### `notes list`

```bash
kai notes list [--customer CUSTOMER] [--json]
```

### `notes show`

```bash
kai notes show NOTE_ID [--json]
```

### `notes delete`

```bash
kai notes delete NOTE_ID [--yes, -y]
```

### `notes edit`

Open the notes file in `$EDITOR`.

```bash
kai notes edit
```
