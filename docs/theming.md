# Theming

Kaisho's desktop UI is themed entirely through CSS custom
properties. To add or modify a theme, edit one block in
`frontend/src/index.css` — no component changes required.

## How it works

Three layers, no others:

1. **Tokens** (`frontend/src/index.css`). CSS custom
   properties grouped by intent: `--surface-*`,
   `--border-*`, `--text-*`, `--status-*`, `--cta*`.
   Each theme is one `[data-theme="<name>"]` block that
   redefines every token.

2. **Tailwind utilities** (`frontend/tailwind.config.cjs`).
   The `theme.extend.colors` object exposes each token
   as a Tailwind colour, so `bg-surface-card`,
   `text-fg-strong`, `border-strong`, etc. all resolve
   at runtime via `var(--…)`.

3. **Components**. Every component uses semantic class
   names (`text-fg-muted`, `bg-surface-raised`) — never
   raw colour scales like `text-stone-700` or
   `bg-zinc-100`. This is the rule that makes the
   token system actually pay off.

## The token catalog

| Layer | Tokens | Tailwind class |
|---|---|---|
| Surface | `--surface-base / --surface-card / --surface-raised / --surface-overlay` | `bg-surface-{base,card,raised,overlay}` |
| Border | `--border-subtle / --border-default / --border-strong` | `border-{subtle,DEFAULT,strong}` |
| Foreground | `--text-primary / --text-secondary / --text-tertiary / --text-muted / --text-disabled` | `text-fg-strong / text-fg / text-fg-muted / text-fg-subtle / text-fg-disabled` |
| Status | `--status-success / --status-warning / --status-danger / --status-info` | `text-success / bg-warning / ...` |
| Action | `--cta / --cta-hover / --cta-muted` | `bg-cta / hover:bg-cta-hover / bg-cta-muted` |

### Foreground intent guide

- `text-fg-strong` — titles, headings, primary emphasis.
- `text-fg` — body default. Use for most regular text.
- `text-fg-muted` — secondary text, captions, helper
  copy, deselected nav.
- `text-fg-subtle` — placeholder text, metadata dots,
  timestamps.
- `text-fg-disabled` — read-only / ghosted controls.

## Built-in presets

!!! version-added "Since 2.2.0"

The preset roster expanded from 4 to 12 in 2.2.0. Each mode now
ships 6 presets:

| Preset | Mode | Description |
|---|---|---|
| `zinc` | light | True-neutral grey (default). |
| `sepia` | light | Warm cream paper, sepia ink. |
| `solarized-light` | light | Ethan Schoonover's Solarized Light. |
| `github` | light | GitHub light, cool blue-grey. |
| `gruvbox-light` | light | Gruvbox light, warm beige. |
| `latte` | light | Catppuccin Latte. |
| `zinc` | dark | True-neutral dark (default). |
| `solarized` | dark | Ethan Schoonover's Solarized Dark. |
| `dracula` | dark | Dracula, deep purple-grey. |
| `nord` | dark | Nord, cool arctic blue. |
| `tokyo-night` | dark | Tokyo Night, indigo accent. |
| `mocha` | dark | Catppuccin Mocha. |

The active preset is picked from `localStorage`:

- `themeLight` → which light preset to use (any from the light
  rows above)
- `themeDark` → which dark preset to use (any from the dark rows
  above)

Settings → Appearance exposes both as dropdowns alongside the
mode picker and the font picker (added in 2.2.0; choose between
Inter, JetBrains Mono and a system stack). Changing a value writes to
`localStorage` and dispatches a `kaisho-theme-changed`
custom event so the running app re-themes without a
reload.

## Theme selection

Three modes, stored under `localStorage.theme`:

- `"light"` — force light.
- `"dark"` — force dark.
- `"system"` — follow the OS preference via
  `matchMedia("(prefers-color-scheme: dark)")`. The app
  subscribes to media-query change events while in this
  mode, so flipping macOS Light/Dark from System Settings
  re-themes the app live without a reload.

The header sun/moon/monitor button cycles
`light → dark → system → light`. Defaults to `"system"`
on first launch.

In components, branch on `resolvedTheme` (concrete
`"dark" | "light"`) rather than the stored `theme`
(which may be `"system"`).

## Adding a new theme

Add one block to `index.css`:

```css
[data-theme="sepia"] {
  --surface-base:    #f5efe3;
  --surface-card:    #fbf6ea;
  --surface-raised:  #efe6d2;
  --surface-overlay: #d9cfb5;

  --border-subtle:  rgba(80, 50, 0, 0.05);
  --border-default: rgba(80, 50, 0, 0.10);
  --border-strong:  rgba(80, 50, 0, 0.20);

  --text-primary:   #3b2e1f;
  --text-secondary: #5a4a36;
  --text-tertiary:  #7a6b54;
  --text-muted:     #a59679;
  --text-disabled:  #cabd9f;

  --status-success: #2e7d32;
  --status-warning: #b8860b;
  --status-danger:  #b22222;
  --status-info:    #1565c0;

  --cta:       #3b2e1f;
  --cta-hover: #5a4a36;
  --cta-muted: #efe6d2;

  --body-bg:    #f5efe3;
  --body-color: #3b2e1f;
}
```

Then flip the active theme:

```js
document.documentElement.setAttribute("data-theme", "sepia");
```

Every component reflows automatically because each Tailwind
utility resolves to the matching `var(--…)`.

## The two unavoidable exceptions

Some styling cannot be expressed as a Tailwind utility and
lives as an element override at the bottom of `index.css`:

- **CTA text inversion in dark mode.** `bg-cta` flips to a
  light surface in dark, so the foreground (often written
  as `text-white` by the author) needs to be re-darkened.
- **Toggle switch active track.** ARIA-driven selector
  (`[role="switch"][aria-checked="true"]`) can't be reached
  from a className.

Add new exceptions sparingly. If a rule can be a token, it
should be a token.

## What to avoid

- **Raw colour scales in components.** `text-stone-700`,
  `bg-zinc-100`, `border-stone-300` — these resolve to a
  baked hex and ignore the active theme. Use the semantic
  utility instead.
- **`dark:` prefixes for foreground/surface tokens.** The
  underlying CSS var already changes per theme, so the
  `dark:` variant is dead weight (and a footgun if the two
  diverge).
- **Theme assumptions in JS.** Don't read `getComputedStyle`
  to pick a tint — let the CSS cascade do the work.

## Status colours (`text-success` / `text-danger` / …)

Use these for state-bearing UI: success banners, danger
buttons, warning chips. They're tuned per-theme — light
mode uses saturated mid-tone hex; dark mode uses lighter
variants that read on the near-black surface.
