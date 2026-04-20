#!/usr/bin/env bash
# Quick desktop dev loop.
#
# Rebuilds the frontend, rebuilds the sidecar, then
# launches `tauri dev` with hot-reload for Rust changes.
#
# Usage:
#   ./scripts/dev-desktop.sh          # full rebuild
#   ./scripts/dev-desktop.sh --skip   # skip sidecar, just run tauri dev
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Kill any leftover kai-serve process on port 8765
if lsof -ti :8765 &>/dev/null; then
    echo "Killing existing process on port 8765..."
    kill $(lsof -ti :8765) 2>/dev/null || true
    sleep 1
fi

if [[ "${1:-}" != "--skip" ]]; then
    echo "Building frontend..."
    cd "$ROOT/frontend"
    pnpm build

    echo "Building sidecar..."
    cd "$ROOT"
    ./scripts/build-sidecar.sh
fi

echo "Starting Tauri dev..."
cd "$ROOT/desktop"
pnpm dev
