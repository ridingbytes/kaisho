"""GitHub service.

Fetches issues and PRs via the GitHub REST API using urllib.request.
Repos are resolved from the customer's REPO property in kunden.org.
"""
import json
import urllib.request
import urllib.error
import urllib.parse
import webbrowser

from ..config import get_config
from .settings import get_github_settings, load_settings


class GhError(RuntimeError):
    """Raised when the GitHub API returns an error."""


# ------------------------------------------------------------------
# Config helpers
# ------------------------------------------------------------------


def _github_cfg() -> dict:
    cfg = get_config()
    data = load_settings(cfg.SETTINGS_FILE)
    return get_github_settings(data)


def _require_token() -> str:
    """Return the configured token or raise."""
    token = _github_cfg().get("token", "")
    if not token:
        raise GhError(
            "No GitHub token configured. "
            "Set a Personal Access Token in Settings."
        )
    return token


def _base_url() -> str:
    return _github_cfg().get(
        "base_url", "https://api.github.com"
    )


# ------------------------------------------------------------------
# HTTP helpers (urllib.request)
# ------------------------------------------------------------------


def _api_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _api_get(
    path: str, params: dict | None = None
) -> list | dict:
    token = _require_token()
    base = _base_url().rstrip("/")
    url = base + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url, headers=_api_headers(token)
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise GhError(
            f"GitHub API error {exc.code}: {path}"
        ) from exc
    except urllib.error.URLError as exc:
        raise GhError(
            f"GitHub API request failed: {exc.reason}"
        ) from exc


# ------------------------------------------------------------------
# Repo normalizer
# ------------------------------------------------------------------


def _normalize_repo(repo: str) -> str | None:
    """Extract owner/name from a repo string or URL.

    Accepts: 'owner/name', 'https://github.com/owner/name',
    'https://github.com/owner/name.git'.
    Returns None for invalid formats like 'None' or bare names.
    """
    repo = repo.strip().rstrip("/")
    if repo.lower() in ("none", ""):
        return None
    # Strip GitHub URL prefix
    for prefix in (
        "https://github.com/",
        "http://github.com/",
        "git@github.com:",
    ):
        if repo.lower().startswith(prefix.lower()):
            repo = repo[len(prefix):]
            break
    # Strip .git suffix
    if repo.endswith(".git"):
        repo = repo[:-4]
    if "/" not in repo:
        return None
    return repo


# ------------------------------------------------------------------
# Issue / PR fetchers
# ------------------------------------------------------------------


def _fetch_issues(
    repo: str, state: str = "open", limit: int = 30
) -> list[dict]:
    if "/" not in repo:
        raise GhError(f"Invalid repo format: {repo!r}")
    owner, name = repo.split("/", 1)
    path = f"/repos/{owner}/{name}/issues"
    params = {
        "state": state,
        "per_page": min(limit, 100),
    }
    items = _api_get(path, params)
    return [
        _normalize_issue(i)
        for i in items
        if "pull_request" not in i
    ]


def _fetch_prs(
    repo: str, state: str = "open", limit: int = 20
) -> list[dict]:
    if "/" not in repo:
        raise GhError(f"Invalid repo format: {repo!r}")
    owner, name = repo.split("/", 1)
    path = f"/repos/{owner}/{name}/pulls"
    params = {
        "state": state,
        "per_page": min(limit, 100),
    }
    items = _api_get(path, params)
    return [_normalize_pr(i) for i in items]


# ------------------------------------------------------------------
# Normalizers
# ------------------------------------------------------------------


def _normalize_label(label: dict) -> dict:
    return {
        "name": label.get("name", ""),
        "color": label.get("color", ""),
    }


