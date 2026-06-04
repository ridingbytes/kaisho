"""PyInstaller entry point for the kaisho sidecar.

This file exists because PyInstaller cannot handle
relative imports in ``kaisho/cli/main.py`` when
building with ``--onedir`` mode. It imports and calls
the CLI entry point as a top-level module.

The optional subprocess tracer is installed here, before
any other module, so it catches every spawn during boot
when ``KAISHO_TRACE_SUBPROC`` is set in the environment.
"""
from kaisho.subproc import install_trace

install_trace()

from kaisho.cli.main import cli  # noqa: E402

if __name__ == "__main__":
    cli()
