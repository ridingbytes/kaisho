#!/usr/bin/env bash
# Serve the Kaisho product website locally for evaluation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBSITE_DIR="$SCRIPT_DIR/../product/website"
PORT="${1:-3000}"

echo "Serving Kaisho website at http://localhost:$PORT"
echo "Press Ctrl+C to stop."
python3 -m http.server "$PORT" -d "$WEBSITE_DIR"
