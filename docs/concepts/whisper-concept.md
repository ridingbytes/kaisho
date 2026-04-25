# Concept: Voice Transcription with Whisper

## Motivation

Kaisho is keyboard-driven. That works at a desk but breaks down
when you're walking between meetings, on the phone, or driving.
Voice input lets you capture inbox items, task descriptions, clock
notes, and knowledge base entries without typing.

The implementation should follow Kaisho's local-first principle:
transcription runs on-device by default, with an optional cloud
fallback for users on the Sync + AI plan.

## Use Cases

1. **Dictate inbox items** -- tap a mic button, speak, text lands
   in the inbox. Triage later on desktop.
2. **Clock entry descriptions** -- describe what you're working on
   while starting a timer on mobile.
3. **Meeting notes** -- record a meeting, transcribe it, save to
   the knowledge base.
4. **Task body text** -- add context to a task by voice instead of
   typing on a phone keyboard.
5. **Advisor voice input** -- speak a question to the AI advisor
   instead of typing.

## Provider Landscape

### Local (offline)

| Library | Speed (1 min audio) | Apple Silicon | Py 3.12 | Install |
|---------|---------------------|---------------|---------|---------|
| mlx-whisper | 1-3s (Metal GPU) | Native MLX | Yes | pip |
| lightning-whisper-mlx | Sub-second | Native MLX | Yes | pip |
| pywhispercpp | 1-3s (Metal/CoreML) | Metal + CoreML | Yes | pip |
| faster-whisper | 3-5s (CPU only) | No GPU accel | No | Blocked |
| openai-whisper | 5-10s (CPU) | Poor MPS | Yes | pip |

### Cloud

| Provider | Price | Speed | API |
|----------|-------|-------|-----|
| Groq | $0.04/hr | 2-4s incl. network | OpenAI-compatible |
| OpenAI | $0.36/hr | 2-10s | Native SDK |
| Deepgram | $0.46/hr | Real-time streaming | WebSocket |

## Recommended Approach

### Primary: mlx-whisper (local)

Pure Python, installs via pip, runs on Apple GPU through the MLX
framework. No C compilation, no external dependencies beyond
ffmpeg. Models auto-download from HuggingFace on first use.

```
pip install mlx-whisper
```

```python
import mlx_whisper

result = mlx_whisper.transcribe(
    "audio.mp3",
    path_or_hf_repo="mlx-community/whisper-base-mlx",
)
print(result["text"])
```

Model trade-offs:

| Model | Disk | Use case |
|-------|------|----------|
| whisper-tiny-mlx | ~75 MB | Fast drafts, mobile dictation |
| whisper-base-mlx | ~150 MB | Good default for most input |
| distil-medium.en | ~750 MB | Best speed/accuracy for English |
| whisper-large-v3-mlx | ~3 GB | Maximum accuracy, all languages |

Default to `distil-medium.en` for English users. Fall back to
`whisper-base-mlx` if disk space is constrained. The model
selection should be configurable in Settings > AI.

### Cloud fallback: Groq

At $0.0007/minute Groq is effectively free. The API is
OpenAI-compatible, so it plugs into the existing provider
pattern (same client, different base URL).

```python
from openai import OpenAI

client = OpenAI(
    api_key=groq_key,
    base_url="https://api.groq.com/openai/v1",
)
with open("audio.mp3", "rb") as f:
    result = client.audio.transcriptions.create(
        model="whisper-large-v3-turbo",
        file=f,
    )
```

Route through the Kaisho Cloud AI gateway for Sync + AI users
so they don't need their own Groq key.

## Architecture

### Provider abstraction

```
TranscriptionProvider (ABC)
  transcribe(audio_path: Path) -> TranscriptionResult
    |
    +-- MLXWhisperProvider    (local, default)
    +-- GroqWhisperProvider   (cloud, via AI gateway)
```

`TranscriptionResult` is a dict with `text` (full transcript)
and `segments` (list of `{start, end, text}` for timestamped
output).

The active provider is selected in `settings.yaml` under a new
`transcription` block:

