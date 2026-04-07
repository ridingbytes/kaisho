Import GitHub tickets as Kaisho tasks.

Steps:
1. Call list_github_projects to get tickets.
   - If a customer is mentioned, filter by customer.
   - If a status is mentioned (e.g. "prioritized"),
     filter by that status column.
2. For each ticket in the result, call add_task with:
   - customer: the customer name from the project
   - title: the ticket title
   - tags: ["@github"]
   - status: map the project column to a task state:
     - Prioritized / Backlog -> TODO
     - In Progress -> IN-PROGRESS
     - Review -> WAIT
     - Done -> DONE
3. Report how many tasks were created and list them.

If no GitHub projects are found, try list_github_issues
as a fallback.
