# CLI Reference

The `kai` command is Kaisho's command-line interface. Every feature
available in the web UI is also accessible from the terminal.

## Global Options

```bash
kai [--profile, -p PROFILE] <command>
```

| Option | Description |
|--------|-------------|
| `--profile`, `-p` | Profile to use (overrides active profile) |

The profile can also be set via the `PROFILE` environment variable.

## Commands

| Command | Description |
|---------|-------------|
| [`clock`](clock.md) | Time tracking: start, stop, book, list entries |
| [`task`](task.md) | Task management: add, move, tag, archive |
| [`customer`](customer.md) | Customer CRUD |
| [`contract`](contract.md) | Contract management with budgets |
| [`inbox`](inbox.md) | Capture and triage inbox items |
| [`notes`](notes.md) | Notes with customer and task links |
| [`kb`](knowledge.md) | Knowledge base search and browsing |
| [`cron`](cron.md) | Scheduled AI job management |
| [`ask`](ask.md) | Query the AI advisor |
| [`gh`](github.md) | GitHub issues and pull requests |
| [`backup`](backup.md) | Backup and restore data |
| [`profiles`](profiles.md) | Profile management |
| [`config`](config.md) | Task states and system configuration |
| [`briefing`](briefing.md) | Morning overview |
| [`serve`](serve.md) | Start the API server |
| [`convert`](convert.md) | Migrate between storage backends |
| [`youtube`](youtube.md) | YouTube transcript tools |

## JSON Output

Most commands support `--json` for machine-readable output:

```bash
kai task list --json
kai clock summary --json | jq '.customers[0].hours'
```

## Editor Integration

Commands with an `edit` subcommand open the data file in your
editor. Set `$VISUAL` or `$EDITOR`:

```bash
export EDITOR=vim
kai task edit        # opens todos.org in vim
kai clock edit       # opens clocks.org
```

## Command Bar

All CLI commands are also available inside the web UI via the
command bar (++cmd+j++). Type `clock start Acme` or `task list`
without leaving the browser.
