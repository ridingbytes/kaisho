# Projects

A project is the aggregation hub for a piece of work. It belongs to a
customer and gathers that work's tasks, time, notes, and files in one
place, with a description and milestones. Projects are the answer to
"where does everything for this engagement live?"

!!! version-added "Since 2.7.0"

    First-class projects with milestones, task/time aggregation, and
    drag-and-drop files.

## Creating a project

Open **Projects** in the sidebar and choose **New project**. Give it a
name and, optionally, a customer. Open a project to fill in the rest:

- A **description** (markdown), for scope, links, and context.
- **Milestones** — a checklist with optional due dates. The project
  card shows milestone progress at a glance.
- A **status**: Active, On hold, Completed, or Archived. Archived
  projects are hidden from the list unless you tick **Show archived**.

Projects are stored in `projects.org` in your profile's org directory,
so they back up and sync along with the rest of your data.

## Assigning tasks

A project's **Tasks** tab groups tasks under their milestone, with an
**Unassigned** group for the rest. In any group you can:

- Type a title and **Add** to create a task — it inherits the
  project's customer and is filed under that milestone automatically.
- **Assign existing** to attach a board task you already have.

Click any task to open a rich edit subview: title, customer, status,
deadline, tags, description, and its project and milestone. Assigned
tasks also show a project badge on the board that links back here.

A task belongs to one project (and at most one of its milestones) at a
time.

## Time rollup

The **Time** tab totals the time that belongs to the project. Time
rolls up two ways:

- Any clock entry logged **against an assigned task** counts
  automatically — assign the task and its time follows.
- An entry can also be assigned to a project directly when editing it.

This means you usually never assign time by hand: assign the tasks, and
the hours aggregate themselves.

## Files

Drag and drop files straight onto the **Files** tab to keep everything
for the project together — briefs, exports, screenshots, contracts.
Files are stored with the profile under the project, and can be
downloaded or removed from the same tab. Each file is capped at 25 MB.

## CLI and AI

Projects are scriptable from the `kai` CLI:

```bash
kai project list
kai project add "Website Redesign" --customer ACME --due 2026-06-30
kai project show P-1a2b3c4d
kai project milestone add P-1a2b3c4d "Design phase" --due 2026-02-01
kai project assign <task_id> P-1a2b3c4d --milestone M-...
```

The AI advisor and MCP tools can also read and manage projects
(`list_projects`, `get_project`, `add_project`, `add_project_milestone`,
`assign_task_to_project`, ...), so you can say "create a project for
ACME and move the login task into it."

## Projects and contracts

Projects and [contracts](customers.md) are complementary, not the same
thing. A contract is the billing arrangement with a customer (budget,
dates, invoicing); a project is how the work is organized. A project
can reference a contract for billing while remaining the place the work
itself is gathered.
