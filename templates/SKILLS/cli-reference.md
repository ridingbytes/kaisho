Kaisho CLI reference for the execute_cli tool.

Use execute_cli to run any kai command. The command
string is everything after "kai".

Common commands:
- task list [--customer X] [--status TODO] [--json]
- task add CUSTOMER "Title" [--tag @code] [--body "..."]
- clock start --customer X [--description "..."]
- clock stop
- clock book 2h --customer X --description "..."
- customer list [--all] [--json]
- customer add "Name" --type agency --budget 80
- customer summary
- contract list CUSTOMER
- contract add CUSTOMER "Name" --hours 80 --start 2026-01-01
- inbox list [--type NOTE] [--json]
- inbox add "Text" [--type EMAIL] [--customer X]
- notes list [--json]
- notes add "Title" --body "..." [--customer X]
- gh issues [--customer X]
- profiles list
- convert --from org --to sql --source X --target Y

Add --json to most commands for structured output
that is easier to parse programmatically.
