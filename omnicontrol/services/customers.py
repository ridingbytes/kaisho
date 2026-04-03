import re
from pathlib import Path

from ..org.parser import parse_org_file
from ..org.writer import write_org_file

CUSTOMER_KEYWORDS: set[str] = set()
# Only extract hours when explicitly marked with "h" unit
HOURS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*h\b", re.IGNORECASE)


def _extract_hours(value: str) -> float:
    """Extract numeric hours from a property value.

    Returns 0 if value does not contain an explicit hours unit.
    """
    m = HOURS_RE.search(value)
    if m:
        return float(m.group(1))
    return 0.0


def _heading_to_customer(heading) -> dict:
    """Convert a level-2 Heading to a customer dict."""
    props = heading.properties
    return {
        "name": heading.title.strip(),
        "status": props.get("STATUS", "active"),
        "kontingent": _extract_hours(props.get("KONTINGENT", "0")),
        "verbraucht": _extract_hours(props.get("VERBRAUCHT", "0")),
        "rest": _extract_hours(props.get("REST", "0")),
        "repo": props.get("REPO", None),
        "properties": dict(props),
    }


def _is_active(customer: dict) -> bool:
    """Check if customer is active."""
    status = customer.get("status", "active").lower()
    return status not in ("inactive", "archiv", "archived")


def list_customers(
    kunden_file: Path,
    include_inactive: bool = False,
) -> list[dict]:
    """List customers from kunden.org."""
    if not kunden_file.exists():
        return []
    org_file = parse_org_file(kunden_file, CUSTOMER_KEYWORDS)
    customers = []
    for h1 in org_file.headings:
        for h2 in h1.children:
            customer = _heading_to_customer(h2)
            if include_inactive or _is_active(customer):
                customers.append(customer)
    return customers


def get_customer(kunden_file: Path, name: str) -> dict | None:
    """Get a customer by name."""
    customers = list_customers(kunden_file, include_inactive=True)
    name_lower = name.lower()
    for customer in customers:
        if customer["name"].lower() == name_lower:
            return customer
    return None


_PROP_MAP = {
    "status": "STATUS",
    "kontingent": "KONTINGENT",
    "verbraucht": "VERBRAUCHT",
    "rest": "REST",
    "repo": "REPO",
}


def update_customer(
    kunden_file: Path,
    name: str,
    updates: dict,
) -> dict | None:
    """Update a customer's fields and persist to disk.

    Supported keys in *updates*: name, status, kontingent,
    verbraucht, rest, repo.
    Returns the updated customer dict, or None if not found.
    """
    org_file = parse_org_file(kunden_file, CUSTOMER_KEYWORDS)
    name_lower = name.lower()
    for h1 in org_file.headings:
        for h2 in h1.children:
            if h2.title.strip().lower() != name_lower:
                continue
            if "name" in updates:
                h2.title = updates["name"]
            for field, prop in _PROP_MAP.items():
                if field not in updates:
                    continue
                val = updates[field]
                if field in ("kontingent", "verbraucht", "rest"):
                    h2.properties[prop] = f"{val}h"
                else:
                    h2.properties[prop] = str(val)
            h2.dirty = True
            write_org_file(kunden_file, org_file)
            return _heading_to_customer(h2)
    return None


def get_budget_summary(kunden_file: Path) -> list[dict]:
    """Return budget summary for all active customers."""
    customers = list_customers(kunden_file, include_inactive=False)
    summaries = []
    for customer in customers:
        kontingent = customer["kontingent"]
        rest = customer["rest"]
        if kontingent > 0:
            percent = round((rest / kontingent) * 100)
        else:
            percent = 0
        summaries.append({
            "name": customer["name"],
            "kontingent": kontingent,
            "rest": rest,
            "percent": percent,
        })
    return summaries
