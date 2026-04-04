# CLI Reference

All commands are available through the `oc` entry point installed by
`pip install -e .`.

```
oc <command> [subcommand] [options]
```

Pass `--help` to any command or subcommand for inline usage.

---

## oc briefing

Morning dashboard: active timer, open tasks (up to 10), inbox items
(up to 5), and budget status for all active customers.

```bash
oc briefing
```

---

## oc task

Manage tasks.

### task add

```bash
oc task add <CUSTOMER> <TITLE...> [--status STATUS] [--tag TAG]...
```

Creates a task under the customer group. `TITLE` can span multiple
words without quoting. Default status is `TODO`.

```bash
oc task add ACME Fix login redirect bug --tag bug --tag urgent
oc task add CERMEL "Prepare proposal" --status NEXT
```

### task list

```bash
oc task list [--customer NAME] [--status STATUS] [--tag TAG]
             [--all] [--json]
```

Lists open tasks. `--all` includes done and cancelled states.
`--json` outputs a JSON array for scripting.

```bash
oc task list
oc task list --customer ACME --tag urgent
oc task list --all --json | jq '.[].title'
```

### task move

```bash
oc task move <ID> <STATUS>
```

Move a task to any configured status. Use the numeric ID shown in
`task list`.

```bash
oc task move 3 IN-PROGRESS
oc task move 3 DONE
```

Shortcuts for common transitions:

```bash
oc task done   <ID>    # → DONE
oc task next   <ID>    # → NEXT
oc task wait   <ID>    # → WAIT
oc task cancel <ID>    # → CANCELLED
```

### task tag

```bash
oc task tag <ID> [+TAG | -TAG | TAG]...
```

With bare tag names, replaces all tags. Prefix `+` adds, `-` removes.

```bash
oc task tag 3 bug urgent          # replace: set to [bug, urgent]
oc task tag 3 +review             # add review
oc task tag 3 -urgent +shipped    # remove urgent, add shipped
```

### task archive

```bash
oc task archive <ID>
```

Moves the task from `todos.org` to `archive.org`.

### task edit

```bash
oc task edit
```

Opens the task data file in `$EDITOR`.

---

## oc clock

Manage time tracking.

### clock start

```bash
oc clock start <CUSTOMER> <DESCRIPTION...>
```

Opens a new clock entry (live timer). Fails if a timer is already
running.

```bash
oc clock start ACME Implement search feature
```

### clock stop

```bash
oc clock stop [--json]
```

Closes the running timer, writes the duration.

### clock status

```bash
oc clock status [--json]
```

Shows the currently running timer, or "No active timer."

### clock book

```bash
oc clock book <DURATION> <CUSTOMER> <DESCRIPTION...>
```

Retroactively book time. Duration examples: `2h`, `90min`, `1.5h`.

```bash
oc clock book 2h ACME Code review
oc clock book 30min CERMEL Planning call
```

### clock list

```bash
oc clock list [--week | --month] [--customer NAME]
              [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--json]
```

Default period is today. Use `--week` or `--month` for broader ranges,
or provide explicit `--from` / `--to` dates.

### clock summary

```bash
oc clock summary [--week] [--json]
```

Shows total hours per customer. Default period is the current month.

### clock edit

```bash
oc clock edit
```

Opens the clock data file in `$EDITOR`.

---

## oc inbox

Capture and triage items.

### inbox add

```bash
oc inbox add <TEXT...> [--type TYPE] [--customer NAME] [--json]
```

Types: `EMAIL`, `LEAD`, `IDEE`, `NOTIZ`. If omitted, the type is
auto-detected from keywords in the text. Pass `-` as TEXT to read
from stdin.

```bash
oc inbox add Customer asked about pricing --customer ACME
oc inbox add LEAD New contact from trade show
echo "Idea: add dark mode" | oc inbox add -
```

### inbox list

```bash
oc inbox list [--type TYPE] [--json]
```

### inbox promote

```bash
oc inbox promote <ID> --customer <NAME> [--json]
```

Moves the inbox item to `todos.org` as a new task and removes it
from the inbox.

```bash
oc inbox promote 2 --customer ACME
```

### inbox edit

```bash
oc inbox edit
```

---

## oc customer

Manage customers and their budget time entries.

### customer list

```bash
oc customer list [--all] [--json]
```

Active customers with budget utilisation. `--all` includes inactive.

### customer show

```bash
oc customer show <NAME> [--json]
```

Full details for a single customer including verbraucht and rest.

### customer summary

```bash
oc customer summary [--json]
```

Table: remaining hours, total budget, and percentage for each active
customer.

### customer edit

```bash
oc customer edit
```

Opens the customers file in `$EDITOR`.

### customer entries

```bash
oc customer entries <NAME> [--json]
```

List all time entries booked against a customer's budget.

```bash
oc customer entries ACME
```

### customer entry-add

```bash
oc customer entry-add <NAME> --description <TEXT> --hours <H> [--date YYYY-MM-DD]
```

Add a time entry to a customer's budget. Date defaults to today.

```bash
oc customer entry-add ACME -d "Code review" -h 2.5
oc customer entry-add CERMEL -d "Planning call" -h 1 --date 2026-04-01
```

Budget is calculated as `VERBRAUCHT` (stored property) plus the sum
of all time entry hours. Both contribute to consumption.

### customer entry-edit

```bash
oc customer entry-edit <NAME> <ENTRY_ID> [-d TEXT] [-h H] [--date DATE]
```

Update fields of an existing time entry. Pass only the fields to change.

```bash
oc customer entry-edit ACME abc123 -h 3.0
```

### customer entry-delete

```bash
oc customer entry-delete <NAME> <ENTRY_ID>
```

---

## oc tag

Manage tag definitions in `settings.yaml`.

```bash
oc tag list
oc tag add <NAME> --color <HEX> [--description TEXT]
oc tag update <NAME> [--color HEX] [--description TEXT]
oc tag remove <NAME>
```

`tag list` shows configured tags alongside live usage counts from all
tasks.

---

## oc config

Manage task state definitions in `settings.yaml`.

```bash
oc config states                        # list all states
oc config add-state <NAME> \
    --label <LABEL> \
    --color <HEX> \
    [--after <STATE>] \
    [--done]
oc config remove-state <NAME>
oc config move-state <NAME> --after <STATE>
```

States marked `--done` are hidden from `task list` by default and
excluded from the kanban board unless the "show done" toggle is on.

---

## oc serve

```bash
oc serve [--host HOST] [--port PORT] [--reload]
```

Starts the FastAPI server. Default host `0.0.0.0`, default port `8765`
(overridable via `.env`). `--reload` enables hot-reload for
development. Interactive API docs available at `/docs`.

---

## Environment variables
    
| Variable      | Default               | Description                     |
|---------------+-----------------------+---------------------------------|
| `ORG_DIR`       | `~/ownCloud/cowork/org` | Directory containing data files |
| `BACKEND`       | `org`                   | Storage driver: `org` or `markdown` |
| `SETTINGS_FILE` | `./settings.yaml`       | Path to settings YAML           |
| `HOST`          | `0.0.0.0`               | API server bind address         |
| `PORT`          | `8765`                  | API server port                 |
