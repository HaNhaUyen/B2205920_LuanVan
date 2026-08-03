from __future__ import annotations

import argparse
import csv
import itertools
import json
import math
from pathlib import Path
from typing import Any


def frange(start: float, stop: float, step: float):
    value = start
    while value <= stop + 1e-9:
        yield round(value, 6)
        value += step


def safe_float(row: dict[str, str], key: str) -> float:
    try:
        value = float(row.get(key) or 0.0)
        if math.isnan(value) or math.isinf(value):
            return 0.0
        return value
    except Exception:
        return 0.0


def parse_range(value: str) -> tuple[float, float, float]:
    parts = [float(item.strip()) for item in value.split(",")]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError(
            "Phạm vi phải có dạng start,stop,step"
        )
    start, stop, step = parts
    if step <= 0 or stop < start:
        raise argparse.ArgumentTypeError("Phạm vi không hợp lệ")
    return start, stop, step


def calculate_metrics(
    rows: list[dict[str, str]],
    raw_threshold: float,
    confidence_threshold: float,
    gap_threshold: float,
) -> dict[str, Any]:
    internal_total = 0
    ood_total = 0

    correct_accept = 0
    wrong_internal_accept = 0
    rejected_internal = 0

    ood_false_accept = 0
    ood_true_reject = 0

    accepted_total = 0

    for row in rows:
        group = (row.get("group") or "").strip()
        correct = str(row.get("clip_correct", "0")).lower() in {
            "1",
            "true",
        }

        accept = (
            safe_float(row, "best_image_score") >= raw_threshold
            and safe_float(row, "confidence") >= confidence_threshold
            and safe_float(row, "top_gap") >= gap_threshold
        )

        if accept:
            accepted_total += 1

        if group == "internal":
            internal_total += 1
            if accept and correct:
                correct_accept += 1
            elif accept and not correct:
                wrong_internal_accept += 1
            else:
                rejected_internal += 1
        else:
            ood_total += 1
            if accept:
                ood_false_accept += 1
            else:
                ood_true_reject += 1

    all_accepted = (
        correct_accept + wrong_internal_accept + ood_false_accept
    )

    accepted_precision = (
        correct_accept / all_accepted if all_accepted else 0.0
    )
    internal_recall = (
        correct_accept / internal_total if internal_total else 0.0
    )
    ood_rejection = (
        ood_true_reject / ood_total if ood_total else 0.0
    )

    if accepted_precision + internal_recall:
        f1 = (
            2
            * accepted_precision
            * internal_recall
            / (accepted_precision + internal_recall)
        )
    else:
        f1 = 0.0

    beta = 0.5
    beta_sq = beta * beta
    if accepted_precision + internal_recall:
        f0_5 = (
            (1 + beta_sq)
            * accepted_precision
            * internal_recall
            / (beta_sq * accepted_precision + internal_recall)
        )
    else:
        f0_5 = 0.0

    external_call_rate = (
        1.0 - accepted_total / len(rows) if rows else 0.0
    )

    objective = (
        0.55 * f0_5
        + 0.25 * ood_rejection
        + 0.20 * internal_recall
    )

    return {
        "raw": raw_threshold,
        "confidence": confidence_threshold,
        "top_gap": gap_threshold,
        "internal_total": internal_total,
        "ood_total": ood_total,
        "correct_accept": correct_accept,
        "wrong_internal_accept": wrong_internal_accept,
        "rejected_internal": rejected_internal,
        "ood_false_accept": ood_false_accept,
        "ood_true_reject": ood_true_reject,
        "accepted_precision": accepted_precision,
        "internal_recall": internal_recall,
        "f1": f1,
        "f0_5": f0_5,
        "ood_rejection": ood_rejection,
        "external_call_rate": external_call_rate,
        "objective": objective,
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Tối ưu ngưỡng CLIP cho Travela."
    )
    parser.add_argument(
        "--predictions",
        default="results/predictions.csv",
    )
    parser.add_argument(
        "--output-dir",
        default="results",
    )
    parser.add_argument(
        "--min-precision",
        type=float,
        default=0.80,
    )
    parser.add_argument(
        "--min-ood-rejection",
        type=float,
        default=0.80,
    )
    parser.add_argument(
        "--min-recall",
        type=float,
        default=0.30,
    )
    parser.add_argument(
        "--raw-range",
        default="0.40,0.90,0.01",
    )
    parser.add_argument(
        "--confidence-range",
        default="0.00,1.00,0.02",
    )
    parser.add_argument(
        "--gap-range",
        default="0.00,0.16,0.005",
    )
    args = parser.parse_args()

    predictions_path = Path(args.predictions)
    if not predictions_path.exists():
        raise SystemExit(
            f"Không tìm thấy predictions: {predictions_path}"
        )

    with predictions_path.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        rows = list(csv.DictReader(file))

    rows = [
        row
        for row in rows
        if not (row.get("error") or "").strip()
    ]
    if not rows:
        raise SystemExit("Không có dòng predictions hợp lệ.")

    raw_range = parse_range(args.raw_range)
    confidence_range = parse_range(args.confidence_range)
    gap_range = parse_range(args.gap_range)

    combinations = itertools.product(
        frange(*raw_range),
        frange(*confidence_range),
        frange(*gap_range),
    )

    all_metrics = [
        calculate_metrics(rows, *values)
        for values in combinations
    ]

    ranked_all = sorted(
        all_metrics,
        key=lambda metric: (
            metric["objective"],
            metric["accepted_precision"],
            metric["ood_rejection"],
            metric["internal_recall"],
        ),
        reverse=True,
    )

    feasible = [
        metric
        for metric in ranked_all
        if metric["accepted_precision"] >= args.min_precision
        and metric["ood_rejection"] >= args.min_ood_rejection
        and metric["internal_recall"] >= args.min_recall
    ]

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    write_csv(
        output_dir / "threshold_grid_top50_all.csv",
        ranked_all[:50],
    )

    if not feasible:
        best_unconstrained = ranked_all[0]
        (
            output_dir / "best_unconstrained_thresholds.json"
        ).write_text(
            json.dumps(
                best_unconstrained,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        print(
            json.dumps(
                best_unconstrained,
                ensure_ascii=False,
                indent=2,
            )
        )
        raise SystemExit(
            "\nKhông có bộ ngưỡng nào đồng thời đạt:\n"
            f"- precision >= {args.min_precision:.2f}\n"
            f"- OOD rejection >= {args.min_ood_rejection:.2f}\n"
            f"- recall >= {args.min_recall:.2f}\n"
            "Không tạo recommended_thresholds.env.\n"
            "Hãy cải thiện gallery/dataset hoặc hạ mục tiêu có chủ đích."
        )

    ranked_feasible = sorted(
        feasible,
        key=lambda metric: (
            metric["objective"],
            metric["accepted_precision"],
            metric["ood_rejection"],
            metric["internal_recall"],
        ),
        reverse=True,
    )

    write_csv(
        output_dir / "threshold_grid_top50_feasible.csv",
        ranked_feasible[:50],
    )

    best = ranked_feasible[0]

    (
        output_dir / "best_thresholds.json"
    ).write_text(
        json.dumps(best, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    (
        output_dir / "recommended_thresholds.env"
    ).write_text(
        (
            f"VISION_MIN_RAW_SCORE={best['raw']:.3f}\n"
            f"VISION_MIN_CONFIDENCE={best['confidence']:.3f}\n"
            f"VISION_MIN_TOP_GAP={best['top_gap']:.3f}\n"
        ),
        encoding="utf-8",
    )

    print(json.dumps(best, ensure_ascii=False, indent=2))
    print(output_dir / "recommended_thresholds.env")


if __name__ == "__main__":
    main()
