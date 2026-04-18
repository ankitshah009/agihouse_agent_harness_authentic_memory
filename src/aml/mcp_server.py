"""
MCP-compatible style tool host.

If the `mcp` package is available, this file exposes a true MCP server.
Without it, it runs a tiny JSON stdin/stdout command dispatcher for local demos.
"""
import argparse
import json
import os
import sys
from typing import Any, Optional

from .db import MemoryStore, StoreConfig
from .service import AMLService


def build_store() -> MemoryStore:
    backend = os.environ.get("AML_BACKEND", "sqlite").lower()
    if backend == "tidb":
        cfg = StoreConfig(backend="tidb", url=os.environ.get("DATABASE_URL"))
    else:
        cfg = StoreConfig(backend="sqlite", db_path=os.environ.get("AML_SQLITE_PATH", "./data/aml_memory.sqlite"))
    return MemoryStore(cfg)


def _json_print(payload):
    print(json.dumps(payload, indent=2, default=str))


def run_stdio():
    """Simple local fallback protocol for scripted demo calls.

    Send one-line JSON per command:
    {"tool":"aml_authenticity_decide","input":{...}}
    """
    store = build_store()
    svc = AMLService(store)
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
                tool = payload.get("tool")
                args = payload.get("input", {})
                if tool == "aml_authenticity_decide":
                    out = svc.decide(
                        tenant_id=args["tenant_id"],
                        challenge_id=args["challenge_id"],
                        channel=args.get("channel"),
                    )
                elif tool == "aml_log_episode":
                    out = svc.log_episode(args)
                elif tool == "aml_upsert_authentic_fingerprint":
                    embedding = args["embedding"]
                    if isinstance(embedding, str):
                        embedding = json.loads(embedding)
                    out = svc.upsert_authentic_fingerprint(
                        tenant_id=args["tenant_id"],
                        customer_id=args["customer_id"],
                        modality=args["modality"],
                        embedding=embedding,
                        source_event_id=args.get("source_event_id"),
                        quality_score=args.get("quality_score"),
                    )
                elif tool == "aml_run_update_cycle":
                    out = svc.run_update_cycle(
                        tenant_id=args["tenant_id"],
                        window_days=int(args["window_days"]),
                        drift_signal=args["drift_signal"],
                        candidate_policy_version=args.get("candidate_policy_version"),
                        prewarm_branch=args.get("prewarm_branch"),
                        run_on_exa_intel=bool(args.get("run_on_exa_intel", True)),
                    )
                elif tool == "aml_audit_bundle":
                    out = svc.audit_bundle(
                        tenant_id=args["tenant_id"],
                        branch_run_id=args["branch_run_id"],
                        fmt=args.get("format", "json"),
                    )
                else:
                    out = {"error": "unknown_tool", "tool": tool}

                _json_print({"ok": True, "output": out})
            except Exception as exc:
                _json_print({"ok": False, "error": str(exc)})
    finally:
        store.close()


def run_mcp():
    # Best-effort true MCP server path
    from mcp.server.fastmcp import FastMCP

    app = FastMCP("Aubric AML")
    store = build_store()
    svc = AMLService(store)

    @app.tool()
    def aml_authenticity_decide(challenge_id: str, tenant_id: str, channel: Optional[str] = None):
        return svc.decide(tenant_id=tenant_id, challenge_id=challenge_id, channel=channel)

    @app.tool()
    def aml_log_episode(event_json: Any):
        event = event_json if isinstance(event_json, dict) else json.loads(event_json)
        return svc.log_episode(event)

    @app.tool()
    def aml_upsert_authentic_fingerprint(
        tenant_id: str,
        customer_id: str,
        modality: str,
        embedding: Any,
        source_event_id: Optional[str] = None,
        quality_score: Optional[float] = None,
    ):
        embedding_vec = embedding if isinstance(embedding, (list, tuple)) else json.loads(embedding)
        return svc.upsert_authentic_fingerprint(
            tenant_id=tenant_id,
            customer_id=customer_id,
            modality=modality,
            embedding=embedding_vec,
            source_event_id=source_event_id,
            quality_score=quality_score,
        )

    @app.tool()
    def aml_run_update_cycle(
        tenant_id: str,
        window_days: int,
        drift_signal: str,
        candidate_policy_version: Optional[str] = None,
        prewarm_branch: Optional[str] = None,
        run_on_exa_intel: bool = True,
    ):
        return svc.run_update_cycle(
            tenant_id=tenant_id,
            window_days=window_days,
            drift_signal=drift_signal,
            candidate_policy_version=candidate_policy_version,
            prewarm_branch=prewarm_branch,
            run_on_exa_intel=run_on_exa_intel,
        )

    @app.tool()
    def aml_audit_bundle(tenant_id: str, branch_run_id: str, fmt: str = "json"):
        return svc.audit_bundle(tenant_id=tenant_id, branch_run_id=branch_run_id, fmt=fmt)

    try:
        app.run()
    finally:
        store.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["mcp", "stdio"], default="stdio", help="launch mode")
    args = parser.parse_args()

    if args.mode == "mcp":
        try:
            from mcp.server.fastmcp import FastMCP  # noqa: F401
        except Exception as exc:
            raise RuntimeError("mcp package missing. install `mcp` or use --mode stdio") from exc
        run_mcp()
    else:
        run_stdio()


if __name__ == "__main__":
    main()
