# Your First Day

This walks through a realistic work day to show how the pieces fit
together. Follow along or read through to build a mental model.

## Morning: Plan

Start the server if it's not running:

```bash
kai serve
```

Open the dashboard. Check what's on your plate:

```bash
kai briefing
```

The briefing shows your active timer (if any), top open tasks, inbox
items, and budget status for all customers.

## Start Working

Pick a task and start the clock:

```bash
kai clock start "Acme Corp" "Working on landing page"
```

Or use the UI: open the clock widget, select the customer, and press
Start. The menu bar tray (desktop app) shows the running timer too.

While working, capture thoughts without breaking flow:

```bash
kai inbox add "Check if SSL cert expires this month"
kai inbox add "Idea: automate the deploy script" --type IDEA
```

## Midday: Switch Context

Stop the current timer and start a new one:

```bash
kai clock stop
kai clock start "Beta Inc" "Code review for PR #42"
```

Book a meeting you forgot to track:

```bash
kai clock book 30min "Acme Corp" "Standup call"
```

## Afternoon: Organize

Process your inbox. In the UI, open **Inbox** and decide for each
item: promote to task, move to notes, or delete.

```bash
kai inbox list
```

Add notes from a client call:

```bash
kai notes add "Acme deployment timeline" \
    --customer "Acme Corp" \
    --body "Go-live planned for June 15. Need staging by June 1."
```

## Evening: Review

Check your hours:

```bash
kai clock summary
```

See all entries for today:

```bash
kai clock list --today
```

The dashboard shows cumulative hours per customer with budget bars.
Click any bar to see the entries behind it.

## Tips

- **Keyboard shortcuts** make the UI fast. Press ++d++ for
  dashboard, ++b++ for board, ++i++ for inbox. Press ++cmd+j++ to
  open the command bar for CLI commands right inside the UI.

- **Command bar** (++cmd+j++) supports autocomplete for 25+
  commands. Type `clock start` or `task add` without leaving the
  browser.

- **Everything is a file.** Your data lives in `~/.kaisho/`. Open
  the org-mode or Markdown files in any editor. Changes sync back
  to the UI automatically via file watching.
