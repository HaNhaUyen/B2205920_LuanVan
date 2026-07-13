# ai-service/check_dataset_images.py
from __future__ import annotations

from pathlib import Path
from PIL import Image

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
VALID_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".jfif"}

print("Dataset dir:", DATASET_DIR)
print("Exists:", DATASET_DIR.exists())
print("=" * 80)

total_ok = 0
bad_files = []
unsupported_files = []
folder_counts = {}

for folder in sorted(DATASET_DIR.iterdir()):
    if not folder.is_dir():
        continue

    all_files = [p for p in folder.rglob("*") if p.is_file()]
    valid_files = [p for p in all_files if p.suffix.lower() in VALID_EXTS]

    ok_count = 0
    for img_path in valid_files:
        try:
            with Image.open(img_path) as img:
                img.verify()
            ok_count += 1
        except Exception as exc:
            bad_files.append((img_path, str(exc)))

    unsupported = [p for p in all_files if p.suffix.lower() not in VALID_EXTS]
    unsupported_files.extend(unsupported)

    folder_counts[folder.name] = {
        "all": len(all_files),
        "valid_ext": len(valid_files),
        "ok": ok_count,
        "unsupported": len(unsupported),
    }

    total_ok += ok_count

print("Số ảnh từng folder:")
for name, c in folder_counts.items():
    status = "OK" if c["ok"] == 60 else "THIẾU/DƯ"
    print(
        f"{name:18} | all={c['all']:3} | valid_ext={c['valid_ext']:3} | "
        f"ok={c['ok']:3} | unsupported={c['unsupported']:2} | {status}"
    )

print("=" * 80)
print("Tổng ảnh mở được:", total_ok)

print("\\nFolder không đúng 60 ảnh mở được:")
for name, c in folder_counts.items():
    if c["ok"] != 60:
        print(f"- {name}: {c['ok']} ảnh mở được")

if unsupported_files:
    print("\\nFile không thuộc extension được hỗ trợ:")
    for p in unsupported_files[:100]:
        print("-", p)

if bad_files:
    print("\\nẢnh bị lỗi hoặc PIL không mở được:")
    for p, err in bad_files:
        print("-", p, "|", err)
