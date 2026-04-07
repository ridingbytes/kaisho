# Kaisho Design Specification

Authoritative design system reference. All values reflect the
actual implementation in `frontend/src/index.css` and
`frontend/tailwind.config.cjs`.

**Kaisho** = **K**anban + **AI** + **Sh**ell + **O**rganizer
Domain: kaisho.dev | CLI: `kai`


## 1. Brand Assets

Logo files in `logos/` (canonical) and `product/website/`:

| File                       | Usage                     |
|----------------------------|---------------------------|
| `kaisho-logo.svg`          | Icon mark (dark on light) |
| `kaisho-logo-light.svg`    | Icon mark (light on dark) |
| `kaisho-wordmark.svg`      | Full wordmark (dark)      |
| `kaisho-wordmark-light.svg`| Full wordmark (light)     |

The logo is a **chevron + dot**. The chevron represents a CLI
command prompt, the dot represents the result. Story:
"Execute. Result."

The logo contains no color. It uses the current theme's text
color (`--text-primary` / `#1e1e2e` light, `#e4e4ec` dark).

### Brand Rules

- Logo is always monochrome (uses current text color)
- Never add color to the logo
- Minimum clear space: 1x the dot diameter on all sides
- Minimum display size: 16x16px
- Wordmark uses Inter Bold, tracking 0.06em, all-caps
- The chevron-dot can be used standalone on marketing
- Written as "Kaisho" in prose, "KAISHO" in the wordmark


## 2. Color System: Graphite Lavender

Light-first palette with a cool violet-gray undertone. The
UI itself is neutral. Status colors (green, amber, red, blue,
violet) are the ONLY chromatic elements. This ensures kanban
columns, tags, and budget bars always stand out.


### 2.1 Surfaces

| Token              | Light     | Dark      |
|--------------------|-----------|-----------|
| `--surface-base`   | `#fafafc` | `#16161e` |
| `--surface-card`   | `#ffffff` | `#1e1e2e` |
| `--surface-raised` | `#f3f3f8` | `#2a2a3d` |
| `--surface-overlay`| `#e4e4ec` | `#36364d` |


### 2.2 Text

| Token              | Light     | Dark      |
|--------------------|-----------|-----------|
| `--text-primary`   | `#1e1e2e` | `#e4e4ec` |
| `--text-secondary` | `#3d3d5c` | `#c4c4d4` |
| `--text-tertiary`  | `#5c5c8a` | `#9898b4` |
| `--text-muted`     | `#8888aa` | `#6868a0` |
| `--text-disabled`  | `#b4b4cc` | `#484878` |


### 2.3 Tailwind Stone Remapping

Tailwind's `stone-*` classes bake in warm brown hex values.
We override them with cool lavender-gray equivalents via CSS
rules in `index.css` (non-layered, so they beat Tailwind).

**Light mode (default):**

| Tailwind Class     | Remapped To | Role              |
|--------------------|-------------|-------------------|
| `text-stone-900`   | `#1e1e2e`   | Headings, primary |
| `text-stone-800`   | `#1e1e2e`   | Strong body       |
| `text-stone-700`   | `#4a4b65`   | Secondary, labels |
| `text-stone-600`   | `#6e7191`   | Tertiary, captions|
| `text-stone-500`   | `#8b8fa3`   | Muted, placeholders|
| `text-stone-400`   | `#b4b4cc`   | Disabled          |

**Dark mode** (`[data-theme="dark"]`):

| Tailwind Class     | Remapped To | Role              |
|--------------------|-------------|-------------------|
| `text-stone-900`   | `#e4e4ec`   | Headings, primary |
| `text-stone-800`   | `#e4e4ec`   | Strong body       |
| `text-stone-700`   | `#c4c4d0`   | Secondary         |
| `text-stone-600`   | `#8b8fa3`   | Tertiary          |
| `text-stone-500`   | `#6e7191`   | Muted             |
| `text-stone-400`   | `#4a4b65`   | Disabled          |


### 2.4 Borders

| Token              | Light                    | Dark                     |
|--------------------|--------------------------|--------------------------|
| `--border-subtle`  | `rgba(0,0,0,0.05)`      | `rgba(255,255,255,0.06)` |
| `--border-default` | `rgba(0,0,0,0.10)`      | `rgba(255,255,255,0.10)` |
| `--border-strong`  | `rgba(0,0,0,0.18)`      | `rgba(255,255,255,0.18)` |


### 2.5 Interactive / CTA

No accent hue. CTAs use the darkest text color. This keeps
the UI free from color competition with status indicators.

| Token              | Light                    | Dark                     |
|--------------------|--------------------------|--------------------------|
| `--cta`            | `#1e1e2e`                | `#e4e4ec`                |
| `--cta-hover`      | `#33334d`                | `#fafafc`                |
| `--cta-muted`      | `#f0f0f8`                | `rgba(228,228,236,0.08)` |


### 2.6 Shadows

