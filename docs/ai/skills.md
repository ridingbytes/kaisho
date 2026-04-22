# Skills

Skills are reusable prompt templates for the AI advisor. They encode
recurring instructions so you don't retype the same prompt patterns.

## Built-in Skills

Fresh profiles include these templates:

| Skill | Purpose |
|-------|---------|
| `daily-planning` | Morning planning routine |
| `week-summary` | Weekly retrospective |
| `budget-review` | Budget analysis across customers |
| `github-lookup` | Look up GitHub tickets |
| `import-github-tickets` | Import issues as tasks |
| `cli-reference` | CLI command documentation |

## Using Skills

Skills appear in the advisor panel. Select one to populate the
input field with the skill's prompt. You can edit the prompt before
sending.

## Creating Skills

=== "Web UI"

    Open **Advisor**, then click **Skills** in the toolbar. Click
    **Add Skill**, give it a name, and write the prompt content in
    Markdown.

=== "API"

    ```bash
    curl -X POST http://localhost:8765/api/advisor/skills \
        -H "Content-Type: application/json" \
        -d '{"name": "standup", "content": "List what I did yesterday..."}'
    ```

## Skill Files

Skills are stored as Markdown files in your profile:

```
~/.kaisho/profiles/work/SKILLS/
  daily-planning.md
  week-summary.md
  budget-review.md
  standup.md          # your custom skill
```

Edit them directly in any text editor. The name is the filename
without the `.md` extension.

## Writing Good Skills

A skill prompt should:

- Reference specific tools the advisor should use
  (e.g., "Use `list_tasks` to check open work")
- Set the scope clearly ("Focus on this week", "Only for Acme Corp")
- Define the output format ("Bullet list", "Markdown table",
  "Three paragraphs")
