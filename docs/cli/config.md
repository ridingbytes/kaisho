# kai config

Manage task states and system configuration.

## Commands

### `config states`

List all configured task states (kanban columns).

```bash
kai config states
```

### `config add-state`

Add a new task state.

```bash
kai config add-state NAME --label LABEL --color COLOR [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--label` | Display label (required) |
| `--color` | Color hex code (required) |
| `--after` | Insert after this state |
| `--done` | Mark as a done/completed state |

```bash
kai config add-state REVIEW --label "Code Review" \
    --color "#8b5cf6" --after IN-PROGRESS
```

### `config remove-state`

```bash
kai config remove-state NAME
```

### `config move-state`

Reorder a state.

```bash
kai config move-state NAME --after OTHER_STATE
```
