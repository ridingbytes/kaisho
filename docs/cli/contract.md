# kai contract

Manage customer contracts with hour budgets and date ranges.

## Commands

### `contract add`

```bash
kai contract add CUSTOMER NAME --hours HOURS [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--hours`, `-h` | Budget in hours (required) |
| `--start` | Start date, YYYY-MM-DD (default: today) |
| `--notes` | Optional notes |

```bash
kai contract add "Acme Corp" "Q2 2026" --hours 120 --start 2026-04-01
```

### `contract list`

```bash
kai contract list CUSTOMER [--json]
```

### `contract show`

Show contract details with computed used/remaining hours.

```bash
kai contract show CUSTOMER NAME [--json]
```

### `contract edit`

Update contract fields.

```bash
kai contract edit CUSTOMER NAME [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--rename` | New name |
| `--hours` | New budget |
| `--start` | New start date |
| `--end` | New end date (empty string to reopen) |
| `--notes` | New notes |

### `contract close`

Set the end date on a contract.

```bash
kai contract close CUSTOMER NAME [--date YYYY-MM-DD]
```

Defaults to today.

### `contract delete`

Delete a contract (requires confirmation).

```bash
kai contract delete CUSTOMER NAME
```
