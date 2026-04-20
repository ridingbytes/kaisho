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

# Kill leftover processes from previous runs
PIDS=$(lsof -ti :8765 2>/dev/null || true)
PIDS="$PIDS $(pgrep -f 'kai-server' 2>/dev/null || true)"
PIDS="$PIDS $(pgrep -f 'kaisho-desktop' 2>/dev/null || true)"
PIDS=$(echo "$PIDS" | xargs -n1 | sort -u | xargs)
if [[ -n "$PIDS" ]]; then
    echo "Killing leftover processes: $PIDS"
    kill $PIDS 2>/dev/null || true
    sleep 1
fi

if [[ "${1:-}" != "--skip" ]]; then
    echo "Building frontend..."
    cd "$ROOT/frontend"
    pnpm build

    echo "Clearing sidecar cache..."
    rm -rf ~/.kaisho/runtime/*

    echo "Building sidecar..."
    cd "$ROOT"
    ./scripts/build-sidecar.sh
fi

echo "Starting Tauri dev..."
cd "$ROOT/desktop"
pnpm dev
