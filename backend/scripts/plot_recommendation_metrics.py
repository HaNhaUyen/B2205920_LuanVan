from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np


MODEL_ORDER = ["ContentBased", "Collaborative", "Hybrid"]
MODEL_LABELS = {
    "ContentBased": "Lọc dựa trên nội dung",
    "Collaborative": "Lọc cộng tác",
    "Hybrid": "Lọc kết hợp (Hybrid)",
}


def load_payload(json_path: Path) -> dict[str, Any]:
    if not json_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file: {json_path}")

    with json_path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    if not isinstance(payload, dict):
        raise ValueError("JSON phải là một object có trường result.")

    rows = payload.get("result")
    if not isinstance(rows, list) or not rows:
        raise ValueError("JSON không có trường result hợp lệ.")

    by_name = {
        str(row.get("modelName")): row
        for row in rows
        if isinstance(row, dict) and row.get("modelName")
    }

    missing = [name for name in MODEL_ORDER if name not in by_name]
    if missing:
        raise ValueError(f"Thiếu kết quả cho: {', '.join(missing)}")

    payload["_orderedResults"] = [by_name[name] for name in MODEL_ORDER]
    return payload


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
            xytext=(0, 5),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=9,
            fontweight="bold",
        )


def dataset_subtitle(payload: dict[str, Any]) -> str:
    dataset = payload.get("dataset", {}) or {}
    config = payload.get("config", {}) or {}

    users = dataset.get("evaluatedUsers", "?")
    tours = dataset.get("activeTours", "?")
    behaviors = dataset.get("loadedBehaviors", "?")
    k = config.get("k", "?")

    return (
        f"Đánh giá thật từ database · {users} người dùng · "
        f"{tours} tour · {behaviors} hành vi · Top-{k}"
    )


def plot_accuracy_metrics(payload: dict[str, Any], output_dir: Path) -> None:
    rows = payload["_orderedResults"]

    metrics = [
        ("precisionAt10", "Precision@10"),
        ("recallAt10", "Recall@10"),
        ("ndcgAt10", "NDCG@10"),
    ]

    x = np.arange(len(metrics))
    width = 0.23

    fig, ax = plt.subplots(figsize=(12, 7))
    all_values = []

    for index, row in enumerate(rows):
        values = [float(row.get(key, 0) or 0) for key, _ in metrics]
        all_values.extend(values)

        bars = ax.bar(
            x + (index - 1) * width,
            values,
            width,
            label=MODEL_LABELS[row["modelName"]],
        )
        add_bar_labels(ax, bars)

    ax.set_title(
        "So sánh độ chính xác và chất lượng xếp hạng",
        fontsize=18,
        fontweight="bold",
        pad=18,
    )
    ax.text(
        0.5,
        1.01,
        dataset_subtitle(payload),
        transform=ax.transAxes,
        ha="center",
        fontsize=10.5,
    )

    ax.set_xticks(x)
    ax.set_xticklabels([label for _, label in metrics])
    ax.set_ylabel("Giá trị chỉ số")
    ax.set_ylim(0, max(all_values) * 1.35 if max(all_values) > 0 else 1)
    ax.legend(loc="upper left")
    clean_axes(ax)

    fig.text(
        0.5,
        0.02,
        "Precision@10: tỷ lệ tour đúng trong Top 10 | "
        "Recall@10: khả năng tìm đủ tour phù hợp | "
        "NDCG@10: chất lượng thứ tự xếp hạng",
        ha="center",
        fontsize=9.5,
    )

    fig.tight_layout(rect=[0, 0.06, 1, 1])
    save_figure(fig, output_dir, "01_accuracy_metrics_real")


def plot_coverage_diversity(payload: dict[str, Any], output_dir: Path) -> None:
    rows = payload["_orderedResults"]

    metrics = [
        ("coverage", "Coverage"),
        ("diversity", "Diversity"),
    ]

    x = np.arange(len(metrics))
    width = 0.23

    fig, ax = plt.subplots(figsize=(10.5, 6.8))

    for index, row in enumerate(rows):
        values = [float(row.get(key, 0) or 0) for key, _ in metrics]

        bars = ax.bar(
            x + (index - 1) * width,
            values,
            width,
            label=MODEL_LABELS[row["modelName"]],
        )
        add_bar_labels(ax, bars)

    ax.set_title(
        "So sánh độ bao phủ và độ đa dạng",
        fontsize=18,
        fontweight="bold",
        pad=18,
    )
    ax.text(
        0.5,
        1.01,
        dataset_subtitle(payload),
        transform=ax.transAxes,
        ha="center",
        fontsize=10.5,
    )

    ax.set_xticks(x)
    ax.set_xticklabels([label for _, label in metrics])
    ax.set_ylabel("Tỷ lệ / điểm chuẩn hóa")
    ax.set_ylim(0, 1.0)
    ax.legend(loc="upper left")
    clean_axes(ax)

    fig.text(
        0.5,
        0.02,
        "Coverage: tỷ lệ tour từng xuất hiện trong gợi ý | "
        "Diversity: mức khác nhau giữa các tour trong cùng danh sách",
        ha="center",
        fontsize=9.5,
    )

    fig.tight_layout(rect=[0, 0.06, 1, 1])
    save_figure(fig, output_dir, "02_coverage_diversity_real")


