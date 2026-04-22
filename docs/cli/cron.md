# kai cron

Manage scheduled AI jobs.

## Commands

### `cron list`

```bash
kai cron list [--json]
```

### `cron show`

```bash
kai cron show JOB_ID [--json]
```

### `cron add`

```bash
kai cron add JOB_ID NAME [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--schedule`, `-s` | Cron expression (required) |
| `--model`, `-m` | AI model (default: `ollama:qwen3:14b`) |
| `--prompt-file`, `-p` | Path to prompt template (required) |
| `--output`, `-o` | Output destination (required): `inbox` or file path |
| `--timeout` | Timeout in seconds (default: 120) |
| `--enabled` / `--disabled` | Initial state (default: enabled) |

```bash
kai cron add weekly-report "Weekly Report" \
    --schedule "0 17 * * 5" \
    --prompt-file prompts/weekly-report.md \
    --output inbox
```

### `cron enable` / `cron disable`

```bash
kai cron enable JOB_ID
kai cron disable JOB_ID
```

### `cron trigger`

Run a job immediately.

```bash
kai cron trigger JOB_ID [--json]
```

### `cron history`

Show execution history.

```bash
kai cron history [JOB_ID] [--limit N] [--json]
```

### `cron delete`

```bash
kai cron delete JOB_ID
```
