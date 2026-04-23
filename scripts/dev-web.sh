#!/usr/bin/env bash
# Start the backend and frontend dev servers for browser testing.
#
# Both processes run in the foreground; Ctrl-C stops both.
#
# Usage:
#   ./scripts/dev-web.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
    echo ""
    echo "Stopping dev servers..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting backend (port 8765)..."
kai serve &
BACKEND_PID=$!

echo "Starting frontend dev server (port 5173)..."
cd "$ROOT/frontend"
pnpm dev &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8765"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl-C to stop."

wait
