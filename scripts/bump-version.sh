#!/usr/bin/env bash
# Sync version from pyproject.toml to the desktop and
# frontend manifests.
#
# Usage:
#   ./scripts/bump-version.sh           # sync current version
#   ./scripts/bump-version.sh 0.9.1     # set new version everywhere
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -n "${1:-}" ]]; then
    NEW_VERSION="$1"

    # Downgrade guard. The auto-updater happily installs
    # whatever version the publish manifest advertises, so
    # publishing a *lower* version than the last git tag
    # would push a downgrade to every client. Reject that
    # here before any file is touched. Set
    # ``BUMP_ALLOW_DOWNGRADE=1`` to override (e.g. when
    # re-tagging after a yanked release).
    LAST_TAG=$(git -C "$ROOT" describe --tags --abbrev=0 \
        2>/dev/null || true)
    if [[ -n "$LAST_TAG" ]]; then
        LAST_VERSION="${LAST_TAG#v}"
        HIGHER=$(printf '%s\n%s\n' \
            "$LAST_VERSION" "$NEW_VERSION" \
            | sort -V | tail -1)
        if [[ "$NEW_VERSION" != "$HIGHER" \
                || "$NEW_VERSION" == "$LAST_VERSION" ]]; then
            if [[ "${BUMP_ALLOW_DOWNGRADE:-0}" != "1" ]]; then
                echo "ERROR: $NEW_VERSION is not strictly" \
                     "greater than last tag $LAST_TAG." >&2
                echo "Set BUMP_ALLOW_DOWNGRADE=1 to override." \
                     >&2
                exit 1
            fi
            echo "WARNING: bumping to $NEW_VERSION which" \
                 "is not greater than $LAST_TAG (override on)."
        fi
    fi

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

# frontend/package.json
python3 -c "
import json, pathlib
p = pathlib.Path('$ROOT/frontend/package.json')
data = json.loads(p.read_text())
data['version'] = '$VERSION'
p.write_text(json.dumps(data, indent=2) + '\n')
"

echo "Done: pyproject.toml, tauri.conf.json, Cargo.toml, frontend/package.json all at v$VERSION"
