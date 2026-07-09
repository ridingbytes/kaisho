"""Scheduler resilience tests.

A single job with a malformed schedule must never abort
syncing the rest. ``sync_jobs`` re-adds every enabled job
on each cron mutation, so a propagated error would turn
every enable/disable/update into a 500 (see the timeout
"reverts to the old value" bug).
"""
from apscheduler.schedulers.background import (
    BackgroundScheduler,
)

from kaisho.cron.scheduler import _add_job_to_scheduler


def _valid_job(job_id="good"):
    return {
        "id": job_id,
        "name": "Good",
        "schedule": "0 9 * * 1",
        "model": "ollama:qwen3:14b",
    }


def _bad_hour_job(job_id="bad-hour"):
    # hour 45 is out of range (0-23) -- CronTrigger rejects
    # it, but _cron_kwargs (field-count only) does not.
    return {
        "id": job_id,
        "name": "Bad hour",
        "schedule": "06 45 * * *",
        "model": "ollama:qwen3:14b",
    }


def _bad_fields_job(job_id="bad-fields"):
    return {
        "id": job_id,
        "name": "Bad fields",
        "schedule": "0 9 * *",  # only 4 fields
        "model": "ollama:qwen3:14b",
    }


def test_add_valid_job_registers_it():
    sched = BackgroundScheduler()
    _add_job_to_scheduler(sched, _valid_job())
    assert sched.get_job("good") is not None


def test_out_of_range_schedule_is_skipped_not_raised():
    sched = BackgroundScheduler()
    # Must not raise -- the whole point of the fix.
    _add_job_to_scheduler(sched, _bad_hour_job())
    assert sched.get_job("bad-hour") is None


def test_wrong_field_count_is_skipped_not_raised():
    sched = BackgroundScheduler()
    _add_job_to_scheduler(sched, _bad_fields_job())
    assert sched.get_job("bad-fields") is None


def test_bad_job_does_not_block_good_ones():
    """The regression: a bad job in the set must not stop
    the good ones from being scheduled."""
    sched = BackgroundScheduler()
    for job in (
        _valid_job("a"),
        _bad_hour_job("b"),
        _valid_job("c"),
    ):
        _add_job_to_scheduler(sched, job)
    assert sched.get_job("a") is not None
    assert sched.get_job("b") is None
    assert sched.get_job("c") is not None
