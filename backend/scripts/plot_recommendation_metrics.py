"""
Vẽ biểu đồ đánh giá hệ thống gợi ý.

Cách dùng trong thư mục backend:
  python scripts/plot_recommendation_metrics_fixed.py scripts/metrics_fixed.json recommendation_charts

Script này đọc được nhiều dạng JSON:
  1) [...]
  2) {"result": [...]}
  3) {"metrics_json": "[...]"}
  4) [{"metrics_json": "[...]"}]
"""

import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np


def load_data(path: Path):
    raw = json.loads(path.read_text(encoding="utf-8"))

    if isinstance(raw, list) and len(raw) == 1 and isinstance(raw[0], dict) and "metrics_json" in raw[0]:
        return json.loads(raw[0]["metrics_json"])

    if isinstance(raw, dict) and "metrics_json" in raw:
        return json.loads(raw["metrics_json"])

    if isinstance(raw, dict) and "result" in raw:
        return raw["result"]

    return raw


def pick(row, *keys, default=0):
    for key in keys:
        if key in row and row[key] is not None:
            return row[key]
    return default


def model_name(row):
    return str(pick(row, "modelName", "model_name", default="Unknown"))


def plot_grouped_metrics(data, out_dir: Path):
    models = [model_name(x) for x in data]
    precision = [float(pick(x, "precisionAt10", "precision_at_10")) for x in data]
    recall = [float(pick(x, "recallAt10", "recall_at_10")) for x in data]
    ndcg = [float(pick(x, "ndcgAt10", "ndcg_at_10")) for x in data]

    x = np.arange(len(models))
    width = 0.25

    plt.figure(figsize=(11, 6))
    plt.bar(x - width, precision, width=width, label="Precision@10")
    plt.bar(x, recall, width=width, label="Recall@10")
    plt.bar(x + width, ndcg, width=width, label="NDCG@10")
    plt.xticks(x, models, rotation=12, ha="right")
    plt.ylim(0, max(0.05, max(precision + recall + ndcg) * 1.25))
    plt.title("Recommendation Metrics Comparison")
    plt.legend()
    plt.tight_layout()
    plt.savefig(out_dir / "recommendation_precision_recall_ndcg.png", dpi=200)
    plt.close()


def plot_coverage_diversity(data, out_dir: Path):
    models = [model_name(x) for x in data]
    coverage = [float(pick(x, "coverage")) for x in data]
    diversity = [float(pick(x, "diversity")) for x in data]

    x = np.arange(len(models))
    width = 0.35

    plt.figure(figsize=(10, 6))
    plt.bar(x - width / 2, coverage, width=width, label="Coverage")
    plt.bar(x + width / 2, diversity, width=width, label="Diversity")
    plt.xticks(x, models, rotation=12, ha="right")
    plt.ylim(0, max(0.05, max(coverage + diversity) * 1.25))
    plt.title("Coverage & Diversity")
    plt.legend()
    plt.tight_layout()
    plt.savefig(out_dir / "recommendation_coverage_diversity.png", dpi=200)
    plt.close()


def plot_hybrid_gain(data, out_dir: Path):
    metric_keys = ("ndcgAt10", "ndcg_at_10")

    baseline_values = [
        float(pick(x, *metric_keys))
        for x in data
        if model_name(x) != "Hybrid"
    ]

    baseline = max(baseline_values or [0])
    hybrid = next(
        (float(pick(x, *metric_keys)) for x in data if model_name(x) == "Hybrid"),
        0,
    )

    plt.figure(figsize=(7, 5))
    plt.bar(["Best baseline", "Hybrid"], [baseline, hybrid])
    plt.title("Hybrid Gain by NDCG@10")
    plt.tight_layout()
    plt.savefig(out_dir / "hybrid_gain_ndcg10.png", dpi=200)
    plt.close()


def main():
    if len(sys.argv) < 3:
        print("Usage: python plot_recommendation_metrics_fixed.py metrics.json output_dir")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    data = load_data(input_path)
    if not isinstance(data, list):
        raise ValueError("metrics JSON phải là mảng hoặc object có result/metrics_json")

    plot_grouped_metrics(data, out_dir)
    plot_coverage_diversity(data, out_dir)
    plot_hybrid_gain(data, out_dir)

    print(f"Saved charts to {out_dir}")


if __name__ == "__main__":
    main()