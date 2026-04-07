#!/usr/bin/env bash
# Start Kaisho backend + frontend. Ctrl+C stops both.
set -euo pipefail

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo "Shutting down..."
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
    wait 2>/dev/null
    echo "Done."
}

trap cleanup EXIT INT TERM

# Check prerequisites
for cmd in python3 pnpm; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "Error: $cmd is not installed."
        exit 1
    fi
done

if ! command -v kai &>/dev/null; then
    echo "kai CLI not found. Installing..."
    pip install -e "$(dirname "$0")"
fi

if [ ! -d "$(dirname "$0")/frontend/node_modules" ]; then
    echo "Frontend deps missing. Installing..."
    cd "$(dirname "$0")/frontend" && pnpm install && cd ..
fi

# Start backend
echo "Starting backend on http://localhost:8765 ..."
kai serve &
BACKEND_PID=$!

# Start frontend
echo "Starting frontend on http://localhost:5173 ..."
cd "$(dirname "$0")/frontend"
pnpm dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "Kaisho is running."
echo "  App:     http://localhost:5173"
echo "  API:     http://localhost:8765"
echo "  Press Ctrl+C to stop."
echo ""

wait
