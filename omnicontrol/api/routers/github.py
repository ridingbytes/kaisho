from fastapi import APIRouter, HTTPException

from ...backends import get_backend
from ...services.github import GhError, issues_for_customers, list_issues

router = APIRouter(prefix="/api/github", tags=["github"])


@router.get("/issues")
def api_all_issues(state: str = "open", limit: int = 30):
    """Return open issues grouped by customer."""
    customers = get_backend().customers.list_customers()
    try:
        return issues_for_customers(customers, state=state, limit=limit)
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="gh CLI not found. Install GitHub CLI.",
        )


@router.get("/issues/{customer}")
def api_customer_issues(
    customer: str,
    state: str = "open",
    limit: int = 30,
):
    """Return issues for a single customer."""
    customers = get_backend().customers.list_customers()
    match = next(
        (c for c in customers if c["name"].lower() == customer.lower()),
        None,
    )
    if match is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    repo = match.get("repo") or match.get("properties", {}).get("REPO")
    if not repo:
        raise HTTPException(
            status_code=404, detail="Customer has no repo configured"
        )
    try:
        issues = list_issues(repo, state=state, limit=limit)
    except GhError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"customer": match["name"], "repo": repo, "issues": issues}