```yaml
transcription:
  provider: mlx           # mlx | groq | off
  model: distil-medium.en # model name or HF repo
```

### API endpoints

**Batch upload** (simpler, works everywhere):

```
POST /api/transcribe
Content-Type: multipart/form-data
Body: file=<audio>

Response:
{
  "text": "Full transcript...",
  "segments": [
    {"start": 0.0, "end": 2.4, "text": "Hello..."}
  ]
}
```

The frontend records audio, uploads the file, receives text.
This is the simplest path and works for all use cases except
live captioning.

**WebSocket streaming** (real-time, future):

```
WS /ws/transcribe

Client sends: binary audio chunks (WebM/Opus, every 250ms)
Server sends: {"text": "partial transcript..."}
```

Streaming requires buffering audio server-side and running
inference on accumulated chunks. More complex, but enables
live captions and dictation with immediate feedback.

Start with batch upload. Add WebSocket streaming later if the
UX demands it.

### Audio capture (frontend)

The browser's MediaRecorder API works in both the Tauri WebView
and the mobile PWA:

```typescript
const stream = await navigator.mediaDevices
  .getUserMedia({ audio: true })
const recorder = new MediaRecorder(stream, {
  mimeType: "audio/webm;codecs=opus",
})
recorder.ondataavailable = (e) => chunks.push(e.data)
recorder.start()
// ... user speaks ...
recorder.stop()
const blob = new Blob(chunks, { type: "audio/webm" })
```

The resulting Blob is uploaded to `/api/transcribe` as a
multipart form. WebM/Opus is the best format: small files
(~16 kbps), natively produced by all browsers, decoded by
ffmpeg on the backend.

### UI integration

A mic button appears next to text inputs where voice capture
makes sense:

- Inbox "add item" input
- Clock description field (start timer, quick book)
- Task body editor
- Note body editor
- Advisor chat input
- Knowledge base file editor (append mode)

The button has three states: idle (mic icon), recording
(pulsing red dot), and processing (spinner). On completion,
the transcribed text is inserted at the cursor position.

A shared `useVoiceInput()` hook encapsulates the
record-upload-insert cycle:

```typescript
const { recording, toggle, transcript } = useVoiceInput()
// toggle() starts/stops recording
// transcript contains the result after processing
```

### Mobile PWA

Voice input is especially valuable on mobile where typing is
slow. The same MediaRecorder + upload flow works in the PWA.
For Sync + AI users, transcription routes through the cloud
gateway (Groq). For free/sync-only users, transcription is
unavailable on mobile (no local model).

### Model management

Models are large (150 MB to 3 GB). They should not be bundled
with the app. On first use:

1. User enables voice transcription in settings.
2. Backend checks if the configured model is cached locally.
3. If not, downloads from HuggingFace (mlx-whisper handles
   this automatically via `snapshot_download`).
4. A progress indicator shows download status.
5. Model is cached in `~/.cache/huggingface/` (standard
   location, shared with other MLX/HF tools).

The desktop app should pre-download the default model during
onboarding or first settings visit to avoid a cold-start delay
on the first transcription.

## What This Does Not Cover

- **Speaker diarization** (who said what) -- useful for meeting
  notes but adds complexity. Defer to a future iteration.
- **Translation** -- Whisper supports translate mode
  (any language to English). Could be added as a toggle later.
- **Voice commands** -- interpreting speech as actions ("start
  a timer for Acme"). This is an advisor feature, not a
  transcription feature. The advisor can receive transcribed
  text and act on it through existing tool calls.

## Implementation Order

1. Add `TranscriptionProvider` abstraction and
   `MLXWhisperProvider` to `kaisho/services/`.
2. Add `POST /api/transcribe` endpoint.
3. Add `useVoiceInput()` hook and mic button component.
4. Wire mic button into inbox input (first integration point).
5. Add `GroqWhisperProvider` for cloud fallback.
6. Add transcription settings to Settings > AI tab.
7. Extend mic button to clock, task, note, and advisor inputs.
8. Add WebSocket streaming endpoint (if batch latency is
   insufficient for dictation UX).