def plot_hybrid_tradeoff(payload: dict[str, Any], output_dir: Path) -> None:
    rows = payload["_orderedResults"]
    by_name = {row["modelName"]: row for row in rows}

    metrics = [
        ("precisionAt10", "Precision@10"),
        ("recallAt10", "Recall@10"),
        ("ndcgAt10", "NDCG@10"),
        ("coverage", "Coverage"),
        ("diversity", "Diversity"),
    ]

    hybrid = by_name["Hybrid"]

    values = []
    labels = []

    for base_name in ["ContentBased", "Collaborative"]:
        base = by_name[base_name]

        for key, label in metrics:
            base_value = float(base.get(key, 0) or 0)
            hybrid_value = float(hybrid.get(key, 0) or 0)

            change = (
                ((hybrid_value - base_value) / base_value) * 100
                if base_value > 0
                else np.nan
            )

            values.append(change)
            labels.append(
                f"{label}\nso với "
                f"{'Content-Based' if base_name == 'ContentBased' else 'Collaborative'}"
            )

    fig, ax = plt.subplots(figsize=(14, 7))

    plot_values = [0 if not np.isfinite(value) else value for value in values]
    x = np.arange(len(labels))
    bars = ax.bar(x, plot_values)

    for bar, value in zip(bars, values):
        text = f"{value:+.1f}%" if np.isfinite(value) else "Không tính %\n(mốc = 0)"
        ax.annotate(
            text,
            xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
            xytext=(0, 6 if bar.get_height() >= 0 else -18),
            textcoords="offset points",
            ha="center",
            va="bottom" if bar.get_height() >= 0 else "top",
            fontsize=9,
            fontweight="bold",
        )

    ax.axhline(0, linewidth=1)
    ax.set_title(
        "Mức thay đổi của Hybrid so với hai thuật toán riêng lẻ",
        fontsize=18,
        fontweight="bold",
        pad=18,
    )
    ax.text(
        0.5,
        1.01,
        dataset_subtitle(payload),
        transform=ax.transAxes,
        ha="center",
        fontsize=10.5,
    )

    ax.set_ylabel("Mức thay đổi (%)")
    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=25, ha="right")
    clean_axes(ax)

    finite = [value for value in values if np.isfinite(value)]
    if finite:
        lower = min(finite + [0])
        upper = max(finite + [0])
        margin = max((upper - lower) * 0.18, 10)
        ax.set_ylim(lower - margin, upper + margin)

    fig.text(
        0.5,
        0.02,
        "Hybrid tăng Precision, Recall, Coverage và Diversity nhưng NDCG thấp hơn Collaborative; "
        "đây là sự đánh đổi cần trình bày trung thực.",
        ha="center",
        fontsize=9.5,
    )

    fig.tight_layout(rect=[0, 0.08, 1, 1])
    save_figure(fig, output_dir, "03_hybrid_tradeoff_real")


def plot_train_tour_distribution(payload: dict[str, Any], output_dir: Path) -> None:
    details = payload.get("evaluatedUserDetails", []) or []

    if not details:
        return

    train_tours = [int(item.get("trainTours", 0) or 0) for item in details]
    test_tours = [int(item.get("testTours", 0) or 0) for item in details]

    sorted_train = sorted(train_tours, reverse=True)
    x = np.arange(1, len(sorted_train) + 1)

    fig, ax = plt.subplots(figsize=(12, 6.5))
    ax.bar(x, sorted_train)

    ax.set_title(
        "Phân bố số tour huấn luyện theo người dùng",
        fontsize=18,
        fontweight="bold",
        pad=18,
    )
    ax.text(
        0.5,
        1.01,
        (
            f"{len(train_tours)} người dùng · "
            f"Trung vị trainTours = {np.median(train_tours):.1f} · "
            f"Min = {min(train_tours)} · Max = {max(train_tours)}"
        ),
        transform=ax.transAxes,
        ha="center",
        fontsize=10.5,
    )

    ax.set_xlabel("Người dùng (sắp xếp giảm dần theo trainTours)")
    ax.set_ylabel("Số tour trong tập train")
    clean_axes(ax)

    fig.text(
        0.5,
        0.02,
        "Biểu đồ cho thấy dữ liệu không cân bằng: một vài user có lịch sử rất lớn, "
        "trong khi đa số chỉ có 4 tour train và 2 tour test.",
        ha="center",
        fontsize=9.5,
    )

    fig.tight_layout(rect=[0, 0.06, 1, 1])
    save_figure(fig, output_dir, "04_train_tour_distribution")


