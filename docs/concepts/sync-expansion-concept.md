# Concept: Syncing Tasks, Notes, and Inbox to the Cloud

## Current State

Today only clock entries sync bidirectionally between the desktop
app and the mobile PWA. Tasks and customers are pushed as
read-only reference snapshots for mobile dropdowns. Notes and
inbox are local-only.

The mobile PWA can start/stop timers, book time, browse entries,
and chat with the advisor. It cannot create tasks, take notes, or
capture inbox items.

## The Idea

Extend cloud sync to tasks, notes, and inbox so the mobile PWA
becomes a lightweight capture and triage device. The desktop app
remains the command center where items are organized, prioritized,
and worked on.

The inbox becomes the universal entry point: anything captured on
mobile (a thought, a to-do, a client request) lands in the inbox
first, then gets sorted on the desktop app or by the advisor.

## What Each Data Type Needs

### Tasks

**Value:** See today's work on mobile. Mark things done on the
go. The advisor on both platforms knows what's open.

**Sync complexity: Medium.**
- Tasks have stable IDs (TASK_ID property, hash-based).
- Fields: customer, title, status, tags, body, github_url,
  created, state_history.
- Conflict surface: status changes and body edits. Two devices
  could change the same task's status simultaneously.
- Ordering: tasks have a position within their column. Syncing
  drag-and-drop order across devices is complex and
  conflict-prone.

**Recommendation:** Sync task fields (status, title, body, tags)
with LWW per field (not per task). Do NOT sync column ordering
initially — each device keeps its own order. Mobile shows tasks
in a flat list grouped by status, not a kanban board.

**Cloud schema addition:**
```sql
CREATE TABLE tasks (
    id          TEXT,
    user_id     UUID REFERENCES users(id),
    customer    TEXT DEFAULT '',
    title       TEXT NOT NULL,
    status      TEXT DEFAULT 'TODO',
    tags        TEXT[] DEFAULT '{}',
    body        TEXT DEFAULT '',
    github_url  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    PRIMARY KEY (user_id, id)
);
```

**Mobile UI:** A "Tasks" tab showing today's tasks (TODO and
IN_PROGRESS) at the top, grouped by customer. Tap to toggle
status. Long-press to edit title or body. No drag-and-drop, no
column management.

### Notes

**Value:** Jot something down on mobile during a meeting or
commute. Review and organize on the desktop later.

**Sync complexity: Low.**
- Notes are simple: title, body, customer, tags.
- No ordering dependency (unlike kanban columns).
- Conflict surface: body edits only. LWW is acceptable since
  notes are typically edited on one device at a time.

**Recommendation:** Full bidirectional sync with LWW. Mobile
gets a simple note list with create/edit. No promotion or
movement on mobile — that's a desktop operation.

**Cloud schema addition:**
```sql
CREATE TABLE notes (
    id          TEXT,
    user_id     UUID REFERENCES users(id),
    customer    TEXT DEFAULT '',
    title       TEXT NOT NULL,
    body        TEXT DEFAULT '',
    tags        TEXT[] DEFAULT '{}',
    task_id     TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    PRIMARY KEY (user_id, id)
);
```

**Mobile UI:** A "Notes" tab with a list view. Tap to
read/edit. Floating action button to create. No promote/move
actions on mobile.

### Inbox

**Value:** The universal capture point. "Send" something to
your Kaisho from anywhere — mobile, advisor, automation — and
sort it out later on the desktop.

**Sync complexity: Low.**
- Inbox items are simple: title, body, type, customer, channel.
- No ordering dependency.
- Promotion/movement is desktop-only (promote to task, move to
  note/KB/archive).

**Recommendation:** Full bidirectional sync. Mobile gets a
capture form and a list. The inbox becomes the primary mobile
input channel — fast, no decisions required.

**Cloud schema addition:**
```sql
CREATE TABLE inbox (
    id          TEXT,
    user_id     UUID REFERENCES users(id),
    type        TEXT DEFAULT 'NOTE',
    customer    TEXT DEFAULT '',
    title       TEXT NOT NULL,
    body        TEXT DEFAULT '',
    channel     TEXT DEFAULT '',
    direction   TEXT DEFAULT 'in',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    PRIMARY KEY (user_id, id)
);
```

