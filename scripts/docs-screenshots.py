"""Capture screenshots for MkDocs documentation.

Switches to the demo-screenshots profile, captures all views,
then switches back to the original profile.

Requires:
  - Kaisho backend running on localhost:8765
  - demo-screenshots profile with sample data

Usage:
  python scripts/docs-screenshots.py
"""
import json
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8765"
OUT = Path(__file__).parent.parent / "docs" / "assets" / "images"
OUT.mkdir(parents=True, exist_ok=True)

DEMO_PROFILE = "demo-screenshots"

# Views to capture: (hash_route, filename, wait_ms)
VIEWS = [
    ("#/dashboard", "dashboard", 2000),
    ("#/kanban", "kanban", 2000),
    ("#/clocks", "clocks", 2000),
    ("#/customers", "customers", 2000),
    ("#/inbox", "inbox", 2000),
    ("#/notes", "notes", 2000),
    ("#/knowledge", "knowledge", 2000),
    ("#/github", "github", 2000),
    ("#/advisor", "advisor", 2000),
    ("#/cron", "cron", 2000),
    ("#/settings", "settings", 2000),
]


def api_get(path):
    """GET a JSON API endpoint."""
    with urllib.request.urlopen(f"{BASE}{path}") as r:
        return json.loads(r.read())


def api_put(path, data):
    """PUT JSON to an API endpoint."""
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{BASE}{path}", data=body, method="PUT",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def capture(page, route, name, wait_ms):
    """Navigate to a view and capture screenshot."""
    url = f"{BASE}/{route}"
    page.goto(url)
    page.wait_for_timeout(wait_ms)
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path))
    print(f"  {name}.png")


def main():
    # Remember current profile
    profiles = api_get("/api/settings/profiles")
    original = profiles["active"]
    print(f"Current profile: {original}")

    # Switch to demo profile
    if original != DEMO_PROFILE:
        api_put(
            "/api/settings/profile",
            {"profile": DEMO_PROFILE},
        )
        print(f"Switched to: {DEMO_PROFILE}")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                device_scale_factor=2,
            )
            page = context.new_page()

            # Initial load
            page.goto(BASE)
            page.wait_for_timeout(3000)

            # Dismiss "What's New" dialog if present
            try:
                ok = page.get_by_role(
                    "button", name="OK",
                )
                ok.wait_for(
                    state="visible", timeout=3000,
                )
                ok.click()
                page.wait_for_timeout(1000)
            except Exception:
                pass

            print("Capturing screenshots:")
            for route, name, wait_ms in VIEWS:
                capture(page, route, name, wait_ms)

            # Dark mode variants
            print("Capturing dark mode:")
            page.evaluate(
                "document.documentElement"
                ".setAttribute('data-theme', 'dark')"
            )
            page.wait_for_timeout(500)

            for route, name, wait_ms in [
                ("#/dashboard", "dashboard-dark", 2000),
                ("#/kanban", "kanban-dark", 2000),
                ("#/customers", "customers-dark", 2000),
            ]:
                capture(page, route, name, wait_ms)

            browser.close()
            print("Done.")
    finally:
        # Switch back to original profile
        if original != DEMO_PROFILE:
            api_put(
                "/api/settings/profile",
                {"profile": original},
            )
            print(f"Restored profile: {original}")


if __name__ == "__main__":
    main()
