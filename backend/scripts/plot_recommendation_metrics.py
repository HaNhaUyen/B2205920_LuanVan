from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch


MODEL_ORDER = [
    "ContentBased",
    "Collaborative",
    "MatrixFactorization",
    "SemanticEmbedding",
    "Hybrid",
]

MODEL_LABELS = {
    "ContentBased": "Content-Based",
    "Collaborative": "Collaborative",
    "MatrixFactorization": "Matrix Factorization",
    "SemanticEmbedding": "Semantic Embedding",
    "Hybrid": "Hybrid",
}


def load_payload(json_path: Path) -> dict[str, Any]:
    if not json_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file: {json_path}")

    with json_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    if not isinstance(payload, dict):
        raise ValueError("JSON phải là object.")

    # File mới do evaluate-recommendations.ts sinh ra có dạng:
    # { generatedAt, kValues, productionK, productionEnv, runs: [...] }
    if isinstance(payload.get("runs"), list) and payload["runs"]:
        runs = payload["runs"]
    # Tương thích file cũ chỉ có một lần đánh giá.
    elif isinstance(payload.get("result"), list):
        runs = [payload]
    else:
        raise ValueError("JSON không có trường runs hoặc result hợp lệ.")

    normalized_runs: list[dict[str, Any]] = []

    for run in runs:
        if not isinstance(run, dict):
            continue

        rows = run.get("result")
        if not isinstance(rows, list) or not rows:
            continue

        by_name = {
            str(row.get("modelName")): row
            for row in rows
            if isinstance(row, dict) and row.get("modelName")
        }

        ordered_rows = [
            by_name[name]
            for name in MODEL_ORDER
            if name in by_name
        ]

        if not ordered_rows:
            continue

        k = infer_k(run, ordered_rows)
        normalized = dict(run)
        normalized["_k"] = k
        normalized["_orderedResults"] = ordered_rows
        normalized_runs.append(normalized)

    if not normalized_runs:
        raise ValueError("Không tìm thấy lần đánh giá hợp lệ trong JSON.")

    normalized_runs.sort(key=lambda item: item["_k"])
    payload["_runs"] = normalized_runs
    return payload


def infer_k(run: dict[str, Any], rows: list[dict[str, Any]]) -> int:
    candidates = [
        run.get("k"),
        (run.get("config") or {}).get("k"),
        run.get("topK"),
    ]

    for candidate in candidates:
        try:
            value = int(candidate)
            if value > 0:
                return value
        except (TypeError, ValueError):
            pass

    first = rows[0]
    for key in first:
        for prefix in ("precisionAt", "recallAt", "hitRateAt", "ndcgAt"):
            if str(key).startswith(prefix):
                suffix = str(key)[len(prefix):]
                if suffix.isdigit():
                    return int(suffix)

    raise ValueError("Không xác định được K của lần đánh giá.")


def save_figure(fig, output_dir: Path, file_name: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_dir / f"{file_name}.png", dpi=260, bbox_inches="tight")
    fig.savefig(output_dir / f"{file_name}.svg", bbox_inches="tight")
    plt.close(fig)


def clean_axes(ax) -> None:
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", linestyle="--", alpha=0.25)


def add_bar_labels(ax, bars, decimals: int = 4) -> None:
    for bar in bars:
        value = float(bar.get_height())
        ax.annotate(
            f"{value:.{decimals}f}",
            xy=(bar.get_x() + bar.get_width() / 2, value),
            xytext=(0, 4),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=7.5,
        )


def dataset_subtitle(run: dict[str, Any]) -> str:
    dataset = run.get("dataset", {}) or {}
    return (
        f"{dataset.get('evaluatedUsers', '?')} người dùng · "
        f"{dataset.get('activeTours', '?')} tour · "
        f"{dataset.get('loadedBehaviors', '?')} hành vi · "
        f"Top-{run['_k']}"
    )


def metric_value(row: dict[str, Any], prefix: str, k: int) -> float:
    return float(row.get(f"{prefix}{k}", 0) or 0)


