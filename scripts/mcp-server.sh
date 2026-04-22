#!/bin/bash
# MCP server wrapper for Claude Code.
# Ensures pyenv is on PATH and activates the kaisho virtualenv.
export PATH="$HOME/.pyenv/shims:$HOME/.pyenv/bin:$PATH"
eval "$(pyenv init -)"
pyenv activate kaisho 2>/dev/null
exec kai mcp-server "$@"
