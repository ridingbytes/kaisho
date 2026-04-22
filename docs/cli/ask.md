# kai ask

Query the AI advisor from the command line.

## Usage

```bash
kai ask QUESTION... [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--model`, `-m` | AI model (default from settings) |
| `--no-github` | Skip fetching GitHub issues (faster) |
| `--no-context` | Send question without Kaisho context |

## Examples

```bash
kai ask "What should I focus on today?"
kai ask "How many hours did I bill Acme this month?"
kai ask "Create a task for Beta Inc: fix the login bug"
kai ask "Summarize my week" --model "claude:claude-sonnet-4-20250514"
```

## Context

By default, the advisor gathers context before answering:

- Open tasks
- This month's clock entries
- Inbox items
- Customers with budgets
- GitHub issues (unless `--no-github`)

Use `--no-context` for standalone questions that don't need your
Kaisho data.
