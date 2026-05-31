# Kaisho Desktop — UI Design System Consolidation Plan

Status: planning. No code in this document. Each phase is independently shippable; the user reviews and approves before any phase begins.

## 0. Scope reminder — what is already solved

These exist and are NOT re-audited in this document:

- Semantic colour tokens (`surface-*`, `border-*`, `cta-*`, `fg-*`, `success/warning/danger/info`) in `frontend/tailwind.config.cjs` + `frontend/src/index.css` (12 theme presets).
- `inputCls` / `smallInputCls` in `frontend/src/styles/formStyles.ts` (h-8 / h-7, width intentionally omitted).
- `HoverActions` wrapper in `frontend/src/components/common/HoverActions.tsx`.
- `Button` v1 in `frontend/src/components/common/Button.tsx` (variants primary/secondary/ghost/danger, sizes sm/md/lg). Only `settings/PathsTab.tsx` consumes it today.
- Theme-aware `.hljs-*` driven by per-theme `--code-*` vars.

## 1. Headline metrics (raw drift, repo-wide)

Counted across `frontend/src/**/*.{ts,tsx}`:

| Axis | Counts |
|---|---|
| Border radii | `rounded` 309, `rounded-lg` 73, `rounded-full` 70, `rounded-xl` 56, `rounded-md` 36, `rounded-2xl` 4, `rounded-sm` 3 |
| Font sizes | `text-xs` 358, `text-[10px]` 253, `text-sm` 129, `text-[9px]` 40, `text-[11px]` 35, `text-base` 3, `text-lg` 2, `text-3xl` 4, `text-[8px]` 1 |
| Spacing | `gap-1` 150, `gap-2` 143, `gap-3` 91, `gap-1.5` 52, `gap-0.5` 26, `gap-4` 14, `gap-2.5` 3; `space-y-*` 19 total across 7 different values |
| Raw `<button>` tags | 99 files |
| `inputCls` / `smallInputCls` adoption | 30 of 49 files containing `<input` |
| Headings (`<h1..h4>`) | 56 occurrences, 20 distinct className strings |
| Toggle reimplementations (`role="switch"`) | 2 (Toggle.tsx + CalDavSection.tsx); plus 6 files using styled `type="checkbox"` |

These are the numbers the plan is sized against.

## 2. Inventory by component category

### 2.1 Buttons (highest-impact)

Adopted: `Button.tsx` used by `settings/PathsTab.tsx` only.

Hand-rolled button styling across the rest of the app. Notable hotspots (file : approximate raw-button count):

- `tray/TimerSection.tsx`, `tray/CaptureSection.tsx`, `tray/RecentSection.tsx` — pill `rounded-full` + ghost variants.
- `components/settings/*` — 13 files, ~40 buttons. AiTab.tsx (891 lines) alone has multiple ad-hoc `px-3 py-1.5 rounded border` flavours and the `actionBtnCls` mini-recipe in `formStyles.ts` (only used by `CustomerCard.tsx` and `settings/TagsTab.tsx`).
- `components/customers/*` — InvoicePanel, CustomerCard, ContractRow, AddContractForm, QuickBookForm, CustomerEditForm. Mix of `rounded`, `rounded-md`, `rounded-full`.
- `components/clock/*` — BookForm, ClockList, ActiveTimer, EntryRow, CloudTriagePanel; uses `rounded-full` pills heavily.
- `components/kanban/*`, `components/inbox/*`, `components/calendar-panel/*` — each ~3-6 raw buttons.
- `components/knowledge/*` — toolbar buttons re-rolled.
- `App.tsx` — top-level nav and menu buttons.

Consolidation: every raw `<button>` whose styling is "icon + label + hover" should go through `Button`. Estimated reach after exclusions (see §5 NO list): ~75 of 99 files.

Additional variants `Button` likely needs to grow:

- `size="xs"` (h-6, text-[10px]) — current `text-[10px]` pills in tray, kanban, clock.
- `variant="pill"` OR a `shape="pill" | "rounded"` prop — for `rounded-full` chip buttons in `tray/TimerSection.tsx`, `components/clock/CloudTimer.tsx`, `kanban/TimerBadge.tsx`.
- `iconOnly` prop (square, equal padding) — toolbar icon buttons in `nav/Sidebar.tsx`, `common/PanelToolbar.tsx`, `knowledge/KnowledgeSidebar.tsx`.
- Retire `actionBtnCls` (replace its 2 callers with `<Button variant="secondary" size="xs">`).

