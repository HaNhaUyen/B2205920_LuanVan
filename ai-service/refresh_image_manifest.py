# ai-service/refresh_image_manifest.py
from __future__ import annotations

import csv
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
DATASET_DIR = ROOT / "dataset"
DESTINATIONS_FILE = ROOT / "destinations.json"
MANIFEST_FILE = ROOT / "image_manifest.csv"
VALID_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".jfif"}


def load_destinations():
    if not DESTINATIONS_FILE.exists():
        return {}
    with open(DESTINATIONS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def is_image_ok(path: Path) -> bool:
    if path.suffix.lower() not in VALID_EXTS:
        return False
    try:
        with Image.open(path) as img:
            img.verify()
        return True
    except Exception:
        return False


def main():
    destinations = load_destinations()

    rows = []
    for folder in sorted(DATASET_DIR.iterdir()):
        if not folder.is_dir():
            continue

        slug = folder.name
        meta = destinations.get(slug, {})
        destination_name = meta.get("name") or slug.replace("-", " ").title()
        province = meta.get("province") or ""

        for img_path in sorted(folder.rglob("*")):
            if not img_path.is_file() or not is_image_ok(img_path):
                continue

            rel = img_path.relative_to(ROOT).as_posix()
            rows.append(
                {
                    "filename": img_path.name,
                    "label": slug,
                    "destination_slug": slug,
                    "destination_name": destination_name,
                    "province": province,
                    "path": rel,
                }
            )

    with open(MANIFEST_FILE, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "filename",
                "label",
                "destination_slug",
                "destination_name",
                "province",
                "path",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print("Đã tạo lại manifest:", MANIFEST_FILE)
    print("Tổng ảnh trong manifest:", len(rows))


if __name__ == "__main__":
    main()
