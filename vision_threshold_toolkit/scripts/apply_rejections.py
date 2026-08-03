from __future__ import annotations

import argparse
import csv
from pathlib import Path


REJECT_PATHS = {
    "images/internal/con-dao/con-dao_03.jpg": "Bản đồ/tranh tư liệu, không phải ảnh phong cảnh thực tế.",
    "images/internal/ha-giang/ha-giang_06.jpg": "Ảnh bò, không đại diện cho địa danh Hà Giang.",
    "images/non_travel/document/document_03.jpg": "Ảnh chân dung, không phải tài liệu.",
    "images/non_travel/screenshot/screenshot_05.jpg": "Ảnh chụp laptop, không phải screenshot thuần.",
    "images/external/statue-of-liberty/statue-of-liberty_04.jpg": "Tranh minh họa, không phải ảnh chụp địa danh.",
}

# Các ảnh này hiện đã rejected đúng; giữ nguyên nhưng liệt kê để kiểm tra.
KEEP_REJECTED = {
    "images/internal/con-dao/con-dao_01.jpg",
    "images/internal/vung-tau/vung-tau_01.jpg",
    "images/external/big-ben/big-ben_01.jpg",
    "images/non_travel/screenshot/screenshot_01.jpg",
    "images/non_travel/screenshot/screenshot_02.jpg",
    "images/non_travel/screenshot/screenshot_03.jpg",
    "images/non_travel/object/object_01.jpg",
    "images/internal/phu-quoc/phu-quoc_05.jpg",
    "images/internal/quy-nhon/quy-nhon_02.jpg",
    "images/internal/ha-giang/ha-giang_05.jpg",
    "images/internal/tay-ninh/tay-ninh_08.jpg",
    "images/external/statue-of-liberty/statue-of-liberty_03.jpg",
    "images/external/statue-of-liberty/statue-of-liberty_08.jpg",
    "images/non_travel/document/document_01.jpg",
    "images/non_travel/document/document_02.jpg",
    "images/non_travel/document/document_08.jpg",
    "images/non_travel/animal/animal_07.jpg",
    "images/non_travel/animal/animal_08.jpg",
    "images/non_travel/object/object_02.jpg",
}

# Toàn bộ Mount Fuji hiện là poster/tranh/tư liệu, chưa phải ảnh chụp thật.
for index in range(1, 9):
    KEEP_REJECTED.add(
        f"images/external/mount-fuji/mount-fuji_{index:02d}.jpg"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Áp dụng các nhãn rejected cần sửa trong metadata.csv."
    )
    parser.add_argument(
        "--metadata",
        default="threshold_dataset/metadata.csv",
    )
    parser.add_argument(
        "--output",
        default="threshold_dataset/metadata.cleaned.csv",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
    )
    args = parser.parse_args()

    metadata = Path(args.metadata)
    if not metadata.exists():
        raise SystemExit(f"Không tìm thấy: {metadata}")

    with metadata.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(file)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    if "review_status" not in fieldnames:
        raise SystemExit("metadata.csv không có cột review_status.")
    if "review_note" not in fieldnames:
        fieldnames.append("review_note")

    changed = 0
    for row in rows:
        path = row.get("relative_path") or ""
        if path in REJECT_PATHS:
            row["review_status"] = "rejected"
            row["review_note"] = REJECT_PATHS[path]
            changed += 1
        elif path in KEEP_REJECTED:
            # Không ép nếu người dùng cố ý đổi, chỉ cảnh báo sau.
            pass

    output = metadata if args.in_place else Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    with output.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Đã cập nhật {changed} dòng.")
    print(f"Đã ghi: {output}")

    print("\nCác ảnh cần giữ rejected:")
    for path in sorted(KEEP_REJECTED):
        print(f"- {path}")

    print(
        "\nLưu ý: hãy bổ sung 5-8 ảnh chụp thật Núi Phú Sĩ, "
        "vì 8 ảnh hiện tại đều là poster/tranh/tư liệu."
    )


if __name__ == "__main__":
    main()
