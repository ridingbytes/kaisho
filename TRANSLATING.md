# Translating Kaisho

Kaisho uses [react-i18next](https://react.i18next.com/)
for the desktop frontend. Translations are plain JSON
files — no programming knowledge required.

## File structure

```
frontend/src/locales/
  en/                 # English (reference)
    common.json       # Shared terms (Save, Cancel, etc.)
    clocks.json       # Time tracking
    kanban.json       # Board and tasks
    customers.json    # Customer management
    settings.json     # Settings panel
    inbox.json        # Inbox
    advisor.json      # AI advisor
    dashboard.json    # Dashboard view
    nav.json          # Navigation and sidebar
  de/                 # German
    common.json
    ...
```

## How to contribute a translation

1. Fork the repository.
2. Copy `frontend/src/locales/en/` to a new folder
   named with the ISO 639-1 language code (e.g.
   `fr/` for French, `es/` for Spanish).
3. Translate the **values** in each JSON file.
   Leave the keys unchanged.
4. Register the new language in
   `frontend/src/i18n.ts` (import the files and add
   the language to the `resources` object).
5. Open a pull request.

## Rules

- Keep the same key structure as English.
- Missing keys fall back to English automatically,
  so partial translations are welcome.
- Use informal "you" where applicable (German: "du",
  French: "tu", Spanish: "tu").
- Do not translate brand names: Kaisho, Ollama,
  Claude, OpenRouter, GitHub.
- Do not translate CLI commands, property names,
  or code examples.
- Use double quotes in JSON.

## Example

English (`en/common.json`):
```json
{
  "save": "Save",
  "cancel": "Cancel",
  "delete": "Delete"
}
```

German (`de/common.json`):
```json
{
  "save": "Speichern",
  "cancel": "Abbrechen",
  "delete": "Löschen"
}
```

## Adding a language selector

The settings panel includes a language selector that
reads from `i18n.ts`. After adding your language,
the selector picks it up automatically.

## Testing

Run the dev server and switch languages in Settings
to verify your translations render correctly:

```bash
cd frontend && pnpm dev
```

Then open `http://localhost:5173`, go to Settings,
and select your language.
