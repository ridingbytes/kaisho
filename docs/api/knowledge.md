# Knowledge Base API

File management and search for the knowledge base.

**Prefix:** `/api/knowledge`

## File Tree

```
GET /api/knowledge/tree
```

Returns all files and empty folders across all KB sources.

```json
[
  {
    "path": "runbooks/deploy.md",
    "label": "Personal",
    "name": "deploy",
    "size": 2048,
    "kind": "file"
  }
]
```

## Read File

```
GET /api/knowledge/file?path=runbooks/deploy.md
```

**Response:**

```json
{
  "path": "runbooks/deploy.md",
  "content": "# Deploy Checklist\n\n..."
}
```

For PDFs, returns extracted text.

## Raw File

Serve the file as a binary download (for inline PDF viewing).

```
GET /api/knowledge/file/raw?path=manuals/handbook.pdf
```

## Search

```
GET /api/knowledge/search?q=connection+pooling&max_results=20
```

**Response:**

```json
[
  {
    "path": "notes/postgres.md",
    "label": "Personal",
    "line_number": 42,
    "snippet": "Connection pooling with PgBouncer..."
  }
]
```

## Write File

Create or overwrite a KB file.

```
PUT /api/knowledge/file
```

**Body:**

```json
{
  "label": "Personal",
  "path": "notes/new-topic.md",
  "content": "# New Topic\n\nContent here."
}
```

## Create Folder

```
POST /api/knowledge/folder
```

**Body:**

```json
{
  "label": "Personal",
  "path": "notes/subtopic"
}
```

## Rename File

```
POST /api/knowledge/rename
```

**Body:**

```json
{
  "old_path": "notes/old-name.md",
  "new_path": "notes/new-name.md"
}
```

## Move Between Sources

```
POST /api/knowledge/move
```

**Body:**

```json
{
  "old_path": "notes/topic.md",
  "old_label": "Personal",
  "new_label": "Company Docs",
  "new_path": "shared/topic.md"
}
```

## Delete File

```
DELETE /api/knowledge/file?path=notes/obsolete.md
```
