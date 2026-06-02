# kai backup

Create and manage data backups.

!!! version-added "Since 1.5.0"

Backup auto-pruning (configurable retention window) was added in
1.5.0; older releases kept every backup forever.

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
