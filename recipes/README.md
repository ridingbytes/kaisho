# Automation recipes

Importable webhook automations that consume Kaisho's
outbound events (see `docs/integrations/automations.md`).

- `n8n/` — n8n workflows, exported as JSON. Import via
  Workflows → menu → Import from File.

Each recipe is a starting point: import it, fill in the
placeholders (a downstream credential and your Kaisho
signing secret), and adapt the logic to your board. Full
setup and the payload contract live in the docs under
Integrations → Automations → Recipes.
