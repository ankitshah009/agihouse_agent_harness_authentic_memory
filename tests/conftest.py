"""Shared pytest fixtures for the Aubric AML smoke test suite."""

import os
import sys

import pytest

# Ensure repo root is on sys.path so `from src.aml.X import Y` works.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Force non-configured fallback paths for every test session.
os.environ["AML_BACKEND"] = "sqlite"
os.environ.pop("DAYTONA_API_KEY", None)
os.environ.pop("EXA_API_KEY", None)

from src.aml.db import MemoryStore, StoreConfig  # noqa: E402
from src.aml.service import AMLService  # noqa: E402


@pytest.fixture
def tmp_sqlite(tmp_path):
    db_file = str(tmp_path / "test_aml.sqlite")
    yield StoreConfig(backend="sqlite", db_path=db_file)


@pytest.fixture
def memory_store(tmp_sqlite):
    store = MemoryStore(tmp_sqlite)
    yield store
    store.close()


@pytest.fixture
def service(memory_store):
    yield AMLService(memory_store)


@pytest.fixture
def seeded_demo(memory_store):
    """Seed the demo scenario and return (tenant_id, [challenge_ids])."""
    from scripts.demo_scenarios import (
        TENANT_ID,
        reset_for_demo,
        seed_demo_scenario,
    )

    # reset_for_demo seeds tenant, customers, policies, fingerprints, attack fps.
    reset_for_demo(memory_store, tenant_id=TENANT_ID)

    # seed_demo_scenario calls reset_for_demo again internally then seeds challenges.
    phases = seed_demo_scenario(
        store=memory_store,
        scenario_id="dating_takeover",
        tenant_id=TENANT_ID,
    )
    challenge_ids = [p["challenge_id"] for p in phases]
    yield TENANT_ID, challenge_ids
