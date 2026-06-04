"""Subprocess helpers and an opt-in spawn tracer.

On Windows, every ``subprocess.run`` against a console-mode
child flashes a conhost window for the lifetime of the call.
The fix is the ``CREATE_NO_WINDOW`` creation flag, which
suppresses the console window for short-lived helpers like
``claude --version`` and ``pdftotext``.

``run`` is the single place where that flag is wired in so
call sites stay platform-agnostic. Use it exactly like
``subprocess.run``; on POSIX it is a thin passthrough.

The module also exposes ``install_trace``: when the
``KAISHO_TRACE_SUBPROC`` env var is set, every
``subprocess.Popen`` (which underlies ``run``, ``call``,
``check_output``, ...) is logged to
``<KAISHO_HOME or ~/.kaisho>/subproc-trace.log`` with
argv, cwd, creation flags, and the first non-stdlib caller
frame. This is meant for diagnosing surprise spawns (e.g.
mystery conhost flashes during app startup): enable the var,
reproduce, send us the log.
"""
import os
import subprocess
import sys
import threading
import time
import traceback
from pathlib import Path


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


# -----------------------------------------------------------
# Optional spawn tracer (KAISHO_TRACE_SUBPROC=1)
# -----------------------------------------------------------

_TRACE_LOCK = threading.Lock()
_TRACE_INSTALLED = False
_ORIGINAL_POPEN_INIT = None


def _trace_log_path() -> Path:
    """Where to write spawn traces.

    Mirrors ``Settings.DATA_DIR`` resolution without importing
    the heavy config module, so the tracer can be installed at
    the very top of the launcher before anything else loads.
    """
    home = os.environ.get("KAISHO_HOME")
    base = Path(home) if home else Path.home() / ".kaisho"
    base.mkdir(parents=True, exist_ok=True)
    return base / "subproc-trace.log"


def _caller_frame() -> str:
    """First stack frame outside subprocess + this module."""
    skip = ("subproc.py", "subprocess.py")
    for frame in traceback.extract_stack()[::-1]:
        name = os.path.basename(frame.filename)
        if name in skip:
            continue
        return "{}:{} ({})".format(
            frame.filename, frame.lineno, frame.name,
        )
    return "<unknown>"


def _format_trace(args, kwargs) -> str:
    cmd = args[0] if args else kwargs.get("args", "<?>")
    cwd = kwargs.get("cwd") or os.getcwd()
    flags = kwargs.get("creationflags", 0)
    ts = time.strftime("%Y-%m-%dT%H:%M:%S")
    return (
        "[{ts}] cmd={cmd!r} cwd={cwd!r} "
        "creationflags=0x{flags:08x} caller={caller}\n"
    ).format(
        ts=ts, cmd=cmd, cwd=cwd, flags=flags,
        caller=_caller_frame(),
    )


def _write_trace(line: str) -> None:
    try:
        path = _trace_log_path()
        with _TRACE_LOCK:
            with open(path, "a", encoding="utf-8") as f:
                f.write(line)
    except OSError:
        # The tracer must never break the host process. A
        # disk-full / read-only home is annoying but not fatal.
        pass


def install_trace() -> bool:
    """Install the spawn tracer if ``KAISHO_TRACE_SUBPROC`` is
    set. Returns ``True`` if installed, ``False`` otherwise.

    Safe to call multiple times; second call is a no-op.
    """
    global _TRACE_INSTALLED, _ORIGINAL_POPEN_INIT
    if _TRACE_INSTALLED:
        return True
    if not os.environ.get("KAISHO_TRACE_SUBPROC"):
        return False

    _ORIGINAL_POPEN_INIT = subprocess.Popen.__init__

    def _traced_init(self, *args, **kwargs):
        _write_trace(_format_trace(args, kwargs))
        return _ORIGINAL_POPEN_INIT(self, *args, **kwargs)

    subprocess.Popen.__init__ = _traced_init
    _TRACE_INSTALLED = True
    _write_trace(
        "[{}] --- subproc tracer installed (pid={}) ---\n"
        .format(time.strftime("%Y-%m-%dT%H:%M:%S"), os.getpid())
    )
    return True
