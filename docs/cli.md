# CLI Reference

All commands are available through the `kai` entry point installed by
`pip install -e .`.

```
kai <command> [subcommand] [options]
```

Pass `--help` to any command or subcommand for inline usage.

---

## kai briefing

Morning dashboard: active timer, open tasks (up to 10), inbox items
(up to 5), and budget status for all active customers.

```bash
kai briefing
```

---

## kai task

Manage tasks.

### task add

```bash
kai task add <CUSTOMER> <TITLE...> [--status STATUS] [--tag TAG]...
```

Creates a task as a flat heading `* TODO [CUSTOMER]: TITLE`.
`TITLE` can span multiple words without quoting.
Default status is `TODO`.

```bash
kai task add ACME Fix login redirect bug --tag bug --tag urgent
kai task add CERMEL "Prepare proposal" --status NEXT
```

### task list

```bash
kai task list [--customer NAME] [--status STATUS] [--tag TAG]
             [--all] [--json]
```

Lists open tasks. `--all` includes done and cancelled states.
`--json` outputs a JSON array for scripting.

```bash
kai task list
kai task list --customer ACME --tag urgent
kai task list --all --json | jq '.[].title'
```

### task move

```bash
kai task move <ID> <STATUS>
```

Move a task to any configured status. Use the numeric ID shown in
`task list`.

```bash
kai task move 3 IN-PROGRESS
kai task move 3 DONE
```

Shortcuts for common transitions:

```bash
kai task done   <ID>    # → DONE
kai task next   <ID>    # → NEXT
kai task wait   <ID>    # → WAIT
kai task cancel <ID>    # → CANCELLED
```

### task tag

```bash
kai task tag <ID> [+TAG | -TAG | TAG]...
```

With bare tag names, replaces all tags. Prefix `+` adds, `-` removes.

```bash
kai task tag 3 bug urgent          # replace: set to [bug, urgent]
kai task tag 3 +review             # add review
kai task tag 3 -urgent +shipped    # remove urgent, add shipped
```

### task archive

```bash
kai task archive <ID>
```

Moves the task from `todos.org` to `archive.org` under the `* Archiv`
heading with standard `ARCHIVE_TIME`, `ARCHIVE_FILE`,
`ARCHIVE_CATEGORY`, and `ARCHIVE_TODO` properties. Compatible with
`org-archive-subtree-default` in Emacs.

Archived tasks can be viewed and unarchived from the board UI
(Archive drawer at the bottom of the board).

### task edit

```bash
kai task edit
```

Opens the task data file in `$EDITOR`.

---

## kai clock

Manage time tracking.

### clock start

```bash
kai clock start <CUSTOMER> <DESCRIPTION...>
               [--contract NAME] [--task-id ID]
```

Opens a new clock entry (live timer). Fails if a timer is already
running. Use `--task-id` to link to a task and `--contract` to
assign the entry to a named contract.

```bash
kai clock start ACME Implement search feature
kai clock start ACME Sprint review --contract "Phase 2"
```

### clock stop

```bash
kai clock stop [--json]
```

Closes the running timer, writes the duration.

### clock status

```bash
kai clock status [--json]
```

Shows the currently running timer, or "No active timer."

### clock book

```bash
kai clock book <DURATION> <CUSTOMER> <DESCRIPTION...>
              [--contract NAME] [--task-id ID]
```

Retroactively book time. Duration examples: `2h`, `90min`, `1.5h`.
Use `--contract` to assign the entry to a named contract.

```bash
kai clock book 2h ACME Code review
kai clock book 30min CERMEL Planning call --contract "Phase 1"
```

### clock list

```bash
kai clock list [--week | --month] [--customer NAME]
              [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--json]
```

Default period is today. Use `--week` or `--month` for broader ranges,
or provide explicit `--from` / `--to` dates.

### clock summary

```bash
kai clock summary [--week] [--json]
```

Shows total hours per customer. Default period is the current month.

### clock update

```bash
kai clock update <START_ISO> [--customer NAME] [--description TEXT]
                [--hours H] [--date YYYY-MM-DD] [--contract NAME]
                [--task-id ID]
```

Update fields of an existing clock entry. Identifies the entry by its
start timestamp (ISO format, as shown in `clock list --json`).
Pass only the fields to change.

```bash
kai clock update 2026-04-05T09:00:00 --hours 2.5
kai clock update 2026-04-05T09:00:00 --contract "Phase 2"
```

### clock edit

```bash
kai clock edit
```

Opens the clock data file in `$EDITOR`.

---

## kai inbox

Capture and triage items.

### inbox add

```bash
kai inbox add <TEXT...> [--type TYPE] [--customer NAME] [--json]
```

Types: `EMAIL`, `LEAD`, `IDEE`, `NOTIZ`. If omitted, the type is
auto-detected from keywords in the text. Pass `-` as TEXT to read
from stdin.

```bash
kai inbox add Customer asked about pricing --customer ACME
kai inbox add LEAD New contact from trade show
echo "Idea: add dark mode" | kai inbox add -
```

