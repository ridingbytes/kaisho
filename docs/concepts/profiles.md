# Profiles

Profiles let you keep separate data sets. A freelancer might have one
profile per client engagement, or split work and personal tracking.

## How Profiles Work

Each profile is a directory under `~/.kaisho/profiles/`:

```
~/.kaisho/
  .active_profile       # Name of the current profile
  profiles/
    work/
      settings.yaml
      jobs.yaml
      org/
        todos.org
        clocks.org
        ...
    personal/
      settings.yaml
      org/
        ...
```

One profile is active at a time. All API calls, CLI commands, and UI
actions operate on the active profile.

## Managing Profiles

=== "Web UI"

    Go to **Settings > Profiles**. You can create, rename, copy, and
    delete profiles. Switching is instant.

=== "CLI"

    ```bash
    # List profiles (* marks the active one)
    kai profiles

    # Use a specific profile for one command
    kai -p personal clock list

    # Delete a profile
    kai profiles delete old-project
    ```

## Profile Contents

A fresh profile is created from a template that includes:

| File | Purpose |
|------|---------|
| `settings.yaml` | Task states, tags, AI config, paths |
| `jobs.yaml` | Default cron jobs (daily briefing, weekly summary) |
| `user.yaml` | Name, email, avatar |
| `SOUL.md` | AI advisor personality instructions |
| `USER.md` | Context about you for the AI advisor |
| `SKILLS/` | Reusable prompt templates |

## Profile-Specific Settings

Each profile has its own:

- **Storage backend** (org-mode, Markdown, JSON, or SQL)
- **Task states and columns** (TODO, IN-PROGRESS, DONE, etc.)
- **Tags with colors**
- **AI provider configuration**
- **Cron job schedule**
- **Knowledge base sources**

This means you can use org-mode for one project and Markdown for
another, or configure different AI providers per profile.

## The PROFILE Environment Variable

Set `PROFILE` to override the active profile:

```bash
PROFILE=work kai clock start "Acme Corp" "Bug fix"
```

This is useful for scripts and automation that should always target a
specific profile regardless of what's active in the UI.
