"""Bearer token for the HTTP MCP transport.

The stdio transport is implicitly trusted because the client
launches the server process directly. The HTTP transport
needs an explicit shared secret so a stray local browser tab
or LAN peer cannot drive the user's tools without consent.

The token lives at ``DATA_DIR/mcp-token`` (not per-profile)
because the connection authenticates the user, not the
profile they happen to have selected. Active-profile
switches inside the running kai serve do not invalidate the
client's configured token, which matches what users expect.

Stored with mode 0600 and reused across restarts so that a
client configured once keeps working. Rotation is a file
delete plus next read.
"""
import hmac
import secrets
from pathlib import Path


TOKEN_FILENAME = "mcp-token"
TOKEN_BYTES = 32


def token_path(data_dir: Path) -> Path:
    """Return the on-disk token path for the data dir."""
    return Path(data_dir) / TOKEN_FILENAME


def load_or_create_token(data_dir: Path) -> str:
    """Return the user's MCP bearer token, generating one on
    first call. The file is created with 0600 perms so it is
    unreadable by other local users.
    """
    path = token_path(data_dir)
    if path.exists():
        value = path.read_text().strip()
        if value:
            return value
    token = secrets.token_urlsafe(TOKEN_BYTES)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(token)
    try:
        path.chmod(0o600)
    except OSError:
        # Windows filesystems without POSIX perms; the
        # token still lives under the user data dir.
        pass
    return token


def verify_token(data_dir: Path, presented: str) -> bool:
    """Constant-time compare a presented bearer token to the
    on-disk token. Returns False when the file is missing or
    the presented value is empty.
    """
    if not presented:
        return False
    path = token_path(data_dir)
    if not path.exists():
        return False
    expected = path.read_text().strip()
    if not expected:
        return False
    return hmac.compare_digest(expected, presented)
