# UI primitives

One-screen cheat sheet for the shared frontend components.
Authors should reach for these before hand-rolling a
className string. The full programme that drove these
choices is in `ui-design-system-plan.md`.

## Colour / typography tokens

Defined in `frontend/tailwind.config.cjs` + per-theme in
`frontend/src/index.css`.

| Class | Use |
|---|---|
| `text-fg-strong` | titles, emphasis |
| `text-fg` | body default |
| `text-fg-muted` | secondary copy, captions |
| `text-fg-subtle` | placeholders, metadata |
| `text-fg-disabled` | ghosted controls |
| `text-success` / `text-warning` / `text-danger` / `text-info` | status copy |
| `bg-surface-base` / `-card` / `-raised` / `-overlay` | layered surfaces |
| `border-subtle` / `border` / `border-strong` | per-intensity borders |
| `bg-cta` / `bg-cta-muted` / `hover:bg-cta-hover` | primary action |

Font sizes (use these — never `text-[Npx]`):

| Class | Pixels | Use |
|---|---|---|
| `text-2xs` | 10px | dense rows, badges, eyebrows |
| `text-xs` | 12px | secondary labels, small buttons |
| `text-sm` | 14px | body, form inputs, primary labels |
| `text-base` | 16px | panel titles, dialog body |

Border radii (use these — never `rounded-xl` / `rounded-2xl`):

| Class | Use |
|---|---|
| `rounded` | inputs, buttons, chips, hover affordances |
| `rounded-lg` | cards, panels, dialogs, popovers |
| `rounded-full` | avatars, switches, pill chips, dots |

Spacing scale: `gap-1` / `gap-2` / `gap-3` / `gap-4`. Avoid
`gap-0.5` / `gap-1.5` / `gap-2.5`.

## Form inputs

```tsx
import { inputCls, smallInputCls } from "../../styles/formStyles";

<input className={inputCls + " w-full"} ... />
<select className={inputCls + " w-full"} ... />
<input className={smallInputCls + " w-14"} ... />
```

- Width is intentionally NOT in the recipe — add `w-full`
  or a fixed width at the call site.
- Both recipes already include `bg-surface-overlay` and
  `border-strong` so inputs read on every theme.

## Button

```tsx
import { Button } from "../common/Button";

<Button onClick={save}>Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost" iconOnly icon={<X size={14} />}>Close</Button>
<Button variant="danger" size="sm">Delete</Button>
<Button shape="pill" icon={<Plus size={12} />}>Add tag</Button>
```

- `variant`: `primary` (default) / `secondary` / `ghost` / `danger`
- `size`: `xs` (h-6) / `sm` (h-7) / `md` (h-8, default) / `lg` (h-10)
- `shape`: `rounded` (default) / `pill`
- `iconOnly`: square button; `children` becomes the
  accessible label, `icon` is the only visible content

Do NOT hand-roll button styles. Open an issue if `Button`
doesn't cover a real case — don't bypass it.

## Badge

```tsx
import { Badge } from "../common/Badge";

<Badge variant="success">Active</Badge>
<Badge variant="danger" size="md">Overdue</Badge>
<Badge variant="info" shape="square">DRAFT</Badge>
<Badge variant="tag" color="emerald">backend</Badge>
```

- `variant`: `neutral` (default) / `success` / `warning`
  / `danger` / `info` / `tag`
- `size`: `sm` (h-4, default) / `md` (h-5)
- `shape`: `pill` (default) / `square`
- For tag chips pass `color="emerald"` etc. — the limited
  palette matches `TagDropdown`.

## Heading

```tsx
import { Heading } from "../common/Heading";

<Heading level="eyebrow">Storage Backend</Heading>
<Heading level="panel">Settings</Heading>
<Heading level="section">External Editor</Heading>
```

- `eyebrow`: uppercase tracking-wider muted label
- `panel`: top-of-panel title (use once per panel)
- `section`: secondary heading
- `sub`: third-tier heading

View-top titles still go through `ViewHeader`; `Heading`
is for in-panel structure.

## StateMessage

```tsx
import { StateMessage } from "../common/StateMessage";

<StateMessage kind="loading">Loading entries...</StateMessage>
<StateMessage kind="empty">No matching tasks</StateMessage>
<StateMessage
  kind="error"
  description={String(err)}
  action={<Button onClick={retry}>Retry</Button>}
>
  Could not load
</StateMessage>
```

- `kind`: `loading` / `empty` (default) / `error`
- `compact`: tighter spacing for narrow panels
- Default icon per kind (spinner / inbox / alert); pass
  `icon={<Custom/>}` or `icon={null}` to override.

## HoverActions

```tsx
import { HoverActions } from "../common/HoverActions";

<div className="group ...row...">
  <span>{label}</span>
  <HoverActions className="ml-auto gap-0.5">
    <Button variant="ghost" iconOnly size="xs" icon={<Pencil size={10} />}>
      Edit
    </Button>
  </HoverActions>
</div>
```

Reveal-on-hover cluster that does NOT change the row's
height (uses `invisible` + `pointer-events-none` not
`hidden`). Supports named groups via the `group` prop.

## Toggle

```tsx
import { Toggle } from "../common/Toggle";

<Toggle checked={enabled} onChange={setEnabled} label="Enable cloud sync" />
```

Use the canonical `Toggle` for any single boolean.

## NO list

Don't hand-roll these patterns. If you need a one-off,
open the design-system plan first to see if it's already
slated for a Phase.
