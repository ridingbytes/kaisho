import re
from pathlib import Path

from ..org.models import Heading
from ..org.parser import parse_org_file
from ..org.writer import write_org_file

CUSTOMER_KEYWORDS: set[str] = {"CONTRACT"}
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


def _heading_to_contract(heading: "Heading", customer_name: str) -> dict:
    """Convert a CONTRACT-keyword heading to a contract dict."""
    props = heading.properties
    budget = _extract_hours(props.get("KONTINGENT", "0"))
    used_offset = _extract_hours(props.get("VERBRAUCHT", "0"))
    return {
        "customer": customer_name,
        "name": heading.title.strip(),
        "budget": budget,
        "start_date": props.get("START", ""),
        "end_date": props.get("END_DATE") or None,
        "notes": "\n".join(heading.body).strip(),
        "used_offset": used_offset,
        "used": 0.0,
        "rest": budget,
    }


def _heading_to_customer(heading: Heading) -> dict:
    props = heading.properties
    contract_children = [
        c for c in heading.children if c.keyword == "CONTRACT"
    ]
    name = heading.title.strip()
    contracts = [_heading_to_contract(c, name) for c in contract_children]

    if contracts:
        active = next(
            (c for c in contracts if not c["end_date"]), None
        )
        budget = active["budget"] if active else 0.0
        used = active["used_offset"] if active else 0.0
        rest = budget - used
    else:
        budget = _extract_hours(props.get("KONTINGENT", "0"))
        used = _extract_hours(props.get("VERBRAUCHT", "0"))
        rest = budget - used

    return {
        "name": name,
        "status": props.get("STATUS", "active"),
        "type": props.get("TYPE", ""),
        "tags": list(heading.tags),
        "budget": budget,
        "used": used,
        "rest": rest,
        "repo": props.get("REPO", None),
        "contracts": contracts,
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


def _clock_hours_for_customer(
    clocks_file: Path, customer_name: str
) -> float:
    """Sum all clock entry hours for a customer (all time)."""
    from . import clocks as clocks_svc
    entries = clocks_svc.list_entries(
        clocks_file, period="all", customer=customer_name
    )
    return sum((e.get("duration_minutes") or 0) / 60.0 for e in entries)


def _enrich_customer(customer: dict, clocks_file: Path) -> dict:
    """Add clock-derived hours to a customer's used and rest."""
    clock_h = _clock_hours_for_customer(clocks_file, customer["name"])
    used = round(customer["used"] + clock_h, 2)
    rest = round(customer["budget"] - used, 2)
    return {**customer, "used": used, "rest": rest}


def list_customers(
    kunden_file: Path,
    clocks_file: Path,
    include_inactive: bool = False,
) -> list[dict]:
    """List customers from customers file, enriched with clock hours."""
    if not kunden_file.exists():
        return []
    org_file = parse_org_file(kunden_file, CUSTOMER_KEYWORDS)
    customers = []
    for h1 in org_file.headings:
        for h2 in h1.children:
            customer = _heading_to_customer(h2)
            if include_inactive or _is_active(customer):
                customers.append(_enrich_customer(customer, clocks_file))
    return customers


def get_customer(
    kunden_file: Path, clocks_file: Path, name: str
) -> dict | None:
    """Get a customer by name."""
    all_customers = list_customers(
        kunden_file, clocks_file, include_inactive=True
    )
    name_lower = name.lower()
    for customer in all_customers:
        if customer["name"].lower() == name_lower:
            return customer
    return None


_PROP_MAP = {
    "status": "STATUS",
    "type": "TYPE",
    "budget": "KONTINGENT",
    "used_offset": "VERBRAUCHT",
    "repo": "REPO",
}


def add_customer(
    kunden_file: Path,
    name: str,
    status: str = "active",
    customer_type: str = "",
    budget: float = 0,
    repo: str | None = None,
    tags: list[str] | None = None,
) -> dict:
    """Add a new customer heading to customers file.

    Appends under the first level-1 group heading, or creates one
    called 'Kunden' if the file is empty.
    Raises ValueError if a customer with that name already exists.
    """
    kunden_file.parent.mkdir(parents=True, exist_ok=True)
    if not kunden_file.exists():
        kunden_file.write_text("", encoding="utf-8")

    if _find_customer_heading(kunden_file, name) is not None:
        raise ValueError(f"Customer already exists: {name}")

    props: dict[str, str] = {"STATUS": status}
    if customer_type:
        props["TYPE"] = customer_type
    if budget:
        props["KONTINGENT"] = f"{budget}h"
    if repo:
        props["REPO"] = repo

    new_heading = Heading(
        level=2,
        title=name,
        tags=tags or [],
        properties=props,
        dirty=True,
    )

    org_file = parse_org_file(kunden_file, CUSTOMER_KEYWORDS)
    if org_file.headings:
        org_file.headings[0].children.append(new_heading)
    else:
        group = Heading(level=1, title="Kunden", dirty=True)
        group.children.append(new_heading)
        org_file.headings.append(group)

    write_org_file(kunden_file, org_file)
    return _heading_to_customer(new_heading)


def update_customer(
    kunden_file: Path,
    name: str,
    updates: dict,
) -> dict | None:
    """Update a customer's fields and persist to disk.

    Supported keys in *updates*: name, status, budget, repo.
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
            if "tags" in updates:
                h2.tags = list(updates["tags"])
            for field, prop in _PROP_MAP.items():
                if field not in updates:
                    continue
                val = updates[field]
                if field in ("budget", "used_offset"):
                    h2.properties[prop] = f"{val}h"
                elif val:
                    h2.properties[prop] = str(val)
                else:
                    h2.properties.pop(prop, None)
            h2.dirty = True
            write_org_file(kunden_file, org_file)
            return _heading_to_customer(h2)
    return None


def get_budget_summary(
    kunden_file: Path, clocks_file: Path
) -> list[dict]:
    """Return budget summary for all active customers."""
    customers = list_customers(
        kunden_file, clocks_file, include_inactive=False
    )
    summaries = []
    for customer in customers:
        budget = customer["budget"]
        rest = customer["rest"]
        if budget > 0:
            percent = round((rest / budget) * 100)
        else:
            percent = 0
        summaries.append({
            "name": customer["name"],
            "budget": budget,
            "rest": rest,
            "percent": percent,
        })
    return summaries


def _clock_hours_by_contract(
    clocks_file: Path, customer_name: str
) -> dict[str, float]:
    """Return {contract_name: hours} from clock entries."""
    from . import clocks as clocks_svc
    entries = clocks_svc.list_entries(
        clocks_file, period="all", customer=customer_name
    )
    totals: dict[str, float] = {}
    for entry in entries:
        contract = entry.get("contract") or ""
        if not contract:
            continue
        mins = entry.get("duration_minutes") or 0
        totals[contract] = totals.get(contract, 0.0) + mins / 60.0
    return totals


def list_contracts(
    kunden_file: Path, clocks_file: Path, customer_name: str
) -> list[dict]:
    """List contracts for a customer with clock-derived hours."""
    result = _find_customer_heading(kunden_file, customer_name)
    if result is None:
        raise ValueError(f"Customer not found: {customer_name}")
    _, h2 = result
    name = h2.title.strip()
    contracts = [
        _heading_to_contract(c, name)
        for c in h2.children
        if c.keyword == "CONTRACT"
    ]
    hours_map = _clock_hours_by_contract(clocks_file, customer_name)
    enriched = []
    for contract in contracts:
        clock_h = hours_map.get(contract["name"], 0.0)
        used = round(
            contract["used_offset"] + clock_h, 2
        )
        rest = round(contract["budget"] - used, 2)
        enriched.append(
            {**contract, "used": used, "rest": rest}
        )
    return enriched


def add_contract(
    kunden_file: Path,
    customer_name: str,
    name: str,
    budget: float,
    start_date: str,
    notes: str = "",
) -> dict:
    """Add a named contract to a customer."""
    result = _find_customer_heading(kunden_file, customer_name)
    if result is None:
        raise ValueError(f"Customer not found: {customer_name}")
    org_file, h2 = result
    existing = {
        c.title.strip().lower()
        for c in h2.children
        if c.keyword == "CONTRACT"
    }
    if name.lower() in existing:
        raise ValueError(f"Contract already exists: {name}")
    props: dict[str, str] = {
        "KONTINGENT": f"{budget}h",
        "START": start_date,
    }
    new_contract = Heading(
        level=3,
        keyword="CONTRACT",
        title=name,
        properties=props,
        body=notes.splitlines() if notes else [],
        dirty=True,
    )
    h2.children.append(new_contract)
    h2.dirty = True
    write_org_file(kunden_file, org_file)
    return _heading_to_contract(new_contract, h2.title.strip())


def update_contract(
    kunden_file: Path,
    customer_name: str,
    contract_name: str,
    updates: dict,
) -> dict | None:
    """Update fields of a contract. Supported keys:
    name, budget, start_date, end_date, notes.
    """
    result = _find_customer_heading(kunden_file, customer_name)
    if result is None:
        return None
    org_file, h2 = result
    name_lower = contract_name.lower()
    for child in h2.children:
        if child.keyword != "CONTRACT":
            continue
        if child.title.strip().lower() != name_lower:
            continue
        if "name" in updates:
            child.title = updates["name"]
        if "budget" in updates:
            child.properties["KONTINGENT"] = f"{updates['budget']}h"
        if "start_date" in updates:
            child.properties["START"] = updates["start_date"]
        if "end_date" in updates:
            if updates["end_date"]:
                child.properties["END_DATE"] = updates["end_date"]
            else:
                child.properties.pop("END_DATE", None)
        if "used_offset" in updates:
            child.properties["VERBRAUCHT"] = (
                f"{updates['used_offset']}h"
            )
        if "notes" in updates:
            child.body = (
                updates["notes"].splitlines()
                if updates["notes"]
                else []
            )
        child.dirty = True
        h2.dirty = True
        write_org_file(kunden_file, org_file)
        return _heading_to_contract(child, h2.title.strip())
    return None


def close_contract(
    kunden_file: Path,
    customer_name: str,
    contract_name: str,
    end_date: str,
) -> dict | None:
    """Set END_DATE on a contract, marking it closed."""
    return update_contract(
        kunden_file, customer_name, contract_name,
        {"end_date": end_date},
    )


def delete_contract(
    kunden_file: Path,
    customer_name: str,
    contract_name: str,
) -> bool:
    """Delete a contract from a customer."""
    result = _find_customer_heading(kunden_file, customer_name)
    if result is None:
        return False
    org_file, h2 = result
    name_lower = contract_name.lower()
    for i, child in enumerate(h2.children):
        if (child.keyword == "CONTRACT"
                and child.title.strip().lower() == name_lower):
            h2.children.pop(i)
            h2.dirty = True
            write_org_file(kunden_file, org_file)
            return True
    return False

