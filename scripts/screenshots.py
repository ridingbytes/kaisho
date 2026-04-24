"""Take screenshots of each Kaisho view for the website."""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = Path(
    "/Users/rbartl/develop/kaisho-website/screenshots"
)
OUT.mkdir(exist_ok=True)

VIEWS = [
    ("dashboard", "/#/dashboard"),
    ("kanban", "/#/board"),
    ("customers", "/#/customers"),
    ("clocks", "/#/clocks"),
    ("inbox", "/#/inbox"),
    ("notes", "/#/notes"),
    ("advisor", "/#/advisor"),
    ("cron", "/#/cron"),
    ("settings", "/#/settings"),
]

WIDTH = 1440
HEIGHT = 900
WAIT = 1500


def dismiss_dialog(page):
    """Click any visible OK button to dismiss the
    What's New dialog, then mark it as seen."""
    try:
        page.wait_for_selector(
            "button:has-text('OK')",
            timeout=2000,
        )
        page.click("button:has-text('OK')")
        page.wait_for_timeout(500)
    except Exception:
        pass


def take_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # -- Light mode --
        ctx = browser.new_context(
            viewport={
                "width": WIDTH, "height": HEIGHT,
            },
            color_scheme="light",
        )
        page = ctx.new_page()

        # First load: set theme and dismiss popup
        page.goto(f"{BASE}/#/dashboard")
        page.wait_for_timeout(1000)
        page.evaluate(
            "localStorage.setItem("
            "'theme', 'light')"
        )
        page.evaluate(
            "localStorage.setItem("
            "'kaisho_app_title', 'KAISHO')"
        )
        dismiss_dialog(page)
        # Mark as seen using the version from the API
        page.evaluate("""
            fetch('/api/version')
              .then(r => r.json())
              .then(d => localStorage.setItem(
                'kaisho_seen_version',
                d.version || '99.0.0'
              ))
        """)
        page.wait_for_timeout(500)
        page.reload()
        page.wait_for_timeout(1500)

        for name, path in VIEWS:
            page.goto(f"{BASE}{path}")
            page.wait_for_timeout(WAIT)
            out = OUT / f"{name}.png"
            page.screenshot(path=str(out))
            print(f"  {out.name}")

        ctx.close()

        # -- Dark mode --
        ctx = browser.new_context(
            viewport={
                "width": WIDTH, "height": HEIGHT,
            },
            color_scheme="dark",
        )
        page = ctx.new_page()

        page.goto(f"{BASE}/#/dashboard")
        page.wait_for_timeout(1000)
        page.evaluate(
            "localStorage.setItem("
            "'theme', 'dark')"
        )
        page.evaluate(
            "localStorage.setItem("
            "'kaisho_app_title', 'KAISHO')"
        )
        dismiss_dialog(page)
        page.evaluate("""
            fetch('/api/version')
              .then(r => r.json())
              .then(d => localStorage.setItem(
                'kaisho_seen_version',
                d.version || '99.0.0'
              ))
        """)
        page.wait_for_timeout(500)
        page.reload()
        page.wait_for_timeout(1500)

        dark_views = [
            ("dashboard-dark", "/#/dashboard"),
            ("kanban-dark", "/#/board"),
            ("customers-dark", "/#/customers"),
        ]
        for name, path in dark_views:
            page.goto(f"{BASE}{path}")
            page.wait_for_timeout(WAIT)
            out = OUT / f"{name}.png"
            page.screenshot(path=str(out))
            print(f"  {out.name}")

        ctx.close()
        browser.close()


if __name__ == "__main__":
    print("Taking screenshots...")
    take_screenshots()
    print("Done!")
