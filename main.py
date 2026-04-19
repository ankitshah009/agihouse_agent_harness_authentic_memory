"""Run Python in a Daytona sandbox (Hello World smoke test).

Delegates to ``src.aml.daytona_runner`` (same logic as the demo API).

::

    export DAYTONA_API_KEY="dtn_..."
    python main.py
"""

from __future__ import annotations

import sys

from src.aml.daytona_runner import run_default_hello


if __name__ == "__main__":
    raise SystemExit(run_default_hello())
