"""Capture screenshots for MkDocs documentation.

Drives an already-running Kaisho backend bound to the `screenshots`
profile and writes PNGs into docs/assets/images/.

Profile switching is intentionally OUT OF SCOPE for this script:
kaisho resolves the active profile by reading
``~/.kaisho/.active_profile`` at startup and ignores the
profile-change API at runtime, so the caller is expected to:

  1. Close the desktop app (it locks the storage).
  2. Back up ``~/.kaisho/.active_profile`` (typically `org-mode`).
  3. Write ``screenshots`` to ``~/.kaisho/.active_profile``.
  4. Start the backend: ``kai serve --port 8765`` in another shell.
  5. Run this script.
  6. Stop the backend.
  7. Restore ``~/.kaisho/.active_profile``.

Usage:
  python scripts/docs-screenshots.py
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

# The frontend dev server (Vite) is what serves the React app;
# the kai backend on :8765 is API-only, so we target Vite here.
# Start it with: ``cd frontend && npm run dev`` (port 5173).
BASE = "http://localhost:5173"
OUT = Path(__file__).parent.parent / "docs" / "assets" / "images"
OUT.mkdir(parents=True, exist_ok=True)

# Light + dark theme presets driven via the App.tsx contract:
# `data-theme` carries the preset slug, `data-mode` carries
# light|dark. Sepia matches the website's atelier look.
LIGHT_THEME = "sepia"
DARK_THEME = "zinc"

# Views to capture: (hash_route, filename, wait_ms)
VIEWS = [
    ("#/dashboard", "dashboard", 2500),
    ("#/kanban", "kanban", 2500),
    ("#/clocks", "clocks", 2500),
    ("#/customers", "customers", 2500),
    ("#/inbox", "inbox", 2500),
    ("#/notes", "notes", 2500),
    ("#/knowledge", "knowledge", 2500),
    ("#/github", "github", 2500),
    ("#/advisor", "advisor", 2500),
    ("#/cron", "cron", 2500),
    ("#/settings", "settings", 2500),
]


def set_theme(page, preset, mode):
    """Apply theme preset + light/dark mode via the App.tsx hooks
    used by the running UI. Mirrors what Settings → Appearance
    does, then dispatches the change event so the React tree
    re-themes without a reload."""
    page.evaluate(
        """({preset, mode}) => {
            const root = document.documentElement;
            root.setAttribute('data-theme', preset);
            root.setAttribute('data-mode', mode);
            if (mode === 'dark') {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
            localStorage.setItem(
                mode === 'dark' ? 'themeDark' : 'themeLight',
                preset,
            );
            localStorage.setItem('theme', mode);
            window.dispatchEvent(new Event('kaisho-theme-changed'));
        }""",
        {"preset": preset, "mode": mode},
    )
    page.wait_for_timeout(400)


def capture(page, route, name, wait_ms):
    """Navigate to a view and capture screenshot once the data has
    loaded. We wait for network-idle so async data fetches settle,
    then add the per-view padding for any tail animations."""
    url = f"{BASE}/{route}"
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(wait_ms)
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path))
    print(f"  {name}.png")


def dismiss_whats_new(page):
    """Close the What's-New dialog on first launch if shown."""
    try:
        ok = page.get_by_role("button", name="OK")
        ok.wait_for(state="visible", timeout=3000)
        ok.click()
        page.wait_for_timeout(800)
    except Exception:
        pass


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
        )
        page = context.new_page()

        # Initial load
        page.goto(BASE)
        page.wait_for_timeout(3000)
        dismiss_whats_new(page)

        # Light pass (sepia)
        set_theme(page, LIGHT_THEME, "light")
        print(f"Capturing light ({LIGHT_THEME}):")
        for route, name, wait_ms in VIEWS:
            capture(page, route, name, wait_ms)

        # Dark pass (zinc) — only the surfaces that have dark
        # variants referenced from the docs.
        set_theme(page, DARK_THEME, "dark")
        print(f"Capturing dark ({DARK_THEME}):")
        for route, name, wait_ms in [
            ("#/dashboard", "dashboard-dark", 2500),
            ("#/kanban", "kanban-dark", 2500),
            ("#/customers", "customers-dark", 2500),
        ]:
            capture(page, route, name, wait_ms)

        browser.close()
        print("Done.")


if __name__ == "__main__":
    main()
