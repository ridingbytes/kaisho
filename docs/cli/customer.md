# kai customer

Manage customers (clients).

## Commands

### `customer add`

```bash
kai customer add NAME [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--status`, `-s` | Status (default: `active`) |
| `--type`, `-t` | Customer type (e.g., agency, startup) |
| `--budget`, `-b` | Hour budget (float) |
| `--repo` | GitHub repository (`owner/repo`) |
| `--tag` | Tags (repeatable) |

### `customer list`

```bash
kai customer list [--all] [--json]
```

`--all` includes inactive customers.

### `customer show`

```bash
kai customer show NAME [--json]
```

### `customer summary`

Budget summary for all customers: total budget, used hours,
remaining capacity.

```bash
kai customer summary [--json]
```

### `customer edit`

Open the customers file in `$EDITOR`.

```bash
kai customer edit
```
