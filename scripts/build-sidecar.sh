#!/usr/bin/env bash
# Build the Python backend as a standalone binary.
#
# macOS: --onedir + self-extracting wrapper that unpacks
#   to ~/.kaisho/runtime/ on first launch. This avoids
#   macOS Gatekeeper rejecting Python.framework signatures
#   in /tmp (which --onefile uses).
# Linux/Windows: --onefile (no signature issues).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TAURI_DIR="$PROJECT_ROOT/desktop/src-tauri"
BIN_DIR="$TAURI_DIR/binaries"

detect_target() {
    if [ -n "${1:-}" ]; then echo "$1"; return; fi
    local arch os
    arch="$(uname -m)"
    case "$arch" in
        x86_64)  arch="x86_64" ;;
        aarch64|arm64) arch="aarch64" ;;
        *) echo "Unsupported arch: $arch"; exit 1 ;;
    esac
    case "$(uname -s)" in
        Darwin)  os="apple-darwin" ;;
        Linux)   os="unknown-linux-gnu" ;;
        MINGW*|MSYS*|CYGWIN*) os="pc-windows-msvc" ;;
        *) echo "Unsupported OS"; exit 1 ;;
    esac
    echo "${arch}-${os}"
}

TARGET="$(detect_target "${1:-}")"
echo "Building sidecar for target: $TARGET"

EXE_SUFFIX=""
[[ "$TARGET" == *"windows"* ]] && EXE_SUFFIX=".exe"

IS_MACOS=false
[[ "$(uname -s)" == "Darwin" ]] && IS_MACOS=true

command -v pyinstaller &>/dev/null || pip install pyinstaller

# Build frontend
echo "Building frontend..."
cd "$PROJECT_ROOT/frontend"
pnpm install --frozen-lockfile
pnpm build

# Common args
cd "$PROJECT_ROOT"
HIDDEN=(
    --hidden-import kaisho
    --hidden-import uvicorn
    --hidden-import uvicorn.logging
    --hidden-import uvicorn.loops
    --hidden-import uvicorn.loops.auto
    --hidden-import uvicorn.protocols
    --hidden-import uvicorn.protocols.http
    --hidden-import uvicorn.protocols.http.auto
    --hidden-import uvicorn.protocols.websockets
    --hidden-import uvicorn.protocols.websockets.auto
    --hidden-import uvicorn.lifespan
    --hidden-import uvicorn.lifespan.on
    --collect-submodules kaisho
)
DATA=(
    --add-data "frontend/dist:frontend/dist"
    --add-data "templates:templates"
    --add-data "prompts:prompts"
    --add-data "CHANGELOG.md:."
    --add-data "pyproject.toml:."
)

mkdir -p "$BIN_DIR"
rm -rf "$PROJECT_ROOT/dist/kai-server-${TARGET}" \
       "$PROJECT_ROOT/build/kai-server-${TARGET}" \
       2>/dev/null

if $IS_MACOS; then
    echo "Building sidecar (macOS --onedir)..."
    pyinstaller --noconfirm --onedir \
        --name "kai-server-${TARGET}" \
        "${DATA[@]}" "${HIDDEN[@]}" \
        kaisho_launcher.py

    # Create a tarball of the bundle
    DIST="dist/kai-server-${TARGET}"
    codesign --force --sign - "$DIST/kai-server-${TARGET}" \
        2>/dev/null || true
    find "$DIST" -type f \( \
        -name "*.dylib" -o -name "*.so" -o \
        -name "Python" \
    \) -exec codesign --force --sign - {} \; \
        2>/dev/null || true

    TARBALL="/tmp/kai-bundle.tar.gz"
    tar czf "$TARBALL" -C "$DIST" .

    # Build self-extracting wrapper. Tauri bundles this
    # single file as the sidecar. On first run it
    # extracts the bundle to ~/.kaisho/runtime/ where
    # macOS allows ad-hoc signed binaries.
    DST="$BIN_DIR/kai-server-${TARGET}"
    # Compute a short hash of the payload so dev
    # rebuilds always re-extract (version alone is
    # not enough when content changes mid-version).
    PAYLOAD_HASH=$(shasum "$TARBALL" | cut -c1-8)

    cat > "$DST" << 'SFX'
#!/bin/bash
VER="__VERSION__-__HASH__"
RT="$HOME/.kaisho/runtime/$VER"
BIN="$RT/kai-server-__TARGET__"
if [ ! -x "$BIN" ]; then
    rm -rf "$HOME/.kaisho/runtime/__VERSION__"*
    mkdir -p "$RT"
    SKIP=$(awk '/^__PAYLOAD__$/{print NR+1;exit}' "$0")
    tail -n +"$SKIP" "$0" | tar xzf - -C "$RT"
    chmod +x "$BIN"
fi
exec "$BIN" "$@"
__PAYLOAD__
SFX
    sed -i '' "s/__TARGET__/${TARGET}/g" "$DST"
    sed -i '' "s/__VERSION__/$(grep '^version' pyproject.toml | head -1 | cut -d'"' -f2)/g" "$DST"
    sed -i '' "s/__HASH__/${PAYLOAD_HASH}/g" "$DST"
    cat "$TARBALL" >> "$DST"
    chmod +x "$DST"
    rm "$TARBALL"

    echo "Sidecar: $DST (self-extracting)"
    echo "Size: $(du -h "$DST" | cut -f1)"
else
    echo "Building sidecar (--onefile)..."
    pyinstaller --noconfirm --onefile \
        --name "kai-server-${TARGET}" \
        "${DATA[@]}" "${HIDDEN[@]}" \
        kaisho/cli/main.py

    SRC="dist/kai-server-${TARGET}${EXE_SUFFIX}"
    DST="$BIN_DIR/kai-server-${TARGET}${EXE_SUFFIX}"
    cp "$SRC" "$DST"

    echo "Sidecar: $DST"
    echo "Size: $(du -h "$DST" | cut -f1)"
fi
