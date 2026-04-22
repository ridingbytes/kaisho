# Emacs Integration

Kaisho stores data in org-mode files, making it a natural fit for
Emacs workflows. The `kaisho-mode` package provides integration.

## Data Files

With the org-mode backend, your data lives in standard org files:

```
~/.kaisho/profiles/work/org/
  todos.org       # Tasks
  clocks.org      # Time entries
  customers.org   # Customers and contracts
  inbox.org       # Inbox items
  notes.org       # Notes
  archive.org     # Archived tasks
```

Open these files in Emacs and edit them with full org-mode support.
Kaisho watches for file changes and reflects edits in the UI
automatically.

## kaisho-mode

The `kaisho-mode` Emacs package (in the
[kaisho-mode](https://github.com/ridingbytes/kaisho-mode) repository)
adds Kaisho-specific commands:

- Start/stop timers from Emacs
- Quick-capture to inbox
- Navigate between tasks and clock entries
- Org-agenda integration

## File Watching

Kaisho uses `watchfiles` to detect changes to org files. When you
save a file in Emacs, the backend reloads the data and broadcasts
updates via WebSocket to the UI.

This means you can edit in Emacs and the web UI simultaneously.
Changes in either direction are picked up within seconds.

## Org-mode Format

Tasks use standard org-mode keywords and properties:

```org
* TODO Design landing page                      :design:frontend:
  :PROPERTIES:
  :CUSTOMER: Acme Corp
  :SYNC_ID:  a1b2c3d4
  :CREATED:  2026-04-20T09:00:00
  :END:
  Mobile-first layout with new brand colors.
```

Clock entries use the org CLOCK logbook format:

```org
* Acme Corp
  :LOGBOOK:
  CLOCK: [2026-04-20 Mon 09:00]--[2026-04-20 Mon 11:30] =>  2:30
  :END:
  Working on landing page design
```

## Using Kaisho Tools from gptel

:octicons-tag-24: Added in v0.9.0
{ .version-badge }

If you use [gptel](https://github.com/karthink/gptel) with its
MCP integration, you can access Kaisho's 40 tools from any gptel
chat buffer.

Add the `mcp` package and configure the Kaisho server:

```elisp
(use-package mcp
  :config
  (setq mcp-hub-servers
        '(("kaisho"
           :command "kai"
           :args ("mcp-server"
                  "--profile" "org-mode"
                  "--allow" "read,write")))))
```

Then run `M-x gptel-mcp-connect` to load the tools. Ask
questions in a gptel chat buffer:

- "What tasks do I have open for Acme?"
- "Start a clock for Beta Inc, working on the API"
- "How many hours did I bill this month?"

The LLM calls Kaisho tools behind the scenes. Disconnect with
`M-x gptel-mcp-disconnect`.
