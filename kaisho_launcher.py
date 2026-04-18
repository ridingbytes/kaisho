"""PyInstaller entry point for the kaisho sidecar.

This file exists because PyInstaller cannot handle
relative imports in ``kaisho/cli/main.py`` when
building with ``--onedir`` mode. It imports and calls
the CLI entry point as a top-level module.
"""
from kaisho.cli.main import cli

if __name__ == "__main__":
    cli()
