#!/usr/bin/env python3
"""
End-to-end demo API for Aubric AML.

Serves:
- static frontend from frontend/
- JSON APIs to seed, run, and inspect demo scenarios
- live update-cycle output + audit bundle retrieval
"""

import argparse
import json
import os
import signal
import sys
import time
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from typing import Any, Dict, Optional

from src.aml import daytona_runner
from src.aml.db import MemoryStore, StoreConfig
from src.aml.daytona_runner import run_python_in_sandbox, status_payload, DEFAULT_HELLO_CODE
from src.aml.service import AMLService
from scripts import demo_scenarios


DEFAULT_TENANT_ID = demo_scenarios.TENANT_ID
FRONTEND_DIR = os.path.join(os.getcwd(), "frontend")


def _build_store():
    backend = os.environ.get("AML_BACKEND", "sqlite").lower()
    if backend == "tidb":
        cfg = StoreConfig(backend="tidb", url=os.environ.get("DATABASE_URL"))
    else:
        cfg = StoreConfig(backend="sqlite", db_path=os.environ.get("AML_SQLITE_PATH", "./data/aml_memory.sqlite"))
    return MemoryStore(cfg)


def _json_or_empty(body: str):
    if not body:
        return {}
    try:
        return json.loads(body)
    except Exception:
        return {}


def _parse_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


class DemoService:
    def __init__(self):
        self.store = _build_store()
        self.svc = AMLService(self.store)

    @property
    def tenant_id(self):
        return DEFAULT_TENANT_ID

    def _challenge_list(self, tenant_id: str, status: Optional[str] = None):
        sql = "SELECT * FROM active_challenges WHERE tenant_id=?"
        params = [tenant_id]
        if status:
            sql += " AND status=?"
            params.append(status)
        sql += " ORDER BY created_at ASC"
        return self.store.fetchall(sql, tuple(params))

    def _to_phase_state(self, challenge_row: Dict[str, Any]):
        if not challenge_row:
            return None
        raw = challenge_row.get("raw_features")
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = {}
        elif raw is None:
            raw = {}
        return {
            "challenge_id": challenge_row.get("challenge_id"),
            "tenant_id": challenge_row.get("tenant_id"),
            "customer_id": challenge_row.get("customer_id"),
            "modality": challenge_row.get("modality"),
            "asset_id": challenge_row.get("asset_id"),
            "status": challenge_row.get("status"),
            "risk_tier": challenge_row.get("risk_tier"),
            "raw_features": raw,
            "created_at": challenge_row.get("created_at"),
        }

    def list_scenarios(self):
        catalog = demo_scenarios.scenario_catalog()
        return {
            "tenant_id": self.tenant_id,
            "scenarios": catalog,
        }

    def seed_demo(self, scenario_id: str, tenant_id: Optional[str] = None):
        tenant = tenant_id or self.tenant_id
        phases = demo_scenarios.seed_demo_scenario(self.store, scenario_id=scenario_id, tenant_id=tenant)
        return {
            "tenant_id": tenant,
            "scenario_id": scenario_id,
            "phases": [
                {
                    "challenge_id": p["challenge_id"],
                    "label": p["label"],
                    "phase": p["phase"],
                    "notes": p["notes"],
                }
                for p in phases
            ],
        }

    def get_current_challenge(self, tenant_id: Optional[str] = None, allow_closed=False):
        tenant = tenant_id or self.tenant_id
        statuses = "open" if not allow_closed else None
        if statuses:
            row = self.store.fetchone(
                "SELECT * FROM active_challenges WHERE tenant_id=? AND status=? ORDER BY created_at ASC LIMIT 1",
                (tenant, "open"),
            )
        else:
            row = self.store.fetchone(
                "SELECT * FROM active_challenges WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1",
                (tenant,),
            )
        return self._to_phase_state(row)

    def list_challenges(self, tenant_id: Optional[str] = None, status: Optional[str] = None):
        tenant = tenant_id or self.tenant_id
        rows = self._challenge_list(tenant, status=status)
        return [self._to_phase_state(r) for r in rows]

    def get_challenge(self, tenant_id: Optional[str], challenge_id: str):
        tenant = tenant_id or self.tenant_id
        row = self.store.get_challenge(challenge_id=challenge_id, tenant_id=tenant)
        if not row:
            return None
        return self._to_phase_state(row)

    def run_phase(self, tenant_id: Optional[str], challenge_id: str, channel: Optional[str] = None):
        tenant = tenant_id or self.tenant_id
        return demo_scenarios.run_phase(
            store=self.store,
            svc=self.svc,
            tenant_id=tenant,
            challenge_id=challenge_id,
            channel=channel,
        )

    def run_layer_query(self, tenant_id: Optional[str], challenge_id: str):
        tenant = tenant_id or self.tenant_id
        return self.svc.query_layer(tenant, challenge_id)

    def run_all(
        self,
        tenant_id: Optional[str],
        scenario_id: str = "dating_takeover",
        run_update_cycle: bool = True,
        window_days: int = 90,
        reset: bool = False,
        daytona_smoke: bool = False,
    ):
        tenant = tenant_id or self.tenant_id
        if reset:
            self.seed_demo(scenario_id=scenario_id, tenant_id=tenant)
        else:
            open_rows = self._challenge_list(tenant, status="open")
            if not open_rows:
                # Keep the demo resilient: seed and run when nothing is active.
                self.seed_demo(scenario_id=scenario_id, tenant_id=tenant)

        open_rows = self._challenge_list(tenant, status="open")
        steps = []
        for row in open_rows:
            step = self.run_phase(tenant, row["challenge_id"])
            row_raw = step.get("phase") or {}
            steps.append(
                {
                    "challenge_id": row["challenge_id"],
                    "scenario": row_raw.get("scenario", scenario_id),
                    "phase": row_raw.get("phase", "unknown"),
                    "label": row_raw.get("label", row["challenge_id"]),
                    "decision": step["decision"],
                    "challenge": step["challenge"],
                }
            )

        summary = {
            "tenant_id": tenant,
            "scenario_id": scenario_id,
            "steps": steps,
            "run_all": True,
            "remaining_open": max(0, len(self._challenge_list(tenant, status="open"))),
        }

        if run_update_cycle:
            cycle = self.svc.run_update_cycle(
                tenant_id=tenant,
                window_days=window_days,
                drift_signal="verified_voice_clone_false_negatives_up_2x",
                run_on_exa_intel=True,
            )
            audit = self.svc.audit_bundle(
                tenant_id=tenant,
                branch_run_id=cycle["branch_run_id"],
                fmt="json",
            )
            summary["update_cycle"] = cycle
            summary["audit"] = audit

        if daytona_smoke:
            summary["daytona"] = run_python_in_sandbox(DEFAULT_HELLO_CODE)

        return summary

    def prewarm(self):
        start = time.time()
        backend = getattr(self.store, "backend", "sqlite")
        tidb_warm = False
        daytona_warm = False
        daytona_configured = daytona_runner.is_configured()
        errors = {}

        if backend == "tidb":
            try:
                row = self.store.fetchone("SELECT 1 AS ok")
                tidb_warm = bool(row)
            except Exception as exc:
                errors["tidb"] = str(exc)

        if daytona_configured:
            try:
                out = daytona_runner.run_python_in_sandbox("print('warm')", timeout=20)
                daytona_warm = bool(out.get("ok"))
                if not daytona_warm:
                    errors["daytona"] = out.get("error") or str(out.get("exit_code"))
            except Exception as exc:
                errors["daytona"] = str(exc)

        return {
            "backend": backend,
            "tidb_warm": tidb_warm,
            "daytona_warm": daytona_warm,
            "daytona_configured": daytona_configured,
            "elapsed_ms": int(round((time.time() - start) * 1000)),
            "errors": errors or None,
        }

    def audit(self, tenant_id: Optional[str], branch_run_id: str):
        tenant = tenant_id or self.tenant_id
        return self.svc.audit_bundle(tenant_id=tenant, branch_run_id=branch_run_id, fmt="json")

    def close(self):
        self.store.close()


class DemoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, service: DemoService, **kwargs):
        self.service = service
        super().__init__(*args, **kwargs)

    def _set_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, payload, status=200):
        raw = json.dumps(payload, default=str)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self._set_cors()
        self.end_headers()
        self.wfile.write(raw.encode("utf-8"))

    def _not_found(self, message="not found"):
        self._json({"ok": False, "error": message}, status=404)

    def _error(self, message, status=400):
        self._json({"ok": False, "error": message}, status=status)

    def _ok(self, payload):
        if not isinstance(payload, dict):
            payload = {"payload": payload}
        payload.setdefault("ok", True)
        self._json(payload, status=200)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else ""
        return _json_or_empty(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api("GET", parsed)
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return self._error("API only", status=404)
        self._handle_api("POST", parsed)

    def _handle_api(self, method: str, parsed):
        path = parsed.path
        query = parse_qs(parsed.query)
        tenant_id = query.get("tenant_id", [None])[0] or DEFAULT_TENANT_ID
        segments = [s for s in path.strip("/").split("/") if s]

        try:
            if method == "GET" and path == "/api/daytona/status":
                st = status_payload()
                return self._ok({"tenant_id": tenant_id, "daytona": st})

            if method == "POST" and path == "/api/daytona/run":
                body = self._read_json()
                code = (body.get("code") or "").strip()
                if not code:
                    return self._error("Missing JSON body field: code", status=400)
                timeout = body.get("timeout")
                timeout_val = None
                if timeout is not None:
                    tout = _parse_int(timeout, 0)
                    if tout > 0:
                        timeout_val = tout
                out = run_python_in_sandbox(code, timeout=timeout_val)
                return self._ok({"daytona_run": out})

            if method == "GET" and path == "/api/scenarios":
                return self._ok(self.service.list_scenarios())

            if method == "GET" and path == "/api/challenges":
                status = query.get("status", [None])[0]
                return self._ok({"tenant_id": tenant_id, "challenges": self.service.list_challenges(tenant_id, status=status)})

            if path == "/api/challenges/current":
                ch = self.service.get_current_challenge(tenant_id, allow_closed=True)
                if ch is None:
                    return self._not_found("No challenges found")
                return self._ok({"tenant_id": tenant_id, "challenge": ch})

            if segments[:2] == ["api", "challenges"] and len(segments) == 3:
                challenge_id = segments[2]
                if challenge_id == "current":
                    ch = self.service.get_current_challenge(tenant_id, allow_closed=True)
                    if ch is None:
                        return self._not_found("No challenge found")
                    return self._ok({"tenant_id": tenant_id, "challenge": ch})
                if method == "GET":
                    ch = self.service.get_challenge(tenant_id, challenge_id)
                    if ch is None:
                        return self._not_found("Challenge not found")
                    return self._ok({"tenant_id": tenant_id, "challenge": ch})

            if segments[:2] == ["api", "challenges"] and len(segments) == 4:
                challenge_id = segments[2]
                action = segments[3]
                resolved = challenge_id
                if challenge_id == "current":
                    current = self.service.get_current_challenge(tenant_id, allow_closed=False)
                    if not current:
                        return self._not_found("No open challenge found")
                    resolved = current["challenge_id"]

                if method == "GET" and action == "query":
                    return self._ok({"tenant_id": tenant_id, "query": self.service.run_layer_query(tenant_id, resolved)})
                if method == "GET" and action == "run":
                    return self._error("GET not allowed on run", status=405)
                if method == "POST" and action == "run":
                    body = self._read_json()
                    step = self.service.run_phase(tenant_id, resolved, channel=body.get("channel"))
                    return self._ok({"tenant_id": tenant_id, "step": step})
                if method == "GET" and action == "episodes":
                    rows = self.service.store.fetchall(
                        """
                        SELECT * FROM episodic_events
                        WHERE tenant_id = ? AND challenge_id = ?
                        ORDER BY ts DESC
                        """,
                        (tenant_id, resolved),
                    )
                    return self._ok({"tenant_id": tenant_id, "challenge_id": resolved, "episodes": rows})

            if method == "POST" and path == "/api/demo/prewarm":
                try:
                    summary = self.service.prewarm()
                except Exception as exc:
                    summary = {
                        "backend": getattr(self.service.store, "backend", "sqlite"),
                        "tidb_warm": False,
                        "daytona_warm": False,
                        "daytona_configured": False,
                        "elapsed_ms": 0,
                        "errors": {"prewarm": str(exc)},
                    }
                return self._ok(summary)

            if method == "POST" and path == "/api/demo/reset":
                body = self._read_json()
                scenario_id = body.get("scenario_id", "dating_takeover")
                tenant = body.get("tenant_id", tenant_id)
                summary = self.service.seed_demo(scenario_id=scenario_id, tenant_id=tenant)
                challenges = self.service.list_challenges(tenant, status="open")
                return self._ok({"tenant_id": tenant, "scenario": summary, "challenges": challenges})

            if method == "POST" and path == "/api/demo/run-all":
                body = self._read_json()
                tenant = body.get("tenant_id", tenant_id)
                scenario_id = body.get("scenario_id", "dating_takeover")
                include_update = bool(body.get("run_update_cycle", True))
                window_days = _parse_int(body.get("window_days", 90), 90)
                reset = bool(body.get("reset", False))
                daytona_smoke = bool(body.get("daytona_smoke", False))
                summary = self.service.run_all(
                    tenant_id=tenant,
                    scenario_id=scenario_id,
                    run_update_cycle=include_update,
                    window_days=window_days,
                    reset=reset,
                    daytona_smoke=daytona_smoke,
                )
                return self._ok(summary)

            if method == "GET" and segments[:2] == ["api", "audit"] and len(segments) == 3:
                branch_run_id = segments[2]
                payload = self.service.audit(tenant_id=tenant_id, branch_run_id=branch_run_id)
                return self._ok(payload)
        except Exception as exc:
            return self._error(str(exc), status=500)

        self._error("Unsupported API endpoint", status=404)


def main():
    parser = argparse.ArgumentParser(description="Run Aubric AML local demo API + UI")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9000)
    args = parser.parse_args()

    db_path = os.environ.get("AML_SQLITE_PATH", "./data/aml_memory.sqlite")
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)

    state = DemoService()

    handler = partial(
        DemoHandler,
        directory=FRONTEND_DIR,
        service=state,
    )

    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving Aubric AML demo at http://{args.host}:{args.port} and API /api")
    print("Press Ctrl+C to stop")

    # Handle Ctrl+C cleanly
    def _shutdown(*_):
        httpd.shutdown()
    signal.signal(signal.SIGINT, _shutdown)

    try:
        httpd.serve_forever()
    finally:
        state.close()


if __name__ == "__main__":
    main()
