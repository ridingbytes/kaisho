import re
from datetime import date
from pathlib import Path

from ..org.models import Heading
from ..org.parser import parse_org_file
from ..org.writer import write_org_file

CUSTOMER_KEYWORDS: set[str] = set()
# Only extract hours when explicitly marked with "h" unit
HOURS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*h\b", re.IGNORECASE)
# Matches "YYYY-MM-DD: description" heading titles
_ENTRY_TITLE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}):\s*(.+)$")


def _extract_hours(value: str) -> float:
    """Extract numeric hours from a property value.

    Returns 0 if value does not contain an explicit hours unit.
    """
    m = HOURS_RE.search(value)
    if m:
        return float(m.group(1))
    return 0.0


def _sum_entry_hours(heading: Heading) -> float:
    """Sum the HOURS property of all heading children."""
    total = 0.0
    for child in heading.children:
        raw = child.properties.get("HOURS", "0")
        try:
            total += float(raw)
        except ValueError:
            pass
    return total


def _heading_to_customer(heading: Heading) -> dict:
    """Convert a level-2 Heading to a customer dict."""
    props = heading.properties
    kontingent = _extract_hours(props.get("KONTINGENT", "0"))
    stored_verbraucht = _extract_hours(props.get("VERBRAUCHT", "0"))
    if heading.children:
        verbraucht = stored_verbraucht + _sum_entry_hours(heading)
        rest = kontingent - verbraucht
    else:
        verbraucht = stored_verbraucht
        rest = _extract_hours(props.get("REST", "0"))
    return {
        "name": heading.title.strip(),
        "status": props.get("STATUS", "active"),
        "kontingent": kontingent,
        "verbraucht": verbraucht,
        "rest": rest,
        "repo": props.get("REPO", None),
        "has_time_entries": bool(heading.children),
        "properties": dict(props),
    }


def _is_active(customer: dict) -> bool:
    """Check if customer is active."""
    status = customer.get("status", "active").lower()
    return status not in ("inactive", "archiv", "archived")


def _find_customer_heading(
    kunden_file: Path, name: str
) -> tuple | None:
    """Find the level-2 heading for a customer by name.

    Returns (org_file, h2) or None if not found.
    """
    org_file = parse_org_file(kunden_file, CUSTOMER_KEYWORDS)
    name_lower = name.lower()
    for h1 in org_file.headings:
        for h2 in h1.children:
            if h2.title.strip().lower() == name_lower:
                return org_file, h2
    return None


def _parse_entry_title(title: str) -> tuple[str, str]:
    """Parse 'YYYY-MM-DD: description' into (date, description).

    Falls back to ("", title) for entries without a date prefix.
    """
    m = _ENTRY_TITLE_RE.match(title.strip())
    if m:
        return m.group(1), m.group(2)
    return "", title.strip()


def _entry_to_dict(child: Heading, idx: int) -> dict:
    """Convert a time-entry child heading to a dict."""
    date_str, description = _parse_entry_title(child.title)
    if not date_str:
        date_str = child.properties.get("DATE", "")
    return {
        "id": str(idx + 1),
        "description": description,
        "hours": float(child.properties.get("HOURS", "0")),
        "date": date_str,
    }


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
    "repo": "REPO",
}


def update_customer(
    kunden_file: Path,
    name: str,
    updates: dict,
) -> dict | None:
    """Update a customer's fields and persist to disk.

    Supported keys in *updates*: name, status, kontingent, repo.
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
                if field == "kontingent":
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


def list_time_entries(kunden_file: Path, name: str) -> list[dict]:
    """List time entries for a customer."""
    result = _find_customer_heading(kunden_file, name)
    if result is None:
        raise ValueError(f"Customer not found: {name}")
    _, h2 = result
    return [_entry_to_dict(c, i) for i, c in enumerate(h2.children)]


def add_time_entry(
    kunden_file: Path,
    name: str,
    description: str,
    hours: float,
    entry_date: str | None = None,
) -> dict:
    """Add a time entry to a customer. Returns the created entry dict."""
    result = _find_customer_heading(kunden_file, name)
    if result is None:
        raise ValueError(f"Customer not found: {name}")
    org_file, h2 = result
    today = entry_date or date.today().isoformat()
    new_child = Heading(
        level=3,
        keyword=None,
        title=f"{today}: {description}",
        properties={"HOURS": str(hours), "DATE": today},
        dirty=True,
    )
    h2.children.append(new_child)
    h2.dirty = True
    write_org_file(kunden_file, org_file)
    idx = len(h2.children) - 1
    return _entry_to_dict(new_child, idx)


def update_time_entry(
    kunden_file: Path,
    name: str,
    entry_id: str,
    description: str | None = None,
    hours: float | None = None,
    entry_date: str | None = None,
) -> dict | None:
    """Update fields of a time entry. Returns None if not found."""
    result = _find_customer_heading(kunden_file, name)
    if result is None:
        return None
    org_file, h2 = result
    idx = int(entry_id) - 1
    if idx < 0 or idx >= len(h2.children):
        return None
    child = h2.children[idx]
    current_date, current_desc = _parse_entry_title(child.title)
    if not current_date:
        current_date = child.properties.get("DATE", "")
    new_date = entry_date if entry_date is not None else current_date
    new_desc = description if description is not None else current_desc
    child.title = (
        f"{new_date}: {new_desc}" if new_date else new_desc
    )
    if hours is not None:
        child.properties["HOURS"] = str(hours)
    if entry_date is not None:
        child.properties["DATE"] = entry_date
    child.dirty = True
    h2.dirty = True
    write_org_file(kunden_file, org_file)
    return _entry_to_dict(child, idx)


def delete_time_entry(
    kunden_file: Path, name: str, entry_id: str
) -> bool:
    """Delete a time entry by 1-based ID. Returns False if not found."""
    result = _find_customer_heading(kunden_file, name)
    if result is None:
        return False
    org_file, h2 = result
    idx = int(entry_id) - 1
    if idx < 0 or idx >= len(h2.children):
        return False
    h2.children.pop(idx)
    h2.dirty = True
    write_org_file(kunden_file, org_file)
    return True
