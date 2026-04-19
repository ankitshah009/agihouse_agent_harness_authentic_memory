"""Smoke tests for AMLService.audit_bundle()."""

import json
import os

import pytest

from src.aml.service import AMLService


def _run_cycle(service, tenant):
    return service.run_update_cycle(tenant, 90, "audit_bundle_test_drift")


def test_audit_bundle_contains_branch_trial_events(seeded_demo, service):
    tenant, _ = seeded_demo
    cycle = _run_cycle(service, tenant)
    brn_id = cycle["branch_run_id"]

    result = service.audit_bundle(tenant, brn_id)
    bundle = result["bundle"]

    assert bundle["branch_run"] is not None
    assert bundle["trial"] is not None
    audits = bundle["audits"]
    assert isinstance(audits, list) and len(audits) >= 1


def test_audit_bundle_writes_file(seeded_demo, service, tmp_path, monkeypatch):
    tenant, _ = seeded_demo
    # Point audit output to tmp_path so we don't pollute the repo's ./data dir.
    monkeypatch.setenv("AML_AUDIT_DIR", str(tmp_path))

    cycle = _run_cycle(service, tenant)
    brn_id = cycle["branch_run_id"]

    result = service.audit_bundle(tenant, brn_id)
    path = result["path"]

    assert os.path.exists(path), f"audit file not found at {path}"
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    assert isinstance(data, dict)
