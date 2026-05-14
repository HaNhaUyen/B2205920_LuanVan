from pathlib import Path
from PIL import Image

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
DATASET_DIR = Path("dataset")

good = []
bad = []

for p in DATASET_DIR.rglob("*"):
    if p.suffix.lower() not in EXTS:
        continue

    try:
        with Image.open(p) as img:
            img.verify()
        good.append(p)
    except Exception as e:
        bad.append((p, str(e)))

print("Tổng ảnh hợp lệ:", len(good))
print("Tổng ảnh lỗi:", len(bad))

if bad:
    print("\nDanh sách ảnh lỗi:")
    for p, err in bad:
        print(f"- {p} | {err}")