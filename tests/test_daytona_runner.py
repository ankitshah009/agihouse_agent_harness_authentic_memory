"""Smoke tests for src/aml/daytona_runner.py fallback behaviour."""

import os
import pytest

from src.aml.daytona_runner import run_python_in_sandbox


def test_daytona_unconfigured_returns_skipped():
    os.environ.pop("DAYTONA_API_KEY", None)
    result = run_python_in_sandbox("print('hi')")
    assert result["ok"] is False
    assert result["skipped"] is True
    assert result["configured"] is False


def test_daytona_replay_fallback_when_unconfigured():
    os.environ.pop("DAYTONA_API_KEY", None)

    try:
        from src.aml.daytona_runner import run_replay_in_sandbox
    except (ImportError, AttributeError):
        pytest.skip("run_replay_in_sandbox not yet available")

    job_input = {
        "events": [
            {"ground_truth": "confirmed_fraud", "auth_distance": 0.5, "attack_distance": 0.1}
        ],
        "active_policy": {"threshold_auth": 0.24, "threshold_attack": 0.22},
        "candidate_policy": {"threshold_auth": 0.30, "threshold_attack": 0.17},
    }
    result = run_replay_in_sandbox(job_input)
    assert result["ok"] is False
