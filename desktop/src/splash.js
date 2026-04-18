"use strict";

var POLL_INTERVAL_MS = 500;
var MAX_WAIT_MS = 60000;

var statusEl = document.getElementById("status");

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

function getBackendUrl() {
  return "http://127.0.0.1:8765";
}

async function isBackendReady() {
  try {
    var res = await fetch(
      getBackendUrl() + "/health",
      { method: "GET", cache: "no-store" },
    );
    return res.ok;
  } catch (_err) {
    return false;
  }
}

function sleep(ms) {
  return new Promise(
    function (resolve) { setTimeout(resolve, ms); },
  );
}

function showMacHint() {
  if (!statusEl) return;
  // Use safe DOM methods (no innerHTML)
  statusEl.textContent = "";

  var line1 = document.createElement("span");
  line1.textContent = "Backend did not start.";
  statusEl.appendChild(line1);

  statusEl.appendChild(document.createElement("br"));

  var hint = document.createElement("span");
  hint.style.fontSize = "11px";
  hint.style.color = "#a1a1aa";
  hint.textContent =
    "On macOS, run in Terminal: "
    + "xattr -cr /Applications/Kaisho.app"
    + " — then reopen the app.";
  statusEl.appendChild(hint);
}

async function waitAndRedirect() {
  var started = Date.now();
  setStatus("Starting\u2026");

  while (Date.now() - started < MAX_WAIT_MS) {
    if (await isBackendReady()) {
      setStatus("Ready");
      window.location.replace(getBackendUrl());
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  showMacHint();
}

waitAndRedirect();
