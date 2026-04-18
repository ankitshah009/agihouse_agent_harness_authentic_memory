import json
import math
from typing import Iterable, List, Sequence


def to_float_list(value) -> List[float]:
    if value is None:
        return []
    if isinstance(value, str):
        value = json.loads(value)
    if isinstance(value, (list, tuple)):
        return [float(x) for x in value]
    raise TypeError("vector must be list/tuple or JSON string")


def normalize(vec: Sequence[float]) -> List[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return [0.0 for _ in vec]
    return [x / norm for x in vec]


def cosine_distance(a: Sequence[float], b: Sequence[float]) -> float:
    a_list = list(a)
    b_list = list(b)
    if not a_list or not b_list:
        return 1.0
    if len(a_list) != len(b_list):
        raise ValueError("vector lengths must match")

    dot = 0.0
    a_norm = 0.0
    b_norm = 0.0
    for x, y in zip(a_list, b_list):
        dot += x * y
        a_norm += x * x
        b_norm += y * y

    if a_norm == 0 or b_norm == 0:
        return 1.0

    cosine_sim = dot / (math.sqrt(a_norm) * math.sqrt(b_norm))
    # map cosine similarity [-1,1] -> distance [0,2]
    return 1.0 - cosine_sim


def min_cosine_distance(vectors: Iterable[Sequence[float]], target: Sequence[float]) -> float:
    target = to_float_list(target)
    best = 1.0
    for vec in vectors:
        score = cosine_distance(to_float_list(vec), target)
        if score < best:
            best = score
    return best


def json_dump_vector(vector: Sequence[float]) -> str:
    return json.dumps([float(x) for x in vector])


def safe_float(value, default=1.0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default
