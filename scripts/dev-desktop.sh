#!/usr/bin/env bash
# Deprecated shim — use bin/dev --desktop instead.
exec "$(dirname "$0")/../bin/dev" --desktop "$@"
