"use strict";

// The sidecar starts in the background. After a brief
// delay for startup, we redirect to the backend URL.
// Tauri's custom protocol (tauri://) blocks fetch() to
// http://localhost, so we use a simple timed redirect.

var statusEl = document.getElementById("status");

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

setStatus("Starting\u2026");

// Wait 4 seconds for the sidecar to start, then
// redirect. The first load of the React app will
// show a loading state if the API isn't ready yet.
setTimeout(function () {
  setStatus("Ready");
  window.location.replace("http://127.0.0.1:8765");
}, 4000);
