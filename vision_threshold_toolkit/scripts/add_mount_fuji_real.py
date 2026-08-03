from __future__ import annotations

import argparse
import csv
import html
import json
import shutil
import time
import urllib.parse
import urllib.request
from urllib.error import HTTPError, URLError
from datetime import datetime
from pathlib import Path
from typing import Any


COMMONS_API = "https://commons.wikimedia.org/w/api.php"

# 8 ảnh chụp thật, đa dạng góc nhìn.
FILES = [
    "File:Mount Fuji, Japan.JPG",
    "File:Mount Fuji (Japan).jpg",
    "File:Mt Fuji.jpg",
    "File:Mount Fuji from Fuji City.jpg",
    "File:Mount Fuji from Lake Sai.jpg",
    "File:Mount Fuji from Lake Yamanaka.JPG",
    "File:Mount Fuji from Lake Motosu.jpg",
    "File:Mount Fuji Japan with Snow, Lakes and Surrounding Mountains.jpg",
]


def strip_html(value: Any) -> str:
    text = html.unescape(str(value or ""))
    inside = False
    out = []
    for char in text:
        if char == "<":
            inside = True
            continue
        if char == ">":
            inside = False
            continue
        if not inside:
            out.append(char)
    return " ".join("".join(out).split())


def request_json(params: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{COMMONS_API}?{query}",
        headers={
            "User-Agent": "TravelaVisionThresholdToolkit/1.0 "
            "(academic dataset calibration)"
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_file_info(title: str, thumb_width: int) -> dict[str, Any]:
    data = request_json(
        {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "titles": title,
            "iiprop": "url|size|extmetadata",
            "iiurlwidth": thumb_width,
        }
    )

    pages = data.get("query", {}).get("pages", {})
    if not pages:
        raise RuntimeError(f"Không tìm thấy trên Wikimedia Commons: {title}")

    page = next(iter(pages.values()))
    if "missing" in page:
        raise RuntimeError(f"File Commons bị thiếu: {title}")

    info_list = page.get("imageinfo") or []
    if not info_list:
        raise RuntimeError(f"Không có imageinfo: {title}")

    info = info_list[0]
    metadata = info.get("extmetadata") or {}

    def meta(name: str) -> str:
        item = metadata.get(name) or {}
        return strip_html(item.get("value"))

    return {
        "title": page.get("title") or title,
        "page_url": info.get("descriptionurl")
        or (
            "https://commons.wikimedia.org/wiki/"
            + urllib.parse.quote((page.get("title") or title).replace(" ", "_"))
        ),
        "download_url": info.get("thumburl") or info.get("url"),
        "width": info.get("thumbwidth") or info.get("width") or "",
        "height": info.get("thumbheight") or info.get("height") or "",
        "license": meta("LicenseShortName")
        or meta("UsageTerms")
        or "See Wikimedia Commons source",
        "artist": meta("Artist") or "Wikimedia Commons contributor",
    }


def download(
    url: str,
    destination: Path,
    max_retries: int = 8,
    initial_wait: float = 8.0,
) -> None:
    if destination.exists() and destination.stat().st_size > 10_000:
        print(f"  -> Bỏ qua, file đã tồn tại: {destination}")
        return

    wait = initial_wait

    for attempt in range(1, max_retries + 1):
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "TravelaVisionThresholdToolkit/1.0 "
                    "(academic dataset calibration; contact: local-user)"
                ),
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,"
                          "image/*,*/*;q=0.8",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                data = response.read()

            if len(data) < 10_000:
                raise RuntimeError(
                    f"Dữ liệu tải về quá nhỏ ({len(data)} bytes)"
                )

            destination.write_bytes(data)
            return

        except HTTPError as exc:
            if exc.code == 429:
                retry_after = exc.headers.get("Retry-After")
                try:
                    retry_wait = float(retry_after) if retry_after else wait
                except Exception:
                    retry_wait = wait

                print(
                    f"  Wikimedia trả 429. "
                    f"Chờ {retry_wait:.0f} giây rồi thử lại "
                    f"({attempt}/{max_retries})..."
                )
                time.sleep(retry_wait)
                wait = min(wait * 2, 120.0)
                continue

            if 500 <= exc.code < 600 and attempt < max_retries:
                print(
                    f"  Lỗi HTTP {exc.code}. "
                    f"Chờ {wait:.0f} giây rồi thử lại..."
                )
                time.sleep(wait)
                wait = min(wait * 2, 120.0)
                continue

            raise

        except (URLError, TimeoutError, ConnectionError) as exc:
            if attempt >= max_retries:
                raise

            print(
                f"  Lỗi mạng: {exc}. "
                f"Chờ {wait:.0f} giây rồi thử lại "
                f"({attempt}/{max_retries})..."
            )
            time.sleep(wait)
            wait = min(wait * 2, 120.0)

    raise RuntimeError(f"Không tải được sau {max_retries} lần: {url}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Thay 8 ảnh Mount Fuji poster/tranh bằng 8 ảnh chụp thật "
            "và cập nhật metadata.csv."
        )
    )
    parser.add_argument(
        "--dataset",
        default="threshold_dataset",
        help="Thư mục dataset chứa metadata.csv và images/",
    )
    parser.add_argument(
        "--thumb-width",
        type=int,
        default=800,
        help="Chiều rộng ảnh tải từ Wikimedia Commons.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=8.0,
        help="Khoảng nghỉ giữa các lần tải.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=8,
        help="Số lần thử lại khi Wikimedia trả lỗi 429/5xx.",
    )
    parser.add_argument(
        "--retry-wait",
        type=float,
        default=10.0,
        help="Thời gian chờ ban đầu khi bị giới hạn tốc độ.",
    )
    args = parser.parse_args()

    dataset = Path(args.dataset).resolve()
    metadata_path = dataset / "metadata.csv"
    target_dir = dataset / "images" / "external" / "mount-fuji"

    if not metadata_path.exists():
        raise SystemExit(f"Không tìm thấy metadata.csv: {metadata_path}")

    target_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = (
        dataset / "backup" / f"mount-fuji_before_real_photos_{timestamp}"
    )
    backup_dir.mkdir(parents=True, exist_ok=True)

    # Sao lưu ảnh Mount Fuji cũ.
    for old_file in target_dir.glob("mount-fuji_*.*"):
        shutil.copy2(old_file, backup_dir / old_file.name)

    metadata_backup = (
        dataset / "backup" / f"metadata_before_fuji_{timestamp}.csv"
    )
    shutil.copy2(metadata_path, metadata_backup)

    with metadata_path.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(file)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    required_fields = [
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
    for field in required_fields:
        if field not in fieldnames:
            fieldnames.append(field)

    existing_by_path = {
        (row.get("relative_path") or ""): row
        for row in rows
    }

    updated_paths: set[str] = set()

    for index, title in enumerate(FILES, start=1):
        print(f"[{index}/{len(FILES)}] Đang lấy: {title}")

        try:
            info = fetch_file_info(title, args.thumb_width)

            extension = Path(
                urllib.parse.urlparse(info["download_url"]).path
            ).suffix.lower()
            if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
                extension = ".jpg"

            filename = f"mount-fuji_{index:02d}{extension}"
            destination = target_dir / filename
            download(
                info["download_url"],
                destination,
                max_retries=args.max_retries,
                initial_wait=args.retry_wait,
            )
        except Exception as exc:
            print(f"  Bỏ qua ảnh này vì lỗi: {exc}")
            time.sleep(max(args.delay, 10.0))
            continue

        relative_path = (
            Path("images")
            / "external"
            / "mount-fuji"
            / filename
        ).as_posix()

        row = existing_by_path.get(relative_path)
        if row is None:
            row = {field: "" for field in fieldnames}
            rows.append(row)
            existing_by_path[relative_path] = row

        row.update(
            {
                "relative_path": relative_path,
                "group": "external",
                "expected_slug": "",
                "expected_name": "Núi Phú Sĩ",
                "expected_image_type": "travel_landscape",
                "should_clip_accept": "0",
                "source_url": info["page_url"],
                "download_url": info["download_url"],
                "license": info["license"],
                "artist": info["artist"],
                "width": str(info["width"]),
                "height": str(info["height"]),
                "review_status": "approved",
                "review_note": "Ảnh chụp thật Núi Phú Sĩ từ Wikimedia Commons.",
            }
        )

        updated_paths.add(relative_path)
        print(f"  -> {destination}")
        time.sleep(max(0.0, args.delay))

    # Xóa các dòng Mount Fuji cũ không còn ứng với 8 file mới.
    cleaned_rows = []
    for row in rows:
        path = row.get("relative_path") or ""
        is_old_fuji = path.startswith(
            "images/external/mount-fuji/mount-fuji_"
        )
        if is_old_fuji and path not in updated_paths:
            continue
        cleaned_rows.append(row)

    with metadata_path.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=fieldnames,
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(cleaned_rows)

    print("\nHoàn tất.")
    print(f"Đã cập nhật: {metadata_path}")
    print(f"Backup metadata: {metadata_backup}")
    print(f"Backup ảnh cũ: {backup_dir}")
    print("8 ảnh Mount Fuji mới đã được đặt review_status=approved.")


if __name__ == "__main__":
    main()