### 2.2 Chips / pill badges / status indicators

Three overlapping families exist:

a) **Tag chips** — pill, coloured by tag. Implementations:
- `components/common/TagDropdown.tsx`
- `components/knowledge/MetadataCard.tsx`
- `components/knowledge/MetaAutocomplete.tsx`
- `components/settings/TagsTab.tsx`
- `components/notes/NotesView.tsx`

b) **Status badges** — semantic colour (success/warning/danger/info). Implementations:
- `components/customers/ContractRow.tsx` (`rounded-full px-2 py-0.5 text-[10px]`)
- `components/customers/BudgetBar.tsx`
- `components/customers/InvoicePanel.tsx`
- `components/settings/CloudSyncTab.tsx`, `UpdateTab.tsx`, `BackupTab.tsx`
- `components/inbox/InboxItemRow.tsx`
- `components/cron/CronView.tsx`

c) **Count badges / numeric pills** — e.g. unread, kanban counts:
- `components/nav/Sidebar.tsx`
- `components/kanban/TimerBadge.tsx`
- `components/clock/CloudTimer.tsx`
- `components/commandBar/CommandBar.tsx`

Consolidate into a single `Badge` component in `components/common/Badge.tsx`:

- `variant`: `neutral | success | warning | danger | info | tag`
- `size`: `sm` (h-4, text-[10px]) | `md` (h-5, text-xs)
- `shape`: `pill` (default) | `square`
- `tag` variant accepts a `color` prop (already used by TagDropdown).

Expected reach: ~25 files.

### 2.3 Toggles / switches

Canonical: `components/common/Toggle.tsx` (h-5 w-9, `role="switch"`).

Drift:
- `components/settings/CalDavSection.tsx:407` re-implements `role="switch"` inline instead of using `Toggle`.
- 6 files use styled `type="checkbox"` for boolean toggles: `customers/AddContractForm.tsx`, `customers/ContractRow.tsx`, `settings/TagsTab.tsx`, `github/GithubView.tsx`, `cron/CronView.tsx`, `clock/EditForm.tsx`. These should either (a) stay as semantic checkboxes (multi-select lists) or (b) move to `Toggle` (boolean settings). Need a per-call-site decision; default is `Toggle` for single boolean state.

Add a labelled wrapper `ToggleField` (label + description + Toggle on the right) for settings tabs — the same row layout is hand-built in nearly every `settings/*Tab.tsx`.

### 2.4 Section headings

20 distinct `<hN className=...>` strings across 56 occurrences. The two dominant patterns are:

- "Section eyebrow": `text-xs font-semibold tracking-wider uppercase text-fg-muted` — used as `<h1>`, `<h2>`, `<h3>` in different files. Also exists as a `text-[10px]` variant in tray + customer panels.
- "Panel title": mixed `text-sm font-semibold text-fg-strong` and `text-base font-semibold text-fg-strong` and `text-lg font-bold text-fg-strong`.

Proposed `<Heading level="eyebrow | panel | section | sub">` in `components/common/Heading.tsx`:

| level | element | classes |
|---|---|---|
| `eyebrow` | h3 | `text-xs font-semibold uppercase tracking-wider text-fg-muted` |
| `panel` | h2 | `text-base font-semibold text-fg-strong` |
| `section` | h3 | `text-sm font-semibold text-fg-strong` |
| `sub` | h4 | `text-xs font-semibold text-fg-strong` |

`ViewHeader.tsx` already covers top-of-view titles — leave it; `Heading` is for in-panel structure.

### 2.5 Empty / loading / error states

Currently inline strings, examples:
- `settings/BackupTab.tsx:81` — `<p className="text-sm text-fg-muted">Loading...</p>`
- `github/GithubView.tsx:80, 275` — same shape
- `kanban/KanbanBoard.tsx:548` — same shape, different padding
- `kanban/KanbanColumn.tsx:175` — `text-xs text-fg-subtle`
- `clock/ClockList.tsx:566` — `text-xs text-fg-subtle text-center py-4`

Add `components/common/StateMessage.tsx` with `kind: "loading" | "empty" | "error"`, optional `icon`, optional `action` (CTA button). Single recipe: centered, `text-sm text-fg-muted`, py-6, optional muted icon above.

