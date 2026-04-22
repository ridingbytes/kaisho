# kai clock

Time tracking: start and stop timers, book retroactive entries, list
and edit time records.

## Commands

### `clock start`

Start a running timer.

```bash
kai clock start [CUSTOMER] [DESCRIPTION...]
```

| Argument | Description |
|----------|-------------|
| `CUSTOMER` | Customer name (optional) |
| `DESCRIPTION` | Optional description (multiple words) |

```bash
kai clock start "Acme Corp" "Working on landing page"
kai clock start "Beta Inc"
kai clock start
```

### `clock stop`

Stop the active timer.

```bash
kai clock stop [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--desc` | Set description before stopping |
| `--notes` | Set notes before stopping |
| `--customer` | Reassign to different customer |
| `--json` | JSON output |

```bash
kai clock stop
kai clock stop --desc "Finished auth module" --notes "Needs review"
```

### `clock status`

Show the active timer.

```bash
kai clock status [--json]
```

### `clock book`

Book time retroactively.

```bash
kai clock book DURATION [CUSTOMER] [DESCRIPTION...]
```

| Argument | Description |
|----------|-------------|
| `DURATION` | Duration string (e.g., `2h`, `30min`, `1h30min`) |
| `CUSTOMER` | Customer name (optional) |
| `DESCRIPTION` | Optional description |

```bash
kai clock book 2h "Acme Corp" "Morning standup + planning"
kai clock book 30min "Beta Inc" "Quick bug fix"
```

### `clock desc`

Set description on the running timer.

```bash
kai clock desc DESCRIPTION...
```

### `clock note`

Add notes to the running timer.

```bash
kai clock note TEXT...
```

### `clock list`

List clock entries with filtering.

```bash
kai clock list [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--week` | Show this week |
| `--month` | Show this month |
| `--customer` | Filter by customer |
| `--from` | Start date (YYYY-MM-DD) |
| `--to` | End date (YYYY-MM-DD) |
| `--json` | JSON output |

### `clock summary`

Show total hours per customer.

```bash
kai clock summary [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--week` | Summarize this week (default: month) |
| `--json` | JSON output |

### `clock update`

Update a clock entry by its start timestamp.

```bash
kai clock update START_ISO [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--customer` | New customer |
| `--description` | New description |
| `--hours` | Duration in hours (float) |
| `--date` | New date (YYYY-MM-DD) |
| `--task-id` | Link to task (empty to remove) |
| `--invoiced` / `--no-invoiced` | Invoiced status |
| `--notes` | New notes |
| `--contract` | Assign to contract |

### `clock batch-invoice`

Mark all uninvoiced entries for a customer as invoiced.

```bash
kai clock batch-invoice CUSTOMER [--contract NAME] [--json]
```

### `clock edit`

Open the clocks file in `$EDITOR`.

```bash
kai clock edit
```
