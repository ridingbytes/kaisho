# Kaisho Rebrand Implementation Guide

This document describes every change needed to rebrand
OmniControl to Kaisho and migrate the UI from the current
dark indigo theme to the Graphite Lavender palette.

Apply changes in the order listed. Each section is
self-contained.


## Brand

**Name:** Kaisho (Kanban + AI + Shell + Organizer)
**Domain:** kaisho.dev
**CLI command:** `kai` (replaces `oc`)
**Logo:** Chevron Dot (see brand/ folder for SVG files)


## Logo Files

The `brand/` folder contains four SVG files:

- `kaisho-logo.svg` — icon mark, dark (#1e1e2e), for
  light backgrounds
- `kaisho-logo-light.svg` — icon mark, light (#fafafe),
  for dark backgrounds
- `kaisho-wordmark.svg` — full "KAISHO" text, dark
- `kaisho-wordmark-light.svg` — full "KAISHO" text, light

Copy `kaisho-logo.svg` to `frontend/public/` and update
`frontend/index.html` to reference it as favicon.

The logo is a terminal chevron `>` followed by a dot. It
represents "Execute. Result."


---


## Design Philosophy: Graphite Lavender

Light canvas with a subtle violet-gray undertone. The warm
graphite text (#1e1e2e) has a purple tint that separates it
from generic gray UIs. Labels use #4a4b65 (secondary) and
#6e7191 (tertiary) which both have strong contrast against
the near-white surfaces. The palette feels creative yet
professional — elegant understatement.

The accent/CTA color is the darkest graphite (#1e1e2e).
Interactive elements (buttons, active nav, focus rings) use
this near-black. Status colors (green, amber, red, blue,
violet) remain the only chromatic elements.


---


## Step 1: Replace CSS Variables in index.css

Open `frontend/src/index.css`.

Replace the entire `:root { ... }` block (lines 9-38) with:

```css
:root {
  /* Surfaces — Graphite Lavender (light default) */
  --surface-base:    #fafafc;
  --surface-card:    #ffffff;
  --surface-raised:  #f3f3f8;
  --surface-overlay: #e4e4ec;

  /* Borders */
  --border-subtle:  rgba(0, 0, 0, 0.05);
  --border-default: rgba(0, 0, 0, 0.10);
  --border-strong:  rgba(0, 0, 0, 0.18);

  /* Accent — Graphite (dark, no hue conflict) */
  --accent:       #1e1e2e;
  --accent-hover: #33334d;
  --accent-muted: rgba(30, 30, 46, 0.06);

  /* Shadows */
  --shadow-card:      0 1px 3px rgba(0,0,0,0.05),
                      0 1px 2px rgba(0,0,0,0.03);
  --shadow-card-hover:0 4px 12px rgba(0,0,0,0.08),
                      0 2px 4px rgba(0,0,0,0.04);
  --shadow-card-drag: 0 20px 40px rgba(0,0,0,0.10),
                      0 8px 16px rgba(0,0,0,0.06);

  /* Body */
  --body-bg:    #fafafc;
  --body-color: #1e1e2e;

  /* Scrollbar */
  --scrollbar-thumb:       rgba(0, 0, 0, 0.10);
  --scrollbar-thumb-hover: rgba(0, 0, 0, 0.22);
}
```

Replace the `[data-theme="light"] { ... }` block (lines
40-69) with a dark theme block. Change the SELECTOR from
`[data-theme="light"]` to `[data-theme="dark"]` AND replace
all values:

```css
[data-theme="dark"] {
  /* Surfaces — dark companion of Graphite Lavender */
  --surface-base:    #16161e;
  --surface-card:    #1e1e2e;
  --surface-raised:  #2a2a3d;
  --surface-overlay: #36364d;

  /* Borders */
  --border-subtle:  rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.10);
  --border-strong:  rgba(255, 255, 255, 0.18);

  /* Accent — light for dark bg */
  --accent:       #e4e4ec;
  --accent-hover: #fafafc;
  --accent-muted: rgba(228, 228, 236, 0.08);

  /* Shadows */
  --shadow-card:      0 1px 3px rgba(0,0,0,0.4),
                      0 1px 2px rgba(0,0,0,0.3);
  --shadow-card-hover:0 4px 12px rgba(0,0,0,0.5),
                      0 2px 4px rgba(0,0,0,0.3);
  --shadow-card-drag: 0 20px 40px rgba(0,0,0,0.6),
                      0 8px 16px rgba(0,0,0,0.4);

  /* Body */
  --body-bg:    #16161e;
  --body-color: #e4e4ec;

  /* Scrollbar */
  --scrollbar-thumb:       rgba(255, 255, 255, 0.12);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.22);
}
```

IMPORTANT: the default (`:root`) is now LIGHT mode. Dark
mode is activated via `[data-theme="dark"]`. This is the
opposite of the current setup where dark is default.


### Light theme text overrides section

Replace the entire "LIGHT THEME — text colour overrides"
section. This is the block that starts with
`[data-theme="light"] .text-slate-200` at around line 123
and ends with the `bg-red-900\/40` rule at around line 142.

Delete that entire block and replace it with:

```css
/* Dark theme — text colour overrides.
   The default (light) mode uses literal Tailwind stone-*
   values which are dark-on-light. For dark mode we remap
   them to light-on-dark equivalents. */

[data-theme="dark"] .text-stone-900,
[data-theme="dark"] .text-stone-800 { color: #e4e4ec; }
[data-theme="dark"] .text-stone-700  { color: #c4c4d0; }
[data-theme="dark"] .text-stone-600  { color: #8b8fa3; }
[data-theme="dark"] .text-stone-500  { color: #6e7191; }
[data-theme="dark"] .text-stone-400  { color: #4a4b65; }

[data-theme="dark"] .hover\:text-stone-900:hover,
[data-theme="dark"] .hover\:text-stone-800:hover { color: #fafafc; }
[data-theme="dark"] .hover\:text-stone-700:hover  { color: #e4e4ec; }

[data-theme="dark"] .placeholder-stone-500::placeholder { color: #4a4b65; }

/* Status colours — brighter variants for dark bg */
[data-theme="dark"] .text-green-400   { color: #4ade80; }
[data-theme="dark"] .text-yellow-400  { color: #fbbf24; }
[data-theme="dark"] .text-red-400     { color: #f87171; }
[data-theme="dark"] .bg-green-900\/40  { background-color: rgba(22, 163, 74, 0.15); }
[data-theme="dark"] .bg-yellow-900\/40 { background-color: rgba(217, 119, 6, 0.15); }
[data-theme="dark"] .bg-red-900\/40    { background-color: rgba(220, 38, 38, 0.15); }
```


---


## Step 2: Tailwind Config

No structural changes to `frontend/tailwind.config.cjs`.
The config references CSS variable names (`--accent`,
`--accent-hover`, `--accent-muted`, etc.) which stay the
same. Only their values changed in index.css above.
No file edit needed here.


---


## Step 3: Bulk Replace Tailwind Classes

In ALL `.tsx` files under `frontend/src/`, do these
find-and-replace operations. These are literal string
replacements, NOT regex. Process them in this exact order
to avoid double-replacements:

| Find                   | Replace               |
|------------------------|-----------------------|
| `text-slate-200`       | `text-stone-900`      |
| `text-slate-300`       | `text-stone-800`      |
| `text-slate-400`       | `text-stone-700`      |
| `text-slate-500`       | `text-stone-600`      |
| `text-slate-600`       | `text-stone-500`      |
| `text-slate-700`       | `text-stone-400`      |
| `hover:text-slate-200` | `hover:text-stone-900` |
| `hover:text-slate-300` | `hover:text-stone-800` |
| `hover:text-slate-400` | `hover:text-stone-700` |
| `bg-slate-`            | `bg-stone-`           |
| `border-slate-`        | `border-stone-`       |
| `placeholder-slate-`   | `placeholder-stone-`  |

WHY THE MAPPING IS INVERTED: the old design was dark-first,
so `text-slate-200` meant "bright text on dark background".
The new design is light-first, so we need "dark text on
light background" which is `text-stone-900`. The number
scale flips.

Do NOT replace `slate` inside hex color strings like
`#64748b`. Only replace Tailwind class names that start
with `text-slate-`, `bg-slate-`, `border-slate-`, or
`placeholder-slate-`.

IMPORTANT: After this replacement, verify that key
components still read well. The most important text
classes and what they become:

- Headings / primary text: `text-stone-900` (#1c1917)
  — near-black, strong contrast on #fafafc base
- Body / secondary text: `text-stone-800` (#292524)
  — dark, very readable
- Labels / tertiary text: `text-stone-700` (#44403c)
  — clear contrast, not washed out
- Muted / captions: `text-stone-600` (#57534e)
  — still readable against white cards
- Placeholders: `text-stone-500` (#78716c)
  — intentionally lighter, for inactive elements
- Disabled text: `text-stone-400` (#a8a29e)
  — faint, for truly disabled elements


---


## Step 4: Update Default Task State Colors

In the file that defines default task states (search for
the array containing `TODO`, `NEXT`, `IN-PROGRESS`, `WAIT`,
`DONE`, `CANCELLED` with color hex values), update:

| State       | Old color | New color |
|-------------|-----------|-----------|
| TODO        | `#64748b` | `#64748b` | (no change)
| NEXT        | `#3b82f6` | `#2563eb` |
| IN-PROGRESS | `#f59e0b` | `#d97706` |
| WAIT        | `#8b5cf6` | `#7c3aed` |
| DONE        | `#10b981` | `#16a34a` |
| CANCELLED   | `#ef4444` | `#dc2626` |

Reason: shifted one step deeper (-500 to -600) for better
contrast on white card surfaces.


---


## Step 5: Update Hardcoded Colors in Components

### DashboardView.tsx

Search for these hardcoded hex values and replace:

| Find      | Replace   | Context                    |
|-----------|-----------|----------------------------|
| `#6366f1` | `#1e1e2e` | StatCard accent color      |
| `#f59e0b` | `#d97706` | Amber stat/budget color    |
| `#ef4444` | `#dc2626` | Red budget bar color       |
| `#10b981` | `#16a34a` | Green budget bar color     |

The fallback color `#64748b` stays unchanged.


### CustomerCard.tsx

Same status color replacements in the usedColor() and
contractBarColor() functions:

| Find      | Replace   |
|-----------|-----------|
| `#ef4444` | `#dc2626` |
| `#f59e0b` | `#d97706` |
| `#10b981` | `#16a34a` |


---


## Step 6: Theme Default

The app currently defaults to dark mode. Change the default
to light mode.

Search for where `data-theme` is initialized from
localStorage. The code will look something like:
`localStorage.getItem("theme") || "dark"` or
`useState("dark")`. Change the fallback from `"dark"` to
`"light"`.

The theme toggle must still work. Users who prefer dark
mode can switch to it and their preference persists in
localStorage.


---


## Step 7: CLI Rename

### Backend (Python)

1. In `omnicontrol/cli/main.py`, find the Click group or
   entry point definition. Change the program name from
   `oc` to `kai`.

2. In `pyproject.toml` (or `setup.cfg`), find the
   `[project.scripts]` or `[console_scripts]` section.
   Change `oc = omnicontrol.cli.main:cli` to
   `kai = omnicontrol.cli.main:cli`.

3. Update any help text or usage strings that reference
   `oc` to say `kai`.

### Frontend

1. In `frontend/index.html`, update the `<title>` tag
   to "Kaisho".

2. Copy `brand/kaisho-logo.svg` to `frontend/public/`
   and update the favicon `<link>` to reference it.

3. In the Sidebar component, update the app name text
   from "OmniControl" (or "OC") to "KAISHO" or "Kaisho".


---


## Step 8: Update CLI Help and Docs

Search all Python files for references to "OmniControl",
"omnicontrol", or "oc " (with trailing space) in docstrings,
help text, and comments. Replace with "Kaisho" / "kai".

Do NOT rename the Python package directory
`omnicontrol/` itself. The internal package name stays
as-is to avoid import breakage.


---


## Color Reference Card

### Surfaces (light default)

```
Base:    #fafafc  (page background — cool off-white)
Card:    #ffffff  (card/sidebar background)
Raised:  #f3f3f8  (kanban columns, hover states)
Overlay: #e4e4ec  (dropdown backgrounds, overlays)
```

### Text Hierarchy (light mode)

These are the effective colors when using Tailwind stone-*
classes on the Graphite Lavender palette:

```
stone-900: #1c1917  — headings, primary text
stone-800: #292524  — strong body text
stone-700: #44403c  — secondary text, labels
stone-600: #57534e  — tertiary text, captions
stone-500: #78716c  — muted, placeholders
stone-400: #a8a29e  — disabled text
```

All of these have strong contrast against the #fafafc base
and #ffffff card surfaces.

### Accent / Interactive (navy-graphite)

```
Accent:       #1e1e2e  (buttons, active nav, links, logo)
Accent hover: #33334d  (button/link hover)
Accent muted: rgba(30, 30, 46, 0.06)  (active nav bg tint)
```

### Borders

```
Subtle:  rgba(0, 0, 0, 0.05)
Default: rgba(0, 0, 0, 0.10)
Strong:  rgba(0, 0, 0, 0.18)
```

### Status Colors (same in light and dark)

```
Green:   #16a34a  — done, healthy budget (<80%)
Amber:   #d97706  — in progress, warning budget (80-99%)
Red:     #dc2626  — cancelled, over budget (100%+)
Blue:    #2563eb  — next
Violet:  #7c3aed  — waiting
Slate:   #64748b  — todo, default/fallback
```

### Status Background Tints (8% opacity)

```
Green bg:  rgba(22, 163, 74, 0.08)
Amber bg:  rgba(217, 119, 6, 0.08)
Red bg:    rgba(220, 38, 38, 0.08)
Blue bg:   rgba(37, 99, 235, 0.08)
Violet bg: rgba(124, 58, 237, 0.08)
Slate bg:  rgba(100, 116, 139, 0.08)
```

### Suggested Default Tag Colors

```
deploy:   #2563eb   frontend: #0891b2
review:   #7c3aed   backend:  #4f46e5
urgent:   #b45309   docs:     #0d9488
design:   #9333ea   misc:     #64748b
```
