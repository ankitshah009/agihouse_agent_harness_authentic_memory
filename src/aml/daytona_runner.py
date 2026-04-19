"""Daytona sandbox helpers for the AML demo stack and CLI."""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Dict, Optional

DEFAULT_HELLO_CODE = 'print("Hello World from code!")'
DEFAULT_SANDBOX_TIMEOUT = 45


def is_configured() -> bool:
    return bool(os.environ.get("DAYTONA_API_KEY", "").strip())


def status_payload() -> Dict[str, Any]:
    return {
        "configured": is_configured(),
        "api_url_set": bool(os.environ.get("DAYTONA_API_URL")),
        "target_set": bool(os.environ.get("DAYTONA_TARGET")),
    }


def run_python_in_sandbox(code: str, timeout: Optional[int] = None) -> Dict[str, Any]:
    """Execute Python in a Daytona sandbox; delete sandbox when done."""
    if not is_configured():
        return {
            "ok": False,
            "skipped": True,
            "error": "DAYTONA_API_KEY is not set",
            "configured": False,
        }

    try:
        from daytona import Daytona, DaytonaConfig
    except ImportError as exc:
        return {
            "ok": False,
            "error": f"daytona package not installed: {exc}",
            "configured": True,
        }

    daytona = None
    sandbox = None
    try:
        config = DaytonaConfig(api_key=os.environ.get("DAYTONA_API_KEY"))
        daytona = Daytona(config)
        sandbox = daytona.create()
        response = sandbox.process.code_run(code, timeout=timeout or DEFAULT_SANDBOX_TIMEOUT)
        exit_code = response.exit_code
        result = response.result or ""
        exit_ok = exit_code == 0 if exit_code is not None else True
        return {
            "ok": exit_ok,
            "exit_code": exit_code,
            "result": result,
            "configured": True,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "trace": traceback.format_exc(),
            "configured": True,
        }
    finally:
        if sandbox is not None and daytona is not None:
            try:
                daytona.delete(sandbox)
            except Exception:
                pass


def _read_replay_source() -> str:
    replay_path = Path(__file__).parent / "replay_job.py"
    source = replay_path.read_text(encoding="utf-8")
    # We prepend a stdin-injection prelude before shipping this to the sandbox,
    # so `from __future__ import ...` cannot remain (must be first statement).
    # Strip any future imports — they are no-ops in the Python 3.13+ sandbox.
    import re
    return re.sub(r'^\s*from\s+__future__\s+import[^\n]*\n', '', source, flags=re.MULTILINE)


def run_replay_in_sandbox(job_input: Dict[str, Any], timeout: int = DEFAULT_SANDBOX_TIMEOUT) -> Dict[str, Any]:
    """Execute the standalone replay_job.py in a Daytona sandbox.

    Pipes ``job_input`` to stdin inside the sandbox and parses the JSON the
    sandbox writes to stdout.
    """
    if not is_configured():
        return {
            "ok": False,
            "sandbox_used": False,
            "fallback_reason": "DAYTONA_API_KEY is not set",
            "error": "DAYTONA_API_KEY is not set",
        }

    try:
        replay_source = _read_replay_source()
    except Exception as exc:
        return {
            "ok": False,
            "sandbox_used": False,
            "fallback_reason": f"cannot_read_replay_job: {exc}",
            "error": str(exc),
        }

    payload_literal = json.dumps(json.dumps(job_input, default=str))
    code = (
        "import json, sys, io\n"
        f"sys.stdin = io.StringIO({payload_literal})\n"
        f"{replay_source}\n"
    )

    start = time.time()
    run_out = run_python_in_sandbox(code, timeout=timeout)
    elapsed_ms = int(round((time.time() - start) * 1000))

    if not run_out.get("ok"):
        return {
            "ok": False,
            "sandbox_used": False,
            "fallback_reason": run_out.get("error") or f"sandbox_exit_{run_out.get('exit_code')}",
            "error": run_out.get("error") or run_out.get("result") or "sandbox_failed",
            "exit_code": run_out.get("exit_code"),
            "elapsed_ms": elapsed_ms,
        }

    stdout_text = (run_out.get("result") or "").strip()
    if not stdout_text:
        return {
            "ok": False,
            "sandbox_used": True,
            "fallback_reason": "empty_sandbox_output",
            "error": "sandbox_empty_output",
            "elapsed_ms": elapsed_ms,
        }

    # Sandbox may print extra lines; take the last JSON-looking line.
    json_line = None
    for line in reversed(stdout_text.splitlines()):
        stripped = line.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            json_line = stripped
            break
    if json_line is None:
        json_line = stdout_text

    try:
        metrics = json.loads(json_line)
    except Exception as exc:
        return {
            "ok": False,
            "sandbox_used": True,
            "fallback_reason": f"sandbox_output_not_json: {exc}",
            "error": str(exc),
            "raw_output": stdout_text[:2000],
            "elapsed_ms": elapsed_ms,
        }

    return {
        "ok": True,
        "sandbox_used": True,
        "metrics": metrics,
        "elapsed_ms": elapsed_ms,
    }


def run_default_hello() -> int:
    """CLI entry used by ``python main.py``."""
    out = run_python_in_sandbox(DEFAULT_HELLO_CODE)
    if out.get("skipped"):
        print("Error: set DAYTONA_API_KEY to your Daytona API key.", file=sys.stderr)
        return 1
    if not out.get("ok"):
        msg = out.get("error") or out.get("result") or "unknown error"
        print(f"Error: {out.get('exit_code')} {msg}", file=sys.stderr)
        if out.get("trace"):
            print(out["trace"], file=sys.stderr)
        ec = out.get("exit_code")
        return int(ec) if isinstance(ec, int) else 1
    print(out.get("result", ""))
    return 0
