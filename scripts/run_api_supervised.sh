#!/bin/bash
# Supervisor for the demo API server.
#
# Python 3.13's stdlib _ssl module + mysql-connector-python occasionally
# segfault on TiDB Cloud Serverless TLS sessions (see src/aml/db.py notes).
# Per-query connections in db.py make this very rare, but this wrapper
# ensures any residual crash is invisible to the UI: if the server exits
# for any reason, we relaunch it in ~1 second. The Next.js frontend's
# retry logic picks up the new server transparently.
#
# Usage:
#   ./scripts/run_api_supervised.sh [--port 9000]
#
# Sourced from package.json dev:api so `pnpm dev:all` is supervisor-backed.

set -u
cd "$(dirname "$0")/.."

PORT="9000"
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

PY=$([ -f venv/bin/python ] && echo venv/bin/python || echo python3)

# Free the port if a stale process is holding it.
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true

# Stop the supervisor loop if WE (the bash script) get a SIGTERM/SIGINT.
# pnpm/concurrently sends SIGTERM to this script when the whole stack stops,
# which triggers this trap and exits the loop cleanly.
trap 'echo "[supervisor] received shutdown signal, exiting." >&2; kill $(lsof -ti:'"$PORT"') 2>/dev/null; exit 0' SIGTERM SIGINT SIGHUP

restarts=0
while true; do
  echo "[supervisor] launching API server on port $PORT (restart #$restarts)" >&2
  "$PY" scripts/demo_api_server.py --port "$PORT" &
  CHILD_PID=$!
  wait "$CHILD_PID"
  exit_code=$?
  restarts=$((restarts + 1))

  # Exit 0 = server stopped on purpose (CLI invocation finished normally).
  # Every other exit — including SIGTERM (143), SIGKILL (137), crashes, and
  # segfaults — is a failure we want to recover from. The supervisor-level
  # trap above handles the 'stop the whole stack' case separately.
  if [ $exit_code -eq 0 ]; then
    echo "[supervisor] server exited 0; stopping supervisor." >&2
    break
  fi

  echo "[supervisor] API exited with $exit_code — restarting in 1s..." >&2
  sleep 1
done