| Token               | Light                                                     | Dark                                                      |
|----------------------|-----------------------------------------------------------|-----------------------------------------------------------|
| `--shadow-card`      | `0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03)`   | `0 1px 3px rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.3)`     |
| `--shadow-card-hover`| `0 4px 12px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.04)`  | `0 4px 12px rgba(0,0,0,.5), 0 2px 4px rgba(0,0,0,.3)`    |
| `--shadow-card-drag` | `0 20px 40px rgba(0,0,0,.08), 0 8px 16px rgba(0,0,0,.05)`| `0 20px 40px rgba(0,0,0,.6), 0 8px 16px rgba(0,0,0,.4)`  |


### 2.7 Dark Mode Toggle Switch

The toggle track uses `#6868a0` (mid-lavender) so the white
knob stays visible and the active state reads as "on".


## 3. Status Colors

These are the ONLY chromatic colors in the UI. Used for task
states, budget bars, tags, and feedback. Same in light and
dark mode.


### 3.1 Task States

| State       | Hex       | Tailwind   | Background Tint         |
|-------------|-----------|------------|-------------------------|
| Todo        | `#64748b` | slate-500  | `rgba(100,116,139,.08)` |
| Next        | `#2563eb` | blue-600   | `rgba(37,99,235,.08)`   |
| In Progress | `#d97706` | amber-600  | `rgba(217,119,6,.08)`   |
| Waiting     | `#7c3aed` | violet-600 | `rgba(124,58,237,.08)`  |
| Done        | `#16a34a` | green-600  | `rgba(22,163,74,.08)`   |
| Cancelled   | `#dc2626` | red-600    | `rgba(220,38,38,.08)`   |

All status colors use the Tailwind -600 step for strong
contrast on white card surfaces. The Graphite Lavender base
makes -500 colors appear slightly washed out.


### 3.2 Budget Bars

| Condition | Color     | Token            |
|-----------|-----------|------------------|
| < 80%     | `#16a34a` | `--status-green` |
| 80-99%    | `#d97706` | `--status-amber` |
| >= 100%   | `#dc2626` | `--status-red`   |


### 3.3 Dashboard Stat Cards

Stat card icons use the relevant status color:

| Stat Card    | Color     | Reason          |
|--------------|-----------|-----------------|
| Open Tasks   | `#1e1e2e` | CTA color       |
| Inbox Items  | `#d97706` | Amber = pending |
| Active Timer | `#16a34a` | Green = running |
| Budget Alert | `#dc2626` | Red = attention |

Fallback icon color: `#64748b` (slate-500).


### 3.4 Dark Mode Status Brightening

Status text on dark backgrounds uses brighter variants:

| Class            | Dark Value |
|------------------|------------|
| `.text-green-400` | `#4ade80` |
| `.text-yellow-400`| `#fbbf24` |
| `.text-red-400`   | `#f87171` |

Status backgrounds on dark use 15% opacity (vs 8% on light).


### 3.5 Default Tag Colors

Tags are user-configurable. Recommended defaults:

| Tag      | Hex       | Tailwind   |
|----------|-----------|------------|
| deploy   | `#2563eb` | blue-600   |
| review   | `#7c3aed` | violet-600 |
| frontend | `#0891b2` | cyan-600   |
| backend  | `#4f46e5` | indigo-600 |
| urgent   | `#b45309` | amber-700  |
| docs     | `#0d9488` | teal-600   |
| design   | `#9333ea` | purple-600 |
| misc     | `#64748b` | slate-500  |


## 4. Typography

| Property    | Value                              |
|-------------|------------------------------------|
| Font family | Inter, system-ui, sans-serif       |
| Mono family | SF Mono, Fira Code, Consolas, mono |
| Weights     | 300, 400, 500, 600, 700            |
| Base size   | 14px                               |
| Smoothing   | antialiased                        |


## 5. Tailwind Config

The `tailwind.config.cjs` extends the default config with
CSS variable references. No hardcoded hex values in the config.

```javascript
colors: {
  surface: {
    base:    "var(--surface-base)",
    card:    "var(--surface-card)",
    raised:  "var(--surface-raised)",
    overlay: "var(--surface-overlay)",
  },
  border: {
    subtle:  "var(--border-subtle)",
    DEFAULT: "var(--border-default)",
    strong:  "var(--border-strong)",
  },
  cta: {
    DEFAULT: "var(--cta)",
    hover:   "var(--cta-hover)",
    muted:   "var(--cta-muted)",
  },
}
```

Box shadows also reference CSS variables:

```javascript
boxShadow: {
  card:        "var(--shadow-card)",
  "card-hover": "var(--shadow-card-hover)",
  "card-drag":  "var(--shadow-card-drag)",
}
```


## 6. Theme Default

The app defaults to light mode. Users can toggle to dark mode
via the Sun/Moon button in the header. Preference persists in
`localStorage` under the key `"theme"`.

Light mode: no `data-theme` attribute on `<html>`.
Dark mode: `data-theme="dark"` on `<html>`.
