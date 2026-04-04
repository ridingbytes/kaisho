"""GitHub service.

Wraps the `gh` CLI binary. Repos are resolved from the customer's
REPO property in kunden.org. Results are returned as plain dicts;
no caching layer here — callers can cache if needed.
"""
import json
import subprocess
from pathlib import Path


class GhError(RuntimeError):
    """Raised when the gh CLI exits with a non-zero status."""


def _gh(*args: str) -> list | dict:
    """Run `gh <args> --json ...` and return parsed output."""
    cmd = ["gh", *args]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise GhError(result.stderr.strip() or " ".join(cmd))
    return json.loads(result.stdout)


def _repo_for_customer(
    customers: list[dict], customer_name: str
) -> str | None:
    """Return REPO property for a customer, or None."""
    for c in customers:
        if c["name"].lower() == customer_name.lower():
            return c.get("repo") or c.get("properties", {}).get(
                "REPO"
            )
    return None


def list_issues(
    repo: str,
    state: str = "open",
    limit: int = 30,
) -> list[dict]:
    """Return issues for a GitHub repo.

    Each dict: number, title, state, createdAt, labels, url
    """
    items = _gh(
        "issue", "list",
        "--repo", repo,
        "--state", state,
        "--limit", str(limit),
        "--json", "number,title,state,createdAt,labels,url",
    )
    return items  # type: ignore[return-value]


def show_issue(repo: str, number: int) -> dict:
    """Return full details of a single issue."""
    item = _gh(
        "issue", "view",
        str(number),
        "--repo", repo,
        "--json",
        "number,title,state,body,createdAt,labels,url,assignees",
    )
    return item  # type: ignore[return-value]


def list_prs(
    repo: str,
    state: str = "open",
    limit: int = 20,
) -> list[dict]:
    """Return pull requests for a GitHub repo.

    Each dict: number, title, state, createdAt, url, isDraft
    """
    items = _gh(
        "pr", "list",
        "--repo", repo,
        "--state", state,
        "--limit", str(limit),
        "--json", "number,title,state,createdAt,url,isDraft",
    )
    return items  # type: ignore[return-value]


def open_in_browser(repo: str, number: int | None = None) -> None:
    """Open repo or issue in the default browser."""
    if number is not None:
        subprocess.run(
            ["gh", "issue", "view", str(number),
             "--repo", repo, "--web"],
            check=True,
        )
    else:
        subprocess.run(
            ["gh", "repo", "view", repo, "--web"],
            check=True,
        )


def issues_for_customers(
    customers: list[dict],
    state: str = "open",
    limit: int = 30,
) -> list[dict]:
    """Return issues grouped by customer for all customers with a repo.

    Each dict: customer, repo, issues (list)
    """
    results = []
    for c in customers:
        repo = c.get("repo") or c.get("properties", {}).get("REPO")
        if not repo:
            continue
        try:
            issues = list_issues(repo, state=state, limit=limit)
        except GhError:
            issues = []
        results.append({
            "customer": c["name"],
            "repo": repo,
            "issues": issues,
        })
    return results
