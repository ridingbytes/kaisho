"""Capture Kaisho app screenshots for the product website.

Usage:
    python scripts/screenshots.py [--out DIR] [--port PORT]

Requires: playwright, chromium browser
    pip install playwright && playwright install chromium

The script starts a kai serve instance with a demo profile,
populates it with sample data, and captures screenshots of
each view. Designed to run locally or in CI.
"""
import argparse
import asyncio
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = PROJECT_ROOT / "product" / "website" / "screenshots"
DEMO_ORG = PROJECT_ROOT / "data" / "users" / "demo" / "profiles" / "demo" / "org"


def _ensure_demo_data():
    """Create demo org data if it does not exist."""
    DEMO_ORG.mkdir(parents=True, exist_ok=True)
    todos = DEMO_ORG / "todos.org"
    if not todos.exists() or todos.stat().st_size == 0:
        todos.write_text(
            "* TODO [Acme Corp]: Design landing page"
            " :design:\n"
            "* TODO [Acme Corp]: Write API docs :docs:\n"
            "* NEXT [Acme Corp]: Implement auth"
            " :backend:\n"
            "* NEXT [WidgetCo]: Review DB schema"
            " :backend:\n"
            "* IN-PROGRESS [WidgetCo]: CI/CD pipeline"
            " :devops:\n"
            "* IN-PROGRESS [Acme Corp]: Customer dashboard"
            " :frontend:\n"
            "* WAIT [DataFlow]: Review PR #42 :review:\n"
            "* DONE [Acme Corp]: Fix login redirect"
            " :frontend:\n"
            "* DONE [WidgetCo]: Deploy staging :devops:\n"
            "* CANCELLED [DataFlow]: Legacy migration"
            " :backend:\n",
            encoding="utf-8",
        )
    customers = DEMO_ORG / "customers.org"
    if not customers.exists() or customers.stat().st_size == 0:
        customers.write_text(
            "* Clients\n"
            "** Acme Corp\n"
            ":PROPERTIES:\n:TYPE: agency\n"
            ":STATUS: active\n:END:\n"
            "*** CONTRACT Q2 Development\n"
            ":PROPERTIES:\n:BUDGET: 80h\n"
            ":USED: 45h\n:START: 2026-04-01\n:END:\n"
            "** WidgetCo\n"
            ":PROPERTIES:\n:TYPE: startup\n"
            ":STATUS: active\n:END:\n"
            "*** CONTRACT MVP Build\n"
            ":PROPERTIES:\n:BUDGET: 120h\n"
            ":USED: 105h\n:START: 2026-02-15\n:END:\n"
            "** DataFlow\n"
            ":PROPERTIES:\n:TYPE: enterprise\n"
            ":STATUS: active\n:END:\n"
            "*** CONTRACT Consulting\n"
            ":PROPERTIES:\n:BUDGET: 40h\n"
            ":USED: 12h\n:START: 2026-03-01\n:END:\n",
            encoding="utf-8",
        )
    inbox = DEMO_ORG / "inbox.org"
    if not inbox.exists() or inbox.stat().st_size == 0:
        inbox.write_text(
            "* Check Tailwind v4 features\n"
            "* Reply to client email\n"
            "* Book conference flight\n"
            "* Research Tauri auto-update\n",
            encoding="utf-8",
        )
    for name in ("clocks.org", "notes.org", "archive.org"):
        f = DEMO_ORG / name
        if not f.exists():
            f.write_text("", encoding="utf-8")


def _wait_for_server(port, timeout=15):
    """Wait until the server responds on the given port."""
    import urllib.request
    url = f"http://localhost:{port}/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(0.5)
    return False


async def _capture(port, out_dir):
    """Capture screenshots using Playwright."""
    from playwright.async_api import async_playwright

    base = f"http://localhost:{port}"
    out_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 800},
        )
        page = await ctx.new_page()
        await page.goto(base)
        await page.wait_for_timeout(2000)

        # Login
        try:
            username = page.locator(
                "input[type='text'], "
                "input[name='username']"
            ).first
            if await username.is_visible(timeout=3000):
                await username.fill("demo")
                pw = page.locator(
                    "input[type='password']"
                ).first
                if await pw.is_visible(timeout=2000):
                    await pw.fill("demo1234")
                submit = page.locator(
                    "button[type='submit']"
                ).first
                await submit.click()
                await page.wait_for_timeout(3000)
        except Exception:
            pass

        # Skip password setup if shown
        try:
            skip = page.locator(
                "button:has-text('Skip'), "
                "a:has-text('Skip')"
            ).first
            if await skip.is_visible(timeout=2000):
                await skip.click()
                await page.wait_for_timeout(2000)
        except Exception:
            pass

        # Capture each view
        panels = [
            ("dashboard", ["Dashboard"]),
            ("kanban", ["Board", "Tasks", "Kanban"]),
            ("customers", ["Customers"]),
            ("inbox", ["Inbox"]),
            ("settings", ["Settings"]),
        ]
        for name, labels in panels:
            for label in labels:
                try:
                    link = page.locator(
                        f"a:has-text('{label}'), "
                        f"button:has-text('{label}')"
                    ).first
                    if await link.is_visible(timeout=1000):
                        await link.click()
                        await page.wait_for_timeout(1500)
                        break
                except Exception:
                    pass
            path = out_dir / f"{name}.png"
            await page.screenshot(
                path=str(path), full_page=False,
            )
            print(f"  {name}.png")

        await browser.close()


def main():
    parser = argparse.ArgumentParser(
        description="Capture Kaisho screenshots",
    )
    parser.add_argument(
        "--out", type=Path, default=DEFAULT_OUT,
        help="Output directory for screenshots",
    )
    parser.add_argument(
        "--port", type=int, default=8765,
        help="Backend port (default 8765)",
    )
    parser.add_argument(
        "--no-server", action="store_true",
        help="Skip starting the server (use existing)",
    )
    args = parser.parse_args()

    _ensure_demo_data()

    server = None
    if not args.no_server:
        import os
        env = {
            **os.environ,
            "KAISHO_USER": "demo",
            "PROFILE": "demo",
        }
        print(f"Starting kai serve on :{args.port}...")
        server = subprocess.Popen(
            ["kai", "serve", "--host", "127.0.0.1",
             "--port", str(args.port)],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if not _wait_for_server(args.port):
            print("Server failed to start.", file=sys.stderr)
            server.terminate()
            sys.exit(1)

    try:
        print(f"Capturing screenshots to {args.out}/")
        asyncio.run(_capture(args.port, args.out))
        print("Done.")
    finally:
        if server:
            server.terminate()
            server.wait(timeout=5)


if __name__ == "__main__":
    main()
