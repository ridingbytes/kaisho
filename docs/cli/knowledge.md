# kai kb

Browse and search the knowledge base.

## Commands

### `kb list`

List all knowledge base files.

```bash
kai kb list [--json]
```

### `kb show`

Display the contents of a KB file.

```bash
kai kb show PATH
```

```bash
kai kb show "runbooks/deploy-checklist.md"
```

### `kb search`

Full-text search across all KB sources.

```bash
kai kb search QUERY... [--max N] [--json]
```

```bash
kai kb search "connection pooling" --max 10
```

Returns file path, line number, and matching snippet for each
result.
