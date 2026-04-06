export const DOCS: Record<string, string> = {

  dashboard: `
# Dashboard

At-a-glance status view for the current working session.

**Active timer** — shows the running clock entry with elapsed time and
a stop button.

**Stats** — open task count, inbox count, and customer budget health.

**Budget bars** — remaining hours per active customer. Click a row to
expand recent time entries.

## CLI equivalent

\`\`\`bash
oc briefing
\`\`\`

Morning summary: active timer, up to 10 open tasks, inbox items, and
budget status for all active customers.
`,

  board: `
# Board

Kanban-style task board. Each column is a task state. Drag cards
between columns or use the status dropdown inside the card.

**New task** — "+ New" in the toolbar or double-tap **B**. The add
form opens in the first column.

**Move task** — drag the card to a column, or hover and pick a state.

**Edit** — pencil icon on hover. Edit title, customer, description
(body), and tags. Save with **⌘↵** (Cmd+Enter) or the check button.

**Body** — each task can have a multi-line description. It is shown
collapsed below the title; click to expand. Rendered as Markdown.

**Tags** — colored labels defined in Settings. Edit them inline.

**Archive** — trash icon on hover. Moves the task to archive.org.

**Show done** — toggle to reveal done and cancelled columns.

**Archive drawer** — at the bottom of the board, click "Archive" to
expand the list of archived tasks. Each row shows the archive date,
customer, title, and original status. Click the restore icon to
unarchive.

## CLI

\`\`\`bash
oc task list
oc task list --customer ACME --tag urgent
oc task add ACME Implement login --status NEXT
oc task move 3 IN-PROGRESS
oc task done 3
oc task cancel 3
oc task archive 3
\`\`\`

### Tag a task

\`\`\`bash
oc task tag 3 bug urgent          # replace tags
oc task tag 3 +review             # add one tag
oc task tag 3 -urgent +shipped    # remove and add
\`\`\`
`,

  inbox: `
# Inbox

Capture triage items quickly. The inbox is intentionally simple —
capture fast, then promote to tasks or discard.

**Capture** — type in the top bar. Auto-detects type from keywords
(LEAD, EMAIL, IDEE, NOTIZ), or select manually.

**Customer** — optionally assign an item to a customer at capture time.

**Promote** — click the arrow on an item to convert it to a task. You
will be asked to pick a customer. The body text of the inbox item is
carried over to the new task.

**Delete** — click the × on an item to discard it.

## CLI

\`\`\`bash
oc inbox add Customer asked about pricing --customer ACME
oc inbox add LEAD New contact from trade show
echo "Idea: add dark mode" | oc inbox add -

oc inbox list
oc inbox list --type LEAD

oc inbox promote 2 --customer ACME
\`\`\`

Types: \`EMAIL\`, \`LEAD\`, \`IDEE\`, \`NOTIZ\`. Pass \`-\` as text to read
from stdin.
`,

  customers: `
# Customers

Manage customer records and budget time entries.

**Budget bar** — shows consumed vs remaining hours from the customer's
\`KONTINGENT\`. Budget is the sum of the stored \`VERBRAUCHT\` property
plus all individual time entry hours.

**Time entries** — expand "Entries (N)" to view, add, edit, or delete
entries. Use "From clock" to copy today's clock sessions.

**Edit** — pencil icon opens inline edit for name, status, type,
budget, repo URL, and tags.

**Type and tags** — assign a type (e.g. LEAD, CLIENT) and colored tags
defined in Settings.

## CLI

\`\`\`bash
oc customer list
oc customer list --all              # include inactive
oc customer show ACME
oc customer summary                 # budget overview

oc customer entries ACME
oc customer entry-add ACME -d "Code review" -h 2.5
oc customer entry-add CERMEL -d "Planning call" -h 1 --date 2026-04-01
oc customer entry-edit ACME 3 -h 3.0
oc customer entry-delete ACME 3
\`\`\`
`,

  knowledge: `
# Knowledge

Browse and search the knowledge base files from \`WISSEN_DIR\` and
\`RESEARCH_DIR\`.

**Tree** — left panel lists all files grouped by directory. Click a
file to view it.

**Search** — type a query in the search box. Returns matching lines
with file path and snippet.

**View** — selected file content is rendered as Markdown.

## CLI

\`\`\`bash
oc kb list
oc kb show wissen/project-notes.md
oc kb search API authentication --limit 10
\`\`\`

Environment variables:

| Variable       | Default                          |
|----------------|----------------------------------|
| \`WISSEN_DIR\`   | \`~/ownCloud/cowork/wissen\`       |
| \`RESEARCH_DIR\` | \`~/ownCloud/cowork/research\`     |
`,

  github: `
# GitHub Issues

Shows open GitHub issues grouped by customer. Repos are resolved from
the \`REPO\` property set on each customer. Only customers with a
configured repo are shown.

**Customer filter** — when multiple customers have repos, a dropdown
in the toolbar lets you narrow the view to one customer.

**Refresh** — issues are cached for 2 minutes; use the reload button
to fetch current data.

Click an issue title to open it directly on GitHub.

## CLI

\`\`\`bash
oc gh issues ACME
oc gh issues CERMEL --state closed --limit 10
oc gh all-issues                    # all customers

oc gh show ACME 42                  # single issue details
oc gh prs ACME                      # pull requests
oc gh open ACME                     # open repo in browser
oc gh open ACME 42                  # open issue in browser
\`\`\`

Requires \`GITHUB_TOKEN\` (or gh CLI auth) to be configured. Set the
\`REPO\` property on a customer to include it.
`,

  notes: `
# Notes

Freeform notes stored in \`notes.org\` in \`ORG_DIR\`. Each note has a
title, an optional body, and an optional customer association.

**Add note** — "+ Add" opens a form. Enter a title, optional body
text, and optionally assign a customer.

**Expand** — click a row to toggle the body text.

**Promote** — click the arrow icon to convert a note into a task. The
body text is carried over to the new task.

**Delete** — trash icon removes the note permanently.

## CLI

\`\`\`bash
oc note list
oc note add "Follow up on proposal" --customer ACME
oc note add "Ideas for refactor" --body "Split into modules"

oc note show 3
oc note delete 3
oc note promote 3 --customer ACME
\`\`\`

Notes are stored in \`notes.org\` in \`ORG_DIR\`.
`,

  communications: `
# Communications

Log inbound and outbound communication entries (calls, emails, chats)
linked to customers.

**Storage** — entries are stored in SQLite
(\`DATA_DIR/omnicontrol.db\`, table \`communications\`). Not in an
org file.

**Log entry** — "+ New" opens a form. Fields: subject, direction
(in/out), channel (email/phone/chat/other), customer, contact, type,
tags, body.

**Type** — free-text field for classifying the entry (e.g. meeting,
proposal, complaint, support). Shown as a badge on the row.

**Tags** — colored labels from Settings. Toggle them in the add form
or by clicking the pencil icon on any existing row.

**Filter** — filter by customer, channel, or direction using the
dropdowns in the toolbar.

**Search** — full-text search across subjects and body text.

**Delete** — × icon on a row removes the entry.

## CLI

\`\`\`bash
oc comm add "Pricing inquiry" --direction in --customer ACME
oc comm add "Sent proposal" -d out -c email -k CERMEL

oc comm list
oc comm list --customer ACME --channel email
oc comm search "budget"
oc comm show 12
oc comm delete 12
\`\`\`

Data is stored in SQLite (\`DATA_DIR/omnicontrol.db\`).
`,

  cron: `
# Cron

Scheduled AI jobs. Each job runs a prompt file through a configured
model on a cron schedule and writes the output to a file.

**Enable/Disable** — toggle switch on the job card.

**Prompt** — click a job card to expand it and view or edit the
prompt that is sent to the model on each run. Save changes with
"Save prompt". Write specific, grounded prompts — the model has no
context beyond what you provide.

**Edit fields** — click the pencil icon to change schedule, model,
output path, or timeout.

**Run now** — trigger a job immediately regardless of its schedule.

**Add Job** — create a new job with the "Add Job" button. Supported
model prefixes: \`ollama:\`, \`lm_studio:\`, \`claude:\`.

**Output** — set to \`inbox\` to capture output as an inbox item, or
provide a file path (e.g. \`~/reports/brief-{date}.md\`).

## Advisor

Ask the Advisor to generate a job configuration, then paste the
values into the Add Job form. Example prompt:

> Create a cron job that summarizes my open tasks every Monday
> morning. Use id: weekly-summary, schedule: 0 8 * * 1,
> model: ollama:qwen3:14b, output: inbox. Write a prompt that
> lists tasks grouped by customer without inventing data.

## CLI

\`\`\`bash
oc cron list
oc cron show daily-briefing
oc cron enable daily-briefing
oc cron disable daily-briefing
oc cron trigger daily-briefing
oc cron history                     # all jobs
oc cron history daily-briefing      # single job
\`\`\`

### Add a job

\`\`\`bash
oc cron add daily-briefing "Morning Brief" \\
    --schedule "30 9 * * 1-5" \\
    --prompt-file prompts/briefing.md \\
    --output ~/reports/brief-{date}.md \\
    --model ollama:qwen3:14b
\`\`\`

Job definitions are stored in \`jobs.yaml\`. Schedule uses standard
cron syntax. \`{date}\` in output path is substituted with
\`YYYY-MM-DD\`.
`,

  settings: `
# Settings

**AI** — configure Ollama URL, LM Studio URL, Claude API key, and
default models for the Advisor and Cron jobs.

**Task States** — ordered list of kanban columns. Configured via CLI
(\`oc config\`). States marked "done" are hidden from the board by
default.

**Tags** — colored labels that can be attached to tasks and customers.
Add, edit color/description, or delete tags here.

**Customer Types** — short codes (e.g. LEAD, CLIENT) used to classify
customers. Add or remove types here.

## CLI

### Tags

\`\`\`bash
oc tag list
oc tag add urgent --color "#ef4444" --description "Urgent items"
oc tag update urgent --color "#f59e0b"
oc tag remove urgent
\`\`\`

### Task states

\`\`\`bash
oc config states
oc config add-state REVIEW --label "In Review" --color "#8b5cf6"
oc config remove-state REVIEW
oc config move-state REVIEW --after IN-PROGRESS
\`\`\`

Settings are stored in \`settings.yaml\` (path: \`SETTINGS_FILE\` env
var, default \`./settings.yaml\`).
`,

  advisor: `
# Advisor

Ask the AI a question. Context from all OmniControl data sources
(tasks, clock entries, inbox, customer budgets, GitHub issues) is
injected into the prompt automatically.

**Model** — type or select a model string. The dropdown lists all
models detected from your configured providers. You can also type
any valid model string directly.

## Model prefixes

| Prefix | Provider | Example |
|--------|----------|---------|
| \`ollama:\` | Local Ollama | \`ollama:qwen3:14b\` |
| \`lm_studio:\` | Local LM Studio | \`lm_studio:qwen2.5-7b\` |
| \`claude:\` | Anthropic API | \`claude:claude-sonnet-4-6\` |
| \`openrouter:\` | OpenRouter | \`openrouter:anthropic/claude-3.5-sonnet\` |
| \`openai:\` | OpenAI | \`openai:gpt-4o\` |

Models are auto-detected when the provider is reachable (local
server running, or API key configured in Settings > AI).

## CLI

\`\`\`bash
oc ask What should I focus on today?
oc ask Which customer is closest to budget limit?
oc ask Summarize open ACME issues --model claude:claude-opus-4-6
oc ask What is 2+2? --no-context
\`\`\`
`,

  clocks: `
# Clock Entries

Full view of all clock entries across periods. Use this panel to
review, correct, and book time.

**Period** — filter by Today, This week, or This month.

**Date picker** — pick a specific date to see all entries for that
day, regardless of the period selection.

**Search** — filter rows by customer name or description.

**Task** — each entry can be linked to a task. The task name appears
in its own column. Use the edit form to assign or change the task.

**Booked** — a green check icon marks entries already transferred to
a customer's budget. The book button is hidden for booked entries.

**Book** — "+ Book" in the toolbar opens a quick-book form to log a
new entry with a duration string (e.g. \`2h\`, \`90min\`, \`1.5h\`).
Double-tap **T** to open the book form directly.

**Edit** (pencil icon on hover) — inline form to change date,
customer, description, hours, and linked task. Date changes shift the
entry to the new day while keeping the original time-of-day.

**Book to project** (arrow icon on hover) — copy the entry's hours
to a customer's budget as a time entry. Customer, description, and
hours are pre-filled and editable. Marks the clock entry as booked.

**Delete** (trash icon on hover) — removes the clock entry
permanently.

## Task card clock section

On the Kanban board, each task card shows a collapsible clock section
listing all entries linked to that task. A "book all unbooked" button
lets you transfer unbooked hours to the customer's budget in one
click.

## CLI

\`\`\`bash
oc clock list
oc clock list --week
oc clock list --month --customer ACME

oc clock book 2h ACME "Code review"
oc clock book 30min CERMEL "Planning call"

oc clock summary
oc clock summary --week
\`\`\`

Clock data is stored in \`clocks.org\` in \`ORG_DIR\`.
`,

  clock: `
# Time Tracking

**Start** — enter a customer name and description, click Start or
press Enter.

**Stop** — click the Stop button on the active timer banner.

**Quick Book** — log time retroactively with a duration string
(e.g. \`2h\`, \`90min\`, \`1.5h\`).

**Task** — optionally link the entry to a task using the task
autocomplete field. If the task does not exist yet, it is created
automatically.

**Entries** — today's entries grouped by customer and description.
Click a group to expand individual time slots. Use Resume to restart
a previous task, or Book to transfer the hours to a customer's budget.

Edit or delete individual slots with the icons that appear on hover.

## CLI

\`\`\`bash
oc clock start ACME "Implement search feature"
oc clock stop
oc clock status

oc clock book 2h ACME "Code review"
oc clock book 30min CERMEL "Planning call"

oc clock list
oc clock list --week --customer ACME
oc clock summary                    # monthly total per customer
oc clock summary --week
\`\`\`

Clock data is stored in \`clocks.org\` in \`ORG_DIR\`.
`,
};
