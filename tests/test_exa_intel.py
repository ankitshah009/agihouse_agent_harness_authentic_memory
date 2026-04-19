"""Smoke tests for src/aml/exa_intel.py (graceful fallback when unconfigured)."""

import os
import pytest

# Skip the entire module if exa_intel hasn't been created yet.
exa_intel = pytest.importorskip("src.aml.exa_intel", reason="exa_intel.py not yet created by backend agent")


def test_exa_unconfigured_returns_safe_default():
    os.environ.pop("EXA_API_KEY", None)
    result = exa_intel.surface_attack_intel("drift")
    # Must not raise; must signal unconfigured with empty hits.
    assert result["ok"] is False
    assert result["configured"] is False
    assert result["hits"] == []


def test_exa_is_configured_reflects_env(monkeypatch):
    monkeypatch.setenv("EXA_API_KEY", "x")
    assert exa_intel.is_configured() is True

    monkeypatch.delenv("EXA_API_KEY", raising=False)
    assert exa_intel.is_configured() is False
