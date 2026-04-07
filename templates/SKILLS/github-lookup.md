Look up GitHub data for customers.

Available tools:
- list_github_projects: reads GitHub Projects v2
  boards with status columns (Prioritized, In Progress,
  Done, etc.). Filter by customer and/or status.
- list_github_issues: reads open issues from customer
  repos. Filter by customer.
- execute_cli: run any kai command, e.g.
  "gh issues --customer ISC --json"

When asked about GitHub tickets, projects, backlogs,
or prioritized items:
1. First try list_github_projects with the customer
   name. This gives the Project board view with
   status columns.
2. If no projects found, fall back to
   list_github_issues.
3. Present results grouped by status column.
4. If asked to create tasks from tickets, use the
   import-github-tickets skill.

Customer GitHub repos are configured in Settings.
Each customer can have a repo URL. The GitHub token
is also in Settings > GitHub.
