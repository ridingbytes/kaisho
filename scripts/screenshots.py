"""Take screenshots of each Kaisho view for the website."""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = Path("/Users/rbartl/develop/kaisho-website/screenshots")
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
WAIT = 1500  # ms to wait for data to load


def take_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # -- Light mode --
        ctx = browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            color_scheme="light",
        )
        page = ctx.new_page()

        # Set light theme in localStorage
        page.goto(f"{BASE}/#/dashboard")
        page.evaluate(
            "localStorage.setItem('theme', 'light')"
        )
        page.evaluate(
            "localStorage.setItem('kaisho_app_title',"
            " 'KAISHO')"
        )
        page.reload()
        time.sleep(1)

        for name, path in VIEWS:
            page.goto(f"{BASE}{path}")
            page.wait_for_timeout(WAIT)
            out = OUT / f"{name}.png"
            page.screenshot(path=str(out))
            print(f"  {out.name}")

        ctx.close()

        # -- Dark mode --
        ctx = browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            color_scheme="dark",
        )
        page = ctx.new_page()

        page.goto(f"{BASE}/#/dashboard")
        page.evaluate(
            "localStorage.setItem('theme', 'dark')"
        )
        page.evaluate(
            "localStorage.setItem('kaisho_app_title',"
            " 'KAISHO')"
        )
        page.reload()
        time.sleep(1)

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
