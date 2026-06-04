"""Subprocess helpers.

On Windows, every ``subprocess.run`` against a console-mode
child flashes a conhost window for the lifetime of the call.
The fix is the ``CREATE_NO_WINDOW`` creation flag, which
suppresses the console window for short-lived helpers like
``claude --version`` and ``pdftotext``.

This module is the single place where that flag is wired in
so call sites stay platform-agnostic. Use ``run`` exactly
like ``subprocess.run``; on POSIX it is a thin passthrough.
"""
import subprocess
import sys


if sys.platform == "win32":
    _NO_WINDOW = subprocess.CREATE_NO_WINDOW
else:
    _NO_WINDOW = 0


def run(cmd, **kwargs):
    """``subprocess.run`` without flashing a console window."""
    if sys.platform == "win32":
        flags = kwargs.pop("creationflags", 0) | _NO_WINDOW
        kwargs["creationflags"] = flags
    return subprocess.run(cmd, **kwargs)
