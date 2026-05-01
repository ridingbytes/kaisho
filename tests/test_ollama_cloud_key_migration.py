"""Regression test for the one-shot Ollama Cloud key
migration in ``services.settings.load_settings``.

Before the binding bug was fixed, the "Ollama Cloud Key"
input wrote into ``ai.ollama_api_key`` (the local key
field). After upgrade, Ollama Cloud requests started
failing with HTTP 403 because the executor reads
``ollama_cloud_api_key`` (now empty). The migration
relocates the value when we are confident it belonged in
the cloud slot.
"""
from pathlib import Path

import pytest
import yaml

from kaisho.services.settings import (
    _migrate_ollama_cloud_key,
    load_settings,
    save_settings,
)


def _write(path: Path, ai: dict) -> None:
    save_settings(path, {"ai": ai})


def test_migrates_when_cloud_url_set_and_cloud_key_empty(
    tmp_path,
):
    p = tmp_path / "settings.yaml"
    _write(p, {
        "ollama_cloud_url": "https://ollama.com",
        "ollama_api_key": "STUCK_HERE",
        "ollama_cloud_api_key": "",
    })

    data = load_settings(p)
    ai = data["ai"]
    assert ai["ollama_cloud_api_key"] == "STUCK_HERE"
    assert ai["ollama_api_key"] == ""

    # Persisted on disk.
    on_disk = yaml.safe_load(p.read_text(encoding="utf-8"))
    assert (
        on_disk["ai"]["ollama_cloud_api_key"]
        == "STUCK_HERE"
    )
    assert on_disk["ai"]["ollama_api_key"] == ""


def test_does_not_migrate_when_cloud_url_missing(tmp_path):
    """User runs only a local Ollama. Their local key
    must stay where it is."""
    p = tmp_path / "settings.yaml"
    _write(p, {
        "ollama_url": "http://localhost:11434",
        "ollama_api_key": "LOCAL",
        "ollama_cloud_url": "",
        "ollama_cloud_api_key": "",
    })
    data = load_settings(p)
    assert data["ai"]["ollama_api_key"] == "LOCAL"
    assert data["ai"]["ollama_cloud_api_key"] == ""


def test_does_not_migrate_when_local_url_set(tmp_path):
    """User runs both a local Ollama and Ollama Cloud
    but has only entered the local key. We must not steal
    the local key into the cloud slot — it's a real local
    auth value."""
    p = tmp_path / "settings.yaml"
    _write(p, {
        "ollama_url": "http://localhost:11434",
        "ollama_api_key": "LOCAL",
        "ollama_cloud_url": "https://ollama.com",
        "ollama_cloud_api_key": "",
    })
    data = load_settings(p)
    assert data["ai"]["ollama_api_key"] == "LOCAL"
    assert data["ai"]["ollama_cloud_api_key"] == ""


def test_does_not_overwrite_existing_cloud_key(tmp_path):
    """If the user already has a real cloud key, never
    clobber it with the local-slot value (which might be
    a legitimate local key)."""
    p = tmp_path / "settings.yaml"
    _write(p, {
        "ollama_cloud_url": "https://ollama.com",
        "ollama_api_key": "LOCAL",
        "ollama_cloud_api_key": "REAL_CLOUD",
    })
    data = load_settings(p)
    assert (
        data["ai"]["ollama_cloud_api_key"] == "REAL_CLOUD"
    )
    assert data["ai"]["ollama_api_key"] == "LOCAL"


def test_idempotent(tmp_path):
    """Running load_settings twice must not move the key
    a second time and clear it."""
    p = tmp_path / "settings.yaml"
    _write(p, {
        "ollama_cloud_url": "https://ollama.com",
        "ollama_api_key": "STUCK",
        "ollama_cloud_api_key": "",
    })
    load_settings(p)
    data = load_settings(p)
    assert data["ai"]["ollama_cloud_api_key"] == "STUCK"
    assert data["ai"]["ollama_api_key"] == ""


def test_migrate_function_returns_bool():
    """The internal helper reports whether it changed
    anything, so callers can decide to persist."""
    no_change = {"ai": {
        "ollama_cloud_url": "",
        "ollama_api_key": "X",
    }}
    assert _migrate_ollama_cloud_key(no_change) is False

    change = {"ai": {
        "ollama_cloud_url": "https://ollama.com",
        "ollama_api_key": "X",
        "ollama_cloud_api_key": "",
    }}
    assert _migrate_ollama_cloud_key(change) is True
    assert (
        change["ai"]["ollama_cloud_api_key"] == "X"
    )
    assert change["ai"]["ollama_api_key"] == ""
