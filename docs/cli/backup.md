# kai backup

Create and manage data backups.

## Commands

### `backup` (default: list)

List existing backups.

```bash
kai backup
kai backup list
```

### `backup create`

Create a new backup archive (zip file).

```bash
kai backup create [--no-prune]
```

By default, old backups are pruned after creation. Use `--no-prune`
to keep all.

### `backup prune`

Delete old backups, keeping only the newest N.

```bash
kai backup prune [--keep N]
```

The keep count is configurable in **Settings > Backup** or defaults
to the profile setting.
