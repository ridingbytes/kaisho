#!/usr/bin/env bash
# Build the Python backend as a standalone binary using
# PyInstaller. The output binary is placed where Tauri
# expects it (desktop/src-tauri/binaries/).
#
# macOS uses --onedir mode to avoid Gatekeeper signature
# issues with --onefile's runtime extraction. The entry
# point binary is placed in binaries/ and the support
# files go into binaries/kai-server-bundle/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TAURI_DIR="$PROJECT_ROOT/desktop/src-tauri"
BIN_DIR="$TAURI_DIR/binaries"

detect_target() {
    if [ -n "${1:-}" ]; then
        echo "$1"
        return
    fi
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
        *) echo "Unsupported OS: $(uname -s)"; exit 1 ;;
    esac
    echo "${arch}-${os}"
}

TARGET="$(detect_target "${1:-}")"
echo "Building sidecar for target: $TARGET"

EXE_SUFFIX=""
if [[ "$TARGET" == *"windows"* ]]; then
    EXE_SUFFIX=".exe"
fi

IS_MACOS=false
if [[ "$(uname -s)" == "Darwin" ]]; then
    IS_MACOS=true
fi

if ! command -v pyinstaller &>/dev/null; then
    echo "Installing PyInstaller..."
    pip install pyinstaller
fi

# Build the frontend
echo "Building frontend..."
cd "$PROJECT_ROOT/frontend"
pnpm install --frozen-lockfile
pnpm build

# Build the Python binary
echo "Building Python sidecar..."
cd "$PROJECT_ROOT"

PYINSTALLER_MODE="--onefile"
if $IS_MACOS; then
    PYINSTALLER_MODE="--onedir"
fi

pyinstaller \
    $PYINSTALLER_MODE \
    --name "kai-server-${TARGET}" \
    --add-data "frontend/dist:frontend/dist" \
    --add-data "templates:templates" \
    --add-data "prompts:prompts" \
    --add-data "CHANGELOG.md:." \
    --hidden-import "kaisho" \
    --hidden-import "uvicorn" \
    --hidden-import "uvicorn.logging" \
    --hidden-import "uvicorn.loops" \
    --hidden-import "uvicorn.loops.auto" \
    --hidden-import "uvicorn.protocols" \
    --hidden-import "uvicorn.protocols.http" \
    --hidden-import "uvicorn.protocols.http.auto" \
    --hidden-import "uvicorn.protocols.websockets" \
    --hidden-import "uvicorn.protocols.websockets.auto" \
    --hidden-import "uvicorn.lifespan" \
    --hidden-import "uvicorn.lifespan.on" \
    --collect-submodules "kaisho" \
    kaisho/cli/main.py

mkdir -p "$BIN_DIR"

if $IS_MACOS; then
    # onedir: copy the entry binary and the bundle dir
    DIST_DIR="dist/kai-server-${TARGET}"
    DST="$BIN_DIR/kai-server-${TARGET}"

    # Copy the entry point binary
    cp "$DIST_DIR/kai-server-${TARGET}" "$DST"

    # Copy the entire bundle alongside it
    BUNDLE_DST="$BIN_DIR/kai-server-${TARGET}_internal"
    rm -rf "$BUNDLE_DST"
    cp -R "$DIST_DIR/_internal" "$BUNDLE_DST"

    # Ad-hoc sign everything
    find "$BUNDLE_DST" -type f \( \
        -name "*.dylib" -o -name "*.so" -o \
        -name "Python" -o -name "python*" \
    \) -exec codesign --force --sign - {} \; 2>/dev/null || true
    codesign --force --sign - "$DST"

    echo "Sidecar built (onedir): $DST"
    echo "Bundle: $(du -sh "$BUNDLE_DST" | cut -f1)"
else
    SRC="dist/kai-server-${TARGET}${EXE_SUFFIX}"
    DST="$BIN_DIR/kai-server-${TARGET}${EXE_SUFFIX}"
    cp "$SRC" "$DST"
    echo "Sidecar built: $DST"
    echo "Size: $(du -h "$DST" | cut -f1)"
fi