Expected reach: ~15 call sites.

### 2.6 Inputs

19 of 49 files with `<input` are NOT using `inputCls`/`smallInputCls`. Mostly inline checkboxes (legit) and:
- `commandBar/CommandBar.tsx`, `commandPalette/CommandPalette.tsx` — bespoke (legit, keep).
- `common/SearchInput.tsx`, `common/Autocomplete.tsx`, `common/FilterAutocomplete.tsx`, `common/TokenFilterInput.tsx` — these are themselves recipes; verify they delegate to `inputCls` internally; if not, switch.
- `inbox/AddInboxForm.tsx`, `customers/QuickBookForm.tsx`, `customers/AddContractForm.tsx` — likely candidates to adopt `inputCls`.

### 2.7 Dialogs / popovers

`fixed inset-0 / role="dialog" / backdrop-blur` appear across 13 files. No shared `Dialog` shell.

- `common/ContentPopup.tsx`, `common/LinkPopover.tsx`, `common/WhatsNewDialog.tsx`, `common/HelpButton.tsx` — popover-family.
- `App.tsx`, `customers/InvoicePanel.tsx`, `calendar-panel/EventPopover.tsx`, `calendar-panel/BookFromEventDialog.tsx`, `commandBar/CommandBar.tsx`, `commandPalette/CommandPalette.tsx`, `knowledge/SummaryPopover.tsx`, `knowledge/KnowledgeSidebar.tsx`, `kanban/StateHistoryPopup.tsx` — modal-family.

Consolidation is high-value but high-risk (focus trap, escape handling, scroll lock). Defer to phase 4+ and only after smaller wins.

### 2.8 Border radius zoo

547 radius classes total. Current distribution shows no policy: `rounded` (309) and `rounded-lg` (73) compete on the same surfaces.

### 2.9 Font-size zoo

The arbitrary `text-[9px]` / `text-[10px]` / `text-[11px]` collectively account for **328 of 826** font-size usages (~40%). This is the biggest single source of visual drift.

`text-[9px]` is essentially "data-dense table cell text" and clusters in: `customers/TimeEntryRow.tsx`, `customers/ContractRow.tsx`, `customers/CustomerCard.tsx`, `customers/TasksSection.tsx`, `dashboard/TimeInsights.tsx`, `clock/ClockList.tsx`-area, kanban cards.

`text-[10px]` is the de-facto "small label" / "eyebrow" size — should be promoted to either `text-xs` (12px) or a named token, not a magic number.

## 3. Policy proposals

### 3.1 Border-radius policy

Standardize on **three** radii. Mapping:

| Token | Tailwind class | Usage |
|---|---|---|
| `radius-sm` | `rounded` (=4px) | Inputs, small buttons, badges, chips, hover affordances, table cells. Default. |
| `radius-md` | `rounded-lg` (=8px) | Cards, panels, dialogs, popovers, large surface containers. |
| `radius-pill` | `rounded-full` | Avatars, switches, true pill chips, status dots. |

Retired classes (with replacement):

- `rounded-sm` (3 uses) → `rounded`
- `rounded-md` (36 uses) → `rounded` for buttons/inputs, `rounded-lg` for card-sized surfaces (decide per call site).
- `rounded-xl` (56 uses) → `rounded-lg`
- `rounded-2xl` (4 uses) → `rounded-lg`

Net result: ~600 → 3 radius values.

### 3.2 Font-size policy

Standardize on **four** sizes + one display size:

| Token | Tailwind | Pixels | Usage |
|---|---|---|---|
| `text-2xs` (new utility) | resolves to 10px | 10 | Data-dense table cells, eyebrows, dense badges. Replaces `text-[10px]` and `text-[9px]`. |
| `text-xs` | 12px | 12 | Default body in dense panels; small buttons, badges, secondary labels. Replaces `text-[11px]`. |
| `text-sm` | 14px | 14 | Default body, form inputs, primary labels. |
| `text-base` | 16px | 16 | Panel titles, dialog body. |
| `text-lg` / `text-3xl` (display) | 18 / 30 | 18 / 30 | View headers and dashboard hero numbers. Keep both, but only via `Heading` / `ViewHeader`. |

Mapping (rough volumes):

