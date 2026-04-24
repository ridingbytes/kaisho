"""Take PWA screenshots for the website.

Requires the kaisho-cloud mobile dev server running on
localhost:5174 (or production at cloud.kaisho.dev).
"""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174/m"
OUT = Path(
    "/Users/rbartl/develop/kaisho-website/screenshots"
)
OUT.mkdir(exist_ok=True)

# iPhone 14 Pro dimensions
WIDTH = 393
HEIGHT = 852

# Login credentials (demo account)
EMAIL = "ramon.bartl@googlemail.com"
PASSWORD = "12345678"


def login(page):
    """Log in to the PWA."""
    page.goto(f"{BASE}/")
    page.wait_for_timeout(1000)

    # Check if already logged in
    if "login" not in page.url.lower():
        loc = page.locator("input[type='email']")
        if not loc.is_visible():
            return

    email_input = page.locator(
        "input[type='email']"
    )
    if not email_input.is_visible():
        return

    email_input.fill(EMAIL)
    page.locator(
        "input[type='password']"
    ).fill(PASSWORD)
    page.locator("button[type='submit']").click()
    page.wait_for_timeout(2000)


def take_pwa_screenshots():
    """Capture PWA views in iPhone viewport."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={
                "width": WIDTH, "height": HEIGHT,
            },
            device_scale_factor=3,
            is_mobile=True,
            has_touch=True,
            color_scheme="light",
        )
        page = ctx.new_page()

        login(page)

        views = [
            ("pwa-timer", "#timer"),
            ("pwa-entries", "#entries"),
            ("pwa-book", "#book"),
            ("pwa-tasks", "#tasks"),
            ("pwa-inbox", "#inbox"),
            ("pwa-notes", "#notes"),
            ("pwa-advisor", "#advisor"),
            ("pwa-profile", "#profile"),
        ]

        for name, hash_path in views:
            page.goto(f"{BASE}/{hash_path}")
            page.wait_for_timeout(1500)
            out = OUT / f"{name}.png"
            page.screenshot(path=str(out))
            print(f"  {out.name}")

        # Dark mode
        ctx2 = browser.new_context(
            viewport={
                "width": WIDTH, "height": HEIGHT,
            },
            device_scale_factor=3,
            is_mobile=True,
            has_touch=True,
            color_scheme="dark",
        )
        page2 = ctx2.new_page()
        login(page2)

        dark_views = [
            ("pwa-timer-dark", "#timer"),
            ("pwa-tasks-dark", "#tasks"),
        ]
        for name, hash_path in dark_views:
            page2.goto(f"{BASE}/{hash_path}")
            page2.wait_for_timeout(1500)
            out = OUT / f"{name}.png"
            page2.screenshot(path=str(out))
            print(f"  {out.name}")

        ctx2.close()
        ctx.close()
        browser.close()


if __name__ == "__main__":
    print("Taking PWA screenshots...")
    take_pwa_screenshots()
    print("Done!")
