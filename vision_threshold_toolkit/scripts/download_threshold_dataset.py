from __future__ import annotations

import argparse
import csv
import hashlib
import json
import mimetypes
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "TravelaThresholdDataset/1.1 (academic thesis evaluation; contact: local-project)"
VALID_MIME = {"image/jpeg", "image/png", "image/webp"}


def clean_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text or "").replace("\n", " ").strip()


def request_bytes(url: str, timeout: int, retries: int, base_delay: float) -> bytes:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json,image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                "Referer": "https://commons.wikimedia.org/",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code not in {429, 500, 502, 503, 504}:
                raise
            wait = base_delay * (2 ** attempt) + random.uniform(0.3, 1.2)
            retry_after = exc.headers.get("Retry-After")
            if retry_after and retry_after.isdigit():
                # Wikimedia đôi khi yêu cầu chờ 600 giây. Với bộ dữ liệu nhỏ,
                # giới hạn thời gian chờ để script không bị treo quá lâu.
                wait = max(wait, min(float(retry_after), 30.0))
            wait = min(wait, 30.0)
            print(f"[RETRY] HTTP {exc.code}; nghỉ {wait:.1f}s")
            time.sleep(wait)
        except Exception as exc:
            last_error = exc
            wait = base_delay * (2 ** attempt) + random.uniform(0.3, 1.2)
            wait = min(wait, 30.0)
            print(f"[RETRY] {exc}; nghỉ {wait:.1f}s")
            time.sleep(wait)
    raise RuntimeError(f"Không thể tải sau {retries + 1} lần: {last_error}")


def api_get(params: dict[str, Any], retries: int, base_delay: float) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    data = request_bytes(f"{COMMONS_API}?{query}", 45, retries, base_delay)
    return json.loads(data.decode("utf-8"))


def search_files(
    query: str,
    limit: int,
    thumb_width: int,
    retries: int,
    base_delay: float,
) -> list[dict[str, Any]]:
    payload = api_get(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,
            "gsrlimit": min(limit, 50),
            "prop": "imageinfo",
            "iiprop": "url|mime|size|extmetadata",
            "iiurlwidth": thumb_width,
            "format": "json",
            "formatversion": 2,
        },
        retries,
        base_delay,
    )

    rows: list[dict[str, Any]] = []
    for page in payload.get("query", {}).get("pages", []):
        info_list = page.get("imageinfo") or []
        if not info_list:
            continue
        info = info_list[0]
        mime = info.get("mime")
        width = int(info.get("width") or 0)
        height = int(info.get("height") or 0)
        url = info.get("thumburl")
        if mime not in VALID_MIME or min(width, height) < 400 or not url:
            continue
        meta = info.get("extmetadata") or {}
        rows.append(
            {
                "title": page.get("title") or "",
                "url": url,
                "source_page": info.get("descriptionurl") or "",
                "mime": mime,
                "width": width,
                "height": height,
                "license": (meta.get("LicenseShortName") or {}).get("value", ""),
                "artist": (meta.get("Artist") or {}).get("value", ""),
            }
        )
    return rows