- `text-[9px]` (40) → `text-2xs`. Eyeball each: most are 9-vs-10 by accident.
- `text-[8px]` (1) → `text-2xs`.
- `text-[10px]` (253) → `text-2xs`.
- `text-[11px]` (35) → `text-xs`.
- Keep `text-xs` (358), `text-sm` (129).
- `text-base` (3), `text-lg` (2), `text-2xl` (1), `text-3xl` (4) — leave but route via `Heading`/`ViewHeader`.

Add `text-2xs` as a Tailwind theme extension (10px / line-height 14px) in `frontend/tailwind.config.cjs`. This single addition removes 294 arbitrary values.

### 3.3 Spacing policy

Standardize gap/space scale on **4 values**:

| Token | Class | Usage |
|---|---|---|
| tight | `gap-1` / `space-y-1` | Inline icon+label, dense lists. |
| default | `gap-2` / `space-y-2` | Form fields, button rows. |
| section | `gap-3` / `space-y-3` | Form sections, card content. |
| panel | `gap-4` / `space-y-4` | Panel-level vertical rhythm. |

Migrate: `gap-0.5` (26) → `gap-1`; `gap-1.5` (52) → `gap-1` or `gap-2` per call site; `gap-2.5` (3) → `gap-2`; `gap-8` (6) → `gap-4` unless intentional hero spacing.

## 4. Refactor plan — phased

Each phase ships as one PR. The user reviews. No phase blocks the previous one being merged.

### Phase 1 — Foundations + Badge + Heading (safe, mostly additive)

Scope:
- Add `text-2xs` utility to `frontend/tailwind.config.cjs`.
- Add `components/common/Badge.tsx` (variants: neutral/success/warning/danger/info/tag; size sm/md; shape pill/square).
- Add `components/common/Heading.tsx` (levels: eyebrow/panel/section/sub).
- Add `components/common/StateMessage.tsx` (kind: loading/empty/error).
- Extend `Button.tsx` with `size="xs"`, `shape="pill"`, `iconOnly` prop. Keep all existing call shapes working.
- Add a short `docs/ui-primitives.md` cheat-sheet (one screen).

Files touched: 4 new common components, 1 tailwind config, 1 Button extension, 1 doc.

Risk: very low. Nothing existing changes visually.

Estimate: 0.5 day.

### Phase 2 — Mechanical sweeps (safe, large diff)

Scope:
- Codemod-style sweep replacing arbitrary font-sizes with the new tokens (the 4 mappings in §3.2). ~330 replacements.
- Codemod-style sweep on radii (the 4 mappings in §3.1). ~100 replacements.
- Tag chip migration in the 5 files listed in §2.2(a) to use `Badge variant="tag"`.
- Status badge migration in the 8 files in §2.2(b) to `Badge` with semantic variant.
- Empty/loading replacement in the ~15 inline call sites identified in §2.5 to `StateMessage`.
- Adopt `Heading` in the 20 distinct heading patterns; each tab gets exactly one of (eyebrow/panel/section/sub).

Files touched: ~50.

Risk: low-medium. Sweeps are mechanical but visual regressions are easy; require visual check on each tab (settings tabs, customers panels, knowledge, kanban, calendar, tray).

Estimate: 1-1.5 days, dominated by manual visual review per panel.

### Phase 3 — Button consolidation

