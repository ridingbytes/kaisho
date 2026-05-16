# Changelog

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
