#!/usr/bin/env bash
# Build the Python backend as a standalone binary using
# PyInstaller. The output binary is placed where Tauri
# expects it (desktop/src-tauri/binaries/).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TAURI_DIR="$PROJECT_ROOT/desktop/src-tauri"
BIN_DIR="$TAURI_DIR/binaries"

# Detect target triple for Tauri sidecar naming
detect_target() {
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

TARGET="$(detect_target)"
echo "Building sidecar for target: $TARGET"

# Ensure PyInstaller is available
if ! command -v pyinstaller &>/dev/null; then
    echo "Installing PyInstaller..."
    pip install pyinstaller
fi

# Build the frontend (production)
echo "Building frontend..."
cd "$PROJECT_ROOT/frontend"
pnpm build

# Build the Python binary
echo "Building Python sidecar..."
cd "$PROJECT_ROOT"
pyinstaller \
    --onefile \
    --name "kai-server-${TARGET}" \
    --add-data "frontend/dist:frontend/dist" \
    --add-data "templates:templates" \
    --add-data "prompts:prompts" \
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

# Move binary to Tauri binaries dir
mkdir -p "$BIN_DIR"
cp "dist/kai-server-${TARGET}" "$BIN_DIR/"

echo "Sidecar built: $BIN_DIR/kai-server-${TARGET}"
echo "Size: $(du -h "$BIN_DIR/kai-server-${TARGET}" | cut -f1)"
