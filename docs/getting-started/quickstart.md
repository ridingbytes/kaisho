# Quick Start

This guide walks you through the first five minutes with Kaisho.
By the end, you'll have a profile, a customer, and a time entry.

## 1. Start the Server

```bash
kai serve
```

Open [localhost:8765](http://localhost:8765) in your browser. Kaisho
creates a default profile with sample data on first launch.

## 2. Create a Customer

=== "Web UI"

    Go to **Customers** in the sidebar. Click **Add Customer**.
    Enter a name and save.

=== "CLI"

    ```bash
    kai customer add "Acme Corp"
    ```

## 3. Start Tracking Time

=== "Web UI"

    The clock widget sits on the right side of the screen. Select
    your customer, type an optional description, and press **Start**.

    The timer counts up in real time. Press **Stop** when you're done.

=== "CLI"

    ```bash
    kai clock start "Acme Corp" "Setting up project"
    ```

    Later:

    ```bash
    kai clock stop
    ```

If you forgot to start the timer, book retroactively:

```bash
kai clock book 2h "Acme Corp" "Initial setup"
```

## 4. Add a Task

=== "Web UI"

    Go to **Board** in the sidebar. Click **Add Task**. Assign it to
    your customer and give it a title.

    Drag tasks between columns to change their status.

=== "CLI"

    ```bash
    kai task add "Acme Corp" "Design the landing page"
    ```

## 5. Check Your Dashboard

Open **Dashboard** in the sidebar. You'll see:

- Hours tracked today, this week, this month
- Budget usage per customer
- Open tasks and inbox items

Every number on the dashboard is clickable. Click a customer's hours
to see the individual time entries behind it.

## What's Next

- [Your First Day](first-day.md) -- a complete walkthrough of a
  typical work day
- [Configuration](../configuration/settings.md) -- customize task
  states, tags, and AI providers
- [CLI Reference](../cli/index.md) -- every command at your
  fingertips
