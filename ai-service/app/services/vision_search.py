from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import os
import re
import threading
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    import torch
except Exception as exc:  # pragma: no cover
    torch = None
    TORCH_IMPORT_ERROR = exc
else:
    TORCH_IMPORT_ERROR = None

try:
    from PIL import Image, ImageOps
except Exception as exc:  # pragma: no cover
    Image = None
    ImageOps = None
    PIL_IMPORT_ERROR = exc
else:
    PIL_IMPORT_ERROR = None

try:
    from transformers import CLIPModel, CLIPProcessor
except Exception as exc:  # pragma: no cover
    CLIPModel = None
    CLIPProcessor = None
    TRANSFORMERS_IMPORT_ERROR = exc
else:
    TRANSFORMERS_IMPORT_ERROR = None


BASE_DIR = Path(__file__).resolve().parents[2]
DATASET_DIR = BASE_DIR / "dataset"
DESTINATIONS_FILE = BASE_DIR / "destinations.json"
MANIFEST_FILE = BASE_DIR / "image_manifest.csv"
CACHE_DIR = BASE_DIR / ".cache"
CACHE_FILE = CACHE_DIR / "clip_gallery_cache.pt"

VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
DEFAULT_TOP_K = 5
MAX_TOP_K = 10
SOFTMAX_TEMPERATURE = 18.0
DESTINATION_SCORE_WEIGHTS = [0.55, 0.20, 0.12, 0.08, 0.05]


def strip_text(value: str) -> str:
    value = unicodedata.normalize("NFD", value or "")
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-zA-Z0-9]+", " ", value.lower())
    return value.strip()


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def clamp_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except Exception:
        number = default
    return max(minimum, min(number, maximum))


