"""Mirror local cron jobs to the hosted cloud cron worker.

When a job is flagged ``cloud: true`` the desktop pushes its
spec to ``POST /cloud/jobs`` (Companion+) so it runs
server-side even when the laptop is closed. Everything here
is best-effort: a cloud failure logs a warning and never
blocks the local job mutation (local-first).

The prompt is pushed inline because the cloud worker cannot
reach the desktop's ``prompt_file`` paths.
"""

import logging

from . import settings as settings_svc
from .cloud_sync import CloudUnavailable, safe_request

logger = logging.getLogger(__name__)


def _creds(cfg):
    """Return ``(base_url, api_key)`` when cloud sync is
    enabled and configured, else ``None``.

    :param cfg: Active config (provides SETTINGS_FILE).
    :returns: Tuple or None.
    """
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    sync = settings_svc.get_cloud_sync_settings(data)
    key = settings_svc.get_cloud_sync_key(data)
    if not sync.get("enabled") or not key:
        return None
    return sync["url"].rstrip("/"), key


def _payload(job, prompt):
    """Build the /cloud/jobs request body from a local job.

    :param job: Local job dict.
    :param prompt: Resolved prompt text.
    :returns: Payload dict.
    """
    return {
        "name": job.get("name") or job["id"],
        "schedule": job["schedule"],
        "prompt": prompt,
        "model": job.get("model", ""),
        "output": job.get("output", "inbox"),
        "timeout": job.get("timeout", 600),
        "enabled": job.get("enabled", True),
    }


def push_job(cfg, job, prompt):
    """Create or update the cloud mirror of a job.

    Creates when the job has no ``cloud_job_id`` yet,
    otherwise PATCHes the existing remote job.

    :param cfg: Active config.
    :param job: Local job dict.
    :param prompt: Resolved prompt text.
    :returns: The cloud job id (new or existing), or the
        unchanged ``cloud_job_id`` if cloud sync is off or
        unreachable.
    """
    creds = _creds(cfg)
    if creds is None:
        return job.get("cloud_job_id")
    url, key = creds
    cloud_id = job.get("cloud_job_id")
    try:
        if cloud_id:
            safe_request(
                f"{url}/cloud/jobs/{cloud_id}",
                key, "PATCH", _payload(job, prompt),
            )
            return cloud_id
        res = safe_request(
            f"{url}/cloud/jobs", key, "POST",
            _payload(job, prompt),
        )
        return res.get("id") if res else None
    except CloudUnavailable as exc:
        logger.warning("cloud cron push failed: %s", exc)
        return cloud_id


def remove_job(cfg, cloud_job_id):
    """Delete the cloud mirror of a job. Best-effort.

    :param cfg: Active config.
    :param cloud_job_id: Remote job id, or falsy (no-op).
    """
    if not cloud_job_id:
        return
    creds = _creds(cfg)
    if creds is None:
        return
    url, key = creds
    try:
        safe_request(
            f"{url}/cloud/jobs/{cloud_job_id}", key, "DELETE",
        )
    except CloudUnavailable as exc:
        logger.warning("cloud cron delete failed: %s", exc)