def load_existing(metadata_path: Path, root: Path) -> tuple[list[dict[str, Any]], set[str], dict[tuple[str, str], int]]:
    records: list[dict[str, Any]] = []
    hashes: set[str] = set()
    counts: dict[tuple[str, str], int] = {}

    if metadata_path.exists():
        with metadata_path.open("r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                path = root / row["relative_path"]
                if not path.exists():
                    continue
                records.append(row)
                try:
                    hashes.add(hashlib.sha1(path.read_bytes()).hexdigest())
                except OSError:
                    pass
                key = (row["group"], row["expected_slug"] or row["expected_name"])
                counts[key] = counts.get(key, 0) + 1
    return records, hashes, counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Tạo dataset hiệu chỉnh ngưỡng từ Wikimedia Commons")
    parser.add_argument("--plan", default="dataset_plan.json")
    parser.add_argument("--output", default="threshold_dataset")
    parser.add_argument("--per-class", type=int, default=None)
    parser.add_argument("--delay", type=float, default=2.5, help="Nghỉ giữa các request tải")
    parser.add_argument("--search-delay", type=float, default=1.5, help="Nghỉ giữa các request tìm kiếm")
    parser.add_argument("--thumb-width", type=int, default=640, help="Chỉ tải thumbnail nhỏ")
    parser.add_argument("--retries", type=int, default=5)
    parser.add_argument("--reset", action="store_true", help="Xóa metadata cũ và tải lại từ đầu")
    args = parser.parse_args()

    plan_path = Path(args.plan).resolve()
    root = Path(args.output).resolve()
    images_root = root / "images"
    images_root.mkdir(parents=True, exist_ok=True)

    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    per_class = args.per_class or int(plan.get("images_per_class", 8))
    metadata_path = root / "metadata.csv"

    if args.reset and metadata_path.exists():
        metadata_path.unlink()

    records, existing_hashes, existing_counts = load_existing(metadata_path, root)

    for group in ("internal", "external", "non_travel"):
        for item in plan[group]:
            slug = item["slug"]
            class_dir = images_root / group / slug
            class_dir.mkdir(parents=True, exist_ok=True)

            key = (group, slug if group == "internal" else item["name"])
            saved = existing_counts.get(key, 0)
            if saved >= per_class:
                print(f"[SKIP] {group}/{slug}: đã đủ {saved}/{per_class}")
                continue

            selected: list[dict[str, Any]] = []
            seen_urls: set[str] = set()

            for query in item["queries"]:
                try:
                    candidates = search_files(
                        query,
                        limit=30,
                        thumb_width=args.thumb_width,
                        retries=args.retries,
                        base_delay=max(args.search_delay, 1.0),
                    )
                except Exception as exc:
                    print(f"[WARN] Search failed: {query}: {exc}")
                    continue

                for candidate in candidates:
                    if candidate["url"] in seen_urls:
                        continue
                    seen_urls.add(candidate["url"])
                    selected.append(candidate)

                if len(selected) >= (per_class - saved) * 5:
                    break
                time.sleep(args.search_delay + random.uniform(0.2, 0.8))

            for candidate in selected:
                if saved >= per_class:
                    break

                ext = mimetypes.guess_extension(candidate["mime"]) or ".jpg"
                if ext == ".jpe":
                    ext = ".jpg"

                tmp = class_dir / f".tmp_{int(time.time()*1000)}{ext}"
                try:
                    data = request_bytes(
                        candidate["url"],
                        timeout=60,
                        retries=args.retries,
                        base_delay=max(args.delay, 1.0),
                    )
                    tmp.write_bytes(data)

                    digest = hashlib.sha1(data).hexdigest()
                    if digest in existing_hashes or len(data) < 15_000:
                        tmp.unlink(missing_ok=True)
                        continue

                    existing_hashes.add(digest)
                    final = class_dir / f"{slug}_{saved + 1:02d}{ext}"
                    tmp.replace(final)

                    records.append(
                        {
                            "relative_path": final.relative_to(root).as_posix(),
                            "group": group,
                            "expected_slug": slug if group == "internal" else "",
                            "expected_name": item["name"],
                            "expected_image_type": item.get(
                                "expected_image_type",
                                "travel_landscape" if group != "non_travel" else "unknown",
                            ),
                            "should_clip_accept": "1" if group == "internal" else "0",
                            "source_url": candidate["source_page"],
                            "download_url": candidate["url"],
                            "license": candidate["license"],
                            "artist": clean_html(candidate["artist"]),
                            "width": candidate["width"],
                            "height": candidate["height"],
                            "review_status": "pending",
                            "review_note": "",
                        }
                    )

                    saved += 1
                    print(f"[{group}] {slug}: {saved}/{per_class} -> {final.name}")

                    # Ghi metadata ngay để có thể tiếp tục nếu bị dừng giữa chừng
                    write_metadata(metadata_path, records)
                except Exception as exc:
                    tmp.unlink(missing_ok=True)
                    print(f"[WARN] Download failed: {candidate['url']}: {exc}")

                time.sleep(args.delay + random.uniform(0.4, 1.3))

            if saved < per_class:
                print(f"[WARN] {slug}: hiện có {saved}/{per_class} ảnh")

    write_metadata(metadata_path, records)
    print(f"\nHiện có {len(records)} ảnh. Metadata: {metadata_path}")
    print("Có thể chạy lại cùng lệnh; script sẽ tiếp tục tải phần còn thiếu.")
    print("BẮT BUỘC: duyệt ảnh và đổi review_status thành approved/rejected trước khi đánh giá.")


def write_metadata(metadata_path: Path, records: list[dict[str, Any]]) -> None:
    fields = [
        "relative_path",
        "group",
        "expected_slug",
        "expected_name",
        "expected_image_type",
        "should_clip_accept",
        "source_url",
        "download_url",
        "license",
        "artist",
        "width",
        "height",
        "review_status",
        "review_note",
    ]
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    with metadata_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)


if __name__ == "__main__":
    main()