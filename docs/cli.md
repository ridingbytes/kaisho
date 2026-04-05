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

Creates a task as a flat heading `* TODO [CUSTOMER]: TITLE`.
`TITLE` can span multiple words without quoting.
Default status is `TODO`.

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

Moves the task from `todos.org` to `archive.org` under the `* Archiv`
heading with standard `ARCHIVE_TIME`, `ARCHIVE_FILE`,
`ARCHIVE_CATEGORY`, and `ARCHIVE_TODO` properties. Compatible with
`org-archive-subtree-default` in Emacs.

Archived tasks can be viewed and unarchived from the board UI
(Archive drawer at the bottom of the board).

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
               [--contract NAME] [--task-id ID]
```

Opens a new clock entry (live timer). Fails if a timer is already
running. Use `--task-id` to link to a task and `--contract` to
assign the entry to a named contract.

```bash
oc clock start ACME Implement search feature
oc clock start ACME Sprint review --contract "Phase 2"
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
              [--contract NAME] [--task-id ID]
```

Retroactively book time. Duration examples: `2h`, `90min`, `1.5h`.
Use `--contract` to assign the entry to a named contract.

```bash
oc clock book 2h ACME Code review
oc clock book 30min CERMEL Planning call --contract "Phase 1"
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

### clock update

```bash
oc clock update <START_ISO> [--customer NAME] [--description TEXT]
                [--hours H] [--date YYYY-MM-DD] [--contract NAME]
                [--task-id ID]
```

Update fields of an existing clock entry. Identifies the entry by its
start timestamp (ISO format, as shown in `clock list --json`).
Pass only the fields to change.

```bash
oc clock update 2026-04-05T09:00:00 --hours 2.5
oc clock update 2026-04-05T09:00:00 --contract "Phase 2"
```

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

Manage customers and budget data.

### customer list

```bash
oc customer list [--all] [--json]
```

Active customers with budget utilisation. `--all` includes inactive.

### customer show

```bash
oc customer show <NAME> [--json]
```

Full details for a single customer including budget status. Budget
consumption is computed as the `VERBRAUCHT` property (manual offset)
plus the sum of all clock entry hours for that customer.

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

---

## oc contract

Manage named contracts (budget periods) for a customer. Each contract
has an independent hour budget. Clock entries reference contracts by
name via the `CONTRACT` property, so actual consumption is computed
from clock data at query time — no copying required.

### contract add

```bash
oc contract add <CUSTOMER> <NAME> --hours <H> [--start YYYY-MM-DD]
                [--notes TEXT]
```

Start date defaults to today.

```bash
oc contract add ACME "Phase 1" --hours 100 --start 2026-01-01
oc contract add ACME "Phase 2" --hours 80
```

### contract list

```bash
oc contract list <CUSTOMER> [--with-hours] [--json]
```

`--with-hours` computes actual consumption from clock entries.

```bash
oc contract list ACME --with-hours
```

### contract show

```bash
oc contract show <CUSTOMER> <NAME> [--json]
```

Full details with computed hours, rest, and status.

### contract edit

```bash
oc contract edit <CUSTOMER> <NAME> [--rename NEW_NAME]
                 [--hours H] [--start DATE] [--end DATE] [--notes TEXT]
```

Pass `--end ""` to reopen a closed contract.

```bash
oc contract edit ACME "Phase 1" --hours 120
oc contract edit ACME "Phase 1" --rename "Phase 1 Extended"
```

### contract close

```bash
oc contract close <CUSTOMER> <NAME> [--date YYYY-MM-DD]
```

Sets the end date. Date defaults to today.

### contract delete

```bash
oc contract delete <CUSTOMER> <NAME>
```

Prompts for confirmation. Clock entries that referenced this contract
retain their `CONTRACT` property but the contract definition is gone.

---

## oc kb

Search and read the knowledge base (WISSEN_DIR and RESEARCH_DIR).

### kb list

```bash
oc kb list [--json]
```

List all files in the knowledge base with their directory label and size.

### kb show

```bash
oc kb show <PATH> [--json]
```

Print the contents of a knowledge base file. PATH is relative to the
knowledge base root (as shown by `kb list`).

```bash
oc kb show wissen/project-notes.md
```

### kb search

```bash
oc kb search <QUERY...> [--limit N] [--json]
```

Full-text regex search across all knowledge base files. Returns
matching file path, line number, and snippet.

```bash
oc kb search API authentication --limit 10
```

---

## oc gh

Query GitHub issues and pull requests. Repos are resolved from the
`REPO` property on each customer in `kunden.org`. Only customers with
a configured `REPO` appear in the GitHub view.