class VisionSearchService:
    """
    CBIR service dùng CLIP để tìm kiếm điểm đến du lịch bằng hình ảnh.

    Luồng chính:
    1. Đọc destinations.json và image_manifest.csv.
    2. Trích xuất embedding CLIP cho toàn bộ ảnh mẫu trong gallery.
    3. Cache embedding để lần khởi động sau không phải encode lại toàn bộ dataset.
    4. Khi người dùng upload ảnh, encode ảnh query -> cosine similarity -> gom điểm theo điểm đến -> Top-K.
    """

    def __init__(self) -> None:
        self.model_name = os.getenv("VISION_MODEL_NAME", "openai/clip-vit-base-patch32")
        self.device_preference = os.getenv("VISION_DEVICE", "auto")
        self.use_cache = os.getenv("VISION_USE_CACHE", "1") != "0"

        self._lock = threading.Lock()
        self._model = None
        self._processor = None
        self._device = "cpu"
        self._status = "not_loaded"
        self._error: str | None = None

        self._destinations: dict[str, dict[str, Any]] = {}
        self._manifest_rows: list[dict[str, Any]] = []
        self._gallery_embeddings = None
        self._gallery_items: list[dict[str, Any]] = []
        self._manifest_signature = ""
        self._cache_used = False

    def status_snapshot(self) -> dict[str, Any]:
        return {
            "engine": "clip_image_gallery_retrieval",
            "model": self.model_name,
            "device": self._device,
            "status": self._status,
            "destination_count": len(self._destinations),
            "gallery_image_count": len(self._gallery_items),
            "manifest_file": str(MANIFEST_FILE),
            "dataset_dir": str(DATASET_DIR),
            "cache_file": str(CACHE_FILE),
            "cache_used": self._cache_used,
            "error": self._error,
        }

    def _resolve_device(self) -> str:
        if self.device_preference and self.device_preference != "auto":
            return self.device_preference
        if torch is not None and hasattr(torch, "cuda") and torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def _load_destinations(self) -> dict[str, dict[str, Any]]:
        if not DESTINATIONS_FILE.exists():
            raise FileNotFoundError(f"Không tìm thấy destinations.json tại: {DESTINATIONS_FILE}")

        with open(DESTINATIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        result: dict[str, dict[str, Any]] = {}
        for label, info in data.items():
            result[label] = {
                "label": label,
                "destinationId": info.get("destinationId"),
                "name": info.get("name") or label,
                "province": info.get("province") or "",
                "aliases": info.get("aliases", []),
                "datasetFolder": info.get("datasetFolder") or label,
            }
        return result

    def _load_manifest_from_csv(self) -> list[dict[str, Any]]:
        if not MANIFEST_FILE.exists():
            return []

        rows: list[dict[str, Any]] = []
        with open(MANIFEST_FILE, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                label = row.get("label") or ""
                relative_path = row.get("relative_path") or ""
                if not label or not relative_path:
                    continue

                image_path = BASE_DIR / relative_path.replace("\\", "/")
                if not image_path.exists() or image_path.suffix.lower() not in VALID_EXTENSIONS:
                    continue

                info = self._destinations.get(label, {})
                rows.append(
                    {
                        "label": label,
                        "destinationId": int(row.get("destination_id") or info.get("destinationId") or 0),
                        "name": row.get("name") or info.get("name") or label,
                        "province": row.get("province") or info.get("province") or "",
                        "filename": row.get("filename") or image_path.name,
                        "relative_path": relative_path.replace("\\", "/"),
                        "absolute_path": str(image_path),
                    }
                )
        return rows

    def _scan_dataset_folder(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for label, info in self._destinations.items():
            folder_name = info.get("datasetFolder") or label
            folder_path = DATASET_DIR / folder_name
            if not folder_path.exists() or not folder_path.is_dir():
                continue

            for image_path in sorted(folder_path.iterdir()):
                if image_path.suffix.lower() not in VALID_EXTENSIONS:
                    continue
                rows.append(
                    {
                        "label": label,
                        "destinationId": int(info.get("destinationId") or 0),
                        "name": info.get("name") or label,
                        "province": info.get("province") or "",
                        "filename": image_path.name,
                        "relative_path": str(image_path.relative_to(BASE_DIR)).replace("\\", "/"),
                        "absolute_path": str(image_path),
                    }
                )
        return rows

    def _load_manifest(self) -> list[dict[str, Any]]:
        rows = self._load_manifest_from_csv()
        return rows if rows else self._scan_dataset_folder()

    def _make_manifest_signature(self) -> str:
        payload = []
        for row in self._manifest_rows:
            path = Path(row["absolute_path"])
            try:
                stat = path.stat()
                payload.append(
                    {
                        "label": row["label"],
                        "path": row["relative_path"],
                        "size": stat.st_size,
                        "mtime": int(stat.st_mtime),
                    }
                )
            except FileNotFoundError:
                continue
        raw = json.dumps(
            {
                "model": self.model_name,
                "items": payload,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _try_load_gallery_cache(self) -> bool:
        if not self.use_cache or torch is None or not CACHE_FILE.exists():
            return False
        try:
            cache = torch.load(CACHE_FILE, map_location="cpu")
            if cache.get("signature") != self._manifest_signature:
                return False
            embeddings = cache.get("embeddings")
            items = cache.get("items")
            if embeddings is None or not items:
                return False
            self._gallery_embeddings = embeddings.to("cpu")
            self._gallery_items = items
            self._cache_used = True
            return True
        except Exception:
            return False

    def _save_gallery_cache(self) -> None:
        if not self.use_cache or torch is None or self._gallery_embeddings is None:
            return
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            torch.save(
                {
                    "signature": self._manifest_signature,
                    "model": self.model_name,
                    "embeddings": self._gallery_embeddings.cpu(),
                    "items": self._gallery_items,
                },
                CACHE_FILE,
            )
        except Exception as exc:
            print(f"[WARN] Không lưu được CLIP gallery cache: {exc}")

    def _load_image(self, image_path: str) -> Image.Image:
        image = Image.open(image_path)
        image = ImageOps.exif_transpose(image)
        return image.convert("RGB")

    def _create_views(self, image: Image.Image) -> list[Image.Image]:
        """Tạo nhiều view để giảm nhiễu nền: ảnh gốc + crop vuông trung tâm."""
        views = [image]
        width, height = image.size
        square = min(width, height)
        if square >= 256:
            left = (width - square) // 2
            top = (height - square) // 2
            views.append(image.crop((left, top, left + square, top + square)))
        return views

    def _encode_pil_image(self, image: Image.Image):
        views = self._create_views(image)
        embeddings = []
        for view in views:
            inputs = self._processor(images=view, return_tensors="pt")
            inputs = inputs.to(self._device)
            with torch.inference_mode():
                features = self._model.get_image_features(**inputs)
            features = features / features.norm(dim=-1, keepdim=True).clamp(min=1e-12)
            embeddings.append(features.cpu())
        embedding = torch.mean(torch.stack(embeddings, dim=0), dim=0)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True).clamp(min=1e-12)
        return embedding

    def _encode_image_bytes(self, image_bytes: bytes):
        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
        return self._encode_pil_image(image)

    def _build_gallery_embeddings(self) -> None:
        if self._try_load_gallery_cache():
            return

        gallery_embeddings = []
        gallery_items = []
        for row in self._manifest_rows:
            image_path = row.get("absolute_path")
            if not image_path or not os.path.exists(image_path):
                continue
            try:
                image = self._load_image(image_path)
                embedding = self._encode_pil_image(image)
            except Exception as exc:
                print(f"[WARN] Bỏ qua ảnh lỗi {image_path}: {exc}")
                continue
            gallery_embeddings.append(embedding)
            gallery_items.append(row)

        if not gallery_embeddings:
            raise RuntimeError("Không build được gallery embedding. Kiểm tra dataset/image_manifest.csv.")

        self._gallery_embeddings = torch.cat(gallery_embeddings, dim=0)
        self._gallery_items = gallery_items
        self._cache_used = False
        self._save_gallery_cache()

    def ensure_loaded(self) -> bool:
        if self._model is not None and self._processor is not None and self._gallery_embeddings is not None and self._gallery_items:
            return True

        with self._lock:
            if self._model is not None and self._processor is not None and self._gallery_embeddings is not None and self._gallery_items:
                return True

            self._destinations = self._load_destinations() if DESTINATIONS_FILE.exists() else {}

            if torch is None:
                self._status = "fallback"
                self._error = f"Thiếu torch: {TORCH_IMPORT_ERROR}"
                return False
            if Image is None or ImageOps is None:
                self._status = "fallback"
                self._error = f"Thiếu pillow: {PIL_IMPORT_ERROR}"
                return False
            if CLIPModel is None or CLIPProcessor is None:
                self._status = "fallback"
                self._error = f"Thiếu transformers: {TRANSFORMERS_IMPORT_ERROR}"
                return False

            try:
                self._status = "loading"
                self._error = None
                self._device = self._resolve_device()

                self._destinations = self._load_destinations()
                self._manifest_rows = self._load_manifest()
                if not self._manifest_rows:
                    raise RuntimeError("Không tìm thấy ảnh trong image_manifest.csv hoặc dataset.")

                self._manifest_signature = self._make_manifest_signature()

                self._processor = CLIPProcessor.from_pretrained(self.model_name)
                self._model = CLIPModel.from_pretrained(self.model_name)
                self._model.to(self._device)
                self._model.eval()

                self._build_gallery_embeddings()
                self._status = "ready"
                self._error = None
                return True
            except Exception as exc:
                self._status = "fallback"
                self._error = str(exc)
                self._model = None
                self._processor = None
                self._gallery_embeddings = None
                self._gallery_items = []
                return False

    def _filename_fallback(self, filename: str | None, top_k: int = DEFAULT_TOP_K) -> dict[str, Any]:
        normalized = strip_text(filename or "")
        for label, info in self._destinations.items():
            candidates = [label, info.get("name", ""), info.get("province", "")]
            candidates.extend(info.get("aliases", []))
            for candidate in candidates:
                if candidate and strip_text(candidate) in normalized:
                    confidence = 0.45
                    return {
                        "engine": "filename_fallback",
                        "model": self.model_name,
                        "device": self._device,
                        "fallback": True,
                        "file_name": filename,
                        "detected": {
                            "label": label,
                            "destination": info.get("name") or label,
                            "destinationId": info.get("destinationId"),
                            "province": info.get("province"),
                            "landmark": info.get("name") or label,
                            "confidence": confidence,
                            "confidence_percent": int(confidence * 100),
                            "certainty": "fallback",
                            "matched_prompt": f"Tên file khớp: {candidate}",
                            "matched_image": "",
                            "best_image_score": 0.0,
                        },
                        "top_matches": [
                            {
                                "rank": 1,
                                "label": label,
                                "destination": info.get("name") or label,
                                "destinationId": info.get("destinationId"),
                                "province": info.get("province"),
                                "confidence": confidence,
                                "confidence_percent": int(confidence * 100),
                                "raw_score": 0.0,
                                "matched_image": "",
                                "best_image_score": 0.0,
                            }
                        ][:top_k],
                        "summary": f"AI vision chưa sẵn sàng nên hệ thống tạm suy luận từ tên file: {info.get('name') or label}.",
                        "message": "Fallback completed.",
                        "vision_status": self.status_snapshot(),
                    }

        return {
            "engine": "filename_fallback",
            "model": self.model_name,
            "device": self._device,
            "fallback": True,
            "file_name": filename,
            "detected": {
                "label": "",
                "destination": "",
                "destinationId": None,
                "province": "",
                "landmark": "Không nhận ra rõ",
                "confidence": 0.0,
                "confidence_percent": 0,
                "certainty": "unknown",
                "matched_prompt": "",
                "matched_image": "",
                "best_image_score": 0.0,
            },
            "top_matches": [],
            "summary": "Chưa nhận diện được điểm đến từ ảnh.",
            "message": "Fallback completed.",
            "vision_status": self.status_snapshot(),
        }

    def _filename_boost_label(self, filename: str | None) -> str | None:
        normalized = strip_text(filename or "")
        for label, info in self._destinations.items():
            candidates = [label, info.get("name", ""), info.get("province", "")]
            candidates.extend(info.get("aliases", []))
            for candidate in candidates:
                if candidate and strip_text(candidate) in normalized:
                    return label
        return None

    def detect_from_image_bytes(self, image_bytes: bytes, filename: str | None = None, top_k: int = DEFAULT_TOP_K) -> dict[str, Any]:
        if not image_bytes:
            raise ValueError("Ảnh tải lên đang rỗng.")

        top_k = clamp_int(top_k, DEFAULT_TOP_K, 1, MAX_TOP_K)

        if not self.ensure_loaded():
            return self._filename_fallback(filename, top_k=top_k)

        try:
            query_embedding = self._encode_image_bytes(image_bytes)
            similarities = torch.matmul(query_embedding, self._gallery_embeddings.T).squeeze(0)
        except Exception as exc:
            self._error = str(exc)
            return self._filename_fallback(filename, top_k=top_k)

        filename_label = self._filename_boost_label(filename)
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)

        for index, item in enumerate(self._gallery_items):
            label = item["label"]
            score = safe_float(similarities[index].item())
            if filename_label and filename_label == label:
                score += 0.03
            grouped[label].append({"score": score, "item": item})

        destination_scores = []
        for label, matches in grouped.items():
            matches = sorted(matches, key=lambda x: x["score"], reverse=True)
            top_scores = [m["score"] for m in matches[: len(DESTINATION_SCORE_WEIGHTS)]]
            while len(top_scores) < len(DESTINATION_SCORE_WEIGHTS):
                top_scores.append(top_scores[-1] if top_scores else 0.0)

            aggregate = sum(score * weight for score, weight in zip(top_scores, DESTINATION_SCORE_WEIGHTS))
            best_match = matches[0]["item"]
            destination_scores.append(
                {
                    "label": label,
                    "destinationId": best_match.get("destinationId"),
                    "destination": best_match.get("name") or label,
                    "province": best_match.get("province") or "",
                    "raw_score": aggregate,
                    "best_image_score": matches[0]["score"],
                    "matched_image": best_match.get("relative_path") or best_match.get("filename"),
                    "matched_filename": best_match.get("filename"),
                    "evidence_images": [
                        {
                            "image": m["item"].get("relative_path") or m["item"].get("filename"),
                            "filename": m["item"].get("filename"),
                            "score": round(safe_float(m["score"]), 4),
                        }
                        for m in matches[:3]
                    ],
                }
            )

        destination_scores.sort(key=lambda x: x["raw_score"], reverse=True)
        if not destination_scores:
            return self._filename_fallback(filename, top_k=top_k)

        raw_values = [x["raw_score"] for x in destination_scores]
        max_raw = max(raw_values)
        exp_values = [math.exp((v - max_raw) * SOFTMAX_TEMPERATURE) for v in raw_values]
        total_exp = sum(exp_values) or 1.0

        for item, exp_value in zip(destination_scores, exp_values):
            confidence = exp_value / total_exp
            item["confidence"] = round(confidence, 4)
            item["confidence_percent"] = int(round(confidence * 100))

        top = destination_scores[0]
        if top["confidence"] >= 0.60:
            certainty = "khá chắc"
        elif top["confidence"] >= 0.35:
            certainty = "mức tin cậy vừa"
        else:
            certainty = "mức tin cậy thấp"

        top_matches = destination_scores[:top_k]
        return {
            "engine": "clip_image_gallery_retrieval",
            "model": self.model_name,
            "device": self._device,
            "fallback": False,
            "file_name": filename,
            "detected": {
                "label": top["label"],
                "destination": top["destination"],
                "destinationId": top["destinationId"],
                "province": top["province"],
                "landmark": top["destination"],
                "confidence": top["confidence"],
                "confidence_percent": top["confidence_percent"],
                "certainty": certainty,
                "matched_prompt": f"So khớp ảnh mẫu: {top['matched_image']}",
                "matched_image": top["matched_image"],
                "best_image_score": round(top["best_image_score"], 4),
                "raw_score": round(top["raw_score"], 4),
            },
            "top_matches": [
                {
                    "rank": index + 1,
                    "label": item["label"],
                    "destination": item["destination"],
                    "destinationId": item["destinationId"],
                    "province": item["province"],
                    "confidence": item["confidence"],
                    "confidence_percent": item["confidence_percent"],
                    "raw_score": round(item["raw_score"], 4),
                    "matched_image": item["matched_image"],
                    "best_image_score": round(item["best_image_score"], 4),
                    "evidence_images": item["evidence_images"],
                }
                for index, item in enumerate(top_matches)
            ],
            "summary": (
                f"AI đã trích xuất embedding ảnh bằng CLIP và so sánh với thư viện {len(self._gallery_items)} ảnh mẫu. "
                f"Kết quả gợi ý: {top['destination']} ({top['confidence_percent']}%, {certainty}). "
                f"Ảnh mẫu gần nhất: {top['matched_image']}."
            ),
            "message": "Vision gallery search completed.",
            "vision_status": self.status_snapshot(),
        }


vision_search_service = VisionSearchService()
