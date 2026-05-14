import csv
import json
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_DIR = BASE_DIR / "dataset"
DESTINATIONS_FILE = BASE_DIR / "destinations.json"
MANIFEST_FILE = BASE_DIR / "image_manifest.csv"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


SLUG_TO_NAME = {
    "phu-quoc": "Phú Quốc",
    "nha-trang": "Nha Trang",
    "da-lat": "Đà Lạt",
    "da-nang": "Đà Nẵng",
    "hoi-an": "Hội An",
    "sa-pa": "Sa Pa",
    "sapa": "Sa Pa",
    "quy-nhon": "Quy Nhơn",
    "ha-long": "Hạ Long",
    "can-tho": "Cần Thơ",
    "hue": "Huế",
    "mui-ne": "Mũi Né",
    "ninh-binh": "Ninh Bình",
    "ha-giang": "Hà Giang",
    "moc-chau": "Mộc Châu",
    "vung-tau": "Vũng Tàu",
    "tay-ninh": "Tây Ninh",
    "an-giang": "An Giang",
    "ca-mau": "Cà Mau",
    "con-dao": "Côn Đảo",
}


def is_valid_image(path: Path) -> bool:
    try:
        with Image.open(path) as img:
            img.verify()
        return True
    except Exception:
        return False


def normalize_destination_item(item):
    """
    Hỗ trợ 2 dạng destinations.json:
    1) ["phu-quoc", "nha-trang", ...]
    2) [{"slug": "phu-quoc", "name": "Phú Quốc"}, ...]
    """
    if isinstance(item, str):
        slug = item.strip()
        name = SLUG_TO_NAME.get(slug, slug.replace("-", " ").title())
        province = ""
        return slug, name, province

    if isinstance(item, dict):
        slug = (
            item.get("slug")
            or item.get("id")
            or item.get("code")
            or item.get("label")
            or ""
        )
        slug = str(slug).strip()
        name = item.get("name") or SLUG_TO_NAME.get(slug, slug.replace("-", " ").title())
        province = item.get("province") or item.get("city") or ""
        return slug, name, province

    return "", "", ""


def main():
    if not DESTINATIONS_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file: {DESTINATIONS_FILE}")

    if not DATASET_DIR.exists():
        raise FileNotFoundError(f"Không tìm thấy thư mục: {DATASET_DIR}")

    with open(DESTINATIONS_FILE, "r", encoding="utf-8") as f:
        destinations = json.load(f)

    rows = []
    skipped = []
    missing_folders = []

    for item in destinations:
        slug, name, province = normalize_destination_item(item)

        if not slug:
            continue

        folder = DATASET_DIR / slug

        if not folder.exists():
            missing_folders.append(str(folder))
            print(f"[WARN] Không có thư mục ảnh: {folder}")
            continue

        images = sorted(
            [
                p
                for p in folder.rglob("*")
                if p.is_file() and p.suffix.lower() in IMAGE_EXTS
            ]
        )

        print(f"[INFO] {slug}: tìm thấy {len(images)} file ảnh")

        for image_path in images:
            if not is_valid_image(image_path):
                skipped.append(str(image_path))
                print(f"[SKIP] Ảnh lỗi: {image_path}")
                continue

            rel_path = image_path.relative_to(BASE_DIR).as_posix()

            rows.append(
                {
                    "filename": image_path.name,
                    "label": slug,
                    "destination_slug": slug,
                    "destination_name": name,
                    "province": province,
                    "path": rel_path,
                }
            )

    with open(MANIFEST_FILE, "w", encoding="utf-8", newline="") as f:
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

    print("\n[DONE] Đã tạo:", MANIFEST_FILE)
    print("[OK] Ảnh hợp lệ ghi vào manifest:", len(rows))
    print("[SKIP] Ảnh lỗi bỏ qua:", len(skipped))
    print("[WARN] Thư mục thiếu:", len(missing_folders))


if __name__ == "__main__":
    main()