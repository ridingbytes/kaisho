# kai youtube

YouTube transcript tools for research and note-taking.

## Commands

### `youtube transcribe`

Fetch the transcript of a YouTube video.

```bash
kai youtube transcribe URL [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--lang`, `-l` | Language codes, comma-separated (default: `en,de`) |
| `--timestamps`, `-t` | Include `[MM:SS]` timestamps |

```bash
kai youtube transcribe "https://youtube.com/watch?v=abc123"
kai youtube transcribe abc123 --lang en --timestamps
```

Accepts full URLs or 11-character video IDs.

### `youtube languages`

List available transcript languages for a video.

```bash
kai youtube languages URL
```
