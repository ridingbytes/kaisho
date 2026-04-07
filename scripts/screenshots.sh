#!/usr/bin/env bash
# Capture Kaisho app screenshots for the product website.
# Installs Playwright if needed and runs the screenshot script.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Ensure Playwright is installed
if ! python3 -c "import playwright" 2>/dev/null; then
    echo "Installing Playwright..."
    pip install playwright
fi

# Ensure Chromium browser is available
playwright install chromium 2>/dev/null || true

echo "Running screenshot capture..."
python3 "$SCRIPT_DIR/screenshots.py" "$@"
