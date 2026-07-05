# Automation Recipes

Importable webhook automations that consume Kaisho's
outbound events. Import one, fill in a couple of
placeholders, and adapt it to your board. For the events
and payload shapes these recipes read, see
[Automations](automations.md).

Recipes live in the repository under `recipes/`. They are
starting points, not turnkey products: n8n evolves its node
schemas between versions, so expect to adjust a node or two
on import.

## n8n: Task moved to Slack

Posts a Slack message when a task moves to a done state.

File: `recipes/n8n/task-moved-to-slack.json`

Three nodes:

1. Webhook (POST) — n8n generates its own URL on import.
2. A Code node that keeps only `task.moved` events whose
   `delta.to_state` is a done state (`DONE` / `CANCELLED`,
   editable at the top of the node) and builds the message.
3. An HTTP Request node that posts to a Slack incoming
   webhook.

### Setup

1. In n8n, Workflows → menu → Import from File, and pick
   `task-moved-to-slack.json`.
2. Open the Post to Slack node and paste your Slack
   [incoming webhook](https://api.slack.com/messaging/webhooks)
   URL.
3. Activate the workflow, then copy the Webhook node's
   Production URL.
4. In Kaisho, open Settings → Automations, add that URL,
   and subscribe it to `task.moved`.
5. Move a task to a done column. A Slack message appears.

Edit `DONE_STATES` in the Code node if your board uses
custom done columns.

## Harden with signature verification

The base recipe trusts any POST to its URL. To reject
forged requests, verify the `X-Kaisho-Signature` header,
an HMAC-SHA256 of the raw body keyed by your endpoint
secret (see
[Verifying the signature](automations.md#verifying-the-signature)).

In n8n:

1. Set a signing secret on the endpoint in Kaisho's
   Automations panel.
2. On the Webhook node, enable the Raw Body option so the
   HMAC is computed over the exact bytes Kaisho sent
   (re-serializing the parsed JSON will not byte-match).
3. Add a Code node after the webhook that computes the
   HMAC over the raw body and compares it to the header,
   stopping the flow on a mismatch. The `crypto` module
   requires `NODE_FUNCTION_ALLOW_BUILTIN=crypto` in the
   n8n environment; alternatively use n8n's built-in Crypto
   node (HMAC action) followed by an IF node.

## Contributing a recipe

Keep recipes minimal (a few nodes), use placeholder URLs
and secrets rather than real ones, and add a short section
here describing what the recipe does and how to wire it.
