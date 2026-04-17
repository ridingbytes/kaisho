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
  var port = window.__KAISHO_PORT__ || 8765;
  return "http://127.0.0.1:" + port;
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

  setStatus(
    "Backend did not start in time. "
    + "Check the application logs.",
  );
}

waitAndRedirect();
