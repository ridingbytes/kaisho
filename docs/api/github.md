# GitHub API

GitHub issue and project integration.

**Prefix:** `/api/github`

## Issues by Customer

```
GET /api/github/issues?state=open&limit=30
```

Returns issues grouped by customer.

## Issues for Single Customer

```
GET /api/github/issues/{customer}?state=open&limit=30
```

**Response:**

```json
{
  "customer": "Acme Corp",
  "repo": "acmeinc/main-app",
  "issues": [
    {
      "number": 42,
      "title": "Fix auth flow",
      "state": "open",
      "labels": [{"name": "bug", "color": "d73a4a"}],
      "created_at": "2026-04-15T10:00:00Z"
    }
  ]
}
```

## GitHub Projects v2

```
GET /api/github/projects
```

Returns project items grouped by customer. Supports `customer` and
`status` query parameters.
