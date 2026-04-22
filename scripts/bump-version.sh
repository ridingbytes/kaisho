#!/usr/bin/env bash
# Sync version from pyproject.toml to tauri.conf.json and Cargo.toml.
#
# Usage:
#   ./scripts/bump-version.sh           # sync current version
#   ./scripts/bump-version.sh 0.9.1     # set new version everywhere
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -n "${1:-}" ]]; then
    NEW_VERSION="$1"
    sed -i '' "s/^version = \".*\"/version = \"$NEW_VERSION\"/" \
        "$ROOT/pyproject.toml"
    echo "Set version to $NEW_VERSION in pyproject.toml"
fi

VERSION=$(grep '^version' "$ROOT/pyproject.toml" \
    | head -1 | sed 's/.*"\(.*\)".*/\1/')

echo "Syncing version $VERSION to desktop files..."

# tauri.conf.json
python3 -c "
import json, pathlib
p = pathlib.Path('$ROOT/desktop/src-tauri/tauri.conf.json')
data = json.loads(p.read_text())
data['version'] = '$VERSION'
p.write_text(json.dumps(data, indent=2) + '\n')
"

# Cargo.toml (only the [package] version line)
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" \
    "$ROOT/desktop/src-tauri/Cargo.toml"

echo "Done: pyproject.toml, tauri.conf.json, Cargo.toml all at v$VERSION"
