#!/usr/bin/env bash
# Fetch the JetBrains Mono Bold font used by the tray
# pill-icon renderer. Idempotent: skips if already present.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST_DIR="$ROOT/desktop/src-tauri/fonts"
DEST="$DEST_DIR/JetBrainsMono-Bold.ttf"

if [[ -f "$DEST" ]]; then
    echo "Font already present at $DEST"
    exit 0
fi

mkdir -p "$DEST_DIR"

URL="https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/JetBrainsMono-Bold.ttf"
echo "Downloading JetBrains Mono Bold..."
curl -fsSL "$URL" -o "$DEST"

if [[ ! -s "$DEST" ]]; then
    echo "Download failed: empty file at $DEST" >&2
    exit 1
fi

echo "Saved $DEST ($(wc -c < "$DEST") bytes)"
