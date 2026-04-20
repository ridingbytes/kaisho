"""Execute kai CLI commands via the API.

Invokes Click commands in-process and captures their
stdout output. Used by the in-app command bar.
"""

import shlex

from click.testing import CliRunner
from fastapi import APIRouter
from pydantic import BaseModel

from ...cli.main import cli

router = APIRouter(prefix="/api/cli", tags=["cli"])

runner = CliRunner()

# Commands that modify data and should not be
# exposed without confirmation.
_BLOCKED = {"serve", "profile", "config"}


class CliRequest(BaseModel):
    """A CLI command string to execute."""
    command: str


@router.post("/run")
def run_command(body: CliRequest):
    """Execute a kai CLI command and return output.

    The command string is split into tokens using
    shell-style parsing. The ``kai`` prefix is
    optional. The ``--json`` flag is appended
    automatically for structured output.

    :param body: Request body with ``command`` field.
    :returns: JSON with ``output``, ``exit_code``,
        and ``error`` fields.
    """
    raw = body.command.strip()
    if not raw:
        return {
            "output": "",
            "exit_code": 1,
            "error": "Empty command",
        }

    # Strip optional "kai " prefix
    if raw.lower().startswith("kai "):
        raw = raw[4:]

    try:
        args = shlex.split(raw)
    except ValueError as exc:
        return {
            "output": "",
            "exit_code": 1,
            "error": f"Parse error: {exc}",
        }

    if not args:
        return {
            "output": "",
            "exit_code": 1,
            "error": "Empty command",
        }

    # Block dangerous commands
    if args[0] in _BLOCKED:
        return {
            "output": "",
            "exit_code": 1,
            "error": f"Command not allowed: {args[0]}",
        }

    result = runner.invoke(
        cli, args, catch_exceptions=True,
    )

    output = result.output.rstrip()
    error = None

    if result.exception:
        # Click returns SystemExit(2) for usage errors
        # (unknown command, missing args). The helpful
        # message is in result.output, not the exception.
        if isinstance(
            result.exception, SystemExit,
        ):
            error = output if output else (
                f"Unknown command: {args[0]}"
            )
            output = ""
        else:
            error = str(result.exception)

    return {
        "output": output,
        "exit_code": result.exit_code,
        "error": error,
    }