def _normalize_issue(item: dict) -> dict:
    return {
        "number": item["number"],
        "title": item["title"],
        "state": item["state"],
        "createdAt": item.get("created_at", ""),
        "labels": [
            _normalize_label(lb)
            for lb in item.get("labels", [])
        ],
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


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------


def _repo_for_customer(
    customers: list[dict], customer_name: str
) -> str | None:
    """Return REPO property for a customer, or None."""
    for c in customers:
        if c["name"].lower() == customer_name.lower():
            return (
                c.get("repo")
                or c.get("properties", {}).get("REPO")
            )
    return None


def list_issues(
    repo: str, state: str = "open", limit: int = 30
) -> list[dict]:
    """Return issues for a GitHub repo."""
    return _fetch_issues(repo, state=state, limit=limit)


def show_issue(repo: str, number: int) -> dict:
    """Return full details of a single issue."""
    if "/" not in repo:
        raise GhError(f"Invalid repo format: {repo!r}")
    owner, name = repo.split("/", 1)
    item = _api_get(
        f"/repos/{owner}/{name}/issues/{number}"
    )
    return {
        **_normalize_issue(item),  # type: ignore[arg-type]
        "body": item.get("body", ""),  # type: ignore[union-attr]
        "assignees": [
            a.get("login", "")
            for a in item.get(  # type: ignore[union-attr]
                "assignees", []
            )
        ],
    }


def list_prs(
    repo: str, state: str = "open", limit: int = 20
) -> list[dict]:
    """Return pull requests for a GitHub repo."""
    return _fetch_prs(repo, state=state, limit=limit)


def open_in_browser(
    repo: str, number: int | None = None
) -> None:
    """Open repo or issue in the default browser."""
    if number is not None:
        url = f"https://github.com/{repo}/issues/{number}"
    else:
        url = f"https://github.com/{repo}"
    webbrowser.open(url)


def issues_for_customers(
    customers: list[dict],
    state: str = "open",
    limit: int = 30,
) -> list[dict]:
    """Return issues grouped by customer."""
    results = []
    for c in customers:
        raw = (
            c.get("repo")
            or c.get("properties", {}).get("REPO")
        )
        repo = _normalize_repo(raw or "")
        if not repo:
            continue
        try:
            issues = list_issues(
                repo, state=state, limit=limit
            )
        except GhError:
            issues = []
        results.append({
            "customer": c["name"],
            "repo": repo,
            "issues": issues,
        })
    return results


# ------------------------------------------------------------------
# GitHub Projects v2 (GraphQL)
# ------------------------------------------------------------------

_PROJECTS_QUERY = """
query($owner: String!, $first: Int!) {
  repositoryOwner(login: $owner) {
    ... on Organization {
      projectsV2(first: $first) {
        nodes {
          id title url closed
          items(first: 50) {
            nodes {
              id type
              content {
                ... on Issue {
                  number title state url
                  labels(first: 10) {
                    nodes { name color }
                  }
                }
                ... on PullRequest {
                  number title state url
                }
                ... on DraftIssue { title }
              }
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2SingleSelectField { name }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    ... on User {
      projectsV2(first: $first) {
        nodes {
          id title url closed
          items(first: 50) {
            nodes {
              id type
              content {
                ... on Issue {
                  number title state url
                  labels(first: 10) {
                    nodes { name color }
                  }
                }
                ... on PullRequest {
                  number title state url
                }
                ... on DraftIssue { title }
              }
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2SingleSelectField { name }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
"""


def _api_graphql(query: str, variables: dict) -> dict:
    token = _require_token()
    base = _base_url().rstrip("/")
    url = base + "/graphql"
    payload = json.dumps(
        {"query": query, "variables": variables}
    ).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            **_api_headers(token),
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise GhError(
            f"GitHub GraphQL error {exc.code}"
        ) from exc
    except urllib.error.URLError as exc:
        raise GhError(
            f"GitHub GraphQL request failed: {exc.reason}"
        ) from exc


def _item_status(item: dict) -> str | None:
    """Extract Status field value from a project item."""
    for fv in (item.get("fieldValues") or {}).get("nodes", []):
        field = (fv.get("field") or {})
        if field.get("name", "").lower() == "status":
            return fv.get("name")
    return None


def _normalize_project_item(item: dict) -> dict:
    content = item.get("content") or {}
    labels = [
        _normalize_label(lb)
        for lb in (
            content.get("labels") or {}
        ).get("nodes", [])
    ]
    return {
        "id": item.get("id", ""),
        "type": item.get("type", ""),
        "number": content.get("number"),
        "title": content.get("title", ""),
        "state": content.get("state", ""),
        "url": content.get("url", ""),
        "status": _item_status(item),
        "labels": labels,
    }


def _normalize_project(project: dict) -> dict:
    items = [
        _normalize_project_item(i)
        for i in (project.get("items") or {}).get("nodes", [])
    ]
    return {
        "id": project.get("id", ""),
        "title": project.get("title", ""),
        "url": project.get("url", ""),
        "closed": project.get("closed", False),
        "items": items,
    }


def _fetch_projects(owner: str) -> list[dict]:
    result = _api_graphql(
        _PROJECTS_QUERY, {"owner": owner, "first": 20}
    )
    owner_data = (
        (result.get("data") or {}).get("repositoryOwner") or {}
    )
    nodes = (owner_data.get("projectsV2") or {}).get("nodes") or []
    return [_normalize_project(p) for p in nodes]


def projects_for_customers(customers: list[dict]) -> list[dict]:
    """Return GitHub Projects v2 grouped by customer."""
    seen_owners: set[str] = set()
    results = []
    for c in customers:
        raw = (
            c.get("repo")
            or c.get("properties", {}).get("REPO")
        )
        repo = _normalize_repo(raw or "")
        if not repo:
            continue
        owner = repo.split("/")[0]
        if owner in seen_owners:
            continue
        seen_owners.add(owner)
        try:
            projects = _fetch_projects(owner)
        except GhError:
            projects = []
        results.append({
            "customer": c["name"],
            "repo": repo,
            "projects": projects,
        })
    return results