### inbox list

```bash
kai inbox list [--type TYPE] [--json]
```

### inbox promote

```bash
kai inbox promote <ID> --customer <NAME> [--json]
```

Moves the inbox item to `todos.org` as a new task and removes it
from the inbox.

```bash
kai inbox promote 2 --customer ACME
```

### inbox edit

```bash
kai inbox edit
```

---

## kai customer

Manage customers and budget data.

### customer list

```bash
kai customer list [--all] [--json]
```

Active customers with budget utilisation. `--all` includes inactive.

### customer show

```bash
kai customer show <NAME> [--json]
```

Full details for a single customer including budget status. Budget
consumption is computed as the `VERBRAUCHT` property (manual offset)
plus the sum of all clock entry hours for that customer.

### customer summary

```bash
kai customer summary [--json]
```

Table: remaining hours, total budget, and percentage for each active
customer.

### customer edit

```bash
kai customer edit
```

Opens the customers file in `$EDITOR`.

---

## kai contract

Manage named contracts (budget periods) for a customer. Each contract
has an independent hour budget. Clock entries reference contracts by
name via the `CONTRACT` property, so actual consumption is computed
from clock data at query time — no copying required.

### contract add

```bash
kai contract add <CUSTOMER> <NAME> --hours <H> [--start YYYY-MM-DD]
                [--notes TEXT]
```

Start date defaults to today.

```bash
kai contract add ACME "Phase 1" --hours 100 --start 2026-01-01
kai contract add ACME "Phase 2" --hours 80
```

### contract list

```bash
kai contract list <CUSTOMER> [--with-hours] [--json]
```

`--with-hours` computes actual consumption from clock entries.

```bash
kai contract list ACME --with-hours
```

### contract show

```bash
kai contract show <CUSTOMER> <NAME> [--json]
```

Full details with computed hours, rest, and status.

### contract edit

```bash
kai contract edit <CUSTOMER> <NAME> [--rename NEW_NAME]
                 [--hours H] [--start DATE] [--end DATE] [--notes TEXT]
```

Pass `--end ""` to reopen a closed contract.

```bash
kai contract edit ACME "Phase 1" --hours 120
kai contract edit ACME "Phase 1" --rename "Phase 1 Extended"
```

### contract close

```bash
kai contract close <CUSTOMER> <NAME> [--date YYYY-MM-DD]
```

Sets the end date. Date defaults to today.

### contract delete

```bash
kai contract delete <CUSTOMER> <NAME>
```

Prompts for confirmation. Clock entries that referenced this contract
retain their `CONTRACT` property but the contract definition is gone.

---

## kai kb

Search and read the knowledge base (KNOWLEDGE_DIR and RESEARCH_DIR).

### kb list

```bash
kai kb list [--json]
```

List all files in the knowledge base with their directory label and size.

### kb show

```bash
kai kb show <PATH> [--json]
```

Print the contents of a knowledge base file. PATH is relative to the
knowledge base root (as shown by `kb list`).

```bash
kai kb show knowledge/project-notes.md
```

### kb search

```bash
kai kb search <QUERY...> [--limit N] [--json]
```

Full-text regex search across all knowledge base files. Returns
matching file path, line number, and snippet.

```bash
kai kb search API authentication --limit 10
```

---

## kai gh

Query GitHub issues and pull requests. Repos are resolved from the
`REPO` property on each customer in `customers.org`. Only customers with
a configured `REPO` appear in the GitHub view.

### gh issues

```bash
kai gh issues <CUSTOMER> [--state STATE] [--limit N] [--json]
```

```bash
kai gh issues ACME
kai gh issues CERMEL --state closed --limit 10
```

### gh show

```bash
kai gh show <CUSTOMER> <NUMBER> [--json]
```

Full details of a single issue including body and labels.

### gh prs

```bash
kai gh prs <CUSTOMER> [--state STATE] [--limit N] [--json]
```

### gh open

```bash
kai gh open <CUSTOMER> [NUMBER]
```

Open repo or issue in the default browser.

### gh all-issues

```bash
kai gh all-issues [--state STATE] [--json]
```

List open issues across all customers that have a configured repo.

---

## kai cron

Manage and run scheduled AI jobs. Job definitions are stored in
`jobs.yaml` at the project root. Execution history is stored in
SQLite.

### cron list

```bash
kai cron list [--json]
```

List all jobs with their id, enabled state, and cron schedule.

### cron show

```bash
kai cron show <JOB_ID> [--json]
```

Full definition of a single job.

### cron enable / disable

```bash
kai cron enable <JOB_ID>
kai cron disable <JOB_ID>
```

### cron trigger

```bash
kai cron trigger <JOB_ID> [--json]
```

Run a job immediately regardless of its schedule or enabled state.
Outputs are written to the configured destination. Result is recorded
in history.

```bash
kai cron trigger daily-briefing
```

### cron history

