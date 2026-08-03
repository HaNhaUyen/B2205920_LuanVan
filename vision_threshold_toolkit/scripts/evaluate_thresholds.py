from __future__ import annotations

import argparse
import csv
import math
import sys
from pathlib import Path
from typing import Any

from PIL import Image


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        if math.isnan(number) or math.isinf(number):
            return default
        return number
    except Exception:
        return default


def load_rows(metadata_path: Path, include_pending: bool) -> list[dict[str, str]]:
    with metadata_path.open("r", encoding="utf-8-sig", newline="") as file:
        rows = list(csv.DictReader(file))

    if include_pending:
        return rows

    approved = [
        row
        for row in rows
        if (row.get("review_status") or "").strip().lower() == "approved"
    ]
    if not approved:
        raise SystemExit(
            "Không có ảnh review_status=approved. "
            "Hãy duyệt metadata.csv hoặc dùng --include-pending."
        )
    return approved


def find_second_destination(
    ranked: list[dict[str, Any]],
    top_slug: str,
) -> dict[str, Any]:
    """Lấy kết quả thứ hai có destination khác Top-1."""
    for item in ranked[1:]:
        if (item.get("destination_slug") or "") != top_slug:
            return item
    return {}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Chạy Travela CLIP và xuất điểm để tối ưu ngưỡng."
    )
    parser.add_argument("--ai-root", required=True)
    parser.add_argument("--dataset", default="threshold_dataset")
    parser.add_argument("--output", default="results/predictions.csv")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--include-pending", action="store_true")
    parser.add_argument("--with-external", action="store_true")
    parser.add_argument("--rebuild-gallery", action="store_true")
    args = parser.parse_args()

    ai_root = Path(args.ai_root).resolve()
    dataset = Path(args.dataset).resolve()
    output = Path(args.output).resolve()

    if not (ai_root / "app").exists():
        raise SystemExit(f"Không tìm thấy thư mục app trong: {ai_root}")

    metadata_path = dataset / "metadata.csv"
    if not metadata_path.exists():
        raise SystemExit(f"Không tìm thấy metadata.csv: {metadata_path}")

    sys.path.insert(0, str(ai_root))

    from app.services.vision_search import (
        reload_vision_gallery,
        search_similar_destinations_from_pil,
    )

    if args.with_external:
        from app.services.external_vision_search import recognize_landmark

    if args.rebuild_gallery:
        print("Đang rebuild gallery...")
        print(reload_vision_gallery(force_rebuild_cache=True))

    rows = load_rows(metadata_path, args.include_pending)

    fields = [
        "relative_path",
        "group",
        "expected_slug",
        "expected_name",
        "expected_image_type",
        "predicted_slug",
        "predicted_name",
        "best_image_score",
        "final_score",
        "confidence",
        "top_gap",
        "clip_correct",
        "current_low_confidence",
        "external_called",
        "external_recognized",
        "external_image_type",
        "external_landmark",
        "external_destination",
        "external_country",
        "external_confidence",
        "external_evidence_count",
        "external_provider",
        "error",
    ]

    results: list[dict[str, Any]] = []

    for index, row in enumerate(rows, start=1):
        image_path = dataset / row["relative_path"]

        record: dict[str, Any] = {key: "" for key in fields}
        for key in (
            "relative_path",
            "group",
            "expected_slug",
            "expected_name",
            "expected_image_type",
        ):
            record[key] = row.get(key, "")

        try:
            with Image.open(image_path) as image_file:
                image = image_file.convert("RGB")

            result = search_similar_destinations_from_pil(
                image,
                top_k=max(args.top_k, 5),
            )

            ranked = result.get("top_matches") or []
            top = ranked[0] if ranked else {}
            top_slug = str(top.get("destination_slug") or "")
            second = find_second_destination(ranked, top_slug)

            top_score = safe_float(top.get("score"))
            second_score = safe_float(second.get("score"))
            top_gap = top_score - second_score if second else 1.0

            expected_slug = str(row.get("expected_slug") or "")
            is_internal = row.get("group") == "internal"
            is_correct = is_internal and top_slug == expected_slug

            record.update(
                {
                    "predicted_slug": top_slug,
                    "predicted_name": top.get("destination_name", ""),
                    "best_image_score": safe_float(top.get("best_image_score")),
                    "final_score": top_score,
                    "confidence": safe_float(top.get("confidence")),
                    "top_gap": top_gap,
                    "clip_correct": int(is_correct),
                    "current_low_confidence": int(
                        bool(result.get("low_confidence"))
                    ),
                    "external_called": 0,
                }
            )

            if args.with_external and bool(result.get("low_confidence")):
                external = recognize_landmark(image)
                evidence = external.get("visual_evidence")
                if not isinstance(evidence, list):
                    evidence = []

                record.update(
                    {
                        "external_called": 1,
                        "external_recognized": int(
                            bool(external.get("recognized"))
                        ),
                        "external_image_type": external.get("image_type", ""),
                        "external_landmark": external.get("landmark", ""),
                        "external_destination": external.get("destination", ""),
                        "external_country": external.get("country", ""),
                        "external_confidence": safe_float(
                            external.get("confidence")
                        ),
                        "external_evidence_count": len(evidence),
                        "external_provider": external.get("provider", ""),
                    }
                )

        except Exception as exc:
            record["error"] = repr(exc)

        results.append(record)

        print(
            f"{index}/{len(rows)} {row['relative_path']} -> "
            f"{record['predicted_slug']} "
            f"raw={record['best_image_score']} "
            f"conf={record['confidence']} "
            f"gap={record['top_gap']}"
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(results)

    print(f"Đã ghi: {output}")


if __name__ == "__main__":
    main()