def plot_evaluation_pipeline(payload: dict[str, Any], output_dir: Path) -> None:
    first_run = payload["_runs"][0]
    dataset = first_run.get("dataset", {}) or {}

    steps = [
        (
            "Dữ liệu đầu vào",
            f"{dataset.get('activeTours', '?')} tour\n"
            f"{dataset.get('loadedBehaviors', '?')} hành vi",
        ),
        (
            "Lọc người dùng",
            f"Tối thiểu 6 tour tích cực\n"
            f"{dataset.get('eligibleUsers', '?')} user hợp lệ",
        ),
        (
            "Chia theo thời gian",
            "Train → Validation → Test\n"
            "Loại dữ liệu tương lai",
        ),
        (
            "Huấn luyện cục bộ",
            "Content-Based · UserCF\n"
            "MF · Semantic",
        ),
        (
            "Tối ưu trọng số",
            "Grid search trên\n"
            "tập validation",
        ),
        (
            "Đánh giá cuối",
            "Precision · Recall · Hit Rate\n"
            "NDCG · Coverage · Diversity",
        ),
    ]

    fig, ax = plt.subplots(figsize=(15, 5.8))
    ax.axis("off")

    x_positions = np.linspace(0.02, 0.84, len(steps))
    box_width = 0.135
    box_height = 0.32
    y = 0.34

    for index, (title, body) in enumerate(steps):
        box = FancyBboxPatch(
            (x_positions[index], y),
            box_width,
            box_height,
            boxstyle="round,pad=0.012",
            linewidth=1.2,
            facecolor="white",
        )
        ax.add_patch(box)
        ax.text(
            x_positions[index] + box_width / 2,
            y + 0.225,
            title,
            ha="center",
            va="center",
            fontsize=10,
            fontweight="bold",
        )
        ax.text(
            x_positions[index] + box_width / 2,
            y + 0.105,
            body,
            ha="center",
            va="center",
            fontsize=8.8,
        )

        if index < len(steps) - 1:
            arrow = FancyArrowPatch(
                (x_positions[index] + box_width, y + box_height / 2),
                (x_positions[index + 1], y + box_height / 2),
                arrowstyle="->",
                mutation_scale=15,
                linewidth=1.2,
            )
            ax.add_patch(arrow)

    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_title(
        "Quy trình đánh giá hệ thống gợi ý trên dữ liệu thực",
        fontsize=17,
        fontweight="bold",
        pad=14,
    )
    save_figure(fig, output_dir, "00_evaluation_pipeline")


def plot_ranking_metrics_for_each_k(
    payload: dict[str, Any],
    output_dir: Path,
) -> None:
    for run in payload["_runs"]:
        k = run["_k"]
        rows = run["_orderedResults"]

        metrics = [
            ("precisionAt", f"Precision@{k}"),
            ("recallAt", f"Recall@{k}"),
            ("hitRateAt", f"Hit Rate@{k}"),
            ("ndcgAt", f"NDCG@{k}"),
        ]

        x = np.arange(len(rows))
        width = 0.18
        fig, ax = plt.subplots(figsize=(13, 7))
        all_values: list[float] = []

        for metric_index, (prefix, label) in enumerate(metrics):
            values = [
                metric_value(row, prefix, k)
                for row in rows
            ]
            all_values.extend(values)
            bars = ax.bar(
                x + (metric_index - 1.5) * width,
                values,
                width,
                label=label,
            )
            add_bar_labels(ax, bars)

        ax.set_title(
            f"So sánh chất lượng xếp hạng các mô hình tại K={k}",
            fontsize=17,
            fontweight="bold",
            pad=18,
        )
        ax.text(
            0.5,
            1.01,
            dataset_subtitle(run),
            transform=ax.transAxes,
            ha="center",
            fontsize=10,
        )
        ax.set_xticks(x)
        ax.set_xticklabels(
            [MODEL_LABELS[row["modelName"]] for row in rows],
            rotation=14,
            ha="right",
        )
        ax.set_ylabel("Giá trị chỉ số")
        ax.set_ylim(
            0,
            max(all_values) * 1.25 + 0.01
            if all_values and max(all_values) > 0
            else 1,
        )
        ax.legend(ncol=4, loc="upper left")
        clean_axes(ax)
        fig.tight_layout()
        save_figure(fig, output_dir, f"01_ranking_metrics_k{k}")


