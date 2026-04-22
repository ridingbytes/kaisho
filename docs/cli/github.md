# kai gh

GitHub integration: issues, pull requests, and projects.

## Commands

### `gh issues`

List issues for a customer's repository.

```bash
kai gh issues CUSTOMER [--all] [--limit N] [--json]
```

### `gh show`

Show a specific issue.

```bash
kai gh show CUSTOMER NUMBER [--json]
```

### `gh prs`

List open pull requests.

```bash
kai gh prs CUSTOMER [--all] [--limit N] [--json]
```

### `gh open`

Open repository or issue in the browser.

```bash
kai gh open CUSTOMER [NUMBER]
```

### `gh projects`

List GitHub Projects v2 items.

```bash
kai gh projects [--customer CUSTOMER] [--status STATUS] [--json]
```

### `gh all-issues`

List open issues across all customer repositories.

```bash
kai gh all-issues [--json]
```
