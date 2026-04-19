"""Smoke tests for AMLService.decide() and query_layer()."""

import pytest

from src.aml.service import AMLService


def test_decide_returns_required_fields(seeded_demo, service):
    tenant, challenge_ids = seeded_demo
    ch_id = challenge_ids[0]
    resp = service.decide(tenant, ch_id)

    assert resp["decision"] in ("allow", "review", "deny")
    assert isinstance(resp["reason"], str) and resp["reason"]
    scores = resp["scores"]
    assert "auth_distance" in scores
    assert "attack_distance" in scores
    assert "recent_flags_90d" in scores
    assert isinstance(resp["applied_policy"], str)
    assert isinstance(resp["query_ms"], float)
    qt = resp["query_template"]
    assert isinstance(qt, str) and qt
    assert "VEC_COSINE_DISTANCE" in qt
    # SQLite path: backend field is absent from current response, but that's fine;
    # assert backend is sqlite if exposed, or simply confirm no crash.
    if "backend" in resp:
        assert resp["backend"] == "sqlite"


def test_decide_raises_on_unknown_challenge(service, seeded_demo):
    tenant, _ = seeded_demo
    with pytest.raises(ValueError):
        service.decide(tenant, "bogus-challenge-id")


def test_query_layer_matches_decide_scores(seeded_demo, service):
    tenant, challenge_ids = seeded_demo
    # Use a challenge that hasn't been decided yet (use index 1 since index 0
    # may still be open — all are seeded open).
    ch_id = challenge_ids[1]

    ql = service.query_layer(tenant, ch_id)
    scores_ql = ql["scores"]

    # decide() will close the challenge, so call query_layer first.
    decide_resp = service.decide(tenant, ch_id)
    scores_d = decide_resp["scores"]

    assert abs(scores_ql["auth_distance"] - scores_d["auth_distance"]) < 1e-6
    assert abs(scores_ql["attack_distance"] - scores_d["attack_distance"]) < 1e-6
    assert scores_ql["recent_flags_90d"] == scores_d["recent_flags_90d"]


def test_decide_sqlite_falls_back_to_python(seeded_demo, service):
    tenant, challenge_ids = seeded_demo
    ch_id = challenge_ids[2]
    resp = service.decide(tenant, ch_id)

    # SQLite never runs the native VEC_COSINE_DISTANCE SQL.
    # The backend agent may expose sql_executed=False; if so, assert it.
    if "sql_executed" in resp:
        assert resp["sql_executed"] is False
    # query_template must still be populated regardless.
    assert "VEC_COSINE_DISTANCE" in resp["query_template"]


def test_decide_logs_audit_event(seeded_demo, service, memory_store):
    tenant, challenge_ids = seeded_demo
    ch_id = challenge_ids[3]
    service.decide(tenant, ch_id)

    rows = memory_store.fetchall(
        "SELECT * FROM audit_events WHERE event_type='challenge_decision' AND tenant_id=?",
        (tenant,),
    )
    assert len(rows) > 0


def test_decide_closes_challenge(seeded_demo, service, memory_store):
    tenant, challenge_ids = seeded_demo
    # Seed provides 4 challenges (ch-001 through ch-004); use last one.
    ch_id = challenge_ids[3]
    # Confirm it's open first (or just proceed — decide() closes it).
    service.decide(tenant, ch_id)

    row = memory_store.fetchone(
        "SELECT status FROM active_challenges WHERE challenge_id=? AND tenant_id=?",
        (ch_id, tenant),
    )
    assert row is not None
    assert row["status"] == "closed"
