# Changelog

## Unreleased

- Edit a clock entry's description from its popup [#240]. In the
  Clocks table, a long description opened a read-only expand
  viewer while notes opened an editable one. The description now
  uses the same editable popup (text icon, Preview/Write), so both
  behave the same.

- Unify the notes indicator across tasks and clock entries [#239].
  A clock entry with notes now shows the same speech-bubble icon
  everywhere it appears (Clocks table, timer sidebar, task-card
  entries, dashboard, customer view), and clicking it opens an
  editable Preview/Write dialog instead of a read-only modal in
  some places and an editor in others. Task cards get a matching
  text icon for their description. One shared NotesBubble component
  backs all of them.

- Edit every time entry through the shared modal, with notes
  preview/edit tabs [#236]. Every clock and task time entry now
  opens the same edit dialog -- the Clocks table, the timer
  sidebar, the entries under a task card, the dashboard, and the
  customer view -- instead of ad-hoc inline forms with differing
  fields. The notes field gained Preview/Write tabs so links
  render as clickable in view mode, and double-click-to-edit is
  gone (the pencil opens the dialog).
- Remove the pause-timer feature [#237]. Pause was a
  desktop-only, device-local flag that never synced to mobile or
  the cloud and needed dedicated cloud-pull regression tests to
  stay consistent. Its one convenience -- restart a recent entry
  without re-entering metadata -- is already covered by the
  mobile "resume last stopped entry" affordance, so it is dropped
  across the backend (all four storage backends), the API, the UI
  (main timer + tray), and the docs.
- Make the time-entry dialog contract field a customer-scoped
  dropdown [#238]. The shared edit dialog rendered the contract
  (Vertrag) field as free text; it now lists the selected
  customer's contracts and clears the value when the customer
  changes.

## 2.8.1

- Manage knowledge-base files from the tree [#230]. Drag a
  file or folder onto another folder (or a source header) and
  choose Move or Copy on drop; right-click any item for a
  context menu with open, cut, copy, copy-path, rename, new
  subfolder, and delete (files and folders). Folders are
  listed before files, each sorted alphabetically, and every
  move or copy triggers a background reindex so metadata
  follows the moved paths. The per-row pencil and trash icons
  are gone -- those actions live in the context menu now.
- Answer beyond the document with web search [#231]. The KB
  document chat and the main advisor now use web search
  (Brave or Tavily when a key is configured, otherwise a
  keyless fallback) for questions your own data does not
  cover, and state plainly when a capability is unavailable
  and how to enable it instead of a vague refusal.

## 2.8.0

- Let the advisor read and tune cron job prompts [#224]. The
  AI advisor can now inspect a scheduled job's prompt and
  placeholders (`get_cron_job`), rewrite it to your needs
  (`update_cron_prompt`), and create a job from a template
  with a custom prompt in one step. Unknown `${...}`
  placeholders are rejected before saving so a typo can't
  silently render as literal text at run time.
- Let the advisor read and tune app settings [#225]. A new
  `get_settings` returns your configuration with every secret
  masked, and a bounded set of setters lets the advisor adjust
  tags, kanban columns, customer/inbox vocabularies, clock
  rounding, backup retention, timezone, and the AI model. API
  keys, tokens, and data paths are never readable or writable
  through the advisor, which is exposed to prompt injection.
- Fix a crash when the advisor or an MCP client listed
  knowledge-base files [#223].

## 2.7.3

- Sync project definitions to the cloud [#219]. Projects,
  their milestones, tags, and status now sync to the hosted
  backend (last-writer-wins, with tombstones), so the mobile
  app sees the same projects as the desktop.
- Send the configured task states (label, colour, done flag,
  and order) in the cloud reference snapshot, so the mobile
  app renders task columns in the same order and colours as
  the desktop instead of guessing.
- More breathing room in the sidebar navigation.

## 2.7.2

- Reorder projects on the board: drag a card within a column
  to reorder it, drag it to another column to change its
  status, and drag a column by its grip to reorder columns.
  All three now persist.
- A project's Tasks tab always shows an add-task control,
  even for a fresh project with no tasks or milestones.
- Change a project's colour from the workspace header, like
  customers.
- Task status badges in a project match the colours
  configured for the board's status columns.

## 2.7.1

- Fix a 500 error when creating a project in the packaged
  app. The projects file is now resolved through the same
  settings overlay as every other org file, honouring a
  configured `org_dir` instead of an un-writable default
  path.

## 2.7.0

- Add first-class Projects [#217]. A project belongs to a
  customer and aggregates its tasks, time, notes, and files
  in one workspace, with a markdown description, milestones,
  tags, a deadline, and a status. Tasks are grouped under
  their milestone; create a task in a project (it inherits
  the customer) or assign an existing one, and its time
  rolls up automatically. A kanban-style board shows
  projects by status with drag-to-reorder, collapsible
  columns, and search. Projects appear on the dashboard and
  on customer cards, are scriptable via `kai project`, and
  are exposed to the AI/MCP tools. See
  `docs/guide/projects.md`.
- Every editing surface now opens in a modal dialog — tasks,
  notes, clock entries, customers, inbox items, contracts,
  and milestones — replacing inline pencil and collapsible
  edit forms.
- Markdown fields (task/note/project descriptions and note
  bodies) use a Preview/Write editor with interactive
  checkboxes and drag-and-drop attachments; removing a
  dropped-file link now deletes the underlying file.
- Consistent tagging across projects and tasks via a shared
  tag input that autocompletes existing tags and accepts new
  ones.
- Customer cards gain Projects, Notes, and Files sections
  (including customer-linked knowledge-base files).
- A keyboard shortcut for the Projects view (default `p`),
  configurable in Settings.

## 2.6.0

Workflow automation. Kaisho now emits a domain event on
every task and clock change and can deliver a signed
webhook to an external tool (n8n, Make, Zapier, or any
endpoint) whenever one fires. A new Settings → Automations
panel manages endpoints, subscribed events, and a delivery
log; mobile-originated changes trigger webhooks once they
sync to a running desktop; and an importable n8n recipe
ships as a starting point.

- Add an importable n8n webhook recipe [#216]. A
  task-moved-to-Slack workflow plus an Automation Recipes
  guide under Integrations → Automations. See
  `docs/integrations/automations-recipes.md`.
- Fire webhooks for mobile-originated changes [#215].
  Clock and task edits pulled from the cloud now emit the
  same domain events as local edits, so a running desktop
  delivers webhooks for changes made on mobile. A large
  first sync or catch-up is applied without firing per-item
  events to avoid flooding subscribers.
- Add outbound webhooks for workflow automation [#214].
  A new Settings → Automations panel subscribes endpoints
  (n8n, Make, Zapier, or any URL) to task and clock events
  and delivers signed JSON POSTs, with a test-fire button
  and a recent-deliveries log. See
  `docs/integrations/automations.md`.
- Emit domain events on task and clock changes [#212].
  Every task create / move / update / archive and clock
  book / timer start / stop / update / delete fires a
  semantic event on a new in-process event bus. This is
  the foundation for outbound webhooks and workflow
  automation (see `product/WORKFLOW-AUTOMATION.md`); no
  user-visible behavior yet.

## 2.5.5

A UX-focused release. The clock history gains date-range
filtering, double-click-to-edit, row highlighting, and
multi-select bulk editing (invoiced / customer / contract).
The task board drops the planned/snooze date in favor of
deadline-only, adds inline task descriptions on create, and
fixes several card interactions. Markdown task-list
checkboxes are now clickable everywhere they can be saved.

- Make the clock entry description a multi-line, resizable
  field when editing [#210]. It was a single-line input.
- Highlight selected clock rows [#209]. Selected rows carry
  a subtle accent tint, with a light hover cue on the rest.
- Multi-select clock entries to bulk-edit them [#208].
  Row checkboxes reveal a bulk-action bar that can mark or
  unmark invoiced and set a customer or contract on all
  selected rows.
- Double-click a clock entry row to edit it [#207]. Opens
  the same inline edit form as the pencil button.
- Filter clock entries by a date range [#206]. A "Range"
  checkbox in the clocks history toolbar switches the single
  date picker to a From/To pair; the backend already
  supported the range.
- Make Markdown task-list checkboxes interactive [#205].
  Clicking a `- [ ]` / `- [x]` in a rendered note, task
  description, inbox item, or knowledge-base file toggles it
  and saves the body.
- Add a description field to the inline create-task form
  [#204]. New tasks can be given a body immediately instead
  of having to create then edit.
- Allow dropping a task onto a folded column without
  expanding it [#203]. Pointer-based drag collision lets a
  narrow collapsed column win as the drop target, and it
  now highlights while a card is dragged over it.
- Show the inline add-task form at the top of the column
  [#202]. New tasks are inserted at the top, so a bottom
  form made the saved card jump up; typing at the top makes
  it appear where it was entered.
- Stop the deadline bell badge from overlapping the task
  card hover actions [#201]. On hover the badge slides left
  of the mark-done/edit/archive strip instead of sitting
  under the tick icon.
- Remove the task scheduled/planned date and the snooze
  behavior [#200]. Tasks are no longer hidden until a
  planned date; only the deadline date remains. Any
  previously snoozed tasks are now always visible on the
  board.
- Refresh the org backend keyword cache when a task state
  is added or removed [#199]. Adding a new board column
  (e.g. "Backlog") and moving a card into it no longer
  makes the card vanish until a server restart.
- Internal: finish moving business logic out of the API
  routers into services — AI provider discovery / probing
  (`services/ai_providers.py`), the cloud disconnect
  workflow, and the task-state reorder algorithm now live
  in their services; the routers are thin shims.

## 2.5.4

A correctness + hardening release continuing the whole-app
review: two more data-integrity fixes (SQL notes/inbox
cloud-sync identity, the settings write race) plus
attachment upload caps and some internal cleanup.

- Give SQL-backend notes and inbox items cloud-sync
  identity (`sync_id` + `updated_at`). Without it they
  were silently never pushed to the cloud, and pulled
  items duplicated on every sync. Adds the columns with an
  idempotent migration and backfills legacy rows on read.
- Serialise settings writes behind a lock and write the
  settings file atomically. Two clients saving different
  settings blocks at once could previously drop one
  another's change (read-modify-write race), and a crash
  mid-write could truncate the file.
- Internal: dedup the notes / inbox "move to knowledge
  base" file-writing and path-traversal guard into a
  shared `write_kb_markdown` helper.
- Cap attachment uploads per bucket (file count and total
  size) so a runaway client can't fill the disk one small
  file at a time, on top of the existing per-file limit.
- Internal: move the iCalendar feed serialisation and the
  dashboard metric aggregation out of their API routers
  into dedicated services (`services/ical.py`,
  `services/dashboard.py`).

## 2.5.3

This release adds drag-and-drop file attachments for
markdown bodies and lands the results of a full whole-app
code review: a cluster of security, data-loss, and
sync-correctness fixes, plus some UI polish. Remaining
structural refactors surfaced by the review are tracked as
GitHub issues.

- Drag-and-drop or paste files onto a markdown body to
  attach them, GitHub-issue style — task descriptions,
  note bodies (edit + create), inbox items (edit +
  create), and the knowledge-base editor all accept drops
  now. Files land under the active profile at
  `data/profiles/<profile>/attachments/<bucket>/...` and
  are served back from `/api/attachments/...`. Images
  embed as `![name](url)`; everything else becomes a
  `[name](url)` link. Local-only for now — desktop
  attachments will show as broken on the mobile PWA
  until cloud-backed storage lands.
- Kanban columns now expand to fill available width up
  to a sensible cap (288–400 px) so editing on wide
  screens is no longer cramped, and collapsed columns
  hand their freed-up space back to the expanded ones.
- Move the scheduled/deadline badges on task cards from
  next to the customer chip to the top-right corner
  where they no longer crowd the title.
- Make the note body field taller by default (and
  resizable on the create form) so writing longer notes
  isn't cramped.
- Fix two data-loss windows from non-atomic file moves:
  archiving / unarchiving a task now writes the
  destination file before removing from the source, and
  knowledge-base file moves use an atomic `shutil.move`
  that also no longer corrupts binary files (PDFs).
- Harden three security gaps: the cron output-to-KB
  endpoint now rejects filenames that escape the
  knowledge dir (path traversal), the command-bar CLI
  endpoint blocks destructive verbs (delete/remove/
  archive/…) in any command group and builds its runner
  per request, and the `batch_invoice` tool refuses to
  run without a customer or contract scope so it can't
  invoice an entire history in one call.
- Fix three frontend correctness bugs: dropping multiple
  files into a description now inserts all their links
  (previously only the last survived), every clock
  mutation refreshes the customer/contract/dashboard
  totals consistently (pause/merge/clear no longer leave
  stale budget bars), and the live-update WebSocket no
  longer leaks a zombie socket + reconnect timer on
  unmount.
- Fix three sync-correctness bugs: the cloud initial
  full-push is now tracked by an explicit flag so a
  failed first push no longer permanently skips pushing
  pre-existing history; the CalDAV push gate compares
  timestamps as instants instead of strings (no more
  dropped entries at negative UTC offsets); and profile
  switch / create now hold a lock and restore the active
  profile on failure so a half-created profile can't
  strand the server.
- Fix the MCP server advertising array/object tool
  parameters (e.g. a task's `tags`) as strings, so MCP
  clients now send list-valued arguments in the correct
  shape.
- Address org-mode notes by their stable `SYNC_ID`
  instead of their position in the file. Editing or
  deleting a note could previously hit the wrong note if
  another note had been inserted ahead of it, and a
  non-numeric id raised a 500.
- Unify the contract picker across all time-tracking
  forms into a shared `ContractSelect`. Invoiced
  contracts are now consistently hidden everywhere (they
  were selectable when editing an entry but hidden when
  booking), while the currently-selected contract stays
  visible so editing never blanks it.
- Small frontend cleanups: memoise the toast context value
  so toasts no longer re-render every consumer, cancel the
  active-timer notes debounce on unmount, and stop
  remounting the timer digits every second.
- Add the missing knowledge-search match-count plural
  strings to the German, Spanish, and Russian locales
  (with correct Russian plural categories) so non-English
  users no longer see the English fallback.
- Push to the cloud / CalDAV after a batch-invoice so the
  invoiced flag propagates to other devices, matching
  every other clock mutation.
- Validate task `scheduled` / `deadline` as `YYYY-MM-DD`
  at the API boundary so a malformed date can't be
  persisted verbatim.

## 2.5.2

This release adds the kanban-scheduling feature (snooze a
task until a future date, see a deadline cue when it's
close) and lands a cluster of correctness fixes from the
post-feature code review — most of them touching the
cloud-sync path where v2.5.1 left small gaps.

- Make the `DONE` flag on task states load-bearing. The
  badge in Settings → Task States is now a clickable
  toggle, the backend's done-filter reads it instead of
  hardcoding `{DONE, CANCELLED}`, and the kanban card's
  tick icon moves a task to the **first** state flagged
  done (deterministic by the user's own ordering). If no
  state is flagged, the tick icon hides entirely — so
  deleting the DONE column can't silently orphan tasks
  into a missing status anymore. Existing profiles whose
  settings have no `done` flag set fall back to the old
  hardcoded set, so nothing changes for anyone who
  hasn't customised. A short description above the list
  explains what the toggle does.

- Refactor the cloud-WS broadcast plumbing from the
  post-feature audit. Single `BROADCAST_RESOURCES`
  constant replaces three duplicate listings of
  `("clocks", "inbox", "kanban", "notes")`. Drop the WS
  pending-resources set + `_drain_and_broadcast_pending`
  since `_broadcast_sync_changes` now fires
  unconditionally inside `_run_cloud_sync` — two
  mechanisms for the same effect collapsed to one.
  Per-iteration `try/except` in the broadcast loop so
  one failing resource doesn't abort the rest. Pass the
  scheduler's own timezone to `next_run_time` so
  APScheduler stops emitting the naive-datetime
  warning. And the snooze filter + deadline badge use
  `toLocaleDateString("en-CA")` instead of
  `toISOString().slice(0, 10)` so users in negative-UTC
  timezones no longer see their snoozes expire /
  deadlines fire a day late.

- Fix three correctness regressions from the
  scheduling + sync work. (1) A cloud-pull update for a
  task whose wire payload omits `scheduled`/`deadline`
  (legacy peer, PWA, iOS on an older build) no longer
  silently clears the local dates; `None` on the wire
  is now "leave unchanged", matching the rest of the
  PATCH convention. (2) The JSON backend's `list_tasks`
  / `list_archived` normalise legacy task dicts so
  `scheduled`/`deadline` always come back as `None`
  instead of missing keys — the SQL and markdown
  backends already did this, the JSON one diverged.
  (3) The PAUSED-on-pull clear from v2.5.1 was too
  aggressive: it wiped the local pause flag on every
  cloud-origin sync, including unrelated edits (notes
  appended, customer renamed). Now PAUSED only clears
  when the cloud actually touched the entry's `end` —
  resume or stop — so editing notes on the iPhone for
  a paused entry leaves the desktop pause flag alone.

- Make the 5-minute cloud-sync poller's
  `_broadcast_sync_changes` actually refresh the kanban.
  It was sending `resource: "tasks"` while the frontend's
  `RESOURCE_TO_QUERY` map only routes `kanban` to the
  tasks React Query, so cloud-side task edits picked up
  by the periodic sync (rather than the WS hot path)
  silently never reached the board. Same fix drops the
  `pulled+deleted == 0` gate that suppressed legitimate
  refreshes whenever cursor races or push-lock
  contention returned zero counts. Closes #150.

- Surface the new task date fields in the kanban UI.
  Snoozed tasks (`scheduled` in the future) drop off the
  board until the day arrives, then return with a small
  alarm-clock badge top-left — clicking it acknowledges,
  which clears the snooze. A toolbar pill shows the
  snoozed count and expands to a list with one-click
  "Wake" per task. Deadlines within three days (or
  overdue) get a separate bell badge that can be
  acknowledged per-device via localStorage — the deadline
  date stays on the task, the urgency cue just gets
  muted. Add-task and edit-task forms gain two date
  inputs.

- Add `scheduled` and `deadline` date fields to the task
  model across all four backends (org, markdown, sql,
  json) and the cloud wire format. Both are date-only ISO
  strings; `scheduled` is the snooze (later UI hides the
  card until that day arrives) and `deadline` is the due
  date (later UI surfaces it as an urgency cue). SQL gets
  an idempotent `ALTER TABLE` migration so existing
  databases pick up the columns on next open. The
  add_task / update_task / MCP / API surfaces all accept
  the new kwargs; UI follows in a separate PR.

- Replace the global "Show done" toggle on the kanban
  board with per-column collapse. Each column has its own
  chevron; collapsed columns shrink to a narrow strip with
  a rotated label and task count, the choice persists per
  profile, and re-expanding restores the full column.
  Drops are blocked on collapsed columns so cards can't
  vanish into an invisible drop zone.

- Expose `scheduled` / `deadline` through the CLI `task
  add` and `task update` commands so a shell user can set
  or clear a snooze and deadline without going through
  the UI. `task list` shows both fields inline. The MCP
  `list_tasks` description now mentions both fields too.
  Reject `deadline < scheduled` at the API and gate the
  Save button in the edit form so the typo can't sneak
  in.

- Make the task body textarea on the edit form
  vertically resizable. Long notes (meeting summaries,
  pasted emails) no longer force an internal scroll
  inside a fixed three-row box.

- Skip the `Unreleased` section in the What's New parser
  and split top-level bullets into separate items. Before,
  opening the dialog against a `CHANGELOG.md` with an
  `## Unreleased` staging section displayed "What's New
  Unreleased" and rendered every bullet with two dots.

## 2.5.1

This release fixes a cluster of cloud-sync edge cases that
left the desktop showing stale paused / running / merge
state whenever another device (PWA, iOS) made a change.
Plus two dev-loop fixes that landed alongside.

- Clear the desktop-local `PAUSED` flag on every
  cloud-origin pull. `PAUSED` is a desktop-only UI
  affordance that never crosses the wire, so a paused
  entry that another device (PWA, iOS) has since resumed
  or stopped used to stay marked paused locally — the
  running-timer card kept offering "Resume" for an entry
  the cloud thought was finished. Both the org and SQL
  backends now clear it whenever they apply an incoming
  sync payload.

- Run the cloud sync once at startup instead of waiting a
  full five minutes for the first interval tick. A fresh
  app launch now reconciles with the cloud immediately, so
  a timer running on another device (PWA, iOS) shows up in
  the desktop's running-timer card right after boot. The
  WebSocket only delivers events from the moment it
  connects, so without an initial pull there was nothing
  to fill the offline-window gap.

- Pull from the cloud when a `timer:started` arrives over
  the cloud WebSocket. The previous map only triggered a
  sync on `timer:stopped`, so a timer started or resumed
  on another device (PWA, iOS) only fired the immediate
  `clocks` broadcast — the desktop frontend invalidated
  its query and re-read the same pre-start local state,
  leaving the running-timer card empty until the 5-minute
  poller eventually caught up. Resume now propagates
  symmetrically with stop.

- Fix a `FileNotFoundError` crash in `write_org_file` when
  two writers raced on the same org file (e.g. a kanban
  list request that backfilled `TASK_ID`/`SYNC_ID` while
  the background cloud sync was also writing). The old
  shared `<path>.tmp` scratch path lost one of the two
  writers to a missing-source rename. Each writer now gets
  a unique `tempfile.mkstemp` scratch and removes it on
  failure. Same fix applied to `kb_index.save_index`.

- Record a cloud tombstone when merging two clock entries
  so the deletion of the merged-away entry propagates to
  other devices on the account (PWA, iOS). Before, the
  merge router only dropped the source from CalDAV — the
  surviving entry's update was pushed to the cloud but
  the deletion of the source never was, so the iOS app
  and the PWA kept showing both the originals plus the
  merged result until those rows were deleted by hand.

- Refresh the desktop UI when the cloud broadcasts
  `entries:changed`, `entries:deleted`, `inbox:changed`,
  `tasks:changed`, or `notes:changed`. The sidecar already
  pulled the new rows into local SQL, but never told the
  React frontend to invalidate its queries — so an entry
  edited on the PWA or iOS app stayed stale on desktop
  until the app was restarted. Cloud-WS events now record
  which resource needs refreshing and the broadcast fires
  after the debounced sync writes the new rows locally.
  Closes #148.

- Strip duplicate newlines and re-split bursts when piping
  `kai-server` output in `bin/dev --desktop` so Python
  tracebacks render with one `[kai]`-prefixed line per
  frame instead of a single squashed blob with a blank
  line between every entry.

## 2.5.0

### Expose the MCP HTTP allow-tier in Settings so write and destructive tools can be enabled without editing the stdio CLI flags [#147]

Before 2.5.0 the HTTP MCP transport mounted by `kai serve`
was hard-wired to `allow="read"`. Stdio users could pick a
tier with `kai mcp-server --allow ...`, but HTTP clients
(the default Claude Desktop / Claude Code / Cursor setup
the integration panel hands out) saw only the read-only
tool surface and had no way to widen it without editing
source.

**A new Permissions selector in Settings → Integrations →
Local MCP server** persists the chosen tier as a flag file
at `~/.kaisho/mcp-allow` (mirroring the existing
`mcp-disabled` pattern, so the desktop app, a shell user,
and a deploy script can all set it without parsing YAML):

- `read` — query tools only (default after install).
- `write` — adds `add_task`, `start_clock`, `book_time`,
  `add_note`, and the rest of the create / update tools.
- `destructive` — also adds `delete_*` and `rename_profile`.

The default stays at `read` so an upgrade never silently
widens what a remote client can drive with the bearer
token.

**Restart-aware UI.** FastMCP registers the tool list once
at startup, so changing the tier requires restarting
`kai serve` (or the desktop app). The panel detects when
the on-disk preference has diverged from the live tier and
surfaces an inline "restart required" hint until the
running server catches up.

## 2.4.1

## 2.4.1

### Fix the Windows loading-screen freeze and console flicker by trimming kill_stale and routing every Rust spawn through CREATE_NO_WINDOW

Two cooperating bugs were behind the multi-minute Windows
startup and the cluster of conhost windows that flashed
during it. Procmon traces from a 2.4.0 user confirmed
both.

**`kill_stale` was killing the wrong PIDs.** The Windows
branch parsed `netstat -ano -p TCP` and ran
`taskkill /F /PID <pid>` for every PID appearing in any
line containing `:8765`. That suffix matches not only the
sidecar's LISTENING row but also every ESTABLISHED and
TIME_WAIT entry for client connections from the webview
back to the sidecar. A normally-closed previous session
leaves 20+ such socket entries on the port for the OS
TCP cleanup window, so the next launch spent the full
loading-screen budget taskkilling unrelated PIDs (the
webview, `kaisho-desktop` itself on a bad day, system
processes that happened to share a PID with an old entry)
before the real sidecar was ever spawned. Now we walk
the netstat columns and only kill the single PID whose
state is `LISTENING` and whose local address ends in the
sidecar port.

**Every Rust-side `Command` bypassed `CREATE_NO_WINDOW`.**
`std::process::Command::new(...)` does not set
`CREATE_NO_WINDOW` on Windows, so each console-subsystem
child (`netstat`, `taskkill`, the user's external editor)
flashed a conhost window for its lifetime. New
`desktop/src-tauri/src/proc.rs` wraps `Command` with the
flag on Windows and is now used by `sidecar::kill_stale`,
`open_in_editor`, and `detect_shell_path`.

The combination is what users will notice: startup goes
from the previous "minute or two of loading screen with
20-30 black windows flashing" to "a few seconds with no
visible terminals". The 2.4.0 Python-side fix is still
necessary for the same reason on the sidecar's own
children (`claude --version`, `pdftotext`, ...).

### Add an opt-in subprocess spawn tracer

For diagnosing future "surprise spawn" reports, both
halves of the app now share a tracer. Setting
`KAISHO_TRACE_SUBPROC=1` causes:

- The Python sidecar to monkey-patch `subprocess.Popen`
  and log every spawn (argv, cwd, creation flags, caller
  frame).
- The Tauri shell to log every `Command` it routes
  through `proc::configured` (binary + call-site label).

Both write to `<KAISHO_HOME or ~/.kaisho>/subproc-trace.log`
so a single tail covers the whole boot path. Off by
default. Replaces the previous "ask the user to run
Procmon" support flow.

## 2.4.0

### Restore the SQL_DSN field in Settings → Paths so Postgres + other SQLAlchemy backends are reachable again

The SQL backend has supported arbitrary SQLAlchemy DSNs
(SQLite, Postgres, MySQL, anything SQLAlchemy can drive)
since the April 2026 rewrite. Config plumbing, settings
service, REST API, and TypeScript types all carry the
field. The Paths settings UI lost its input row at some
point during a refactor, so users had no way to point
Kaisho at a Postgres instance from the desktop app even
though every layer below the form supported it.

Re-adds the `SQL_DSN` input under the SQL backend row in
Settings → Paths. Visible only when the active backend is
`sql`. Placeholder shows the recommended
`postgresql+psycopg://user:pass@host/db` shape; an empty
field keeps the current behaviour of a per-profile
`sqlite:///<profile>/kaisho.db`. Saving the form persists
to `settings.yaml` via the existing `/api/settings/paths`
PATCH and triggers `reset_backend()` so the new DSN takes
effect without restarting.

Translations updated for EN, DE, ES, and RU. Added unit
tests that exercise the settings round-trip and the
`_OverlayCfg` proxy used by the backend factory.

### Stop the Windows sidecar from flashing console windows on startup

On Windows, every `subprocess.run` against a console-mode
child flashes a `conhost.exe` window for the lifetime of
the call. The Settings panel polls the `claude --version`
status on mount, and PDF ingest shells out to `pdftotext`,
so users saw a stream of black terminals pop in and out
during the loading screen and again whenever they opened
Settings.

Two changes, scoped to the flicker:

- New `kaisho.subproc.run` helper that sets
  `CREATE_NO_WINDOW` on Windows and passes through
  unchanged on POSIX. All sidecar-side `subprocess.run`
  call sites (`settings_ai`, `knowledge`, `advisor`,
  `cron.tools`, `cron.executor`) route through it. The
  interactive CLI editor launcher is left on plain
  `subprocess.run` because suppressing the console would
  hide `vim` / `emacs -nw`.
- `scripts/build-sidecar.ps1` builds with `--noconsole`
  so the sidecar exe itself is GUI-subsystem on Windows.
  Tauri already captures the sidecar's stdout/stderr via
  its `Command` API, so log capture is unchanged.

Slow Windows startup (>1 min during the loading screen)
is a separate problem: `--onefile` re-extracts the whole
bundle to `%TEMP%\_MEI*` every launch and Defender scans
each extracted file. Fixing that requires switching to
`--onedir` and restructuring the Tauri `externalBin`
bundle, which is left for a follow-up.

## 2.3.2

### Fix KB summarize crashing when the Kaisho-cloud model is selected

`_ask_kaisho_cloud` was calling `cloud_ai_agentic` with
`system_prompt=` and `tool_handlers=`, but the function
signature uses `system=` and `tool_executor=`. The mismatch
landed during an earlier refactor of `cloud_ai_agentic` and
went undetected because nobody summarized a KB file against
the cloud model. Any attempt to do so raised
`TypeError: cloud_ai_agentic() got an unexpected keyword
argument 'system_prompt'` and returned a 500 from
`/api/knowledge/file/summarize`.

Caller updated to use the right names. Added a regression
test that snapshots the real signature and asserts every
kwarg the summarize path passes is one the function
actually accepts, so the same drift cannot recur silently.

## 2.3.1

### Register the kaisho:// URL scheme so kaisho.dev can deep-link into the app

Adds `tauri-plugin-deep-link` with the `kaisho://` scheme
registered against the desktop bundle. The Rust handler
focuses the main window on receipt and emits the incoming
URL to the React UI as a window event; the frontend parses
`kaisho://<view>[#<sub-tab>]` and drives the existing hash
router so the user lands on the right panel.

Initial use case: `kaisho://settings#integrations` lets the
kaisho.dev MCP page open the Settings → Integrations panel
directly, so visitors do not have to hunt through menus to
find the URL + token they need to configure their MCP
client.

The handler ignores unknown views and malformed URLs
silently rather than surfacing an error, since the OS will
hand us anything that starts with the scheme.

## 2.3.0

### Surface the MCP URL and bearer token in Settings → Integrations

The HTTP transport from the previous change worked but
required users to `cat ~/.kaisho/mcp-token` from a shell to
find the bearer token. The Integrations tab now shows the
URL and token directly with copy buttons, ready-to-paste
config snippets for Claude Code, Claude Desktop, and Cursor
that interpolate the live values, and a rotate button that
generates a fresh token and warns that existing clients will
disconnect.

The token stays masked by default behind a Show toggle so
the value doesn't sit on screen during demos or pair
programming sessions.

When disconnected, the panel collapses to a single Connect
button matching the cloud-integration rows above. Clicking
Connect starts serving on `/mcp/` and expands the panel to
show the URL, token, snippets, and a live status pill (green
Running, gray Disabled, red Backend unreachable) that
refreshes every 10 seconds. Disconnect makes the endpoint
return 503 to every request regardless of bearer, so a leaked
token can be revoked without restarting the app.

### Expose the MCP server over HTTP so any client can connect with a URL

The MCP server was stdio-only, which forced every Claude /
Cursor / Zed config to spawn a per-client subprocess and
reference the bundled `kai-server` binary by full path. Desktop
installers do not put `kai` on PATH, so the JSON differed per
operating system and broke after auto-updates relocated the
bundle.

The MCP transport now mounts onto the always-running `kai serve`
FastAPI app at `http://localhost:8765/mcp/`. Clients point at a
single URL that is identical on macOS, Windows, Linux, and inside
WSL. One always-on backend serves any number of MCP clients
concurrently instead of one subprocess per connection.

Auth is a per-user bearer token at `~/.kaisho/mcp-token`,
generated lazily on first start with mode `0600` and compared in
constant time on every request. Loopback binding plus file perms
keep the surface tight; rotation is a file delete and restart.

Stdio remains available via `kai mcp-server` for setups that
need per-client tier scoping, profile pinning, or independence
from the desktop app.

## 2.2.5

Bug fix and a documentation refresh. No new app features.

### `kai customer list` shows used hours, not remaining

The list formatter pulled the `rest` field and rendered
`{rest}h / {budget}h ({percent}%)`, which reads naturally as
"used of total (% used)" but the values meant the opposite. A
customer at "36h / 40h (91%)" looked nearly exhausted when only
4h had been used and 36h were still left.

The formatter now uses the `used` field, matching the mental
model for budget tracking and lining up with `kai customer show`,
which already labels the field "Used:". Customers without a
budget continue to show just their status.

### Documentation refresh

End-to-end pass over docs.kaisho.dev:

- Cloud-sync API and integration pages rewritten to match the
  current surface: Companion / Pro / Team plan names (renamed in
  1.7.3, never reflected in the docs), the WebSocket fast path
  with 2s debounce, the `/use-kaisho-models`, `/ai-usage`, and
  `/sync-now` endpoints, real settings keys, and a clarified
  triage model.
- Every release-introduced feature now carries an inline
  `version-added` chip next to its heading so readers can tell at
  a glance when a feature shipped (2.2.0 themes, 1.8.1 pause /
  resume, 1.5.0 KB metadata index, 1.4.4 Ollama Cloud, etc.).
- All desktop and PWA screenshots re-shot against a fresh
  `screenshots` demo profile. Desktop uses the default zinc
  theme; PWA captures show the current PRO plan badge instead of
  the legacy "SYNC + AI" string.

### Notify the website on release publish

New `.github/workflows/notify-website.yml` fires a
`repository_dispatch` into `ridingbytes/kaisho-website` whenever a
release publishes here. Combined with the website's
`sync-kaisho-version.yml`, the visible version chip on
`kaisho.dev` updates within seconds of a release instead of
waiting up to six hours for the scheduled poll. Setup is
optional: drop a `WEBSITE_DISPATCH_TOKEN` PAT into repo secrets
to enable; the scheduled fallback continues to work without it.

## 2.2.4

Single-purpose patch: the What's New dialog after the
2.2.3 update rendered an empty body. The CHANGELOG
parser only picked up top-level `- bullets` and the
2.2.3 entry was written entirely as prose plus `###`
subsections, so it produced `items: []` and the dialog
showed no content beyond the title.

### Parser handles prose and subsections

`frontend/src/utils/changelog.ts` now treats each
`### Heading` as a new item with the heading rendered
as a bold prefix and the prose underneath accumulated
as the item body. Leading paragraphs directly under
`## VERSION` are emitted as the section's first item.
Old-style top-level `- bullets` and their indented
continuation lines are preserved inline inside the
parent section, so every historical entry (1.x, 2.0.x,
2.1.x) still renders correctly. Verified against the
full CHANGELOG: 2.2.3 now produces four items where it
previously produced zero, 2.2.2 produces two, 2.2.1
produces three, 2.2.0 produces twelve.

## 2.2.3

Three desktop-app polish fixes.

### Settings → Install Update no longer fails on a stale chunk

The Settings → Updates flow imported
`@tauri-apps/api/core` dynamically to call a
renderer-side `kill_sidecar` IPC before the installer
ran. That extra chunk failed to load post-update on some
installs and aborted the install with `Importing a
module script failed`. The auto-update banner has never
performed that kill and works reliably; the settings
flow now matches it, delegating sidecar termination to
the NSIS pre-install hook (Windows) and the installer
itself (macOS/Linux).

### Version history label no longer renders as a literal key

`UpdateTab` referenced two i18n keys
(`versionHistory`, `versionHistoryCount`) that were not
defined in `settings.json`, so the heading rendered as
the raw `versionHistoryCount` string in the UI. Keys
added for `en` / `de` / `es` / `ru` with plural variants
(`_one` / `_few` / `_many` / `_other` where the locale
requires them).

### Tray popup picks up the selected theme

`tray.html`'s inline theme-sync script only handled the
legacy two-mode `theme === "dark"` toggle. It ignored
`themeLight` and `themeDark` preset names (sepia,
solarized, dracula, nord, ...), the `"system"` mode that
follows OS preferences, and the `themeFont` choice. It
now mirrors `App.tsx` `resolveTheme` /
`attrForPreset` / `applyFont`, listens for the
`kaisho-theme-changed` custom event for same-window
updates, and follows the `prefers-color-scheme` media
query so the tray re-themes live when the OS flips
between Light and Dark.

## 2.2.2

Follow-up patch to 2.2.1 fixing one more org -> sql
convert data-loss bug surfaced by the same user import
on 2026-06-01.

### Clock notes were dropped on import

The multi-line body under each org `CLOCK:` heading
(`notes`) was not transferred into the SQL `clocks`
table. Two unrelated bugs combined to lose it:

- `services.convert._convert_clocks` did not forward
  `notes` to `target.clocks.quick_book`.
- The SQL backend's `quick_book` accepted a `notes`
  parameter but hardcoded `notes=""` when persisting
  the row.

Verified against the reporting user's archive: 37 of
37 source clock entries with non-empty notes now
import correctly.

## 2.2.1

A polish + correctness release with three categories of
fixes layered on top of 2.2.0.

### Data fidelity — convert preserves cross-references

Two bugs in `services.convert` were silently corrupting
data when migrating between backends (e.g. org -> sql).
Both were surfaced by a user import of a long-running
org workspace on 2026-06-01.

- **Task IDs were regenerated on import**, so clock
  entries and notes that referenced the source's task
  IDs ended up pointing at nothing in the target DB.
  The sidebar timetracker showed raw 12-char hex IDs
  like `a81b5f2efd4b` next to entries instead of the
  task title. Fixed by threading an optional ``task_id``
  parameter through ``add_task`` in every backend (base
  interface + sql + markdown + json + org/kanban) and
  passing the source's id when converting. When omitted,
  behaviour is unchanged.

- **Customer-level `:USED:` (`used_offset`) was being
  dropped** for customers without contracts. The SQL
  `customers` table had no column for it. For one user
  this lost 11 customer offsets totalling > 1,600 h of
  historical invoiced work. Fixed by:
  - Adding a `used_offset FLOAT` column to `CustomerRow`
    + an idempotent `_ensure_customer_used_offset_column`
    migration helper so legacy DBs grow the column on
    next open (same shape as the existing
    `_ensure_paused_column`).
  - Surfacing `used_offset` on the org backend's
    customer dict independently of any contract.
  - Rewriting the SQL backend's `_enrich_customer` to
    mirror the org backend's contract-scope logic so
    historical entries on previous (invoiced) contracts
    no longer poison the active contract's "remaining
    capacity".
  - Wiring `used_offset` through `add_customer` in every
    backend and through `services.convert`.

### UI polish

- **SearchInput fills its wrapper.** The wrapping div
  takes the caller's width (`w-44` / `w-52`), but the
  inner `<input>` lost `w-full` in the form-recipe
  cleanup -- so it sized to its placeholder + padding
  and overflowed into the next toolbar sibling. Fixed
  by re-adding `w-full` to the default input class
  inside SearchInput.

- **Placeholder text rendered too faint on warm and
  dark themes.** Modern browsers paint `::placeholder`
  at ~54% opacity by default; our themed
  `placeholder-fg-muted` then disappeared on
  `bg-surface-overlay` in sepia / gruvbox /
  solarized-light and on the dark variants. Added a
  global `::placeholder { opacity: 1; }` rule so the
  colour we set is the colour that paints.

- **Sidebar timetracker edit form gained per-input
  labels.** Eight unlabelled stacked fields (where
  Description and Task often hold the same string)
  made the form impossible to read. Same eyebrow-label
  treatment ContractRow uses (`CUSTOMER`, `CONTRACT`,
  `DESCRIPTION`, `TASK`, `DATE`, `START TIME`, `HOURS`,
  `NOTES`). Date / start time / hours grid cells now
  use `w-full` + `min-w-0` so they fill their share
  rather than collapsing to placeholder-width stubs.
  Field height bumped from `h-7`/`text-xs` to
  `h-8`/`text-sm` (the standard `inputCls`) so the
  form reads as a real form, not an inline table edit.

## 2.2.0

A theme + design-system release. Rewrites the appearance
layer onto a single token catalog, adds 12 selectable
themes (6 light + 6 dark) and a font picker, ships a set
of shared UI primitives, and fixes a chain of advisor /
customer-budget reporting bugs surfaced during the
overhaul.

### Theme system

- Semantic colour tokens (`surface-*`, `border-*`,
  `cta-*`, `fg-*`, `success` / `warning` / `danger` /
  `info`) replace every raw `text-stone-*` / `bg-stone-*`
  in components -- one codemod pass rewrote 1,181
  occurrences across 107 files.
- **12 theme presets** selectable via Settings >
  Appearance:
  - Light: Zinc (default), Sepia, Solarized Light,
    GitHub, Gruvbox Light, Catppuccin Latte.
  - Dark: Zinc, Solarized, Dracula, Nord, Tokyo Night,
    Catppuccin Mocha.
- New **system mode** that follows the OS
  `prefers-color-scheme` and flips live when macOS /
  GNOME / Windows toggle Light/Dark.
- Mode + light-preset + dark-preset stored separately, so
  choosing Sepia for light and Mocha for dark works.
- Per-theme syntax highlighting via CSS-var-driven
  `.hljs-*` palette; removed the static
  `highlight.js/styles/github.min.css` import that made
  code blocks unreadable on every dark preset.
- Tailwind `dark:` variant now fires on every dark
  preset (zinc, solarized, dracula, nord, tokyo-night,
  mocha) -- not just the literal `zinc-dark`.

### Font picker

- 5 font presets (Inter default / System UI / Helvetica
  / Georgia serif / JetBrains Mono) selectable in
  Settings > Appearance. Body font reads from
  `--app-font` CSS var so swaps are instant.

### Design-system primitives (new)

| Component | Purpose |
|---|---|
| `common/Button.tsx` | Variants primary / secondary / tonal / ghost / danger; sizes xs / sm / md / lg; shapes rounded / pill; `iconOnly` |
| `common/Badge.tsx` | Tag / status / count chip; 18-colour tag palette |
| `common/Heading.tsx` | Levels eyebrow / panel / section / sub |
| `common/StateMessage.tsx` | Empty / loading / error with default icon + optional CTA |
| `common/HoverActions.tsx` | Reveal-on-hover cluster that doesn't reflow the row (supports named-group variants) |
| `common/ToggleField.tsx` | Label + description + Toggle row for settings tabs |
| `common/Dialog.tsx` | Modal shell with backdrop + focus + scroll lock |
| `common/Popover.tsx` | Anchored non-modal overlay with outside-click + Escape |

### Mechanical sweeps

- Font-size policy: 329 arbitrary `text-[Npx]` usages
  collapsed onto a named scale
  (`text-2xs` / `text-xs` / `text-sm` / `text-base`).
- Border-radius policy: 63 `rounded-sm` /
  `rounded-xl` / `rounded-2xl` collapsed onto the
  three-radius set (`rounded` / `rounded-lg` /
  `rounded-full`).
- Form-input recipe drops `w-full` from the shared
  `inputCls` / `smallInputCls` (was overriding caller-
  supplied `w-14` / `w-24` and exploding hours / select
  inputs to full width).
- Form-input contrast switches to
  `bg-surface-overlay + border-strong` so inputs read
  as inputs on every preset (the previous
  `bg-surface-raised + border-border` washed out on
  warm sepia / gruvbox / solarized surfaces).

### Settings

- **Appearance tab** added (mode + light preset + dark
  preset + font + app title). App title moved here from
  General.
- All 7 panel toolbars (Customers, Notes, Inbox, Clock,
  Kanban, Cron, Knowledge) share the same tonal `+ Add`
  button.
- PathsTab: select height matches input height,
  buttons use the shared component, KB-source row
  controls (move up / move down / remove) all use
  `<Button>` with the right variant + size.

### Knowledge base

- Open file persists across navigations and app
  reloads (per-profile localStorage), reveals itself in
  the tree on restore (parent folders auto-expand,
  selected leaf scrolls into view).
- Tree font bumped (`text-xs -> text-sm`) for
  readability; section heading (`KNOWLEDGE` /
  `RESEARCH` / ...) strengthened from `text-[10px]` to
  `text-xs font-semibold`.
- Recent-files list shows dimmed parent folder next to
  the title plus a full corpus/path tooltip.

### Advisor

- Drop the duplicate cloud `google_list_events` tool;
  `list_calendar_events` already aggregates CalDAV +
  Google. The standalone Google tool was distracting
  the model into picking the wrong calendar source for
  iCloud / Fastmail / Nextcloud users.
- New system-prompt rule 5a: explicit INTENT -> TOOL
  mapping (calendar -> `list_calendar_events`,
  KB -> `search_knowledge`, etc.) plus the hard rule
  "NEVER claim a feature is missing without first
  trying the dedicated tool". Stops the model from
  reaching for `execute_cli` (and falsely concluding
  "no calendar integration") for queries that have a
  dedicated handler.
- New system-prompt rule 5z: `list_contracts` now
  returns an explicit `state` field (`active` /
  `invoiced` / `ended`); the model is told to IGNORE
  invoiced / ended contracts for budget / capacity
  reasoning.
- `list_customers` and `list_contracts` pre-compute
  `budget_hours` / `used_hours` / `rest_hours` /
  `pct_used` so the model can't invert "used" and
  "rest" (which was happening: 79h left mis-reported
  as "79% used").
- Calendar tool trigger phrases expanded to cover
  "what should I focus on" / "plan my week" planning
  questions.

### Customer / budget fixes

- ContractRow edit form: per-input labels added
  (`NAME`, `BUDGET H`, `OFFSET H`, `START DATE`,
  `END DATE`, `NOTES`); third-column overflow fixed
  via explicit `w-full` + `min-w-0` on grid cells.
- CustomerEditForm: budget + offset fields hide
  themselves when contracts exist (they are silently
  ignored by the backend in that case) and the hint
  points the user at where the actual budget lives.
- `_enrich_customer`: when contracts exist, the
  active contract's "used" hours now count only clock
  entries attributed to that contract, not all-time
  customer hours. Previously a new contract showed
  MAXED the moment any historical entries existed on
  prior invoiced contracts.

### Behaviour fixes around the row-hover pattern

- 6 row patterns (ContractRow, TimeEntryRow,
  DashboardView budget row, KB TreeNodeRow leaf,
  TreeNodeRow folder, KnowledgeSidebar label) now use
  the shared `HoverActions` wrapper so action clusters
  appear without changing the row's height.
- 28-file sweep replaced raw
  `bg-surface-raised + border-border` with the
  corrected `bg-surface-overlay + border-strong` so
  inputs read across warm themes.

### MCP server + CalDAV

- MCP server no longer crashes at startup when a tool
  schema names a Python keyword (the
  `list_calendar_events` `from` field killed the
  server with `SyntaxError`; the handler builder now
  renames Python keywords to a trailing-underscore
  local while preserving the original key in the args
  dict).
- CalDAV push: naive datetimes are treated as local
  wall-clock (was UTC), so pushed clock entries no
  longer show up offset by the user's UTC offset in
  Apple Calendar / iCloud.
- CalDAV: new `sync_entry(sync_id)` and
  `backfill_range(from_date, to_date)` services with
  matching CLI + API surfaces for per-entry sync and
  historical backfill that bypass the
  `enabled_since` gate.

### Documentation

- `docs/ui-design-system-plan.md` -- the 5-phase
  consolidation plan that drove this release.
- `docs/ui-primitives.md` -- one-screen cheat sheet
  for every primitive and the colour / typography /
  spacing policies authors should follow.

## 2.1.3

A focused hotfix + UX polish release. Two server-side
bugs surfaced after 2.1.2 went live with the CalDAV
push feature, alongside a bundle of calendar-panel
improvements.

### Fix MCP SyntaxError when tool param is a Python keyword [#134]

`list_calendar_events` declares a `from` property in its
input schema. The MCP handler builder fed that name
verbatim into `exec`'d function source, which made
`kai mcp-server` die at startup with `SyntaxError:
invalid syntax`. Python keywords now get a trailing-
underscore local in the generated signature while the
schema name and dispatcher key stay unchanged, so the
MCP contract is preserved.

### Fix CalDAV push: treat naive datetimes as local wall-clock [#135]

Clock entries land in the backend as
`datetime.now().isoformat()` -- naive, no `tzinfo`.
`_to_utc` stamped them as if they were already UTC, so
a 12:00 local entry was written to the calendar as
`DTSTART:120000Z` and rendered at 14:00 in CEST. Now
naive datetimes are projected onto the system local
zone via `astimezone()` before being converted to UTC.
The sync engine pushes an update for every known UID
on the next reconciliation, so existing pushed events
self-heal after one `kai caldav push-sync`.

### CalDAV: per-entry sync and date-range backfill [#136]

The sync engine's `enabled_since` gate prevents back-
flooding the calendar with years of history when push
is first enabled, but offers no escape hatch for the
legitimate cases ("push this one entry I booked
yesterday" / "I want all of last month in iCloud").
Adds two service entry points, both with CLI and API
surfaces, that bypass the gate while still skipping
running timers:

- `kai caldav push-entry <sync_id>` +
  `POST /api/caldav/entries/{sync_id}/push-sync`
- `kai caldav backfill --from <date> [--to <date>]` +
  `POST /api/caldav/backfill`

### Calendar panel UX polish + dark-mode foundation [#137]

- New Month view (6x7 grid with an ISO week column,
  per-day 3-tile cap with `+N more` overflow into the
  popover).
- ISO week number shown in the corner cell of the Week
  view (`KW NN` / `W NN` per locale).
- Toolbar (view toggle + prev/today/next/refresh)
  centred in the header so the edges stop drifting
  when the date label changes width.
- Date label is now a clickable button that opens the
  native date picker via `showPicker()` -- jump to any
  date without click-spamming Prev/Next.
- Calendar panel gains a Help button + `DOCS.calendar`
  entry (it was the only main panel missing one).
- `EventTile` time/location lines gated by tile
  duration so a 60-minute slot stops slicing the third
  line in half.
- Dark-mode foundation: Tailwind config maps `dark:`
  prefix onto `[data-theme="dark"]` so dark variants
  actually fire (was a silent no-op since the app
  toggles theme via a data attribute, not Tailwind's
  default class strategy). Calendar palette + advisor
  integration chips get dark variants so they read on
  the dark surface.
- `DEFAULT_SHORTCUTS.views` adds `calendar: "l"`;
  Settings > Shortcuts row exposes it. Sidebar already
  rendered the hint automatically.
- i18n: `weekShort` + `month` keys added across
  en/de/es/ru.

### Auto-update

The desktop client auto-update pings GitHub Releases on
launch and every few hours after that, so 2.1.x clients
will pick up 2.1.3 without action.

## 2.1.2

CalDAV hardening + cleanup release. Rolls up the
security, robustness, performance, and polish work the
2026-05-30 in-depth review surfaced after the
calendar feature shipped in 2.1.x.

### CalDAV security [#132]

- CORS allowlist no longer includes
  `http://localhost:3000`. The Tauri webview never uses
  that origin in any shipped configuration; its only
  beneficiaries were third-party local pages that
  could POST to `/api/caldav/test-connection` from the
  user's browser and phish CalDAV credentials.
- Custom-preset CalDAV URL now goes through an SSRF
  guard before any HTTP request is opened. Rejects
  non-https URLs and any host that resolves to an
  RFC1918, loopback, link-local, or otherwise
  internal address. Blocks the case where a malicious
  page could ask the sidecar to probe a corporate VPN
  via the test-connection endpoint.
- CalDAV error messages now scrub the literal
  password and its basic-auth base64 form before
  surfacing to the UI or logs. Defence-in-depth
  against urllib / proxy error formatters that
  occasionally include the request line.
- The encrypted-file fallback warning across all 4
  locales now spells out the threat model
  explicitly ("anyone with read access to your
  profile directory can decrypt"; "prefer fixing
  your keyring backend"). The earlier "no system
  keychain available" line under-communicated the
  trade-off.

### CalDAV robustness + performance [#133]

- Cache TOCTOU closed. Each cached events entry is
  stamped with a per-account generation counter that
  the invalidator bumps under the lock; a fetch
  racing with an invalidate can no longer overwrite
  the invalidate with its stale result. Previously
  the next reader could serve stale data for up to
  60 seconds.
- `add_account` now rolls the keychain back when the
  settings save fails. Previously a disk-full or
  read-only profile would orphan a credential in the
  OS keychain that the next runtime had no
  reference to.
- DAVClient instances are now memoised per
  `(account, base_url)` for 10 minutes. Every CalDAV
  operation used to pay a fresh TCP+TLS+auth
  handshake (~200-600 ms against iCloud); bulk
  pushes from the Phase 1.5 sync engine now pay it
  once per window instead of once per event. A
  rotated password eventually re-auths via the TTL.

### Backend polish [#131]

- `kaisho/cli/convert.py` error reporting includes
  the exception class and falls back to a full
  traceback under `KAISHO_LOG=DEBUG`. The earlier
  collapsed-to-one-line message left misconfigured
  DSNs unhelpful to debug.
- `kaisho/services/cloud_sync.py`
  `pull_and_apply_tasks` refactored: the depth-6
  if/elif/else conflict-resolution ladder is now
  three small dispatch helpers
  (`_apply_pulled_task`, `_apply_task_update`,
  `_is_remote_newer`). Top-level function drops to
  depth-3. No behaviour change.
- `frontend/src/utils/tauri.ts` exports a shared
  `DownloadProgressEvent` union type used by both
  `App.tsx` and `settings/UpdateTab.tsx`. Drops the
  two duplicate `(e: any)` annotations + their
  eslint-disables.
- `IntegrationsTab.tsx` catch-binding renamed to
  match the codebase's `err` convention.
- `kaisho/backends/markdown/__init__.py` imports
  re-ordered stdlib -> third-party -> relative.

## 2.1.1

Hotfix release. The clock-entry push half of the calendar
feature shipped in 2.1.0 was broken end-to-end against
the most common configuration (Apple iCloud + the
default org backend). 2.1.0 was held as a draft and
never reached users; 2.1.1 is the first 2.1.x available
via the auto-updater.

### Fixes

- Push sync now recognises the org backend's `start` /
  `end` field names. The earlier release only checked
  the SQL backend's `start_at` / `end_at`, so the gate's
  first check silently filtered every org entry as if it
  were a running timer. Sync now created 0 events for
  the entire org-on-iCloud audience.
- DAVClient now uses the target URL's own scheme + host
  when opening a calendar or event. iCloud redirects per
  user to a per-shard host (e.g. `p49-caldav.icloud.com`)
  that differs from the discovery host
  (`caldav.icloud.com`); the `caldav` library refuses to
  URL-join across hosts. The earlier release blew up the
  first time it tried to actually PUT an event with
  ``can't be joined with...``. Fastmail and Nextcloud
  keep the same host end-to-end so the change is a
  no-op there.
- A 404 from CalDAV when fetching a previously-pushed
  event now triggers a re-create rather than recording
  a permanent failure. Handles the user deleting the
  event in Calendar.app (kaisho re-pushes since it is
  the source of truth) and iCloud's eventually-
  consistent PROPFIND lag immediately after a PUT.

### Behaviour to know about

Deleting a clock entry's mirrored event in Apple
Calendar (or any CalDAV client) does **not** opt that
entry out of push. The entry will reappear on the next
sync. To genuinely stop a particular booking from
appearing on the calendar, either delete the clock
entry in kaisho (propagates immediately) or toggle
push off on the account (existing events stay, new
ones stop). A per-entry "do not push" toggle is a
candidate for a future release if the need surfaces.

## 2.1.0

The calendar release. A new top-level Calendar panel
aggregates events from your CalDAV server (Apple iCloud,
Fastmail, Nextcloud, or any standards-compliant CalDAV
provider) and your existing Google Calendar integration
into one view. Time you book in kaisho can optionally push
back to a chosen calendar so your day appears in
Calendar.app alongside your meetings.

Local-first by design: CalDAV credentials never leave the
machine. The OS keychain holds the password; an encrypted
file fallback covers headless Linux systems without a
keyring backend. No Pro plan required for either direction.

### Calendar panel (new)

- Top-level Calendar view between Clocks and Cron.
  Day + week layouts, all-day strip, per-calendar colour
  coding via a stable FNV-1a hash of source + calendar id.
- Event tiles open a side popover with full details
  (when / where / source / external link). The popover's
  Book as time entry button opens the QuickBook form
  prefilled with the event's title and rounded duration
  (1h / 90m / 1h30m), so you can turn a calendar event
  into a clock entry in two clicks [#121, #122].
- Source badges show which providers contributed events
  and surface per-source errors so a stuck source is
  visible instead of silently dimming the view [#119].

### CalDAV integration

- Connect Apple iCloud, Fastmail, Nextcloud, or a custom
  CalDAV server in Settings -> Integrations [#118, #120].
- Provider presets prefill URLs, fields, and app-password
  documentation links. Test connection preflight before
  saving so you never persist an account that cannot
  authenticate.
- Multiple accounts per kind supported (e.g. work iCloud
  + personal Fastmail).

### Push clock entries to calendar (Phase 1.5)

- Per-account "Push clock entries to this calendar"
  toggle with a calendar picker [#127]. The default option
  auto-creates and reuses a dedicated "Kaisho" calendar so
  writes are sandboxed; pick any other writable calendar
  via the dropdown.
- One-way push: edits in Calendar.app are ignored. The
  kaisho entry is the source of truth.
- VEVENTs carry SUMMARY = '[customer] description',
  UID = 'kaisho-<sync_id>' so re-pushes hit the same
  event in place rather than duplicating, and a
  CATEGORIES line with the customer name.
- Sync now button in Settings + live "Last synced N min
  ago" indicator + degraded badge after repeated failures
  [#129]. Per-account sync health polled every 30 s.
- kai clock book / start / stop / update now trigger the
  same sync the API does (CLI parity).

### Advisor integration

- New tools list_calendar_events and get_calendar_event
  let the advisor read your week. The tools fan out
  through the same aggregator as the panel, so the
  advisor sees Google + CalDAV in one call.
- The default 'from' window snaps to today 00:00 local
  (was 'now') so 'what is on my calendar this week?'
  includes events earlier today [#126].

### Backend correctness fixes (from the in-depth review)

- Frontend: all-day events no longer shift one day west
  of UTC. parseIso now detects bare YYYY-MM-DD and
  constructs a local-midnight Date instead of relying on
  the browser's UTC default [#126].
- Backend: calendar aggregator sort now parses
  timestamps to real instants instead of doing
  lexicographic ISO comparison, so events from sources
  with different timezone offsets order chronologically.
- VEVENTs with DURATION but no DTEND now render at
  their true duration instead of a 0-minute pill.
- get_event uses the same fetch helper as the write path
  (update_event, delete_event), fixing iCloud 404s on
  the event-by-id flow.

### Pro gate

- None of the calendar features require Pro. CalDAV is
  local-first; Google Calendar reuses the existing Pro
  integration when connected. The user's plan does not
  gate any calendar surface.

### Backend cleanup carried over from 2.0.x

- Backend cleanup work merged earlier: dedup task-status
  keywords, tombstone helpers, dead re-exports [#113].
- Sidecar runtime auto-prune on launch removes stale
  PyInstaller extractions from previous versions [#112].

### Deferred (tracked elsewhere)

- CalDAV security hardening (CORS allowlist tightening,
  SSRF guard on test-connection, password-leak scrub in
  errors): #124.
- CalDAV robustness + performance (cache TOCTOU,
  keychain atomicity on partial write, per-account
  DAVClient memoization): #125. Becomes important when
  the next release stops opening a fresh HTTP connection
  per write.
- Phase 2 (cloud-hosted CalDAV credentials for the
  hosted advisor + MCP gateway + cron-AI consumption):
  not yet filed; deliberately deferred until a real
  "AI sees my calendar when laptop is closed" customer
  ask materialises.

## 2.0.2

Patch release with a desktop disk-hygiene fix and a backend
cleanup pass surfaced by an end-to-end review on the way to
2.0.x stability.

### Desktop

- Sidecar prunes stale runtime extractions on launch. Each
  installer ships a self-extracting PyInstaller bundle into
  `~/.kaisho/runtime/<version>-<hash>/`; previous versions
  never cleaned up, so every update added another ~50 MB.
  The desktop now removes runtime directories whose version
  prefix doesn't match the current build before spawning
  the sidecar [#112].

### Backend

- Backend cleanup: dedup task-status keywords, tombstone
  helpers, dead re-export. Centralised the `{TODO, NEXT,
  IN-PROGRESS, WAIT, DONE, CANCELLED}` set in a new
  `kaisho/constants.py`, collapsed three near-identical
  tombstone-wire-format helpers in `cloud_sync.py` to a
  single factory, dropped a stale `TOOL_DEFS` re-export in
  `cron/executor.py`, and aligned 8 untagged broad-except
  sites on the project's `# noqa: BLE001` convention. No
  behaviour change; full pytest suite passes [#113].

## 2.0.1

Patch release for the new SQL / Markdown / JSON backends and
the convert pipeline. Surfaced from real use of the SQL
backend right after 2.0.0 shipped.

### SQL / Markdown / JSON backends

- SQL backend now persists `used_offset` updates on contracts.
  Previously dropped silently by `update_contract`, so converted
  contracts lost their hours-already-used from the previous
  period.
- SQL backend implements proper pause/resume semantics: paused
  entries are now distinct from stopped entries and the "Resume"
  affordance works. Adds an `_ensure_paused_column` schema
  migration helper for legacy databases.
- Markdown and JSON backends gain the same pause/resume parity
  with org and SQL. All four backends now share one contract.
- Active-customer predicate unified across all backends. The
  org backend treats anything not in `{inactive, archiv,
  archived}` as active; the three new backends were strict
  `status == "active"` and silently hid `intern` / `prospect` /
  custom statuses behind the "show inactive" toggle. Shared
  `INACTIVE_STATUSES` constant in `services.customers` is now
  the single source of truth.

### Convert tool

- Re-runs no longer skip contracts when a customer already
  exists in the target. A `treat_exists_as_success` opt-in on
  `_try_or_skip` makes the customer- and contract-add paths
  idempotent so downstream `update_contract` / `close_contract`
  steps still apply.
- Every silent skip now logs at WARNING with the entity name
  and exception class; each `_convert_*` helper prints a
  summary line at the end ("3 customer(s) skipped: foo, bar
  -- re-run with KAISHO_LOG=DEBUG for details").

### UI

- Invoice panel now opens as a centred modal instead of inline
  inside the narrow customer card. Descriptions no longer
  truncate to 'Change t...' / 'Hermes C...'; date pickers stay
  on one line; the entry list fills the available height. ESC
  or click-outside closes.

## 2.0.0

Track AI: hosted Companion & Pro plans, premium integrations,
the mobile PWA, a backend-agnostic storage layer, and a
hardened agentic advisor.

### Hosted plans + cloud

- Companion & Pro add cross-device sync, the mobile PWA, the
  hosted MCP gateway (reach your tools from Claude Code /
  Cursor when the laptop is closed), and scheduled cron-AI
  runs on a token quota. Local stays free forever.

### Premium integrations (Pro)

- The advisor can read and act on Google Calendar, Slack,
  Linear and GitHub Projects through the hosted gateway —
  connect them in Settings > Integrations. Credentials are
  stored encrypted server-side; the calls run there, so the
  advisor never sees your tokens.

### Storage, your way

- Backend-agnostic: org-mode (default), Markdown, JSON and SQL,
  all selectable in Settings > Paths. The SQL backend now
  supports cloud sync.

### GitHub

- Consolidated to a single connection in the Integrations tab,
  available on every plan; the standalone GitHub settings tab
  is gone. View options (sidebar entry, Enterprise URL) live
  under the connected GitHub row.

### Security

- The advisor/cron `execute_cli` tool is gated by an allowlist
  and rejects destructive verbs — a prompt-injected model
  can't run `delete --yes`.
- The URL-fetch allowlist is enforced before any fetch (no
  PyPI bypass), and the model can no longer self-approve
  domains; you approve them in Settings > AI.

### Emacs

- kaisho-mode works with any backend; on non-org backends the
  file commands render read-only CLI buffers instead of
  visiting org files.

## 1.8.3

Fix the tray pill displaying ``00:00`` even though a
timer is running.

### Tray timer timezone bug

- The self-healing tray ticker added in 1.8.2 reads the
  active timer's ``start`` from the backend. The org
  file stores naive local timestamps (no timezone
  suffix), but the Rust parser interpreted them as
  UTC -- so a user in CEST (UTC+2) ended up with
  ``start_secs`` two hours in the future of
  ``now_unix()``. ``elapsed.max(0)`` then clamped to
  zero and the green pill drew ``00:00`` forever.
- ``GET /api/clocks/active`` now returns a
  ``start_unix`` field (canonical Unix epoch seconds,
  computed server-side with the local zone correctly
  applied). The Rust ticker reads that directly; the
  hand-rolled ISO parser is gone. Frontend pushes
  remain unaffected since JavaScript's ``new Date()``
  already handles naive ISO correctly.

## 1.8.2

Self-healing menu-bar tray.

### Tray ticker reads the backend directly

- The Rust-side ticker now re-queries
  ``/api/clocks/active`` on every wall-clock minute
  tick and reconciles its in-process snapshot
  accordingly. The frontend's transition pushes
  (``set_active_timer`` / ``clear_active_timer``) stay
  as the fast path for instant reaction, but the tray
  no longer depends on the main window seeing every
  transition.
- This fixes a stuck-tray edge case after the
  auto-updater restart: the brief backend-respawn
  window could make ``useActiveTimer`` resolve to
  ``{active: false}`` before the timer was actually
  picked back up, leaving ``useTrayIconSync`` in an
  "idle" state. The next minute boundary now repairs
  itself instead of waiting for a manual reload.
- The tray ticker also clears its own ``offline``
  flag whenever a backend query succeeds, so a
  transient connection blip can't leave the menu bar
  sitting red after recovery.

## 1.8.1

Pause/Resume for clock entries, plus a sizable cleanup
of the tray + clock plumbing surfaced by code review.

### Pause / Resume

- A new amber Pause button next to Stop on the active
  timer (main app and tray popover). Pause closes the
  entry at exact length (rounding bypassed) and flags
  it server-side as paused.
- A frozen "Paused" widget then replaces the active
  timer with the elapsed time at the moment of pausing,
  the customer/description, and two buttons: green
  Resume (creates a fresh sibling entry with the same
  metadata, starting from 00:00 — the gap is excluded
  from billed time) and red Stop (clears the paused
  flag without touching the entry; it stays in the
  recent-entries list as a plain stopped row).
- Paused state is stored on the org heading via a
  ``PAUSED=true`` property and exposed by a new
  ``GET /api/clocks/paused`` endpoint. The flag is a
  local UI hint -- it is not synced to the cloud, so
  Pause on one device does not show as paused on
  another.

### Tray icon ticker fix

- The tray pill is now redrawn on each wall-clock
  minute boundary instead of on a fixed 30-second
  interval. The main-app timer and the tray title now
  flip from one minute to the next at the same moment;
  previously they could drift by up to 30 seconds.

### Tray popover

- Auto-closes when focus moves elsewhere -- standard
  menu-bar behavior. Click the tray icon to reopen.
- Listens for ``timer-changed`` events so the main
  window picks up popover-initiated mutations
  immediately instead of waiting for the next 5-second
  poll.

### Multi-CLOCK heading migration

- An earlier iteration of Pause/Resume put multiple
  CLOCK lines under one heading and broke merge /
  edit / delete identity. The new model is one
  heading per entry (each Resume creates a sibling),
  matching the rest of the codebase.
- A one-shot migration runs on first start of the org
  backend: any heading carrying more than one CLOCK
  line is split into separate sibling headings, with
  fresh ``SYNC_ID``s on the new ones. Idempotent --
  running again on a clean file is a no-op.

### Surgical per-row delete

- Deleting one row of a multi-CLOCK heading (legacy
  data only after the migration above) now removes
  just that CLOCK line and keeps the heading when
  more CLOCKs remain. The router prefers the start
  timestamp over ``sync_id`` for UI deletes since
  ``start_iso`` is unique per row.

### Cleanup

- Dead ``continue_existing`` profile setting, the
  matching Alt-click ``force_new``/``force_continue``
  override flags, and the ``_reopen_today_match``
  service helper are removed across the stack (router,
  backends, frontend client, hooks, settings UI, and
  locale strings). They were no-ops after the
  one-heading-per-entry pivot.
- Mutation hooks no longer emit ``timer-changed`` on
  success; the same-window listener and the per-hook
  ``invalidateQueries`` calls already cover that
  surface. The popover handlers still emit the event
  to notify the main window across webviews.
- ``PausedTimerView`` extracted to ``components/
  common/`` so the main app and the tray popover
  render identical widgets.
- ``round`` query parameter on ``POST /clocks/stop``
  renamed to ``apply_rounding`` so it no longer
  shadows the Python built-in.

## 1.8.0

Time-tracking polish across three new features plus a
modern, retina-crisp menu bar pill that replaces the
text-next-to-icon look.

### Clock entry rounding

- New setting under Settings > General > Clock Entries
  rounds a stopped timer's duration to 15 / 30 / 60
  minute buckets, or leaves it exact (the default).
  A second dropdown picks the direction: nearest
  (half-up), always up (ceiling), or always down
  (floor). The end timestamp is adjusted so the entry
  covers exactly the rounded interval -- nothing is
  silently dropped to zero; a sub-bucket duration
  bumps up to one bucket.

### Merge two adjacent entries

- Each non-first entry within a customer group on the
  clocks page gets a merge button next to edit and
  delete. Clicking folds the entry into the previous
  one: the earlier entry's range extends to cover
  both, and notes are appended with a blank-line
  separator. Cross-customer or running-timer merges
  are refused. Available on the org backend.

### Continue an existing timer

- Optional setting that, when on, reopens the most
  recent stopped entry from today instead of creating
  a new one if customer + description + task +
  contract all match. The gap between stop and start
  counts toward the entry's duration. Hold Alt/Option
  when clicking Start or Resume to force a new entry
  regardless of the setting. Available on the org
  backend.

### Modern tray icon

- The menu bar item is now a coloured rounded pill
  with the elapsed HH:MM baked in. Green when a timer
  runs, amber after eight hours, red when the backend
  is offline, neutral grey when idle. Renders at 2x
  with an embedded pHYs chunk so macOS treats it as
  a retina image and the text stays crisp.

### macOS Sequoia dev-mode fix

- On macOS 15, an unsigned bare debug binary cannot
  register an NSStatusItem -- the tray icon would
  never appear when running via `bin/dev --desktop`.
  An embedded Info.plist plus ad-hoc codesigning in
  the dev script gives the binary a real bundle
  identity so the tray works end-to-end in dev. Only
  affects the dev workflow; release builds were never
  broken.

### Tray popover

- Recent-entries list now shows every completed entry
  from today, scrolling when the popover fills.
  Previously hard-capped at three.
- Listens for a new `timer-changed` event fired by the
  main window's start / stop / merge / delete / book
  / update mutations, so the popover refreshes
  immediately instead of waiting up to five seconds
  for the next poll.

### Translations

- EN, DE, ES, RU strings added for rounding, merge,
  continue-existing, and the start-button modifier
  hint. Russian also picked up the rounding-direction
  strings that were missing from earlier drafts.

### Fixes

- ActiveTimer notes autosave no longer fires a toast
  on every keystroke.
- Kanban add_task drops the leading `[]:` prefix when
  no customer is set, so headings read just the task
  title.
- Settings page bottom padding bumped so the
  Profiles > Create row clears the bottom edge.

## 1.7.3

Defensive UI patch ahead of the Track AI tier rollout
(Companion / Pro / Team). The old "Cloud Sync, Mobile
App & AI" SKUs are archived in Stripe; this release
removes the in-app upsell that pointed at them and
replaces it with an honest "Companion, Pro and Team
launch Q3 2026" notice. Standalone use is unaffected.

### Cloud Sync settings tab

- Promo card shortened: the three-bullet feature pitch
  (Cloud Sync / Mobile App / Kaisho AI) is gone. The
  card now shows the new heading + a one-paragraph
  description of what's coming in Q3, plus the
  existing "View plans & pricing" button (still
  pointing at kaisho.dev/#pricing, which already
  reflects the new tier model).
- "Spam folder" amber footer removed — there's no
  in-app signup flow to send a confirmation email
  while the paid plans are in development.

### Top nudge banner

- "Unlock AI advisor, cloud sync, and mobile access —
  See plans or connect now" rewritten to "Companion,
  Pro and Team launch Q3 2026 — See pricing or
  connect to a self-hosted cloud". The connect path
  to a self-hosted Kaisho Cloud still works.

### Translations

- EN, DE, ES, RU `settings.unlockCloudSync` and
  `settings.unlockCloudSyncHint` rewritten to match.
  Orphan keys (`cloudSyncFeature`, `mobileAppFeature`,
  `kaishoAiFeature`, `spamFolderHint`) left in the
  catalogs for now — they return when the new tier
  surface ships.

### No functional change

- Cloud-sync connect flow itself is unchanged. Users
  who already had a paid plan keep their data and
  their plan label.
- The "Sync+AI" / "Cloud" / "Free" plan badge in the
  app header is unchanged — the hard rename to
  Companion / Pro / Team ships with the in-app upgrade
  flow, not now.

## 1.7.1

Bugfix release. Move-to-KB from the inbox and notes panels
now actually targets the right place and writes metadata
where the new (1.5+) index expects it.

### Move-to-KB

- The inbox and notes move dialogs gained a KB source
  selector and a folder autocomplete. Previously the
  destination was hardcoded to the first configured source
  with no way to pick a subfolder.
- The service no longer writes legacy YAML frontmatter into
  the moved file. Customer, type, channel, direction,
  status, tags, and the creation date land in `kb_meta.yaml`
  so the KB filter, MetadataCard, and customer chips pick
  them up.
- The service `mkdir(parents=True)` for nested target
  folders, so a path like `customers/acme/note.md` works
  instead of silently failing.
- The destination folder field treats unknown paths as a
  "create new folder" affordance (the backend creates
  parents on write).
- The picker forces a fresh tree fetch on mount so folders
  created seconds earlier show up immediately.
- After a successful move the `knowledge` query is
  invalidated so the sidebar refreshes.

### Empty KB sources

A KB source with no files and no subfolders -- typically a
freshly added one pointing at an empty directory -- now
appears in the sidebar as an empty top-level node.
Previously the tree-builder derived labels only from file
entries, so empty sources rendered nothing.

## 1.7.0

Feature release. The knowledge-base panel gets a unified
chip-based filter, a faster search backend, and a persistent
PDF text cache. Other panels are unchanged.

### Unified chip-based KB filter

The sidebar filter and the panel-toolbar content search are
collapsed into a single input that lives in the top toolbar.
Scoped tokens become removable chips inline as you type:

- `customer:`, `task:`, `type:`, `tag:`, `filename:` -- each
  with autocomplete drawn from your actual data.
- Quoted values for whitespace, e.g. `customer:"RIDING BYTES"`.
- Backspace at the start of the input removes the rightmost
  chip; X on a chip removes that chip.
- Free text in the same input drives the backend content
  search, scoped to whatever the chips have narrowed.

Search results now group by file with a chevron that expands
to the per-line snippets. Hovering a snippet shows the full
matched line in a tooltip.

The previous tag chip row, the dedicated content-search
input, and the separate "filename filter" funnel are gone --
they were three places to express what one input now handles.

### Recent / Starred sidebar views

New clock-icon toolbar button flips the tree into a flat list
of the 30 most recently modified files. Stars work inside
both the recent view and the tree view.

### Faster content search

Two changes:

- **Result cap rework**. The previous `max_results=20` was a
  per-line cap, so a common search term burned every slot in
  the first noisy file and other files never surfaced. The
  cap is now per-file (`max_files=50`) plus per-file hits
  (`max_hits_per_file=20`). Searching `screen` no longer
  drowns out `screencast`.
- **Persistent PDF text cache**. PDF extraction is the
  cold-start bottleneck. Extracted text is now stored at
  `<DATA_DIR>/cache/kb_pdf/<hash>.txt` keyed by path +
  mtime + size. The cache survives server restarts and
  invalidates automatically when a PDF is edited. Writes
  are atomic (tempfile + `os.replace`) so concurrent
  searches can't read a truncated file.

### Reindex pre-warms the cache

`kai kb reindex --apply` (and the `/knowledge/reindex` API)
now triggers a background refresh of the PDF cache after
the metadata pass. The HTTP request returns immediately;
extraction happens in a FastAPI `BackgroundTasks` worker.

### New CLI: `kai kb cache`

- `kai kb cache info` -- show cache directory size and entry
  count.
- `kai kb cache warm` -- ahead-of-time extract every PDF.
- `kai kb cache clear` -- wipe the cache directory.

### Breaking changes for direct API / CLI / MCP consumers

- `/knowledge/search` accepts `max_files` and
  `max_hits_per_file`. The deprecated `max_results` query
  param is kept as an alias for `max_files` so existing
  scripts don't silently fall back to defaults.
- `kai kb search --max` semantics changed from "max line
  hits" to "max distinct files". A new
  `--max-per-file` flag controls hits per file.
- The MCP `search_knowledge` tool's `max_results` parameter
  now caps distinct files. Its descriptor advertises this so
  AI consumers know each matching file may contribute up to
  20 line hits.
- The localStorage key `kaisho_kb_tag_filters` (a JSON
  array) is replaced by `kaisho_kb_filter_query` (the
  canonical filter string). A one-time migration converts
  existing tag filters to `tag:<name>` chips on first load.
- The transient `kaisho_kb_group_search` localStorage key
  used in pre-1.7 dev builds is cleaned up automatically.

## 1.6.1

Patch release reverting the touch swipe-to-delete UX that
shipped in 1.6.0 for notes.

Swipe-to-reveal belongs in the dedicated cloud mobile PWA,
not in the main Kaisho frontend. On touch devices the notes
row's delete button is again the in-row trash + ConfirmPopover
that has been the convention elsewhere in the app, restoring
parity across all surfaces.

- Removed `frontend/src/components/common/SwipeToReveal.tsx`
  and `frontend/src/hooks/useIsTouch.ts`.
- `NotesView` no longer branches on touch capability.

## 1.6.0

Feature release: better knowledge-base discovery, safer mobile
delete UX, and several dashboard and tray polish fixes.

### Knowledge base: scoped filter tokens and Recent view

The sidebar filter input now accepts ``key:value`` tokens
alongside free-text filename matching. Supported keys:
``customer:``, ``task:``, ``type:``, ``tag:``. Tokens AND
together (e.g. ``customer:acme tag:wip``) and can be quoted
to allow spaces. A new clock icon in the toolbar flips the
sidebar into a flat list of the 30 most recently modified
files, honouring any active filters — useful for finding a
file you just added or edited without remembering where it
lives in the tree.

The KB tree endpoint now includes ``mtime``, ``customer``,
and ``task_id`` so the frontend can filter and sort without
extra round-trips.

### Mobile: swipe-to-reveal delete on notes

Tapping a notes row's trash icon was a one-tap-to-confirm
flow that occasionally caught stray taps on small screens.
On touch devices the in-row trash icon is now hidden and
deletion happens via a swipe-left gesture that reveals a red
Delete button on the right of the row; tap outside or swipe
back to dismiss. Desktop UX is unchanged. Implemented as a
reusable ``SwipeToReveal`` wrapper plus a ``useIsTouch``
media-query hook.

### Dashboard: sorting and budget refresh

- Expanded clock entries under a customer in the dashboard
  are now sorted newest-first. Previously they appeared in
  raw API order.
- Editing or deleting a clock entry now refreshes the
  customer budget bars immediately. The clock mutations were
  invalidating ``clocks`` / ``customers`` / ``contracts`` but
  not ``dashboard``, so used/remaining totals stayed stale
  until the next refetch.
- Hover-only edit/trash icons on dashboard entries now use
  ``hidden`` / ``group-hover:flex`` so they fully leave the
  layout when not hovered. The prior opacity-based pattern
  could keep them visually present in some focus states.

### Tray: drop the frozen stopped-timer snapshot

Stopping a timer used to pin a snapshot of the last duration
in the tray and the in-app clock widget so the user could
resume with one click. The snapshot did not re-read from the
underlying entry, so manually editing the clock entry
afterwards left a misleading frozen value visible. The
stopped-state UI is removed everywhere; after Stop the
surface goes back to the start form. The recent entries
list is the canonical way to resume.

### Inbox and notes: resizable body textarea

Both edit forms had ``resize-none`` on the body textarea,
making longer entries awkward to read while editing.
Switched to ``resize-y``.

## 1.5.2

Patch release fixing three stale-state bugs around profile
switching, the markdown backend, and cloud config sync.

### File watcher restarts on profile switch

The file watcher was launched once at app startup with the
initial profile's paths and stayed bound to those paths for
the life of the process. Switching profiles in the UI swapped
the backend correctly but left the watcher pointed at the
previous profile's directory, so writes to the new profile's
data files never produced ``file_changed`` WebSocket events.
The visible symptom: newly booked clock entries did not
appear automatically, and edits to notes only surfaced after
a hard reload.

- The watcher is now managed via ``start_watcher`` /
  ``stop_watcher`` / ``restart_watcher`` in
  ``kaisho/api/watcher/service.py``. The lifespan uses the
  start/stop pair; ``switch_profile`` calls ``restart_watcher``
  alongside ``reset_backend`` and ``restart_cloud_ws``.
- ``restart_watcher`` is thread-safe (schedules onto the
  captured uvicorn loop via ``call_soon_threadsafe``), so the
  sync FastAPI handler can call it without ceremony. It
  no-ops before the loop is up.

### Markdown backend persists ``quick_book`` notes

``MarkdownClockBackend.quick_book`` was dropping the
``notes`` field on insert -- the entry stored an empty
string regardless of what the API was given. The org-mode
backend already persisted them. Now both backends agree.

### Cloud config digest uses the server's stored value

``push_reference_snapshot`` was digesting the *local*
payload and storing the result as ``.snapshot_digest``.
When the server stripped unknown fields (e.g. an older
deployment vs a newer client field), the local digest
matched on the next cycle and the push was skipped --
leaving the server permanently behind until the user
manually deleted the digest file.

- Now digests the server-echoed config when the response
  includes one, falling back to the local payload for
  pre-echo deployments so older servers still benefit
  from the change-detection optimization.

## 1.5.1

Patch release focused on data-integrity bugs around
multi-profile usage, MCP, and external link handling.

### MCP server follows the active profile

The MCP server is a long-lived subprocess spawned by Claude
Desktop / Claude Code, and previously resolved the profile
once at boot. Switching profiles in the UI left MCP writing
to the old profile -- both the data and the audit log.

- ``kai mcp-server`` (no ``--profile``) now re-reads
  ``.active_profile`` at the start of every tool dispatch
  and rebuilds the backend on a switch. The env / config /
  backend flip is held under a lock so two concurrent
  dispatches can never see a half-flipped state. The audit
  log path is recomputed per dispatch as well, so
  ``<profile>/mcp-audit.log`` follows the data.
- ``kai mcp-server --profile NAME`` keeps the previous pin
  behavior for setups that intentionally want stable
  scoping (e.g. one MCP server per profile).
- See ``docs/integrations/mcp.md`` for the updated guidance
  including how to wire the bundled binary into Claude
  Desktop / Claude Code without the Python dev install.

### Customer auto-creation across all write paths

Booking time, adding a task / note / inbox item, or
pulling those from the cloud with a brand-new customer
name silently left the customer unregistered. Drilldowns
and dropdowns wouldn't find it.

- New idempotent ``CustomerBackend.ensure_customer(name)``
  on the ABC (org / markdown / json / sql all inherit it).
  Auto-selects the first configured ``customer_types``
  entry as the default type so the new record shows up
  under a meaningful group, and tolerates a concurrent
  create race by re-fetching on ``ValueError``.
- Wired through MCP / cron tools, the API routers
  (clocks book/start/update, kanban add/update, notes
  add/update/promote/move, inbox capture/update/promote/
  move), the CLI add commands, and the cloud-sync pull
  paths for inbox, tasks, and notes.
- ``cloud_sync.autocreate_customer`` (previously a
  bespoke clock-pull helper) now delegates to the shared
  ABC method, so all auto-create paths agree on what the
  default record looks like.

### Stable inbox IDs (org backend)

The org inbox backend identified items by 1-based file
position. Any concurrent insert (cron jobs, cloud-sync
pulls, MCP ``add_inbox_item``) shifted positions, so the
user-visible "delete this entry" silently hit the wrong
heading -- and ``on_local_delete_inbox`` recorded the
wrong tombstone, so the cloud kept pushing the targeted
item back.

- Inbox items now expose ``id = sync_id``; ``remove_item``,
  ``update_item``, ``promote_to_task``, ``move_to_note``,
  ``move_to_kb``, and ``reorder_items`` all look up by
  SYNC_ID instead of positional index. Markdown / JSON /
  SQL backends were already using stable ids and are
  unaffected.
- The starred-only filter view now exposes a clickable
  star icon per row so you can unstar from inside the
  filter (previously the only way was to disable the
  filter first).

### Avatars: multi-style picker, fully offline

The user avatar gained a small style picker hidden behind
the avatar itself (click to open). The legacy 5x5 pixel
sprite is now called ``invaders`` and remains the default;
three DiceBear styles (``pixel-art``, ``bottts``,
``adventurer``) join it.

- All four styles render fully client-side. No network
  calls, no DiceBear public API, no leaking the seed (your
  name) to a third party. DiceBear styles are lazy-imported
  so the main bundle only carries the renderer you use.
- ``avatar_style`` rides through ``user.yaml``, the
  ``/settings/user`` API, and the cloud reference snapshot.
  The mobile PWA picks up the new field and renders the
  matching avatar (separate kaisho-cloud release covers
  the API and PWA changes).

### Other fixes

- Tauri desktop: external links (mobile-app button,
  pricing, github, etc.) failed silently in dev mode
  because the dev webview origin
  (``http://127.0.0.1:8767``) was missing from the
  capability remote allowlist. ``openExternal`` now also
  logs Tauri shell errors instead of swallowing them.

## 1.5.0

### Knowledge base: central metadata index

The knowledge base no longer stores metadata as YAML
frontmatter inside markdown files. A central
``kb_meta.yaml`` per profile is now the single source of
truth for tags, title, status, customer, task_id, type,
and created. Source files on disk are never modified --
write your KB any way you like (Obsidian, Emacs, plain
editor) and Kaisho leaves it alone.

- ``POST /api/knowledge/reindex`` (and ``kai kb reindex``,
  plus a refresh button in the sidebar header) hashes
  files (md5, cached by mtime+size), detects renames
  (path changed but content matches -- metadata reattaches
  automatically), and prunes records for files that
  disappeared. Default is dry-run; ``--apply`` writes.
- ``kai kb import-frontmatter [--apply]`` is a one-shot
  helper that copies legacy in-file YAML frontmatter into
  the index without modifying the file. Existing index
  values win on conflict, so you can safely re-run it.
- The metadata index is profile-scoped (lives at
  ``<profile>/kb_meta.yaml``), atomically written, and
  diff-stable -- sorted by ``(label, path)`` so you can
  commit it to git without churn.

### Knowledge base: tags, filtering, and discoverability

- **Free-text tags** stored only in the index; the editor
  offers autocomplete from the union of all tags in use
  via the new ``GET /api/knowledge/tags`` endpoint and
  ``kai kb list-tags`` CLI.
- **Click-to-filter**: clicking any tag chip toggles it in
  an active-filter set with AND semantics. Active filters
  show as a chip row at the top of the sidebar with
  per-chip remove and a Clear-all button. Persisted in
  localStorage so the narrowed view survives reloads.
- **Funnel filename filter** moved into the sidebar header
  (live, client-side, regex-tolerant). Combines with the
  panel-toolbar content search and tag filters; the
  server-side grep is automatically scoped to the
  post-filter visible subset via a new ``paths`` query
  param.
- **Hidden-files toggle** (eye icon in the sidebar
  header). Hides any path with a dot-prefixed segment
  (``.obsidian``, ``.git``, ``.trash``), files starting
  with ``_``, and files where metadata
  ``status: archived``. Defaults off; persisted. Backend
  also skips dot-folders unconditionally so they never
  surface even with the toggle on.
- **Tag rename/merge**: ``POST /api/knowledge/tags/rename``
  and ``kai kb retag <old> <new>``. Records already
  carrying the new tag drop the old one without
  duplicating, so the same command handles both typo
  fixes and tag consolidation.

### Knowledge base: metadata card

The MetadataCard above the file body replaces the YAML
frontmatter card.

- Defaults to a thin one-row strip showing the chevron,
  colored tag chips, and customer/task/status pills (the
  doc body already shows the title via its H1, so the
  card no longer duplicates it).
- Click the chevron to expand for the full read view, the
  pencil to enter edit mode.
- Edit mode: title input, TagPicker with autocomplete,
  customer autocomplete (from ``useCustomers``), task
  autocomplete that displays the title and stores the id
  (``RichMetaAutocomplete``), and type/status
  autocompletes seeded from values already in use plus
  common defaults (``active`` / ``draft`` / ``archived``
  / ``in-progress`` / ``note`` / ``reference`` /
  ``research`` / ``guide``).
- The card renders above the iframe for PDFs too, so PDFs
  are taggable. Free-text tag chips use a deterministic
  djb2-hash auto-color so the same tag always lands on the
  same hue.

### Knowledge base: AI summaries + chat

The Sparkles button in the panel toolbar opens a chat
popover. The first AI bubble is a summary of the file
(cached in the index); below it the user can keep asking
follow-up questions about the same document. Each AI
bubble has a hover-revealed inbox icon for one-click
capture with an auto-generated headline.

- ``POST /api/knowledge/file/summarize`` with optional
  ``force: true``. The cached summary lives on the same
  index record as the tags (``summary``, ``summary_model``,
  ``summary_hash``, ``summary_at``); cache hits skip the
  model call entirely.
- Stale detection compares the summary's hash snapshot
  against the file's current content hash; the popover
  surfaces a "Stale" badge and a Regenerate button when
  the document has changed.
- Cached summaries can be deleted via the popover trash
  icon, ``DELETE /api/knowledge/file/summary``, or
  ``kai kb forget-summary <path>``.
- ``kai kb summarize <path> [--force --no-cache --model X
  --json]`` runs the same pipeline from the terminal --
  pipe summaries into ``gh issue create`` or your morning
  briefing prompt.
- ``POST /api/knowledge/file/chat`` powers the chat
  follow-ups. Stateless on the server (UI sends the full
  Q/A history each turn); the document text and the
  cached summary are stitched into the prompt so the
  model stays grounded in the actual content.

### Knowledge base: full CLI parity

Every API endpoint now has a CLI counterpart with
consistent option naming (``--json`` everywhere,
``--apply`` for dry-run-by-default destructive work,
``--yes`` / ``-y`` for confirmations, ``-`` sentinel to
clear an optional metadata field).

- ``kai kb list [--tag --status --json]`` -- enriched text
  output now shows title, tag chips, and status inline.
- ``kai kb search [--path --tag --max --json]`` --
  composable filter-then-search.
- ``kai kb get-metadata`` / ``kai kb set-metadata`` --
  ``--add-tag`` / ``--remove-tag`` for delta edits, full
  field set on ``set-metadata``.
- ``kai kb retag <old> <new>`` -- bulk tag rename / merge.
- ``kai kb write`` / ``mkdir`` / ``rename`` / ``move`` /
  ``delete`` -- file management round-out.

### AI safety nets

The advisor and cron now share a single guard layer that
makes it much harder for a misbehaving model -- or a
prompt-injection vector via fetched URLs / KB content --
to corrupt the data store.

- **Advisor allowlist.** ``advisor_safe_tool_defs()``
  excludes every ``tier=destructive`` tool. The advisor
  cannot call ``delete_task``, ``delete_note``,
  ``delete_customer``, ``delete_clock_entry``,
  ``delete_profile``, ``rename_profile``, ``execute_cli``,
  ``create_skill`` (skills become part of every future
  system prompt), or ``trigger_cron_job`` (the spawned
  job runs with a fresh budget that bypasses the caller's
  caps). ``archive_task`` was demoted to ``write`` because
  archive is reversible -- the advisor can move tasks to
  the archive but not delete them. Cron stays on the
  read-only allowlist as before.
- **Per-session write caps.** Every advisor turn and
  every cron run is capped at ``MAX_WRITES_PER_RUN = 5``
  total writes; ``write_kb_file`` has a separate, tighter
  ``MAX_KB_WRITES_PER_RUN = 3`` so a runaway summariser
  cannot mass-duplicate KB files even when other writes
  are bounded. The caps are enforced inside
  ``execute_tool`` itself, so cloud-side agentic paths
  benefit too.
- **No silent overwrites.** ``write_kb_file`` refuses to
  replace an existing KB file unless the model passes
  ``overwrite=true`` explicitly. Same call also caps
  payloads at 1 MB.
- **Auto-snapshot before AI writes.** The first
  non-read tool call of any agentic session triggers a
  full profile backup (the same path as
  ``create_backup``), throttled to once every 10 minutes
  across the process so a busy user doesn't accumulate
  dozens of near-identical archives. The throttle slot
  is rolled back if the snapshot itself fails, so a
  misconfigured backup directory cannot silently lock
  the safety net out for 10 minutes. The MCP server,
  cloud advisor path, and every local provider all reset
  the per-session counters at request boundaries so
  long-lived clients don't monotonically deplete their
  budget.
- **HTTP DELETE confirmation.** ``DELETE
  /api/knowledge/file`` now requires ``?confirm=true``
  to mirror the CLI's ``--yes`` and the UI's
  ConfirmPopover. The frontend always sends it, so this
  is invisible in normal use; the change blocks
  bare-curl mistakes and locks the door for any
  third-party MCP client that wraps the HTTP API.

### Other changes

- Indexable file extensions widened to include common
  text and code formats: ``.sh``/``.bash``/``.zsh``,
  ``.py``/``.js``/``.ts``/``.html``/``.css``,
  ``.json``/``.yaml``/``.toml``/``.xml``/``.csv``,
  ``.tex``/``.bib``/``.adoc``, ``Dockerfile``,
  ``Makefile``, and a few dozen more. Reindex once
  after upgrading to surface them.
- Cross-process index locking. The metadata index
  ``kb_meta.yaml`` is now protected by an advisory OS
  file lock (``kb_meta.yaml.lock`` via ``fcntl.flock``)
  in addition to the in-process ``RLock``. A running
  ``kai serve`` and a parallel ``kai kb set-metadata``
  / ``reindex`` / ``retag`` from the terminal can no
  longer race or clobber each other's writes. Falls
  back to in-process locking on Windows where ``fcntl``
  is unavailable.
- Locale-independent org-mode date writers. The 1.4.9
  parser fix tolerated locale-dependent weekday tokens
  (``Do.``, ``jeu.``); the writers in ``format_clock`` and
  the heading-title formatter now also emit a hardcoded
  English weekday so org files stay stable regardless of
  the running process locale -- no more git churn for
  users syncing org files between machines with different
  ``LC_TIME``.
- KB external-editor button: a Tauri-only "Open in editor"
  toolbar button next to Edit launches the configured
  external editor on a KB file directly. Reuses the v1.4.8
  login-shell PATH fix, so Homebrew tools like
  ``alacritty`` resolve correctly.
- ``MetadataCard`` is collapsible per-profile
  (``kaisho_kb_meta_collapsed``) and remembers your choice
  across files.

### Migration notes

The 1.4.9 release wrote in-file YAML frontmatter into your
markdown files via the now-removed ``kai kb migrate``
command. After upgrading to 1.5.0:

1. Run ``kai kb reindex --apply`` once to populate the
   metadata index for every file.
2. Optionally run ``kai kb import-frontmatter --apply`` to
   copy the existing in-file frontmatter into the index.
   Files on disk are not modified -- the leftover
   frontmatter blocks are silently stripped from the
   rendered view and from search snippets.
3. From here on, all metadata edits go through the index.
   You can leave old frontmatter blocks in place
   indefinitely or strip them manually with your editor of
   choice.

## 1.4.9

### Features

- Russian (``ru``) is now a fully-supported UI language
  alongside English, German, and Spanish. All twelve
  locale namespaces (``common``, ``nav``, ``clocks``,
  ``kanban``, ``customers``, ``settings``, ``inbox``,
  ``advisor``, ``dashboard``, ``cron``, ``knowledge``,
  ``notes``) are translated. Switch via Settings →
  General → Language → Русский. Browser locales starting
  with ``ru`` auto-detect on first launch
- First release signed under the new ``RIDING BYTES GmbH``
  Apple Developer ID certificate. Team ID stays
  ``75EHWS7L8X`` so existing installs auto-update without
  any user-visible difference

### Fixes

- Clock entries written by Emacs on a non-English macOS
  locale (e.g. ``CLOCK: [2026-05-07 Do. 08:00]...``)
  are no longer silently dropped by the org parser. The
  weekday abbreviation inside ``[...]`` timestamps was
  parsed via ``%a`` which is locale-bound; we now ignore
  the abbreviation entirely (the date already encodes the
  weekday) so German ``Do.``, French ``jeu.``, etc. all
  parse correctly

## 1.4.8

### Fixes

- External editor: ``open_in_editor`` now spawns the user's
  configured editor with a PATH derived from their login
  shell (``$SHELL -l -i -c 'printf %s "$PATH"'``), captured
  once at startup. GUI-launched ``.app`` bundles on macOS
  inherit only the minimal launchd PATH and miss Homebrew /
  asdf / pyenv locations, so bare-name lookups for tools
  like ``alacritty`` failed with "No such file or directory"
- Knowledge base sources for new profiles: the default KB
  now lives at ``~/.kaisho/profiles/<name>/knowledge`` (one
  per profile) instead of the shared ``~/.kaisho/knowledge``,
  and the legacy auto-fallbacks that pulled in
  ``data/knowledge`` / ``data/research`` whenever those
  folders happened to exist on disk are gone. Existing
  installs that still have content in the shared directory
  keep accessing it via an automatically added ``shared``
  source, so no data is lost on upgrade

## 1.4.7

### Fixes

- Inbox capture form: the body textarea is now resizable
  vertically (was hard-locked at two rows). Helpful when
  pasting longer notes or email bodies into the inbox
- Clock entry rows render long descriptions with an
  ellipsis again (single-line, uniform row height) and the
  description-popup + notes speech-bubble icons are now
  flex siblings outside the truncated text span — so they
  stay clickable no matter how long the description is.
  Same pattern applied uniformly across the clock panel
  (``EntryRow``), customer panel (``TimeEntryRow``),
  kanban task expanded entries (``ClockEntryRow``), and
  the dashboard drill-down

## 1.4.6

### Features

- Menu-bar / system-tray HH:MM title now keeps ticking even
  when the popover panel is closed. The hidden tray webview
  was being throttled by the OS and missed minute-rollovers,
  so the title is now driven from the always-running main
  window via a ``useTrayIconSync`` hook
- Dashboard active-timer banner now ticks live every second
  (it was frozen at first render) and uses the same circular
  filled-red Stop button as the right-sidebar ``ActiveTimer``
  and the PWA — one Stop affordance everywhere
- Notes popup on clock entries renders Markdown when opened
  from the entries table, matching the inline editor that
  produces the notes
- Sidebar clock-list edit form now focuses the notes field
  on open instead of the customer field. Focusing customer
  caused the contract to be flushed as soon as the user
  typed (the autocomplete clears the contract on every
  customer change), so a quick edit-notes flow lost the
  contract assignment
- Uniform Escape-to-close across every inline create form:
  Add Customer, Add Contract, New Knowledge File, New Cron
  Job, Add Tag, Add State, Add Skill. Previously some closed
  on Escape and some did not — now they all behave the same

## 1.4.5

### Features

- Desktop **pause/resume** flow on running timers, mirroring
  the PWA. Tapping Stop on the tray or the main Time
  Tracking widget freezes the elapsed counter and shows a
  pinned "Stopped" card with a green Resume icon (re-fires
  the same customer/description) and a neutral Clear icon
  (returns to the empty start form). Cross-device: a stop
  initiated on the PWA pins the snapshot on desktop, and
  vice versa
- Round filled-red **Stop** button (and matching green
  Resume) in the tray and the main Time Tracking widget,
  matching the PWA's affordance. Sized to roughly 80% of
  the elapsed counter so it doesn't compete with the
  timer visually

### Fixes

- Stopping the timer on desktop no longer leaves the
  Time Tracking panel blank — the API returns
  ``{active: false}`` after stop, so the render gates
  must check ``isRunning`` rather than ``timer``
  truthiness
- ConfirmPopover (delete confirmations on clock entries,
  tasks, etc.) now sits directly below-and-right-aligned
  with the trigger icon. Previously a hardcoded 180px
  offset placed it far to the left of any narrow trigger

## 1.4.4

### Features

- Settings > AI: every saved API key now shows a masked
  ``••••XXXX`` preview so users can recognise their key
  without exposing it. A small **X** next to each
  configured field deletes the saved value via a new
  ``DELETE /api/settings/ai/keys/{field}`` endpoint
- Settings > Cloud Sync now reports ``advisor_changed``
  alongside ``jobs_changed`` so the toast after "Use
  Kaisho models" is honest about whether the advisor
  was already on ``kaisho:advisor``

### Fixes

- Advisor + ``GET /api/settings/ai/models``: forward
  ``ollama_cloud_api_key`` (not ``ollama_api_key``) when
  authenticating against ``ollama_cloud_url``. Previously
  the advisor's chat against an ``ollama_cloud:*`` model
  silently sent the local key (or empty), and the model
  dropdown for Ollama Cloud came back empty for users
  who only had the cloud key set. Same class of bug as
  v1.4.3 fixed for the cron path
- One-shot migration on settings load: when a user has
  ``ollama_cloud_url`` configured and no local
  ``ollama_url``, but the cloud key slot is empty and the
  local key slot has a value, relocate it. Recovers users
  who saved a cloud key while the form binding was
  pointing at the wrong slot
- Cron output normalize: tighter heuristic so brief
  one-line answers that legitimately mention ``\n`` (e.g.
  explaining a regex) are no longer mangled. Now requires
  no real newlines AND ≥2 ``\n`` literals AND length ≥80
  chars before decoding

### Improvements

- ``<SecretKeyField>`` extracted from ``AiTab.tsx``,
  collapses 6 nearly-identical password+badge blocks
  into one component. The hardcoded English string
  ``"Configured — type to replace"`` is now an i18n key
- Configured-key badge stretches to match input height
  (cosmetic)

### Docs

- ``docs/integrations/cloud-sync.md`` covers the new
  "Use Kaisho models" button
- ``docs/integrations/desktop.md`` covers the external
  editor configuration with vim, emacs, emacsclient,
  VS Code examples

## 1.4.3

### Features

- Settings: new dedicated **Profile** tab (now the
  default landing tab) holds the user-profile fields and
  the Profiles switcher. **General** is slimmed down to
  app-level prefs (App Title, Language, Tray, Reset
  Local Storage). The Hide-GitHub-menu control moved
  into the GitHub tab where users naturally look for it,
  rendered as a Toggle to match the board's "Show Done"
  switch
- New external-editor integration. Each panel (Board,
  Clocks, Notes, Inbox) gets a small icon next to its
  Help button that opens the file backing the panel
  (``todos.org``, ``clocks.org``, ``notes.org``,
  ``inbox.org``, ``tasks.json``, ...) in the user's
  configured editor. Configured under
  Settings > General > External Editor with a toggle
  and a shell-style command template, e.g.
  ``alacritty -e vim "{file}"`` or
  ``alacritty -e emacs -nw "{file}"``. Honours the
  profile's configured ``org_dir``/``markdown_dir``/
  ``json_dir`` and supports the org, markdown, and json
  backends; the icon hides itself for the SQL backend or
  in the browser

### Improvements

- ContentPopup expand icon switched from
  ``ExternalLink`` to ``Maximize2`` so it no longer
  visually clashes with the new "open in external
  editor" affordance

### Docs

- Removed concept papers (``whisper-concept.md``,
  ``sync-expansion-concept.md``) from the published
  MkDocs site. They live on as working notes under
  ``notes/concepts/`` for future implementation

## 1.4.2

### Fixes

- Cron jobs configured with ``ollama_cloud:<model>``
  failed with ``Ollama Cloud URL not configured`` when
  triggered via the UI's "Run" button, even after
  setting the URL in Settings > AI. The API trigger
  path was missing the ``ollama_cloud_url`` and
  ``ollama_cloud_api_key`` kwargs to the executor; the
  scheduler and the agentic-trigger paths already
  forwarded them. Locked down with a regression test
  covering the API path

## 1.4.1

### Features

- Settings > General > Navigation: new "Hide GitHub
  menu entry" toggle removes the GitHub item from the
  sidebar for users who don't track issues or PRs in
  Kaisho. Per-device preference (localStorage)
- Settings > Updates: new "Version history" card lists
  every previous release parsed from the changelog;
  expand the card to browse, expand each version to see
  its full bullet list

### Fixes

- Windows update: fix "Error opening the file for
  writing; kai-server.exe" when installing an update
  via the in-app updater. The frontend now kills the
  sidecar via a new ``kill_sidecar`` IPC before the
  download starts so the file handle is released before
  the installer claims it. The NSIS pre-install hook
  also polls ``tasklist`` for up to 6s as a backstop
- The What's-New dialog and Update tab now render
  RST-style double-backtick code spans as Markdown
  inline code. Past entries no longer show literal
  backticks
- After running ``/onboard``, the General tab and
  empty-profile banner refresh immediately. The advisor
  now invalidates the ``settings`` query key after
  tool calls

## 1.4.0

### Features

- Cron and advisor prompts now support ``${user.<field>}``
  placeholder substitution. The active profile's
  ``user.yaml`` exposes ``name``, ``email``, ``bio``,
  ``company``, ``industry``, and ``research_targets``;
  these get substituted at prompt-load time. ``${date}``
  and ``${fetch_results}`` cover the system side. The
  cron prompt editor highlights known placeholders green
  and unknown ones (typos, removed fields) red so
  authoring mistakes are visible before saving. Legacy
  ``{date}`` / ``{fetch_results}`` placeholders are
  auto-migrated on startup
- New ``/onboard`` slash command in the advisor walks the
  user through filling in their profile. Idempotent:
  reads current state first, only asks about empty
  fields, lets you skip filled ones. Surfaced via a
  dismissible banner in the advisor empty state when
  bio/company/industry are all empty, and via a "Tell
  the advisor about yourself" link in the Cloud Sync tab
  on the Sync + AI plan
- Cron prompt editor now shows a placeholder reference
  strip below the textarea listing every supported
  ``${...}`` token so authors don't have to remember the
  vocabulary

### Fixes

- ``save_user_yaml`` is now atomic (write-tmp +
  ``os.replace``) and serialized through a process-wide
  lock. Concurrent writes (advisor tool + Settings UI)
  no longer lose data; a crash mid-write cannot
  truncate the file
- Placeholder migration catches ``UnicodeDecodeError`` so
  a hand-edited non-UTF-8 prompt no longer breaks server
  startup, and reads/writes with ``newline=""`` to
  preserve Windows line endings
- Placeholder regex tightened to single-line tokens
  (``[^}\n]+``): a malformed ``${user.name`` (missing
  close brace) can no longer greedily swallow content
  across lines
- Desktop dev shell binds the sidecar to port 8767 in
  debug builds (release stays on 8765). Stops a running
  installed Kaisho.app from silently taking the port
  during ``bin/dev --desktop``. The Windows
  ``kill_stale`` path now filters by port instead of
  killing every ``kai-server.exe`` on the system
- Desktop auto-update banner is suppressed in dev builds
  via a new ``is_dev_build`` IPC. Prevents the banner
  from offering a stale published version after every
  hot reload
- Profile help text replaced with plain English. Cron
  prompt editor is the single place that surfaces the
  ``${...}`` syntax. Bio gets a one-line description for
  visual parity. Research Targets textarea no longer
  uses a smaller font than the other profile fields
- ``update_user_profile`` rejects non-string scalar
  values instead of silently coercing via ``str()``
- ``GET /api/cron/jobs/{id}/prompt`` returns the raw
  file content rather than the runtime-assembled prompt
  (which can include megabytes of fetched URL bodies)

### Internal

- The placeholder field set is now a single source of
  truth in ``services.placeholders.USER_FIELDS``. The
  config template, profile tools, and frontend prompt
  editor all derive from it. New
  ``GET /api/advisor/placeholder-vocab`` exposes the
  vocabulary so the editor highlight can no longer
  drift from the substitution layer
- Public ``get_project_root()`` replaces direct access
  to a private config attribute
- ``advisor-run-slash`` event listener uses a ref
  pattern to avoid stale closure on slash handlers

## 1.3.3

- Cron view: history table now polls every 3s while a
  job run is in ``status: running`` so the user sees the
  output as soon as the job finishes — no more
  right-click → reload to see the result. Polling stops
  automatically when no run is running

## 1.3.2

- Fix sync snapshot oscillation. ``push_reference_snapshot``
  fired on every cycle without checking whether anything
  had actually changed, so users saw "snapshot" appear in
  the sync result on every click even when no customer or
  task data had changed. Now skips the network round-trip
  when the SHA-256 of the canonical-JSON payload matches
  the last successful push (digest stored at
  ``profile_dir/.snapshot_digest``)
- Pair with kaisho-cloud >= 1.2.4 for the full sync
  echo-loop fix (cloud now preserves client's
  ``updated_at`` so locally-pushed entries don't bounce
  back as if cloud-modified)

## 1.3.1

- Fix cron prompt loading for ``~``-prefixed paths.
  ``Path.is_absolute()`` returns False on ``~/...``, so
  the loader was joining the path onto project_root
  before expanding ``~``, producing
  ``<runtime>/_internal/~/.kaisho/profiles/...`` and a
  "prompt file not found" error. ``~`` now expands
  before the absolute-path check. Affects users who set
  jobs.yaml ``prompt_file`` to a profile-relative
  override

## 1.3.0

- Cron jobs now pre-inject Kaisho data (open tasks,
  recent clock entries, inbox, customer budgets, time
  insights) so prompts work on any model — including
  ones that cannot tool-call (Gemma, small Ollama
  models). Opt-in per job via the new ``inject_context``
  field; default true to preserve existing behavior.
  News/research templates set it to false to avoid
  shipping unrelated data to the upstream LLM
- Cloud cron path (``model: kaisho:cron``) now runs an
  agentic loop with tools, mirroring the local Ollama
  path. Prompts that need dynamic research
  (``transcribe_youtube``, ``fetch_url``) work via
  ``kaisho:cron`` for the first time
- Cron tool surface restricted to a read-only subset
  (inspection + research). Destructive tools
  (``delete_*``, ``execute_cli``, profile management)
  are no longer reachable from any cron path
  (Anthropic, OpenAI-compatible, Ollama, kaisho cloud)
- Path-traversal guard on cron job ids: the
  ``create_cron_from_template`` MCP tool and the
  ``POST /api/cron/jobs`` endpoint enforce a strict
  slug regex (``^[a-z0-9][a-z0-9-]\{0,63\}$``)
- User-created cron prompts now write to
  ``cfg.PROFILE_DIR / "prompts/"`` so they survive
  Kaisho version updates. Bundled template references
  (e.g. ``prompts/daily-briefing.md``) keep working
- New ``GET /api/cron/templates`` endpoint listing
  curated cron job templates with metadata + prompt
  body. Used by the new "From Template" picker in the
  Cron view and by the advisor's
  ``create_cron_from_template`` MCP tool
- Cron history rows can now be expanded for failed
  runs to read the full error message; the truncated
  cell also shows full text on hover
- Cron Ollama path now respects the job's ``timeout``
  field (was silently ignored, falling back to a
  hardcoded 300s). Default bumped 120s → 600s for new
  jobs; 31B local models routinely exceed 5min in an
  agentic loop
- Per-run write-counter is now thread-safe
  (``threading.local``). Concurrent runs from the
  scheduler and the advisor's ``trigger_cron_job`` no
  longer race
- Default cron prompts (``hn-ai-daily``,
  ``weekly-scout``) made generic for use as templates
  in fresh profiles. Personal copies in
  ``~/.kaisho/profiles/<profile>/prompts/`` are
  unaffected
- Tag/state/type sorting via drag-and-drop in Settings;
  inline rename for customer types, inbox types, and
  inbox channels; persistent action icons replace the
  flaky ``opacity-0 group-hover`` pattern
- Task and Clock edit forms now focus the description /
  notes textarea instead of opening the customer
  dropdown
- Bug fix: ``trigger_cron_job`` MCP tool now passes
  cloud credentials and the correct
  ``ollama_cloud_api_key`` so kaisho:cron and
  ollama_cloud:* jobs can be manually triggered
- Bug fix: scheduler also passes the correct
  ``ollama_cloud_api_key`` (same copy-paste error as
  the trigger path)

## 1.2.0

- Replace the Cloud AI global override with explicit
  kaisho:advisor / kaisho:cron model identifiers. The
  advisor and cron system no longer silently overrides
  the configured model — picking Kaisho AI is now an
  explicit choice in the model field. The mode after
  the colon is forwarded to the cloud gateway so it can
  pick the right upstream model per use case (Haiku 4.5
  for advisor, Gemma 4 31B for cron) and per-mode budget
- On Sync+AI plan connection, advisor_model / cron_model
  are auto-populated with kaisho:advisor / kaisho:cron
  when empty so the cloud gateway is wired up by default;
  existing non-empty values are kept
- Drop the cloud_sync.use_cloud_ai global toggle and the
  per-cron-job use_kaisho_ai flag; both are replaced by
  the explicit model field
- Settings: drag-and-drop reordering for task states,
  tags, customer types, inbox types, inbox channels via
  @dnd-kit/sortable
- Settings: inline rename for customer types, inbox types,
  inbox channels (mirroring the existing tag rename UI)
- Settings: replace the flaky opacity-0 group-hover row
  pattern with always-visible subtle action icons that
  brighten on hover — fixes pencil/X icons getting stuck
  visible after a color picker or confirm popover stole
  focus
- Tag delete now uses ConfirmPopover, matching state delete
- Task and Clock edit forms now focus the description /
  notes textarea on open instead of the customer field,
  so the customer dropdown no longer auto-opens

## 1.1.0

- Identify clock entries by sync_id end-to-end so two
  entries that share a start time can be edited or
  deleted independently — fixes a bug where toggling
  invoiced on one entry could flip a different one
- Show the actual model in cron history: when a job has
  use_kaisho_ai but the cloud gateway isn't fully
  configured, history now records the local model that
  actually ran instead of mislabeling the run as
  "kaisho:ai"
- Active profile name shown under the user name in the
  top-right user menu so it's obvious which profile is
  active without opening the menu
- Sync frontend/package.json in bump-version.sh — the
  desktop build no longer reports a stale frontend
  version number
- MCP: tag strings are no longer split into individual
  characters when add_task / set_task_tags / update_note
  receive a single string instead of an array
- MCP: new delete_clock_entry, delete_task, and
  delete-by-sync_id paths plus richer update_clock_entry
  (new_start, new_end, task_id) and book_time (start,
  contract, task_id, notes) for full editing workflows
- "What's New" popup and Settings → Update tab no longer
  truncate multi-line bullets in CHANGELOG.md
- Tray timer notes render as proper markdown (added a
  compact variant of the shared Markdown component for
  small surfaces)
- GitHub issue URL field hidden in task forms when no
  PAT is configured (still shown if a value already
  exists, so legacy tasks remain editable)
- Add and delete kanban task states from settings — the
  task states section gains a + button, each row a
  delete button gated by the same ConfirmPopover used
  elsewhere; backend refuses to delete a state that
  still has tasks (409) so nothing gets orphaned
- Live elapsed timer next to the tray icon (macOS) —
  HH:MM updates each minute, IPC pushed only on actual
  change so the menu bar doesn't thrash
- Tray icons render in their brand colours
  (green/amber/red) instead of being repainted by the
  menu bar's foreground tint, so they stay readable on
  Sequoia's wallpaper-tinted menu bars
- bin/dev gains a --clean flag that wipes WKWebView
  caches, the extracted sidecar runtime, and the cargo
  target dir before starting — use it after pulling a
  branch when fresh code isn't reflected in the running
  app

## 1.0.0

- Multi-profile cloud sync: each profile can independently
  connect to its own cloud account and sync in the background
- Per-profile user identity: user.yaml moved from global to
  per-profile, with automatic migration for existing installs
- Background sync for all profiles: the 5-minute cron job now
  iterates all enabled profiles, not just the active one
- WebSocket reconnect on profile switch: switching profiles
  now properly reconnects the cloud WebSocket
- Fix MCP server crash: parameter ordering bug caused
  SyntaxError when optional params preceded required ones
- Security: API key no longer leaked in WebSocket query string
  (switched to first-message auth)
- Security: default server binding changed from 0.0.0.0 to
  127.0.0.1 (Docker and desktop pass explicit values)
- Security: settings API masks secret keys instead of
  returning them in plaintext
- Security: profile name validation on switch prevents
  path traversal attacks
- Security: MCP server validates tool and parameter names
  against identifier regex before code generation
- Remove vestigial clocks_file parameter from run_sync_cycle
- Push lock coordination between cron sync and eager push
  prevents concurrent sync cycles for the active profile

## 0.9.4

- Fix sync 500 error: wrap config pull in try/except
- Add sync_id parameter to all backends (markdown, sql, json)

## 0.9.3

- Cloud sync: bidirectional sync for inbox, tasks, notes
  (not just clock entries)
- Cloud sync: tag and user profile sync between desktop
  and PWA via ref_config
- Cloud sync: real-time WS events for inbox, tasks, notes
  (instant sync instead of 5-minute poll)
- Cloud sync: echo-back prevention (pulled items excluded
  from push to avoid LWW conflicts)
- Cloud sync: "Sync Now" invalidates all data queries
- Fix phantom unread badges (React Query loading state)
- Fix deleted_at validation on all sync apply schemas
- Fix customer prefix duplication on sync push/pull
- Screenshot script: dismiss "What's New" dialog

## 0.9.2

- Fix "What's New" dialog showing old version notes
  (CHANGELOG.md was not updated for v0.9.0/v0.9.1)
- Fix version mismatch after auto-update: kill stale
  sidecar process on startup before spawning new one

## 0.9.1

- Customer is now optional everywhere: start timers, book
  time, and create tasks without selecting a customer
- Tray panel: inline-editable description and notes on the
  running timer, auto-refocus after capture
- Dashboard drilldown: paginated entries (5 at a time) when
  expanding a customer in time insights
- Styled contract selects with custom chevron arrow
- Fix org-mode regex that corrupted empty-customer entries
- Fix cloud triage: only flag entries from the cloud, not
  locally created customerless entries
- Fix iCal export showing empty brackets for no customer
- Fix AI tools requiring customer in their schemas
- Fix tray tooltip showing blank when no customer
- Fix stale sidecar after auto-update (kill on startup)
- Docs: customer-optional in CLI/API, gptel MCP section,
  profile isolation, tray editing, corrected tool count

## 0.9.0

- MCP server: expose 40 tools via Model Context Protocol
  with tier-based access control (read/write/destructive)
- Profile-scoped localStorage to isolate browser state
  across profiles
- MkDocs Material documentation site (58 pages) at
  docs.kaisho.dev, auto-deployed on version tags
- Code review fixes: CORS wildcard removed, layer
  violations fixed, shared ai_utils module
- Version shown in docs header via pyproject.toml hook

## 0.8.4

- PDF text extraction: pdftotext (poppler) with pypdf
  fallback, cached in memory
- PDF content limit 8K for advisor tool calls
- Settings toolbar uses PanelToolbar, no title
- Language selector styled consistently
- KB sidebar resize fixed with PDF iframe overlay
- Advisor clear button with icon + label
- Fix updater re-offering same version
- Suppress pypdf warnings for malformed PDFs

## 0.8.3

- PanelToolbar component: consistent toolbar layout
  across all panels, no more panel titles
- SearchInput component: built-in search icon, uniform
  styling across all panels
- Drag-and-drop reordering for notes and inbox items
- Star/bookmark KB files with filter toggle
- Inline PDF viewer in knowledge base
- Hide invoiced toggle (switch) in clocks toolbar
- iCal feed link in calendar sidebar
- GitHub select box styled consistently
- Board columns aligned with toolbar (px-5)
- Update button shows in all languages
- Fix regex filter crash on null values
- Fix PDF content-type for inline viewing

## 0.8.2

- Fix Windows updater crash (sign .exe directly, no zip)
- Refactoring: narrow exception handling, fix imports,
  add error checks in command bar and sync

## 0.8.1

- Tray mode toggle in Settings > General (defaults off
  on Windows/Linux, on for macOS)
- Show connected user email in Cloud Sync settings
- Single-click badge navigation to Cloud Sync / AI tab
- Auto-create customer when adding a task for a
  non-existing customer
- Sync error messages show detail instead of generic 500
- clock desc/note commands for running timer
- clock stop --desc/--notes/--customer options
- Configurable command bar shortcut
- Default cron: replaced weekly-scout with weekly-summary

## 0.8.0

- Command bar thinking spinner while executing
- Ask command sends conversation history for
  follow-up questions in context

## 0.7.9

- Ask command: query AI advisor from command bar
- clock stop --desc/--notes/--customer options
- Expanded autocomplete: 25 commands (briefing,
  customer show/summary, kb search, cron list, etc.)

## 0.7.8

- Fix command bar Cmd+J shortcut
- Add clear command to flush command bar history
- Fix unknown commands showing exit code instead of
  error message
- Add clock desc and clock note CLI commands for
  updating running timer description and notes

## 0.7.7

- In-app command bar (Cmd+J): execute any kai CLI
  command directly from the UI with autocomplete
- Full CLI via /api/cli/run backend endpoint
- Fix import: preserve billable, invoiced, and
  used_offset on contracts
- CLI: description is optional for clock start/book
- Fix Excel export corruption in desktop app
- Close tray panel on blur (Windows/Linux)
- Windows: sharp ICO with 7 sizes up to 256x256

## 0.7.6

- Fix Windows: remove transparent window ghost behind
  tray panel, use opaque window with proper sizing
- Fix Windows: colored 32x32 tray icons (white on dark
  bg) instead of macOS template images
- Fix Windows updater: generate NSIS zip + signature so
  in-app updates work (was missing windows-x86_64 platform)
- Fix Windows version showing "vdev" (bundle pyproject.toml)
- Platform-specific tray icons: template images on macOS,
  colored icons on Windows/Linux

## 0.7.5

- Fix Windows: sharp square icons (no blurry rounded corners)
- Fix Windows/Linux: tray panel opens above bottom taskbar
  instead of extending off-screen

## 0.7.4

- Fix Linux/Windows sidecar startup (relative import)
- Fix Windows installer missing from releases
- Fix Ollama Cloud /v1/models endpoint path

## 0.7.3

- Menu bar tray timer: crisp icons, transparent popover
  panel with rounded corners, dark/light theme sync,
  language sync, proper positioning below tray icon
- Left-click opens panel, right-click shows context menu
- Timer toggle calls backend API directly (no crash)
- Advisor model badge: read-only, click navigates to
  Settings > AI (removed inline model override)
- Fix Ollama Cloud model prefix (ollama_cloud: instead
  of ollama:), fix /v1/models endpoint path
- Local Ollama fetch skips remote URLs
- Dock icon with proper padding for macOS
- Desktop app refactored into modules (sidecar, tray,
  http, lib)
- Sidecar cache uses content hash to avoid stale builds
- dev-desktop.sh script for local Tauri dev loop

## 0.7.2

- Spanish translations (12 namespace files, full coverage)
- Language selector changed from toggle to dropdown
  (English, Deutsch, Español) in header and settings
- Mobile PWA now fully translated (EN, DE, ES) with
  language selector in Profile > Appearance
- Fix advisor not recognizing ollama_cloud: model prefix

## 0.7.1

- Unified app icon: same dark bracket-palm design on
  desktop and mobile, centered and slightly larger
- Ollama Cloud separated as distinct provider
  (ollama_cloud: prefix, own URL field in Settings > AI)
- Sync badge click navigates directly to Cloud Sync tab
- Advisor responses show timestamp and model name
- Copy advisor responses to inbox (inbox icon on bubbles)
- AI token usage meter in mobile PWA profile
- 14-day free trial for first-time subscribers
- Complete i18n: all 47 remaining components wired,
  3 new namespaces (cron, knowledge, notes), all
  placeholders translated
- Fix cron "No AI provider" when Ollama Cloud configured

## 0.7.0

- Menu bar tray timer with popover panel
- Tray icon shows timer state (idle/active/long/offline)
- Quick start, quick capture (inbox/note/task), recent
  entries with resume in tray popover
- Global shortcuts: Cmd+Shift+T (tray), Cmd+Shift+S
  (start/stop timer)
- Main window hides on close, tray stays active
- Separate Vite entry point for slim tray bundle

## 0.6.6

- Globe icon in header bar for quick language switching
- German translation active across all UI components
- 26 components wired with react-i18next
- Disable Kaisho AI toggle on non-sync_ai plans

## 0.6.5

- i18n: react-i18next with 483 translation keys
- English + German locale files (9 namespaces)
- Language selector in Settings > General
- Ollama Local/Cloud preset dropdown
- Fix CSV export freeze in desktop app (Tauri save dialog)
- TRANSLATING.md contributor guide

## 0.6.4

- Updated documentation and in-app help panels
- Cloud Sync and Import help in settings panel
- Website format examples match actual org/md structure
- Consolidated planning docs, removed duplicates

## 0.6.3

- Code review: fix path traversal, iCal UID collisions,
  SSL init, AI endpoint crashes, dead code
- Consistent local_now() across all services
- Flake8 clean (0 errors), lint step in CI
- 30 new FastAPI TestClient tests (244 total)
- Updated documentation across all repos
- Security: WS auth via first-message, rate-limited
  password reset, paid plan enforcement on sync
- Accessibility: ARIA roles, keyboard nav, focus trapping

## 0.6.2

- Fix SSL globally for all HTTPS requests in desktop app
- Reject cloud connect on free plan
- Enforce paid plan on all cloud sync endpoints

## 0.6.1

- Fix cloud sync: SSL certs for PyInstaller bundle
- Eye toggle to verify API key in connect form
- Better error messages for cloud connection failures

## 0.6.0

- Resume button visible on all clock entries (not just today)
- Hardcode cloud.kaisho.dev URL (no manual URL input)
- Password reset flow in mobile PWA
- Markdown rendering + syntax highlighting in PWA advisor
- Advisor templates populate input (don't auto-send)
- Stop button for in-flight advisor requests
- Redesigned PWA home screen icon

## 0.5.10

- Empty AI settings on fresh profiles (no pre-filled URLs)
- Rewrite build workflow for reliable auto-updater

## 0.5.9

- Fix clock import: preserve original start/end times
- Add syntax highlighting for code blocks (rehype-highlight)
- Fix updater workflow: collect sig files correctly
- URL-encode contract names in API client

## 0.5.8

- Fix settings endpoint hidden by SPA catch-all
- Fix input height mismatches in settings selects
- Remove unused update channel selector
- Code cleanup: remove unused variables, fix state
  ordering, fix import write-on-no-change bug

## 0.5.7

- Fix data directory: always use ~/.kaisho in desktop app
- Hide JSON and SQL backends from UI (org + markdown only)
- Better API error reporting (detect non-JSON responses)
- Fix auto-updater latest.json generation

## 0.5.6

- Fix Tags & Types panel on fresh/reset profile
- Create profile directory on startup if missing
- Fix auto-updater: generate latest.json correctly
- Reset local preferences button in Settings
- Settings endpoint: robust defaults for all fields

## 0.5.5

- Fix Tags & Types settings panel (stuck on Loading)
- Fix 500 error on AI models endpoint without providers
- Show version number in header bar
- Remove Intel Mac from build matrix (Apple Silicon only)

## 0.5.4

- Fix updater: allow IPC from localhost webview
- External links open in system browser (not webview)
- Automatic update notifier on app startup
- What's New dialog shows only latest version
- Import: upsert by ID (no duplicates on re-import)
- Import: auto-populate task states and tags in settings
- Hide advisor model selector when no AI configured
- Disable cron enable toggle without a model
- Narrow exception handling to specific types

## 0.5.3

- Cloud onboarding: pricing links, feature overview, spam email hint
- Top-bar cloud plan badge and mobile app link when connected
- Dismissable cloud nudge banner (14-day cooldown)
- Advisor, Cron, GitHub panels always visible in sidebar
- Empty-state hints when no AI provider or GitHub token configured
- Ollama API Key moved to Cloud API Keys section
- Cron Run button disabled when no model configured
- Fix updater ACL permissions for in-app updates
- Fix version display (bundle pyproject.toml in sidecar)
- Claude models only shown when API key is set

## 0.4.0

- Advisor tool calling: kai CLI commands via Kaisho AI
- Full codebase refactoring for maintainability
- API key cache invalidated on key rotation (security fix)
- Zod validation schemas on all AI endpoints
- Shared utility modules (formatElapsed, time formatters)
- Plan cache cleared on Stripe webhook (no stale plan)
- OpenRouter key + token quota extracted as middleware
- Stripe client reused from module-level instance
- Silent catch blocks replaced with console.warn/log
- Dead code removed (double write_output, unused functions)
- Exception chaining in claude_cli timeout
- Consistent datetime.now() vs local_now() usage
- Imports sorted and deduplicated throughout

## 0.3.2

- Fix desktop app startup: PyInstaller-aware path resolution
- Random port selection to avoid conflicts
- Simplify Kaisho AI: single completion, no tool calls
- Default crons (daily-briefing, project-update) use Kaisho AI
- Token budget for agentic loop (50K max per run)

## 0.3.1

- Fix desktop app: set SERVE_FRONTEND=true for sidecar
- Fix Windows build: PowerShell reads BUILD_TARGET from env
- Batch sync/apply: single SELECT + batch INSERT (20s to 3s)
- Auth cache: SHA-256 fast cache (5 min TTL, skips bcrypt)
- Plan cache: 60s TTL eliminates Supabase round-trip per request
- WebSocket refactoring: error logging, reconnect jitter,
  safe disconnect, consistent async broadcasts
- Mobile: editable start time and duration in entry editor
- Mobile: hash-based routing (stays on tab after reload)
- Mobile: full-screen edit modal for iOS compatibility
- HTTP timeout increased to 60s for initial sync
- Sync cursor properly saved after successful push
- Code cleanup: remove dead code, fix imports, update docs

## 0.3.0

- Kaisho AI with full agentic tool calling through OpenRouter
- Real-time WebSocket sync replaces polling (mobile + desktop)
- Per-job Kaisho AI toggle for cron jobs
- AI token usage meter in Cloud Sync settings
- Security guardrails for cloud tool execution
- Hide advisor/cron/GitHub panels when not configured
- Timezone fix for cloud sync (UTC conversion)
- System scheduler jobs preserved during job sync
- German identifiers renamed to English throughout

## 0.2.0

- Bidirectional cloud sync with last-writer-wins conflict resolution
- Mobile PWA with dashboard, calendar navigation, and entry editing
- AI gateway with OpenRouter integration and token metering
- Desktop app with auto-update (stable and develop channels)
- Customer picker with free-text and auto-create
- Offline mutation queue for mobile
- ConfirmPopover for all destructive actions
- Backend-agnostic sync (org, markdown, JSON, SQL)
- Single-profile sync enforcement
- Disconnect flow that wipes cloud entries
- Windows path compatibility fix

## 0.1.0

- Initial release
- Time tracking with start/stop timers and quick-booking
- Kanban board with drag-and-drop and custom columns
- Customer and contract management with budget tracking
- Invoicing with CSV export
- Dashboard with daily, weekly, and monthly views
- AI assistant with Ollama, Claude, and OpenRouter support
- Pluggable storage backends (org-mode, Markdown, JSON, SQL)
- Multi-profile support
- Emacs integration (kaisho-mode)
- CLI with all features accessible as subcommands
- GitHub integration for issue tracking
- Keyboard shortcuts
- Knowledge base with full-text search
