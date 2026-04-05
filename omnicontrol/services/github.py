"""GitHub service.

Fetches issues and PRs either via the GitHub REST API (when a personal
access token is configured) or via the `gh` CLI binary as a fallback.
Repos are resolved from the customer's REPO property in kunden.org.
"""
import json
import subprocess
from pathlib import Path

import httpx

from ..config import get_config
from .settings import get_github_settings, load_settings


class GhError(RuntimeError):
    """Raised when the GitHub API or gh CLI returns an error."""


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------


def _github_cfg() -> dict:
    cfg = get_config()
    data = load_settings(cfg.SETTINGS_FILE)
    return get_github_settings(data)


def _token() -> str:
    return _github_cfg().get("token", "")


def _base_url() -> str:
    return _github_cfg().get("base_url", "https://api.github.com")


# ---------------------------------------------------------------------------
# API backend (httpx)
# ---------------------------------------------------------------------------


def _api_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _api_get(path: str, params: dict | None = None) -> list | dict:
    token = _token()
    base = _base_url()
    url = base.rstrip("/") + path
    try:
        resp = httpx.get(
            url,
            headers=_api_headers(token),
            params=params,
            timeout=10,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise GhError(
            f"GitHub API error {e.response.status_code}: {path}"
        ) from e
    except httpx.RequestError as e:
        raise GhError(f"GitHub API request failed: {e}") from e
    return resp.json()


def _api_issues(
    repo: str, state: str = "open", limit: int = 30
) -> list[dict]:
    owner, name = repo.split("/", 1)
    path = f"/repos/{owner}/{name}/issues"
    params = {"state": state, "per_page": min(limit, 100), "type": "issue"}
    items = _api_get(path, params)
    return [_normalize_issue(i) for i in items if "pull_request" not in i]


def _api_prs(
    repo: str, state: str = "open", limit: int = 20
) -> list[dict]:
    owner, name = repo.split("/", 1)
    path = f"/repos/{owner}/{name}/pulls"
    params = {"state": state, "per_page": min(limit, 100)}
    items = _api_get(path, params)
    return [_normalize_pr(i) for i in items]


def _normalize_label(label: dict) -> dict:
    return {"name": label.get("name", ""), "color": label.get("color", "")}


def _normalize_issue(item: dict) -> dict:
    return {
        "number": item["number"],
        "title": item["title"],
        "state": item["state"],
        "createdAt": item.get("created_at", ""),
        "labels": [_normalize_label(l) for l in item.get("labels", [])],
        "url": item.get("html_url", ""),
    }


def _normalize_pr(item: dict) -> dict:
    return {
        "number": item["number"],
        "title": item["title"],
        "state": item["state"],
        "createdAt": item.get("created_at", ""),
        "url": item.get("html_url", ""),
        "isDraft": item.get("draft", False),
    }


# ---------------------------------------------------------------------------
# gh CLI backend
# ---------------------------------------------------------------------------


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


def _gh_issues(
    repo: str, state: str = "open", limit: int = 30
) -> list[dict]:
    return _gh(
        "issue", "list",
        "--repo", repo,
        "--state", state,
        "--limit", str(limit),
        "--json", "number,title,state,createdAt,labels,url",
    )  # type: ignore[return-value]


def _gh_prs(
    repo: str, state: str = "open", limit: int = 20
) -> list[dict]:
    return _gh(
        "pr", "list",
        "--repo", repo,
        "--state", state,
        "--limit", str(limit),
        "--json", "number,title,state,createdAt,url,isDraft",
    )  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Public API (dispatcher)
# ---------------------------------------------------------------------------


def _repo_for_customer(
    customers: list[dict], customer_name: str
) -> str | None:
    """Return REPO property for a customer, or None."""
    for c in customers:
        if c["name"].lower() == customer_name.lower():
            return c.get("repo") or c.get("properties", {}).get("REPO")
    return None


def list_issues(
    repo: str, state: str = "open", limit: int = 30
) -> list[dict]:
    """Return issues for a GitHub repo."""
    if _token():
        return _api_issues(repo, state=state, limit=limit)
    return _gh_issues(repo, state=state, limit=limit)


def show_issue(repo: str, number: int) -> dict:
    """Return full details of a single issue."""
    if _token():
        owner, name = repo.split("/", 1)
        item = _api_get(f"/repos/{owner}/{name}/issues/{number}")
        return {
            **_normalize_issue(item),  # type: ignore[arg-type]
            "body": item.get("body", ""),  # type: ignore[union-attr]
            "assignees": [
                a.get("login", "")
                for a in item.get("assignees", [])  # type: ignore[union-attr]
            ],
        }
    return _gh(
        "issue", "view", str(number),
        "--repo", repo,
        "--json",
        "number,title,state,body,createdAt,labels,url,assignees",
    )  # type: ignore[return-value]


def list_prs(
    repo: str, state: str = "open", limit: int = 20
) -> list[dict]:
    """Return pull requests for a GitHub repo."""
    if _token():
        return _api_prs(repo, state=state, limit=limit)
    return _gh_prs(repo, state=state, limit=limit)


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
    """Return issues grouped by customer for all customers with a repo."""
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
