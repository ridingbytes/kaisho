"use strict";
// The Rust backend handles health polling and webview
// navigation. This script just shows the loading status.
var statusEl = document.getElementById("status");
if (statusEl) {
  statusEl.textContent = "Starting\u2026";
}