def plot_coverage_diversity_all_k(
    payload: dict[str, Any],
    output_dir: Path,
) -> None:
    runs = payload["_runs"]
    models = [
        name
        for name in MODEL_ORDER
        if any(
            any(row["modelName"] == name for row in run["_orderedResults"])
            for run in runs
        )
    ]

    x = np.arange(len(models))
    series: list[tuple[list[float], str]] = []

    for run in runs:
        k = run["_k"]
        by_name = {
            row["modelName"]: row
            for row in run["_orderedResults"]
        }
        series.append(
            (
                [float(by_name.get(model, {}).get("coverage", 0) or 0) for model in models],
                f"Coverage@{k}",
            )
        )
        series.append(
            (
                [float(by_name.get(model, {}).get("diversity", 0) or 0) for model in models],
                f"Diversity@{k}",
            )
        )

    total_series = len(series)
    width = min(0.12, 0.72 / max(total_series, 1))

    fig, ax = plt.subplots(figsize=(14, 7.5))

    for index, (values, label) in enumerate(series):
        offset = (index - (total_series - 1) / 2) * width
        ax.bar(x + offset, values, width, label=label)

    ax.set_title(
        "So sánh Coverage và Diversity tại các giá trị K",
        fontsize=17,
        fontweight="bold",
        pad=18,
    )
    ax.set_xticks(x)
    ax.set_xticklabels(
        [MODEL_LABELS[model] for model in models],
        rotation=14,
        ha="right",
    )
    ax.set_ylabel("Giá trị chuẩn hóa")
    ax.set_ylim(0, 1.05)
    ax.legend(ncol=3, loc="upper left")
    clean_axes(ax)
    fig.tight_layout()
    save_figure(fig, output_dir, "02_coverage_diversity_all_k")


def plot_collaborative_vs_hybrid(
    payload: dict[str, Any],
    output_dir: Path,
) -> None:
    runs = payload["_runs"]
    metrics = [
        ("precisionAt", "Precision"),
        ("recallAt", "Recall"),
        ("hitRateAt", "Hit Rate"),
        ("ndcgAt", "NDCG"),
    ]

    fig, ax = plt.subplots(figsize=(12.5, 7))

    for prefix, label in metrics:
        collaborative_values = []
        hybrid_values = []
        k_values = []

        for run in runs:
            k = run["_k"]
            by_name = {
                row["modelName"]: row
                for row in run["_orderedResults"]
            }
            if "Collaborative" not in by_name or "Hybrid" not in by_name:
                continue

            k_values.append(k)
            collaborative_values.append(
                metric_value(by_name["Collaborative"], prefix, k)
            )
            hybrid_values.append(
                metric_value(by_name["Hybrid"], prefix, k)
            )

        ax.plot(
            k_values,
            collaborative_values,
            marker="o",
            label=f"Collaborative - {label}",
        )
        ax.plot(
            k_values,
            hybrid_values,
            marker="s",
            linestyle="--",
            label=f"Hybrid - {label}",
        )

    ax.set_title(
        "So sánh Collaborative và Hybrid theo K",
        fontsize=17,
        fontweight="bold",
        pad=18,
    )
    ax.set_xlabel("K")
    ax.set_ylabel("Giá trị chỉ số")
    ax.set_xticks([run["_k"] for run in runs])
    ax.legend(ncol=2, fontsize=8.5)
    clean_axes(ax)
    fig.tight_layout()
    save_figure(fig, output_dir, "03_collaborative_vs_hybrid")


def plot_validation_weights(
    payload: dict[str, Any],
    output_dir: Path,
) -> None:
    runs = payload["_runs"]
    weight_names = [
        ("RECO_HYBRID_CONTENT_WEIGHT", "Content-Based"),
        ("RECO_HYBRID_COLLABORATIVE_WEIGHT", "Collaborative"),
        ("RECO_HYBRID_MF_WEIGHT", "Matrix Factorization"),
        ("RECO_HYBRID_SEMANTIC_WEIGHT", "Semantic Embedding"),
    ]

    x = np.arange(len(runs))
    width = 0.19
    fig, ax = plt.subplots(figsize=(11.5, 6.8))

    for index, (env_key, label) in enumerate(weight_names):
        values = []
        for run in runs:
            env = run.get("recommendedProductionEnv", {}) or {}
            values.append(float(env.get(env_key, 0) or 0))

        bars = ax.bar(
            x + (index - 1.5) * width,
            values,
            width,
            label=label,
        )
        add_bar_labels(ax, bars, decimals=1)

    ax.set_title(
        "Trọng số Hybrid được chọn trên tập validation",
        fontsize=17,
        fontweight="bold",
        pad=18,
    )
    ax.set_xticks(x)
    ax.set_xticklabels([f"K={run['_k']}" for run in runs])
    ax.set_ylabel("Trọng số")
    ax.set_ylim(0, 1.0)
    ax.legend(ncol=2, loc="upper left")
    clean_axes(ax)
    fig.tight_layout()
    save_figure(fig, output_dir, "04_validation_weights")


