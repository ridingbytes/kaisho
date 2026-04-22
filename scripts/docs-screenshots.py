"""Capture screenshots for MkDocs documentation.

Uses the running Kaisho instance on localhost:8765.
Saves to docs/assets/images/.
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8765"
OUT = Path(__file__).parent.parent / "docs" / "assets" / "images"
OUT.mkdir(parents=True, exist_ok=True)

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


def capture(page, route, name, wait_ms):
    """Navigate to a view and capture screenshot."""
    url = f"{BASE}/{route}"
    page.goto(url)
    page.wait_for_timeout(wait_ms)
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path))
    print(f"  {name}.png")


def main():
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


if __name__ == "__main__":
    main()
