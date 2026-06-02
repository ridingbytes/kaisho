"""Take PWA screenshots for the website and docs.

Default target is the production PWA at cloud.kaisho.dev/m so we
shoot against the same demo account the website uses. Pass
``--local`` to drive the dev server at http://localhost:5174/m
instead.

Credentials live in ``~/.config/ridingbytes/kaisho.env`` (mode
600). The file is the canonical secrets store for this repo and
is never committed; we read ``EMAIL`` and ``PASSWORD`` from its
demo-account block.

Output destinations:
  - website mode (default): kaisho-website/screenshots/
  - docs mode (``--docs``): kaisho/docs/assets/images/
"""
import argparse
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ENV_FILE = Path.home() / ".config/ridingbytes/kaisho.env"

# iPhone 14 Pro dimensions
WIDTH = 393
HEIGHT = 852


def load_demo_credentials():
    """Pull EMAIL + PASSWORD from the demo-account block of the
    shared secrets file. We parse instead of sourcing because the
    file mixes dev and PROD_-prefixed keys and is intentionally
    not meant to be sourced wholesale."""
    if not ENV_FILE.exists():
        sys.exit(f"missing {ENV_FILE}")
    creds = {}
    in_demo_block = False
    for raw in ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if line.startswith("# --- Demo account"):
            in_demo_block = True
            continue
        if in_demo_block and line.startswith("# ---"):
            break
        if not in_demo_block or "=" not in line or \
                line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        creds[key.strip()] = value.strip().strip('"').strip("'")
    for required in ("EMAIL", "PASSWORD"):
        if not creds.get(required):
            sys.exit(f"{required} missing from {ENV_FILE}")
    return creds["EMAIL"], creds["PASSWORD"]


EMAIL, PASSWORD = load_demo_credentials()


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
            ("pwa-dashboard", "#dashboard"),
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


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--local", action="store_true",
        help="Use the local PWA dev server on :5174",
    )
    parser.add_argument(
        "--docs", action="store_true",
        help="Write PNGs into kaisho/docs/assets/images/ "
             "instead of the website screenshots folder",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    BASE = (
        "http://localhost:5174/m" if args.local
        else "https://cloud.kaisho.dev/m"
    )
    if args.docs:
        OUT = Path(__file__).parent.parent / \
            "docs" / "assets" / "images"
    else:
        OUT = Path(
            "/Users/rbartl/develop/kaisho-website/screenshots"
        )
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Taking PWA screenshots from {BASE}")
    print(f"Writing to {OUT}")
    take_pwa_screenshots()
    print("Done!")
