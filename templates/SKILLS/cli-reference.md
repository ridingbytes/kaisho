Kaisho CLI reference for the execute_cli tool.

Use execute_cli to run any kai command. The command
string is everything after "kai".

Task commands:
- task list [--customer X] [--status TODO] [--json]
- task add CUSTOMER "Title" [--tag @code] [--body "..."] [--github-url URL]
- task show TASK_ID [--json]
- task update TASK_ID [--title "..."] [--customer X] [--body "..."] [--github-url URL]
- task delete TASK_ID [-y]
- task move TASK_ID STATUS
- task done TASK_ID
- task next TASK_ID
- task wait TASK_ID
- task cancel TASK_ID
- task tag TASK_ID +tag1 -tag2
- task archive TASK_ID

Clock commands:
- clock start --customer X [--description "..."]
- clock stop
- clock book 2h --customer X --description "..."

Customer commands:
- customer list [--all] [--json]
- customer add "Name" --type agency --budget 80
- customer summary
- contract list CUSTOMER
- contract add CUSTOMER "Name" --hours 80 --start DATE

Inbox commands:
- inbox list [--type NOTE] [--json]
- inbox add "Text" [--type EMAIL] [--customer X] [--body "..."]
- inbox remove ITEM_ID

Notes commands:
- notes list [--customer X] [--json]
- notes add "Title" --body "..." [--customer X] [--tag design]
- notes show NOTE_ID [--json]
- notes delete NOTE_ID [-y]

GitHub commands:
- gh issues CUSTOMER [--all] [--json]
- gh projects [--customer X] [--status Y] [--json]
- gh prs CUSTOMER [--all] [--json]
- gh show CUSTOMER NUMBER [--json]
- gh all-issues [--json]

Other:
- profiles list
- convert --from org --to sql --source X --target Y

Add --json for structured output the advisor can parse.
