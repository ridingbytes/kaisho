# kai inbox

Capture and triage inbox items.

## Commands

### `inbox add`

```bash
kai inbox add TEXT... [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--type` | Item type: NOTE, EMAIL, LEAD, IDEA, BUG, FEATURE |
| `--customer` | Associated customer |
| `--body`, `-b` | Detail text |
| `--channel` | Channel: email, phone, chat, meeting, web |
| `--direction` | Direction: `in` or `out` |
| `--json` | JSON output |

Use `-` as text to read from stdin:

```bash
echo "Notes from today" | kai inbox add -
```

### `inbox list`

```bash
kai inbox list [--type TYPE] [--json]
```

### `inbox remove`

```bash
kai inbox remove ITEM_ID [--json]
```

### `inbox promote`

Convert an inbox item to a task.

```bash
kai inbox promote ITEM_ID --customer CUSTOMER [--json]
```

### `inbox edit`

Open the inbox file in `$EDITOR`.

```bash
kai inbox edit
```