def write_summary(payload: dict[str, Any], output_dir: Path) -> None:
    rows = payload["_orderedResults"]
    by_name = {row["modelName"]: row for row in rows}

    dataset = payload.get("dataset", {}) or {}
    config = payload.get("config", {}) or {}
    leakage = payload.get("leakageProtection", {}) or {}
    details = payload.get("evaluatedUserDetails", []) or []

    train_tours = [int(item.get("trainTours", 0) or 0) for item in details]

    lines = [
        "KẾT QUẢ ĐÁNH GIÁ THẬT HỆ THỐNG GỢI Ý TRAVELA",
        "=" * 58,
        "",
        f"Thời điểm tạo: {payload.get('generatedAt', '-')}",
        f"Nguồn: {payload.get('source', '-')}",
        f"Phương pháp: {payload.get('evaluationMethod', '-')}",
        "",
        "Cấu hình:",
        f"- K: {config.get('k', '-')}",
        f"- Số user tối đa: {config.get('maxUsers', '-')}",
        f"- Số tour tối thiểu/user: {config.get('minUniqueTours', '-')}",
        f"- Số test item/user: {config.get('testItems', '-')}",
        f"- Số user tương tự: {config.get('topSimilarUsers', '-')}",
        f"- Trọng số Content-Based: {config.get('hybridWeights', {}).get('contentBased', '-')}",
        f"- Trọng số Collaborative: {config.get('hybridWeights', {}).get('collaborative', '-')}",
        "",
        "Dữ liệu:",
        f"- Tour đang xuất bản: {dataset.get('activeTours', '-')}",
        f"- Hành vi đã đọc: {dataset.get('loadedBehaviors', '-')}",
        f"- User đủ điều kiện: {dataset.get('eligibleUsers', '-')}",
        f"- User được đánh giá: {dataset.get('evaluatedUsers', '-')}",
    ]

    if train_tours:
        lines.extend(
            [
                f"- TrainTours trung vị: {np.median(train_tours):.1f}",
                f"- TrainTours nhỏ nhất: {min(train_tours)}",
                f"- TrainTours lớn nhất: {max(train_tours)}",
            ]
        )

    lines.extend(
        [
            "",
            "Chống rò rỉ dữ liệu:",
            f"- Loại test của target user khỏi train: {leakage.get('targetUserTestRemovedFromTraining', False)}",
            f"- Loại hành vi sau cutoff: {leakage.get('behaviorsAfterTestCutoffRemovedFromCollaborativeMatrix', False)}",
            "",
            "Kết quả:",
        ]
    )

    for model_name in MODEL_ORDER:
        row = by_name[model_name]
        lines.extend(
            [
                "",
                MODEL_LABELS[model_name],
                f"- Precision@10: {float(row.get('precisionAt10', 0)):.4f}",
                f"- Recall@10: {float(row.get('recallAt10', 0)):.4f}",
                f"- NDCG@10: {float(row.get('ndcgAt10', 0)):.4f}",
                f"- Coverage: {float(row.get('coverage', 0)):.4f}",
                f"- Diversity: {float(row.get('diversity', 0)):.4f}",
            ]
        )

    lines.extend(
        [
            "",
            "Nhận xét:",
            "- Hybrid cao nhất về Precision@10, Recall@10, Coverage và Diversity.",
            "- Collaborative cao nhất về NDCG@10 trong lần chạy này.",
            "- Vì vậy không kết luận Hybrid tốt nhất ở mọi chỉ số.",
            "- Dữ liệu có độ lệch lớn: nhiều user chỉ có 4 tour train, trong khi một số user có hơn 120 tour.",
            "- Các cutoff 2026-04-29 lặp lại ở nhiều user cho thấy dữ liệu seed hoặc dữ liệu sinh hàng loạt; cần nêu đây là hạn chế của tập đánh giá.",
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
        else Path("recommendation_charts")
    )

    payload = load_payload(json_path)

    plot_accuracy_metrics(payload, output_dir)
    plot_coverage_diversity(payload, output_dir)
    plot_hybrid_tradeoff(payload, output_dir)
    plot_train_tour_distribution(payload, output_dir)
    write_summary(payload, output_dir)

    print(f"Đã tạo biểu đồ tại: {output_dir.resolve()}")
    print("- 01_accuracy_metrics_real.png / .svg")
    print("- 02_coverage_diversity_real.png / .svg")
    print("- 03_hybrid_tradeoff_real.png / .svg")
    print("- 04_train_tour_distribution.png / .svg")
    print("- summary_real.txt")


if __name__ == "__main__":
    main()