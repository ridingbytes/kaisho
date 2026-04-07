import json
import sys

import click

from ..backends import get_backend
from ..services import github as gh_service
from ..services.github import GhError


def _repo(name: str) -> str:
    """Resolve repo for a customer name, exit if not found."""
    customers = get_backend().customers.list_customers(
        include_inactive=True
    )
    for c in customers:
        if c["name"].lower() == name.lower():
            repo = c.get("repo") or c.get(
                "properties", {}
            ).get("REPO")
            if repo:
                return repo
            click.echo(
                f"No REPO property set for customer: {name}",
                err=True,
            )
            sys.exit(1)
    click.echo(f"Customer not found: {name}", err=True)
    sys.exit(1)


@click.group("gh")
def gh():
    """GitHub integration (wraps the gh CLI)."""


@gh.command("issues")
@click.argument("customer")
@click.option("--all", "show_all", is_flag=True,
              help="Include closed issues")
@click.option("--limit", default=30, show_default=True)
@click.option("--json", "as_json", is_flag=True)
def gh_issues(customer, show_all, limit, as_json):
    """List GitHub issues for a customer's repo."""
    repo = _repo(customer)
    state = "all" if show_all else "open"
    try:
        issues = gh_service.list_issues(
            repo, state=state, limit=limit
        )
    except GhError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(issues, default=str))
        return
    click.echo(repo)
    if not issues:
        click.echo("  No issues found.")
        return
    for i in issues:
        labels = " ".join(
            f":{lb['name']}:" for lb in i.get("labels", [])
        )
        created = i.get("createdAt", "")[:10]
        click.echo(
            f"  #{i['number']:<5} {i['state']:<6} "
            f"{i['title']:<50} {labels}  {created}"
        )


@gh.command("show")
@click.argument("customer")
@click.argument("number", type=int)
@click.option("--json", "as_json", is_flag=True)
def gh_show(customer, number, as_json):
    """Show details for a GitHub issue."""
    repo = _repo(customer)
    try:
        issue = gh_service.show_issue(repo, number)
    except GhError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(issue, default=str))
        return
    click.echo(f"#{issue['number']} {issue['title']}")
    click.echo(f"State:   {issue['state']}")
    click.echo(f"Created: {issue.get('createdAt', '')[:10]}")
    click.echo(f"URL:     {issue.get('url', '')}")
    if issue.get("body"):
        click.echo("")
        click.echo(issue["body"])


@gh.command("prs")
@click.argument("customer")
@click.option("--all", "show_all", is_flag=True)
@click.option("--limit", default=20, show_default=True)
@click.option("--json", "as_json", is_flag=True)
def gh_prs(customer, show_all, limit, as_json):
    """List open pull requests for a customer's repo."""
    repo = _repo(customer)
    state = "all" if show_all else "open"
    try:
        prs = gh_service.list_prs(repo, state=state, limit=limit)
    except GhError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(prs, default=str))
        return
    click.echo(repo)
    if not prs:
        click.echo("  No pull requests found.")
        return
    for pr in prs:
        draft = " [draft]" if pr.get("isDraft") else ""
        created = pr.get("createdAt", "")[:10]
        click.echo(
            f"  #{pr['number']:<5} {pr['title']}{draft}"
            f"  {created}"
        )


@gh.command("open")
@click.argument("customer")
@click.argument("number", type=int, required=False)
def gh_open(customer, number):
    """Open a customer's repo or issue in the browser."""
    repo = _repo(customer)
    try:
        gh_service.open_in_browser(repo, number)
    except (GhError, Exception) as e:
        click.echo(str(e), err=True)
        sys.exit(1)


@gh.command("projects")
@click.option("--customer", "-c", default=None,
              help="Filter by customer name")
@click.option("--status", "-s", default=None,
              help="Filter by status column")
@click.option("--json", "as_json", is_flag=True)
def gh_projects(customer, status, as_json):
    """List GitHub Projects v2 for customers."""
    customers = get_backend().customers.list_customers(
        include_inactive=True,
    )
    if customer:
        customers = [
            c for c in customers
            if c["name"].lower() == customer.lower()
        ]
        if not customers:
            click.echo(
                f"Customer not found: {customer}",
                err=True,
            )
            sys.exit(1)
    try:
        results = gh_service.projects_for_customers(
            customers,
        )
    except GhError as e:
        click.echo(str(e), err=True)
        sys.exit(1)
    if as_json:
        click.echo(json.dumps(results, default=str))
        return
    for group in results:
        click.echo(
            f"\n{group['customer']}"
            f"  ({group['repo']})"
        )
        for proj in group.get("projects", []):
            click.echo(
                f"  Project: {proj.get('title', '?')}"
            )
            for col in proj.get("columns", []):
                col_name = col.get("name", "?")
                if status and col_name.lower() != (
                    status.lower()
                ):
                    continue
                items = col.get("items", [])
                if not items:
                    continue
                click.echo(f"    [{col_name}]")
                for item in items:
                    title = item.get("title", "?")
                    num = item.get("number", "")
                    num_str = (
                        f"#{num} " if num else ""
                    )
                    click.echo(
                        f"      {num_str}{title}"
                    )


@gh.command("all-issues")
@click.option("--json", "as_json", is_flag=True)
def gh_all_issues(as_json):
    """List open issues across all customer repos."""
    customers = get_backend().customers.list_customers()
    results = gh_service.issues_for_customers(customers)
    if as_json:
        click.echo(json.dumps(results, default=str))
        return
    for group in results:
        count = len(group["issues"])
        click.echo(f"\n{group['customer']}  ({group['repo']})")
        if not group["issues"]:
            click.echo("  No open issues.")
            continue
        for i in group["issues"]:
            created = i.get("createdAt", "")[:10]
            click.echo(
                f"  #{i['number']:<5} {i['title']:<50}  {created}"
            )
        click.echo(f"  — {count} issue(s)")
