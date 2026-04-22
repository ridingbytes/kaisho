# kai profiles

Manage user profiles. Run without a subcommand to list all profiles.

## Commands

### `profiles` (default: list)

List profiles. The active profile is marked with `*`.

```bash
kai profiles
kai profiles list
```

### `profiles delete`

Delete a profile and all its data.

```bash
kai profiles delete NAME [--yes, -y]
```

### `profiles rename`

Rename a profile.

```bash
kai profiles rename OLD_NAME NEW_NAME
```
