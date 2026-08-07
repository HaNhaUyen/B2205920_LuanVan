from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from pathlib import Path
from typing import Any

from PIL import Image

from app.services.vision_search import vision_search_engine


def _collect_images(limit: int) -> list[Path]:
    dataset = Path("dataset")
    paths = sorted(
        [
            *dataset.glob("*/*.jpg"),
            *dataset.glob("*/*.jpeg"),
            *dataset.glob("*/*.png"),
            *dataset.glob("*/*.webp"),
        ]
    )
    return paths[:limit]


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((len(ordered) - 1) * percentile))
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Travela image search latency.")
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--repeat", type=int, default=2)
    parser.add_argument("--top-k", type=int, default=12)
    args = parser.parse_args()

    os.environ.setdefault("VISION_EXTERNAL_ENABLED", "0")

    images = _collect_images(args.limit)
    if not images:
        raise SystemExit("No benchmark images found in ai-service/dataset.")

    started = time.perf_counter()
    status = vision_search_engine.load(force_rebuild_cache=False)
    load_ms = round((time.perf_counter() - started) * 1000, 2)

    rows: list[dict[str, Any]] = []
    for round_index in range(args.repeat):
        for image_path in images:
            with Image.open(image_path) as image:
                started = time.perf_counter()
                result = vision_search_engine.search_pil_image(image.convert("RGB"), top_k=args.top_k)
                elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

            detected = result.get("detected") or {}
            rows.append(
                {
                    "round": round_index + 1,
                    "file": str(image_path),
                    "elapsed_ms": elapsed_ms,
                    "detected": detected.get("destination_slug"),
                    "low_confidence": result.get("low_confidence"),
                }
            )

    values = [row["elapsed_ms"] for row in rows]
    summary = {
        "load_ms": load_ms,
        "status": getattr(status, "status", None),
        "cache_used": getattr(status, "cache_used", None),
        "count": len(values),
        "avg_ms": round(statistics.mean(values), 2),
        "median_ms": round(statistics.median(values), 2),
        "p95_ms": round(_percentile(values, 0.95), 2),
        "min_ms": round(min(values), 2),
        "max_ms": round(max(values), 2),
    }

    print(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
