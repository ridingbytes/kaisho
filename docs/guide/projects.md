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

From a project's **Tasks** tab, use **Assign a task** to attach any
existing board task to the project. Assigned tasks are listed there and
link back to the board. Unassign a task with the row's remove action.

A task can belong to one project at a time.

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

## Projects and contracts

Projects and [contracts](customers.md) are complementary, not the same
thing. A contract is the billing arrangement with a customer (budget,
dates, invoicing); a project is how the work is organized. A project
can reference a contract for billing while remaining the place the work
itself is gathered.
