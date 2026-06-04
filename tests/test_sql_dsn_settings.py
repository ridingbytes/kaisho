"""Tests for the SQL_DSN path setting.

Goals:

- Setting ``sql_dsn`` via ``set_path_settings`` round-trips
  through ``get_path_settings`` unchanged.
- The ``_OverlayCfg`` proxy used by ``_build_backend``
  exposes the custom DSN as ``SQL_DSN`` so the SQL backend
  picks it up.
- Empty ``sql_dsn`` leaves ``SQL_DSN`` empty on the overlay,
  triggering the per-profile SQLite fallback in
  ``_build_backend`` (which is asserted indirectly by
  ``backends/__init__.py``).
"""
from kaisho.backends import _OverlayCfg
from kaisho.services import settings as settings_svc


def test_sql_dsn_roundtrips_through_settings(tmp_path):
    f = tmp_path / "settings.yaml"
    settings_svc.set_path_settings(
        f,
        {"sql_dsn": "postgresql+psycopg://u:p@h/db"},
    )
    data = settings_svc.load_settings(f)
    paths = settings_svc.get_path_settings(data)
    assert paths["sql_dsn"] == (
        "postgresql+psycopg://u:p@h/db"
    )


def test_overlay_exposes_sql_dsn_when_set(tmp_path):
    class FakeCfg:
        SETTINGS_FILE = tmp_path / "settings.yaml"
        PROFILE_DIR = tmp_path
        DATA_DIR = tmp_path

    paths = {
        "backend": "sql",
        "sql_dsn": "postgresql+psycopg://u:p@h/db",
    }
    overlay = _OverlayCfg(FakeCfg(), paths)
    assert overlay.SQL_DSN == (
        "postgresql+psycopg://u:p@h/db"
    )


def test_overlay_hides_empty_sql_dsn(tmp_path):
    """An empty DSN must fall through to the underlying
    config so ``_build_backend`` sees ``getattr(cfg,
    "SQL_DSN", "") == ""`` and triggers the per-profile
    SQLite fallback. Setting it to an empty string on the
    overlay would be just as good, but the current shape
    is to delegate.
    """

    class FakeCfg:
        SETTINGS_FILE = tmp_path / "settings.yaml"
        PROFILE_DIR = tmp_path
        DATA_DIR = tmp_path
        SQL_DSN = ""

    overlay = _OverlayCfg(
        FakeCfg(), {"backend": "sql", "sql_dsn": ""},
    )
    assert overlay.SQL_DSN == ""
