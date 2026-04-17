# Build the Python backend as a standalone binary using
# PyInstaller on Windows. Mirrors build-sidecar.sh.
param(
    [string]$Target = "x86_64-pc-windows-msvc"
)

$ErrorActionPreference = "Stop"

# $PSScriptRoot is scripts/, parent is the repo root
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TauriDir = Join-Path $ProjectRoot "desktop\src-tauri"
$BinDir = Join-Path $TauriDir "binaries"

Write-Host "Building sidecar for target: $Target"

# Ensure PyInstaller is available
if (-not (Get-Command pyinstaller -ErrorAction SilentlyContinue)) {
    Write-Host "Installing PyInstaller..."
    pip install pyinstaller
}

# Build the frontend
Write-Host "Building frontend..."
Push-Location (Join-Path $ProjectRoot "frontend")
pnpm install --frozen-lockfile
pnpm build
Pop-Location

# Build the Python binary
Write-Host "Building Python sidecar..."
Push-Location $ProjectRoot
pyinstaller `
    --onefile `
    --name "kai-server-$Target" `
    --add-data "frontend\dist;frontend\dist" `
    --add-data "templates;templates" `
    --add-data "prompts;prompts" `
    --add-data "CHANGELOG.md;." `
    --hidden-import "kaisho" `
    --hidden-import "uvicorn" `
    --hidden-import "uvicorn.logging" `
    --hidden-import "uvicorn.loops" `
    --hidden-import "uvicorn.loops.auto" `
    --hidden-import "uvicorn.protocols" `
    --hidden-import "uvicorn.protocols.http" `
    --hidden-import "uvicorn.protocols.http.auto" `
    --hidden-import "uvicorn.protocols.websockets" `
    --hidden-import "uvicorn.protocols.websockets.auto" `
    --hidden-import "uvicorn.lifespan" `
    --hidden-import "uvicorn.lifespan.on" `
    --collect-submodules "kaisho" `
    kaisho\cli\main.py
Pop-Location

# Move binary to Tauri binaries dir
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
$Src = Join-Path $ProjectRoot "dist\kai-server-$Target.exe"
$Dst = Join-Path $BinDir "kai-server-$Target.exe"
Copy-Item $Src $Dst -Force

Write-Host "Sidecar built: $Dst"
Write-Host "Size: $([math]::Round((Get-Item $Dst).Length / 1MB, 1)) MB"
