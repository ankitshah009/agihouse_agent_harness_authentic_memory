"""Exa search integration for surfacing live attack intel during update cycles."""

from __future__ import annotations

import os
from typing import Any, Dict


def is_configured() -> bool:
    return bool(os.environ.get("EXA_API_KEY", "").strip())


def _build_query(drift_signal: str, modality: str) -> str:
    signal = (drift_signal or "").lower()
    modality_token = (modality or "").lower()
    if "voice" in signal or "clone" in signal or modality_token == "voice":
        return "voice clone deepfake generator 2026 release"
    if "face" in signal or modality_token in ("face", "video", "image"):
        return "face swap deepfake generator 2026 release"
    return "deepfake detection bypass 2026"


def surface_attack_intel(drift_signal: str, modality: str = "voice", num_results: int = 3) -> Dict[str, Any]:
    """Query Exa for fresh attack intel matching the current drift signal.

    Never raises: returns a dict describing configuration + hits (possibly empty).
    """
    query = _build_query(drift_signal, modality)

    if not is_configured():
        return {
            "ok": False,
            "configured": False,
            "query": query,
            "hits": [],
        }

    try:
        from exa_py import Exa
    except ImportError as exc:
        return {
            "ok": False,
            "configured": True,
            "error": f"exa_py not installed: {exc}",
            "query": query,
            "hits": [],
        }

    try:
        client = Exa(api_key=os.environ["EXA_API_KEY"])
        response = client.search(query, num_results=num_results, type="auto")
    except Exception as exc:
        return {
            "ok": False,
            "configured": True,
            "error": str(exc),
            "query": query,
            "hits": [],
        }

    hits = []
    for result in getattr(response, "results", []) or []:
        hits.append(
            {
                "title": getattr(result, "title", None),
                "url": getattr(result, "url", None),
                "id": getattr(result, "id", None),
                "published": getattr(result, "published_date", None),
            }
        )

    return {
        "ok": True,
        "configured": True,
        "query": query,
        "hits": hits,
    }
