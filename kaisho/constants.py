"""Shared constants used across backends and services.

This module exists to avoid duplicating the same literal
sets in `org.parser`, `backends.markdown`, and
`services.convert`. Keep it dependency-free so it can be
imported from anywhere without cycle risk.
"""

# Canonical task-state keywords recognised across backends.
# Backends may render or store them differently (org-mode
# uses TODO keywords; markdown uses status prefixes; SQL
# stores them as a column value) but the vocabulary is
# the same.
TASK_STATUSES = frozenset({
    "TODO", "NEXT", "IN-PROGRESS", "WAIT",
    "DONE", "CANCELLED",
})