Scope:
- Migrate raw `<button>` usages to `Button` across the ~75 in-scope files. Group by area:
  - settings/* (13 files) — biggest, mostly `secondary` + `ghost`.
  - customers/* (8 files) — primary + secondary + danger.
  - clock/* and kanban/* (10 files) — pills via new `shape="pill"`.
  - tray/* (3 files) — pills, iconOnly.
  - knowledge/*, inbox/*, nav/*, common/* — toolbar buttons, mostly `ghost iconOnly`.
- Retire `actionBtnCls` from `styles/formStyles.ts`; replace its 2 callers with `<Button variant="secondary" size="xs">`.

Risk: medium. Per-file visual review needed. Suggested ordering: tray (small, isolated) → settings (most uniform) → customers → clock/kanban → knowledge → nav → common.

Estimate: 2-3 days; chunk into 3 sub-PRs by area to keep diffs reviewable.

### Phase 4 — Toggle + ToggleField unification

Scope:
- Replace inline `role="switch"` in `settings/CalDavSection.tsx` with `Toggle`.
- Audit the 6 files using `type="checkbox"`; convert those that are boolean settings (not multi-select) to `Toggle`.
- Add `ToggleField` (label + description + Toggle row) and adopt in every `settings/*Tab.tsx` row that pairs a label with a toggle. Likely ~15 rows.
- Adopt `inputCls` / `smallInputCls` in the remaining ~6 in-scope `<input` files identified in §2.6; verify `common/SearchInput.tsx` and autocompletes delegate to `inputCls` internally.

Files touched: ~12.

Risk: low. Toggle component is stable; risk is per-call-site UX (labels, descriptions).

Estimate: 0.75 day.

### Phase 5 — Dialog shell (optional, larger scope)

Scope:
- Introduce `components/common/Dialog.tsx` and `Popover.tsx` shells (overlay, focus trap, escape, scroll lock).
- Migrate the 13 dialog/popover files in §2.7 one at a time. Easiest first: `WhatsNewDialog`, `HelpButton`, `ContentPopup`, `LinkPopover`. Hardest last: `CommandBar`, `CommandPalette`.

Risk: medium-high (keyboard + focus regressions are easy to miss).

Estimate: 2-3 days, split across multiple PRs. **Recommend deferring** until phases 1-4 land and team has bandwidth.

## 5. NO list — do not touch

Treat the following as out-of-scope for the entire programme unless the user explicitly opts each in:

- **Calendar integration chips with brand colours** — `components/calendar-panel/calendarColors.ts`, `SourceBadges.tsx`, `EventTile.tsx`. These deliberately use per-provider hues. Do not route through `Badge`'s semantic variants.
- **Knowledge editor CodeMirror chrome** — `components/knowledge/EditorPanel.tsx` editor surface, gutters, line numbers. These follow the `--code-*` vars and CodeMirror's own theming.
- **Anything calendar-specific shipped in PR #137** — `components/calendar-panel/*` (CalendarPanel, MonthGrid, WeekGrid, DayGrid, EventTile, EventPopover, BookFromEventDialog) is frozen for this programme. Calendar tile sizing, week-grid spacing, event tile radii are intentional.
- **Command bar + command palette internals** — `components/commandBar/CommandBar.tsx`, `components/commandPalette/CommandPalette.tsx`. Bespoke layouts; only swap obvious badges/buttons if they don't break keyboard nav.
- **Tray pixel-precise sizing** — `tray/TrayPanel.tsx` (panel chrome). The tray window has a fixed width and is sensitive to row height; touch inner content but not the panel shell.
- **Avatar + `PixelAvatar`** — `components/common/PixelAvatar.tsx`. Pixel-art renderer, owns its own sizing.
- **Markdown rendering** — `components/common/Markdown.tsx`. Prose styling lives there; not part of the system primitives.
- **Theme presets and CSS vars** — `frontend/src/index.css`. Add `text-2xs` to tailwind config only; do not edit theme vars.
- **Toast styling** — `context/ToastContext.tsx`. Already coherent; revisit only if a status colour is wrong.

## 6. Execution checklist (punch list)

A reviewer can run this top-to-bottom:

- [ ] Phase 1: open PR adding `text-2xs`, `Badge`, `Heading`, `StateMessage`, `Button` xs/pill/iconOnly, `docs/ui-primitives.md`. Visual check: no diff to existing screens.
- [ ] Phase 2a: font-size sweep PR. Visual review per tab.
- [ ] Phase 2b: radius sweep PR. Visual review per tab.
- [ ] Phase 2c: chips/badges/headings/empty-states adoption PR.
- [ ] Phase 3a: tray Button migration.
- [ ] Phase 3b: settings/* Button migration; retire `actionBtnCls`.
- [ ] Phase 3c: customers/* + clock/* + kanban/* Button migration.
- [ ] Phase 3d: knowledge/* + nav/* + common/* + inbox/* Button migration.
- [ ] Phase 4: Toggle/ToggleField + remaining input adoption.
- [ ] Phase 5 (optional, deferred): Dialog/Popover shell migration in 3 sub-PRs.

After each phase, take screenshots of: settings (each tab), customers (cards + invoice panel), kanban board, knowledge sidebar, clock list, dashboard, tray, calendar panel — and diff against the pre-phase baseline.
