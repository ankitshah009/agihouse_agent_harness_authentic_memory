"""Smoke tests for AMLService.run_update_cycle()."""

import pytest

from src.aml.service import AMLService


def test_update_cycle_writes_branch_row(seeded_demo, service, memory_store):
    tenant, _ = seeded_demo
    resp = service.run_update_cycle(tenant, 90, "test_drift_signal")

    brn_id = resp["branch_run_id"]
    rows = memory_store.fetchall(
        "SELECT * FROM branch_runs WHERE branch_run_id=? AND tenant_id=?",
        (brn_id, tenant),
    )
    assert len(rows) == 1
    assert rows[0]["status"] in ("promoted", "rejected")


def test_update_cycle_writes_trial(seeded_demo, service, memory_store):
    tenant, _ = seeded_demo
    resp = service.run_update_cycle(tenant, 90, "clone_attack_drift")

    brn_id = resp["branch_run_id"]
    trial = memory_store.fetchone(
        "SELECT * FROM branch_trial_results WHERE branch_run_id=?",
        (brn_id,),
    )
    assert trial is not None
    assert trial["branch_run_id"] == brn_id
    assert isinstance(trial["delta_fpr"], (int, float))
    assert isinstance(trial["delta_fnr"], (int, float))


def test_update_cycle_returns_recommendation(seeded_demo, service):
    tenant, _ = seeded_demo
    resp = service.run_update_cycle(tenant, 90, "false_positive_spike")

    assert resp["recommendation"] in ("promote", "archive")
    assert resp["artifact_uri"].startswith("file://")
    assert resp["branch_run_id"].startswith("brn-")


def test_update_cycle_daytona_falls_back_when_unconfigured(seeded_demo, service):
    """When DAYTONA_API_KEY is absent the service must not crash.

    The backend agent adds executed_in/sandbox_used fields; we check them if
    present, otherwise we just verify the cycle completes without error.
    """
    import os
    os.environ.pop("DAYTONA_API_KEY", None)

    tenant, _ = seeded_demo
    resp = service.run_update_cycle(tenant, 90, "daytona_fallback_test")

    # Always present fields must survive.
    assert "branch_run_id" in resp
    assert "recommendation" in resp

    # Optional fields added by backend agent:
    if "executed_in" in resp:
        assert resp["executed_in"] == "local_python"
    if "sandbox_used" in resp:
        assert resp["sandbox_used"] is False
