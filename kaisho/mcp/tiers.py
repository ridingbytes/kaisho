"""Tool tier filtering for the MCP server."""
from ..cron.tool_defs import TOOL_DEFS

VALID_TIERS = {"read", "write", "destructive"}


def filter_tools(allowed: set[str]) -> list[dict]:
    """Return tool defs whose tier is in allowed set."""
    return [
        t for t in TOOL_DEFS
        if t.get("tier", "read") in allowed
    ]


def parse_tiers(tier_str: str) -> set[str]:
    """Parse comma-separated tier string.

    ``write`` implies ``read``.
    ``destructive`` implies both.
    """
    tiers = {
        t.strip() for t in tier_str.split(",")
    }
    if "destructive" in tiers:
        tiers |= {"read", "write"}
    elif "write" in tiers:
        tiers.add("read")
    return tiers & VALID_TIERS
