#!/usr/bin/env bash
# Build the Python backend as a standalone binary using
# PyInstaller. The output is placed where Tauri expects
# it (desktop/src-tauri/binaries/).
#
# macOS: uses --onedir to avoid Gatekeeper rejecting the
#   extracted Python.framework. A shell wrapper script
#   serves as the Tauri sidecar entry point.
# Linux/Windows: uses --onefile (no signature issues).
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

# Common PyInstaller args
HIDDEN_IMPORTS=(
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

DATA_ARGS=(
    --add-data "frontend/dist:frontend/dist"
    --add-data "templates:templates"
    --add-data "prompts:prompts"
    --add-data "CHANGELOG.md:."
)

echo "Building Python sidecar..."
cd "$PROJECT_ROOT"
mkdir -p "$BIN_DIR"

if $IS_MACOS; then
    # macOS: --onedir avoids Gatekeeper Python.framework
    # signature rejection. The entry point uses
    # kaisho_launcher.py (top-level import, no relative).
    pyinstaller --onedir \
        --name "kai-server-${TARGET}" \
        "${DATA_ARGS[@]}" \
        "${HIDDEN_IMPORTS[@]}" \
        kaisho_launcher.py

    # The bundle directory goes next to the sidecar
    BUNDLE_DIR="$BIN_DIR/kai-server-${TARGET}-bundle"
    rm -rf "$BUNDLE_DIR"
    cp -R "dist/kai-server-${TARGET}" "$BUNDLE_DIR"

    # Ad-hoc sign all binaries in the bundle
    find "$BUNDLE_DIR" -type f \( \
        -name "*.dylib" -o -name "*.so" -o \
        -name "Python" -o -perm +111 \
    \) -exec codesign --force --sign - {} \; \
        2>/dev/null || true

    # Create a shell wrapper as the sidecar entry point.
    # Tauri puts externalBin in Contents/MacOS/ and
    # resources in Contents/Resources/. The wrapper
    # checks both locations.
    DST="$BIN_DIR/kai-server-${TARGET}"
    cat > "$DST" << 'WRAPPER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
NAME="kai-server-PLACEHOLDER-bundle/kai-server-PLACEHOLDER"
# Check Contents/Resources/ (Tauri resources)
if [ -x "$DIR/../Resources/$NAME" ]; then
    exec "$DIR/../Resources/$NAME" "$@"
fi
# Check Contents/MacOS/ (same dir, dev builds)
if [ -x "$DIR/$NAME" ]; then
    exec "$DIR/$NAME" "$@"
fi
# Fallback: same directory without bundle
exec "$DIR/kai-server-PLACEHOLDER" "$@"
WRAPPER
    sed -i '' "s/PLACEHOLDER/${TARGET}/g" "$DST"
    chmod +x "$DST"

    echo "Sidecar built (onedir): $DST"
    echo "Bundle: $(du -sh "$BUNDLE_DIR" | cut -f1)"
else
    # Linux/Windows: --onefile works fine
    pyinstaller --onefile \
        --name "kai-server-${TARGET}" \
        "${DATA_ARGS[@]}" \
        "${HIDDEN_IMPORTS[@]}" \
        kaisho/cli/main.py

    SRC="dist/kai-server-${TARGET}${EXE_SUFFIX}"
    DST="$BIN_DIR/kai-server-${TARGET}${EXE_SUFFIX}"
    cp "$SRC" "$DST"

    echo "Sidecar built: $DST"
    echo "Size: $(du -h "$DST" | cut -f1)"
fi