**Mobile UI:** Inbox as a prominent capture bar (always
visible, like a messaging app's input field). List of recent
items below. Swipe to delete.

## The Inbox as Universal Router

This is where the USP sharpens. The inbox is not just a list —
it's the entry point for everything:

**Capture channels:**
- Mobile PWA: type or voice-dictate into the inbox bar
- Desktop tray: quick capture (already exists)
- Advisor: "add an inbox item" (already works)
- Email forwarding (future: parse forwarded emails)
- API/webhook (future: external integrations)

**Triage on desktop:**
- Promote to task (already exists)
- Move to note (already exists)
- Move to KB (already exists)
- Archive (already exists)
- Assign to customer
- The advisor can suggest triage actions

**Advisor awareness:**
The advisor already receives inbox items in its context. With
sync, items captured on mobile appear in the advisor's context
on the desktop within 5 minutes (or immediately with
sync-now). The advisor can:
- Suggest which inbox items are urgent
- Auto-triage items to the right customer
- Create tasks from inbox items on request
- Include today's inbox in the daily briefing

## What the Advisor Gains

With all three data types synced, the advisor's context becomes
complete:

| Data          | Current          | After Sync        |
|---------------|------------------|-------------------|
| Clock entries | Full context     | No change         |
| Tasks         | Included (local) | Included (synced) |
| Notes         | NOT included     | Included          |
| Inbox         | Included (local) | Included (synced) |
| Customers     | Full context     | No change         |

The advisor can now answer:
- "What should I focus on today?" (tasks + inbox + clocks)
- "Summarize what I captured this week" (inbox + notes)
- "Which tasks are overdue?" (tasks with state history)
- "Draft a note from this inbox item" (inbox → note)

## Technical Feasibility

### Effort Estimate

| Component                  | Effort | Notes                                                      |
|----------------------------|--------|------------------------------------------------------------|
| Cloud schema (3 tables)    | Small  | Supabase migration                                         |
| Sync protocol extension    | Medium | Extend push/pull for 3 new entity types, reuse LWW pattern |
| Local sync service         | Medium | Add task/note/inbox to push-snapshot → full sync           |
| Stable IDs for notes/inbox | Small  | Add SYNC_ID property (same pattern as clocks)              |
| Mobile task view           | Medium | New tab, status toggle, grouped list                       |
| Mobile note view           | Small  | Simple list + create/edit                                  |
| Mobile inbox capture       | Small  | Input bar + list (already exists in desktop tray)          |
| Advisor context update     | Small  | Add notes to context prompt                                |
| Testing                    | Medium | Sync conflict scenarios, round-trip tests                  |

**Total: 3-4 focused sessions.** The sync protocol is already
battle-tested for clocks. Extending it to tasks/notes/inbox
reuses the same LWW, tombstone, and cursor patterns.

### Risk Areas

**Task ordering:** Syncing kanban column order across devices
is a known hard problem (CRDTs, vector clocks). Recommendation:
don't sync order. Each device maintains its own order. Desktop
has drag-and-drop kanban, mobile has a flat sorted list.

**Note body conflicts:** Two devices editing the same note body
simultaneously. LWW means one edit wins and the other is lost.
Acceptable for now — notes are typically short and edited on
one device at a time. If this becomes a problem later, add a
conflict marker (like git's `<<<<`) instead of silent
overwrite.

**ID stability:** Notes and inbox currently use 1-based indices
as IDs (position in the org file). These change on reorder or
delete. Need to add a stable SYNC_ID property, same as clocks.
This is a prerequisite and must be done before sync.

**Inbox volume:** If the inbox becomes the primary capture
channel, it could grow fast. Need pagination on the cloud
endpoint and a TTL or auto-archive policy.

## What NOT to Sync

- **Knowledge base:** Files can be large (PDFs, docs). File
  sync is a different problem (Syncthing, iCloud Drive). Not
  worth the complexity.
- **Task column order:** Too conflict-prone for LWW. Each
  device owns its own layout.
- **Cron jobs and settings:** Profile-specific, desktop-only.
- **Advisor chat history:** Stored in localStorage, not worth
  syncing.

## Mobile App Redesign

With three new data types, the mobile PWA's tab bar needs
rethinking:

**Current tabs:** Timer | Dashboard | Book | Advisor | Entries

**Proposed tabs:** Timer | Tasks | Inbox | Advisor | More

- **Timer** — unchanged (start/stop, active timer display)
- **Tasks** — today's tasks, grouped by customer, status toggle
- **Inbox** — capture bar at top, recent items below, swipe
  actions
- **Advisor** — unchanged (now with full context including
  notes/inbox)
- **More** — entries, notes, dashboard, profile (secondary
  actions)

The inbox capture bar could also be a floating action button
accessible from any tab, making capture truly frictionless.

## USP Impact

**Before:** Kaisho is a desktop productivity app with a mobile
timer. The mobile experience is limited to time tracking.

**After:** Kaisho is a capture-anywhere, organize-on-desktop
system. The mobile app becomes a real companion:
- Capture thoughts and to-dos on the go (inbox)
- Check what's on your plate today (tasks)
- Jot down meeting notes (notes)
- Ask the advisor with full context (advisor)
- Track time (timer, unchanged)

The competitive differentiator: local-first data ownership with
cloud sync that actually covers your whole workflow, not just
timesheets. The inbox-as-router pattern gives mobile users a
single, fast input channel without forcing them to decide
"is this a task, a note, or just a thought?" upfront.

## Recommended Implementation Order

1. **Stable IDs** — Add SYNC_ID to notes and inbox items
   (prerequisite, no user-visible change)
2. **Inbox sync** — Highest value, lowest complexity. Enables
   mobile capture immediately.
3. **Task sync** — Medium complexity. Enables the "what should
   I do today" mobile experience.
4. **Notes sync** — Lowest priority. Notes are less
   time-sensitive than tasks and inbox.
5. **Mobile UI** — Build each tab as its sync backend lands.
6. **Advisor context** — Add notes to the context prompt (small
   change, big impact).

## Decision

**Should we go this path?**

Yes, with a phased approach. The inbox sync alone is high
value and low risk — it turns the mobile PWA from a timer into
a capture device. Task sync adds the "what do I need to do"
dimension. Notes sync completes the picture but can wait.

The technical foundation (LWW sync, tombstones, cursors) is
already proven and extensible. The main prerequisite — stable
IDs for notes and inbox — is a small change that pays for
itself regardless of sync.