def write_summary(payload: dict[str, Any], output_dir: Path) -> None:
    lines = [
        "KẾT QUẢ ĐÁNH GIÁ HỆ THỐNG GỢI Ý TRAVELA",
        "=" * 58,
        "",
    ]

    for run in payload["_runs"]:
        k = run["_k"]
        rows = run["_orderedResults"]
        by_name = {row["modelName"]: row for row in rows}

        lines.extend(
            [
                f"K={k}",
                "-" * 20,
            ]
        )

        if "Collaborative" in by_name and "Hybrid" in by_name:
            collaborative = by_name["Collaborative"]
            hybrid = by_name["Hybrid"]

            for prefix, label in [
                ("precisionAt", "Precision"),
                ("recallAt", "Recall"),
                ("hitRateAt", "Hit Rate"),
                ("ndcgAt", "NDCG"),
            ]:
                collaborative_value = metric_value(collaborative, prefix, k)
                hybrid_value = metric_value(hybrid, prefix, k)
                difference = hybrid_value - collaborative_value

                lines.append(
                    f"- {label}@{k}: Collaborative={collaborative_value:.4f}; "
                    f"Hybrid={hybrid_value:.4f}; "
                    f"Hybrid-Collaborative={difference:+.4f}"
                )

            lines.append(
                f"- Coverage: Collaborative={float(collaborative.get('coverage', 0)):.4f}; "
                f"Hybrid={float(hybrid.get('coverage', 0)):.4f}"
            )
            lines.append(
                f"- Diversity: Collaborative={float(collaborative.get('diversity', 0)):.4f}; "
                f"Hybrid={float(hybrid.get('diversity', 0)):.4f}"
            )

        lines.append("")

    lines.extend(
        [
            "NHẬN XÉT",
            "- Collaborative cao hơn Hybrid về Precision, Recall, Hit Rate và NDCG ở cả K=3, K=5 và K=10.",
            "- Đây không phải lỗi vẽ biểu đồ. Đó là kết quả thật của lần đánh giá hiện tại.",
            "- Hybrid không bắt buộc phải tốt nhất ở mọi chỉ số.",
            "- Hybrid vẫn có vai trò cân bằng nhiều nguồn tín hiệu và hỗ trợ cold-start.",
            "- Với giao diện hiển thị 3 tour, nên dùng bộ trọng số validation của K=3 cho production.",
            "- Không nên sửa số liệu để làm Hybrid cao hơn Collaborative.",
        ]
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary_real.txt").write_text(
        "\n".join(lines),
        encoding="utf-8",
    )


def main() -> None:
    json_path = (
        Path(sys.argv[1])
        if len(sys.argv) >= 2
        else Path("scripts/recommendation_metrics_real.json")
    )
    output_dir = (
        Path(sys.argv[2])
        if len(sys.argv) >= 3
        else Path("scripts/recommendation_charts_real")
    )

    payload = load_payload(json_path)

    plot_evaluation_pipeline(payload, output_dir)
    plot_ranking_metrics_for_each_k(payload, output_dir)
    plot_coverage_diversity_all_k(payload, output_dir)
    plot_collaborative_vs_hybrid(payload, output_dir)
    plot_validation_weights(payload, output_dir)
    write_summary(payload, output_dir)

    print(f"Đã tạo biểu đồ tại: {output_dir.resolve()}")
    print("- 00_evaluation_pipeline.png / .svg")
    for run in payload["_runs"]:
        print(f"- 01_ranking_metrics_k{run['_k']}.png / .svg")
    print("- 02_coverage_diversity_all_k.png / .svg")
    print("- 03_collaborative_vs_hybrid.png / .svg")
    print("- 04_validation_weights.png / .svg")
    print("- summary_real.txt")


if __name__ == "__main__":
    main()