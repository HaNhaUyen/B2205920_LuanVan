from pathlib import Path
from PIL import Image

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
DATASET_DIR = Path("dataset")

bad_images = []
good_images = []

for p in DATASET_DIR.rglob("*"):
    if p.suffix.lower() not in EXTS:
        continue

    try:
        with Image.open(p) as img:
            img.verify()
        good_images.append(p)
    except Exception as e:
        bad_images.append((p, str(e)))

print("Ảnh hợp lệ:", len(good_images))
print("Ảnh lỗi:", len(bad_images))

if bad_images:
    print("\nDanh sách ảnh lỗi:")
    for p, err in bad_images:
        print(f"- {p} | {err}")

confirm = input("\nBạn có chắc muốn xóa tất cả ảnh lỗi không? Gõ YES để xóa: ")

if confirm.strip() == "YES":
    for p, _ in bad_images:
        try:
            p.unlink()
            print(f"[DELETED] {p}")
        except Exception as e:
            print(f"[ERROR] Không xóa được {p}: {e}")
    print("\nĐã xóa xong ảnh lỗi.")
else:
    print("\nĐã hủy, chưa xóa ảnh nào.")