### gh issues

```bash
oc gh issues <CUSTOMER> [--state STATE] [--limit N] [--json]
```

```bash
oc gh issues ACME
oc gh issues CERMEL --state closed --limit 10
```

### gh show

```bash
oc gh show <CUSTOMER> <NUMBER> [--json]
```

Full details of a single issue including body and labels.

### gh prs

```bash
oc gh prs <CUSTOMER> [--state STATE] [--limit N] [--json]
```

### gh open

```bash
oc gh open <CUSTOMER> [NUMBER]
```

Open repo or issue in the default browser.

### gh all-issues

```bash
oc gh all-issues [--state STATE] [--json]
```

List open issues across all customers that have a configured repo.

---

## oc cron

Manage and run scheduled AI jobs. Job definitions are stored in
`jobs.yaml` at the project root. Execution history is stored in
SQLite.

### cron list

```bash
oc cron list [--json]
```

List all jobs with their id, enabled state, and cron schedule.

### cron show

```bash
oc cron show <JOB_ID> [--json]
```

Full definition of a single job.

### cron enable / disable

```bash
oc cron enable <JOB_ID>
oc cron disable <JOB_ID>
```

### cron trigger

```bash
oc cron trigger <JOB_ID> [--json]
```

Run a job immediately regardless of its schedule or enabled state.
Outputs are written to the configured destination. Result is recorded
in history.

```bash
oc cron trigger daily-briefing
```

### cron history

```bash
oc cron history [JOB_ID] [--limit N] [--json]
```

Show execution history. Optionally filter to a single job.

### cron add

```bash
oc cron add <ID> <NAME> \
    --schedule "30 9 * * 1-5" \
    --prompt-file prompts/my-prompt.md \
    --output ~/reports/output-{date}.md \
    [--model ollama:qwen3:14b] \
    [--timeout 120] \
    [--enabled | --disabled]
```

Add a new job definition to `jobs.yaml`.

### cron delete

```bash
oc cron delete <JOB_ID>
```

---

## oc ask

Ask the AI advisor a question. Context from all OmniControl data
sources (tasks, clock entries, inbox, customer budgets, GitHub issues)
is injected into the prompt automatically.

```bash
oc ask <QUESTION...> [--model MODEL] [--no-github] [--no-context]
```

Model format: `ollama:<model>` for a local Ollama instance,
`lm_studio:<model>` for LM Studio, `claude:<model>` for the
Anthropic API. Default: `ollama:qwen3:14b`.

```bash
oc ask What should I focus on today?
oc ask Which customer is closest to exceeding their budget? --no-github
oc ask Summarize open ACME issues --model claude:claude-opus-4-6
oc ask What is 2+2? --no-context
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

## oc youtube

YouTube video tools.

### youtube transcribe

```bash
oc youtube transcribe <URL> [--lang LANGS] [--timestamps]
```

Fetch and print the transcript of a YouTube video. URL can be a full
YouTube URL or a bare 11-character video ID. `--lang` accepts a
comma-separated language preference list (default `en,de`).
`--timestamps` includes `[MM:SS]` markers in the output.

```bash
oc youtube transcribe https://youtu.be/dQw4w9WgXcQ
oc youtube transcribe dQw4w9WgXcQ --lang de,en --timestamps
```

### youtube languages

```bash
oc youtube languages <URL>
```

List available transcript languages for a video.

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

| Variable           | Default                      | Description                                        |
|--------------------|------------------------------|----------------------------------------------------|
| `ORG_DIR`          | `~/ownCloud/cowork/org`      | Directory containing org data files                |
| `WISSEN_DIR`       | `~/ownCloud/cowork/wissen`   | Knowledge base directory                           |
| `RESEARCH_DIR`     | `~/ownCloud/cowork/research` | Research / AI output directory                     |
| `KUNDEN_DIR`       | `~/ownCloud/cowork/kunden`   | Customer markdown files (markdown backend)         |
| `BACKEND`          | `org`                        | Storage driver: `org` or `markdown`                |
| `JOBS_FILE`        | `./jobs.yaml`                | Cron job definitions                               |
| `DATA_DIR`         | `./data`                     | SQLite database directory (cron history)            |
| `OLLAMA_BASE_URL`  | `http://localhost:11434`     | Ollama API base URL                                |
| `SETTINGS_FILE`    | `./settings.yaml`            | Path to settings YAML                              |
| `HOST`             | `0.0.0.0`                   | API server bind address                            |
| `PORT`             | `8765`                       | API server port                                    |
