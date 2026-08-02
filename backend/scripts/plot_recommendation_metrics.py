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


def get_selected_weights(run: dict[str, Any]) -> dict[str, float]:
    """Đọc bộ trọng số Hybrid được chọn trên tập validation."""
    config = run.get("config", {}) or {}
    selection = config.get("hybridWeightSelection", {}) or {}
    selected = selection.get("selected", {}) or {}

    if selected:
        return {
            "CBF": float(selected.get("contentBased", 0) or 0),
            "CF": float(selected.get("collaborative", 0) or 0),
            "MF": float(selected.get("matrixFactorization", 0) or 0),
            "Semantic": float(selected.get("semanticEmbedding", 0) or 0),
        }

    env = run.get("recommendedProductionEnv", {}) or {}
    return {
        "CBF": float(env.get("RECO_HYBRID_CONTENT_WEIGHT", 0) or 0),
        "CF": float(env.get("RECO_HYBRID_COLLABORATIVE_WEIGHT", 0) or 0),
        "MF": float(env.get("RECO_HYBRID_MF_WEIGHT", 0) or 0),
        "Semantic": float(env.get("RECO_HYBRID_SEMANTIC_WEIGHT", 0) or 0),
    }


def hybrid_weight_text(run: dict[str, Any]) -> str:
    weights = get_selected_weights(run)
    return (
        "Trọng số Hybrid được chọn trên validation: "
        f"CBF={weights['CBF']:.1f} · "
        f"CF={weights['CF']:.1f} · "
        f"MF={weights['MF']:.1f} · "
        f"Semantic={weights['Semantic']:.1f}"
    )


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
        selected_weights = get_selected_weights(run)

        metrics = [
            ("precisionAt", f"Precision@{k}"),
            ("recallAt", f"Recall@{k}"),
            ("hitRateAt", f"Hit Rate@{k}"),
            ("ndcgAt", f"NDCG@{k}"),
        ]

        x = np.arange(len(rows))
        width = 0.18
        fig, ax = plt.subplots(figsize=(13, 8.2))
        all_values: list[float] = []

        for metric_index, (prefix, label) in enumerate(metrics):
            values = [metric_value(row, prefix, k) for row in rows]
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
            pad=52,
        )

        ax.text(
            0.5,
            1.065,
            dataset_subtitle(run),
            transform=ax.transAxes,
            ha="center",
            va="bottom",
            fontsize=10,
        )

        ax.text(
            0.5,
            1.015,
            hybrid_weight_text(run),
            transform=ax.transAxes,
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
            bbox={
                "boxstyle": "round,pad=0.35",
                "facecolor": "white",
                "edgecolor": "gray",
                "alpha": 0.96,
            },
        )

        model_labels = []
        for row in rows:
            model_name = row["modelName"]
            if model_name == "Hybrid":
                model_labels.append(
                    "Hybrid\n"
                    f"CBF={selected_weights['CBF']:.1f}; "
                    f"CF={selected_weights['CF']:.1f}\n"
                    f"MF={selected_weights['MF']:.1f}; "
                    f"Sem={selected_weights['Semantic']:.1f}"
                )
            else:
                model_labels.append(MODEL_LABELS[model_name])

        ax.set_xticks(x)
        ax.set_xticklabels(model_labels, rotation=12, ha="right")
        ax.set_ylabel("Giá trị chỉ số")
        ax.set_ylim(
            0,
            max(all_values) * 1.25 + 0.01
            if all_values and max(all_values) > 0
            else 1,
        )
        ax.legend(ncol=4, loc="upper left")
        clean_axes(ax)
        fig.tight_layout(rect=[0, 0.04, 1, 0.91])
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
    width = min(0.16, 0.78 / max(len(weight_names), 1))
    fig, ax = plt.subplots(figsize=(11.5, 6.8))

    for index, (env_key, label) in enumerate(weight_names):
        values = []
        for run in runs:
            env = run.get("recommendedProductionEnv", {}) or {}
            values.append(float(env.get(env_key, 0) or 0))

        bars = ax.bar(
            x + (index - (len(weight_names) - 1) / 2) * width,
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



def plot_top_hybrid_weight_candidates(
    payload: dict[str, Any],
    output_dir: Path,
) -> None:
    for run in payload["_runs"]:
        k = run["_k"]
        selection = (
            (run.get("config") or {})
            .get("hybridWeightSelection", {})
        )
        candidates = selection.get("topCandidates", []) or []
        if not candidates:
            continue

        labels: list[str] = []
        ndcg_values: list[float] = []
        recall_values: list[float] = []
        precision_values: list[float] = []

        for index, row in enumerate(candidates, start=1):
            weights = row.get("weights", {}) or {}
            labels.append(
                f"{index}. "
                f"CBF={float(weights.get('contentBased', 0)):.1f}; "
                f"CF={float(weights.get('collaborative', 0)):.1f}; "
                f"MF={float(weights.get('matrixFactorization', 0)):.1f}; "
                f"Sem={float(weights.get('semanticEmbedding', 0)):.1f}"
            )
            ndcg_values.append(float(row.get("validationNdcgAtK", 0) or 0))
            recall_values.append(float(row.get("validationRecallAtK", 0) or 0))
            precision_values.append(float(row.get("validationPrecisionAtK", 0) or 0))

        y = np.arange(len(labels))
        fig, ax = plt.subplots(figsize=(14, 8))
        bars = ax.barh(y, ndcg_values)

        # Gạch chéo cấu hình được chọn để phân biệt mà không phụ thuộc màu sắc.
        if bars:
            bars[0].set_hatch("///")
            bars[0].set_linewidth(2.0)

        ax.set_yticks(y)
        ax.set_yticklabels(labels, fontsize=9)
        ax.invert_yaxis()
        ax.set_xlabel(f"NDCG@{k} trên tập validation")
        ax.set_title(
            f"So sánh các cấu hình trọng số Hybrid tại K={k}\n"
            f"Cấu hình đầu tiên được chọn theo NDCG@{k} cao nhất",
            fontsize=16,
            fontweight="bold",
            pad=16,
        )

        for bar, ndcg, recall, precision in zip(
            bars, ndcg_values, recall_values, precision_values
        ):
            ax.text(
                ndcg + 0.00015,
                bar.get_y() + bar.get_height() / 2,
                f"NDCG={ndcg:.4f} | Recall={recall:.4f} | Precision={precision:.4f}",
                va="center",
                fontsize=8.5,
            )

        ax.set_xlim(0, max(ndcg_values) * 1.3 if ndcg_values else 1)
        clean_axes(ax)
        fig.tight_layout()
        save_figure(fig, output_dir, f"05_top_hybrid_weight_candidates_k{k}")

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
        weights = get_selected_weights(run)

        lines.extend([
            f"K={k}",
            "-" * 20,
            (
                "- Trọng số Hybrid được chọn trên validation: "
                f"CBF={weights['CBF']:.1f}; "
                f"CF={weights['CF']:.1f}; "
                f"MF={weights['MF']:.1f}; "
                f"Semantic={weights['Semantic']:.1f}"
            ),
        ])

        selection = (
            (run.get("config") or {})
            .get("hybridWeightSelection", {})
        )
        top_candidates = selection.get("topCandidates", []) or []
        if top_candidates:
            best = top_candidates[0]
            lines.append(
                f"- Validation: NDCG@{k}="
                f"{float(best.get('validationNdcgAtK', 0)):.4f}; "
                f"Recall@{k}="
                f"{float(best.get('validationRecallAtK', 0)):.4f}; "
                f"Precision@{k}="
                f"{float(best.get('validationPrecisionAtK', 0)):.4f}"
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
                    f"- Test {label}@{k}: "
                    f"Collaborative={collaborative_value:.4f}; "
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

    production_k = payload.get("productionK")
    production_env = payload.get("productionEnv") or {}
    lines.extend(["CẤU HÌNH PRODUCTION", "-" * 20])

    if production_k is not None:
        lines.append(f"- K dùng để chọn trọng số production: {production_k}")

    if production_env:
        lines.append(
            "- Trọng số production: "
            f"CBF={float(production_env.get('RECO_HYBRID_CONTENT_WEIGHT', 0)):.1f}; "
            f"CF={float(production_env.get('RECO_HYBRID_COLLABORATIVE_WEIGHT', 0)):.1f}; "
            f"MF={float(production_env.get('RECO_HYBRID_MF_WEIGHT', 0)):.1f}; "
            f"Semantic={float(production_env.get('RECO_HYBRID_SEMANTIC_WEIGHT', 0)):.1f}"
        )

    lines.extend([
        "",
        "GIẢI THÍCH",
        "- Trọng số không được chọn ngẫu nhiên.",
        "- Với mỗi K, chương trình tạo các tổ hợp trọng số có tổng bằng 1 theo bước grid search.",
        "- Mỗi tổ hợp được chấm trên tập validation bằng NDCG@K.",
        "- Nếu NDCG@K bằng nhau, chương trình ưu tiên Recall@K rồi Precision@K.",
        "- Vì độ dài danh sách thay đổi theo K nên bộ trọng số tốt nhất tại K=3, K=5 và K=10 có thể khác nhau.",
    ])

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
    plot_top_hybrid_weight_candidates(payload, output_dir)
    write_summary(payload, output_dir)

    print(f"Đã tạo biểu đồ tại: {output_dir.resolve()}")
    print("- 00_evaluation_pipeline.png / .svg")
    for run in payload["_runs"]:
        print(f"- 01_ranking_metrics_k{run['_k']}.png / .svg")
    print("- 02_coverage_diversity_all_k.png / .svg")
    print("- 03_collaborative_vs_hybrid.png / .svg")
    print("- 04_validation_weights.png / .svg")
    for run in payload["_runs"]:
        print(f"- 05_top_hybrid_weight_candidates_k{run['_k']}.png / .svg")
    print("- summary_real.txt")


if __name__ == "__main__":
    main()