```bash
kai cron history [JOB_ID] [--limit N] [--json]
```

Show execution history. Optionally filter to a single job.

### cron add

```bash
kai cron add <ID> <NAME> \
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
kai cron delete <JOB_ID>
```

---

## kai ask

Ask the AI advisor a question. Context from all Kaisho data
sources (tasks, clock entries, inbox, customer budgets, GitHub issues)
is injected into the prompt automatically.

```bash
kai ask <QUESTION...> [--model MODEL] [--no-github] [--no-context]
```

Model format: `ollama:<model>` for Ollama, `lm_studio:<model>` for
LM Studio, `claude:<model>` for the Anthropic API,
`openrouter:<model>` for OpenRouter, `openai:<model>` for OpenAI.
Default: `ollama:qwen3:14b`.

When Kaisho AI is enabled in Cloud Sync settings, the model flag is
ignored and all requests route through OpenRouter via the cloud.

```bash
kai ask What should I focus on today?
kai ask Which customer is closest to exceeding their budget? --no-github
kai ask Summarize open ACME issues --model claude:claude-opus-4-6
kai ask What is 2+2? --no-context
```

---

## kai tag

Manage tag definitions in `settings.yaml`.

```bash
kai tag list
kai tag add <NAME> --color <HEX> [--description TEXT]
kai tag update <NAME> [--color HEX] [--description TEXT]
kai tag remove <NAME>
```

`tag list` shows configured tags alongside live usage counts from all
tasks.

---

## kai config

Manage task state definitions in `settings.yaml`.

```bash
kai config states                        # list all states
kai config add-state <NAME> \
    --label <LABEL> \
    --color <HEX> \
    [--after <STATE>] \
    [--done]
kai config remove-state <NAME>
kai config move-state <NAME> --after <STATE>
```

States marked `--done` are hidden from `task list` by default and
excluded from the kanban board unless the "show done" toggle is on.

---

## kai youtube

YouTube video tools.

### youtube transcribe

```bash
kai youtube transcribe <URL> [--lang LANGS] [--timestamps]
```

Fetch and print the transcript of a YouTube video. URL can be a full
YouTube URL or a bare 11-character video ID. `--lang` accepts a
comma-separated language preference list (default `en,de`).
`--timestamps` includes `[MM:SS]` markers in the output.

```bash
kai youtube transcribe https://youtu.be/dQw4w9WgXcQ
kai youtube transcribe dQw4w9WgXcQ --lang de,en --timestamps
```

### youtube languages

```bash
kai youtube languages <URL>
```

List available transcript languages for a video.

---

## kai profiles

```bash
kai profiles                      # list profiles (default)
kai profiles list                 # same as above
kai profiles rename OLD NEW       # rename a non-active profile
kai profiles delete NAME          # delete a non-active profile
kai profiles delete NAME --yes    # skip confirmation prompt
```

Manage profiles for the active user. The active profile (marked with
`*`) cannot be renamed or deleted. Profile names may only contain
letters, digits, hyphens, and underscores.

Examples:

```bash
kai profiles                      # → lists default *, work, client-x
kai profiles rename client-x acme
kai profiles delete work --yes
```

---

## kai convert

```bash
kai convert --from FORMAT --to FORMAT \
    --source PATH --target PATH
```

Convert data between backends. Supported formats: `org`, `markdown`.

```bash
# Org to markdown
kai convert --from org --to markdown \
    --source ~/data/org --target ~/data/md
```

Conversion order: customers, tasks, clocks, inbox, notes.
Active timers are skipped (only completed entries).

---

## kai serve

```bash
kai serve [--host HOST] [--port PORT] [--reload]
```

Starts the FastAPI server. Default host `0.0.0.0`, default port `8765`
(overridable via `.env`). `--reload` enables hot-reload for
development. Interactive API docs available at `/docs`.

---

## Environment variables

| Variable           | Default                      | Description                                        |
|--------------------|------------------------------|----------------------------------------------------|
| `ORG_DIR`          | `~/ownCloud/cowork/org`      | Directory containing org data files                |
| `KNOWLEDGE_DIR`       | `~/ownCloud/cowork/knowledge`   | Knowledge base directory                           |
| `RESEARCH_DIR`     | `~/ownCloud/cowork/research` | Research / AI output directory                     |
| `CUSTOMERS_DIR`       | `~/ownCloud/cowork/customers`   | Customer markdown files (markdown backend)         |
| `BACKEND`          | `org`                        | Storage driver: `org` or `markdown`                |
| `JOBS_FILE`        | `./jobs.yaml`                | Cron job definitions                               |
| `DATA_DIR`         | `./data`                     | SQLite database directory (cron history)            |
| `OLLAMA_BASE_URL`  | `http://localhost:11434`     | Ollama API base URL                                |
| `SETTINGS_FILE`    | `./settings.yaml`            | Path to settings YAML                              |
| `HOST`             | `0.0.0.0`                   | API server bind address                            |
| `PORT`             | `8765`                       | API server port                                    |
