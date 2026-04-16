"use strict";

const BACKEND_URL = "http://localhost:8765";
const HEALTH_URL = BACKEND_URL + "/health";
const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 60000;

const statusEl = document.getElementById("status");

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

async function isBackendReady() {
  try {
    const res = await fetch(HEALTH_URL, {
      method: "GET",
      cache: "no-store",
    });
    return res.ok;
  } catch (_err) {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitAndRedirect() {
  const started = Date.now();
  setStatus("Starting\u2026");

  while (Date.now() - started < MAX_WAIT_MS) {
    if (await isBackendReady()) {
      setStatus("Ready");
      window.location.replace(BACKEND_URL);
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  setStatus(
    "Backend did not start in time. Check that `kai` is in PATH.",
  );
}

waitAndRedirect();
