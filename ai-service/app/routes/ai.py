from __future__ import annotations

import copy
import hashlib
import io
import os
import time
from typing import Any, Dict

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from PIL import Image, ImageOps

from app.services.external_vision_search import recognize_landmark
from app.services.vision_search import (
    CACHE_VERSION,
    PerfTimer,
    get_vision_status,
    reload_vision_gallery,
    search_similar_destinations_from_pil,
    vision_search_service,
)

router = APIRouter()

ALLOWED_EXTERNAL_IMAGE_TYPES = {
    "travel_landscape",
    "building_landmark",
}

TECHNICAL_REASON_SIGNALS = (
    "json",
    "choices",
    "timeout",
    "timed out",
    "api key",
    "invalid api",
    "unauthorized",
    "forbidden",
    "groq",
    "openrouter",
    "provider",
    "chat/completions",
    "http",
    "model",
    "connection",
)

REQUEST_CACHE: Dict[str, Dict[str, Any]] = {}
REQUEST_CACHE_TTL_SECONDS = int(os.getenv("IMAGE_SEARCH_CACHE_TTL_SECONDS", "900"))
REQUEST_CACHE_ENABLED = os.getenv("IMAGE_SEARCH_CACHE_ENABLED", "1").strip().lower() in {"1", "true", "yes", "on"}
MAX_UPLOAD_MB = float(os.getenv("IMAGE_SEARCH_MAX_UPLOAD_MB", "10"))
MAX_IMAGE_SIDE = int(os.getenv("IMAGE_SEARCH_MAX_IMAGE_SIDE", "1024"))


def _resize_uploaded_image(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("RGB")
    if MAX_IMAGE_SIDE > 0 and max(image.size) > MAX_IMAGE_SIDE:
        resized = image.copy()
        resized.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
        return resized
    return image


def _cache_key(content: bytes, top_k: int) -> str:
    if not vision_search_service.dataset_fingerprint:
        vision_search_service.load(force_rebuild_cache=False)
    fingerprint = vision_search_service.dataset_fingerprint or "not_loaded"
    digest = hashlib.sha256(content).hexdigest()
    return f"{CACHE_VERSION}:{fingerprint}:{top_k}:{digest}"


def _cache_get(key: str) -> Dict[str, Any] | None:
    if not REQUEST_CACHE_ENABLED:
        return None
    row = REQUEST_CACHE.get(key)
    if not row:
        return None
    if time.time() - float(row.get("created_at") or 0) > REQUEST_CACHE_TTL_SECONDS:
        REQUEST_CACHE.pop(key, None)
        return None
    return copy.deepcopy(row["result"])


def _cache_set(key: str, result: Dict[str, Any]) -> None:
    if not REQUEST_CACHE_ENABLED:
        return
    external = result.get("external_recognition")
    if isinstance(external, dict) and external.get("enabled") and not external.get("recognized"):
        return
    REQUEST_CACHE[key] = {
        "created_at": time.time(),
        "result": copy.deepcopy(result),
    }


def _safe_external_reason(external: Dict[str, Any]) -> str:
    raw = str(external.get("reason") or "").strip()
    normalized = raw.lower()

    if any(
        signal in normalized
        for signal in TECHNICAL_REASON_SIGNALS
    ):
        return (
            "AI chưa thể xác định chắc chắn địa điểm "
            "trong ảnh ở lần thử này."
        )

    image_type = str(
        external.get("image_type") or "unknown"
    ).lower()

    if image_type in {"document", "screenshot"}:
        return (
            "Ảnh là tài liệu, chữ viết hoặc ảnh chụp "
            "màn hình, không phải địa danh du lịch."
        )

    if image_type in {"object", "food", "animal"}:
        return (
            "Ảnh không phải phong cảnh hoặc công trình "
            "du lịch."
        )

    return raw or (
        "Không đủ bằng chứng để nhận diện địa danh."
    )


@router.get("/vision-status")
def vision_status(load: bool = Query(False)):
    return get_vision_status(load=load)


@router.post("/vision-reload")
def vision_reload(
    force_rebuild_cache: bool = Query(True),
):
    return reload_vision_gallery(
        force_rebuild_cache=force_rebuild_cache
    )


@router.post("/image-search-upload")
async def image_search_upload(
    file: UploadFile = File(...),
    top_k: int = Query(5, ge=1, le=20),
):
    perf = PerfTimer("image_search_upload")
    if (
        not file.content_type
        or not file.content_type.startswith("image/")
    ):
        raise HTTPException(
            status_code=400,
            detail="Vui lòng upload một file ảnh.",
        )

    try:
        content = await file.read()
        perf.mark("read_upload")

        if not content:
            raise ValueError("File ảnh rỗng.")

        if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
            raise ValueError(f"File ảnh vượt quá {MAX_UPLOAD_MB:g}MB.")

        cache_key = _cache_key(content, top_k)
        cached = _cache_get(cache_key)
        if cached is not None:
            cached["uploaded_filename"] = file.filename
            cached["cache_hit"] = True
            cached["perf"] = perf.finish(cache_hit=True)
            return cached

        image = _resize_uploaded_image(
            Image.open(
                io.BytesIO(content)
            )
        )
        perf.mark("decode_resize")

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Không đọc được ảnh upload: {exc}",
        )

    try:
        result = search_similar_destinations_from_pil(
            image,
            top_k=top_k,
        )
        perf.mark("clip_search")

        result["uploaded_filename"] = file.filename
        result["external_recognition"] = None
        result["accepted"] = not bool(
            result.get("low_confidence")
        )

        # Frontend chỉ được hiển thị display_matches.
        # top_matches vẫn giữ để debug hoặc đánh giá CLIP.
        result["display_matches"] = (
            result.get("top_matches") or []
            if result["accepted"]
            else []
        )

        if bool(result.get("low_confidence")):
            external = recognize_landmark(image)
            perf.mark("external_vision")

            image_type = str(
                external.get("image_type") or "unknown"
            ).lower()

            try:
                confidence = float(
                    external.get("confidence") or 0.0
                )
            except (TypeError, ValueError):
                confidence = 0.0

            evidence = external.get(
                "visual_evidence"
            )

            if not isinstance(evidence, list):
                evidence = []

            valid_external = (
                bool(external.get("recognized"))
                and image_type
                in ALLOWED_EXTERNAL_IMAGE_TYPES
                and confidence >= 0.68
                and len(evidence) >= 2
            )

            if not valid_external:
                external["recognized"] = False
                external["landmark"] = None
                external["destination"] = None
                external["province"] = None

                if (
                    image_type
                    not in ALLOWED_EXTERNAL_IMAGE_TYPES
                ):
                    external["country"] = None

            external["reason"] = _safe_external_reason(
                external
            )

            # Không trả lỗi kỹ thuật chi tiết cho frontend.
            # errors vẫn có thể xem trong log server nếu cần.
            external["errors"] = []

            result["external_recognition"] = external

        result["cache_hit"] = False
        result["perf"] = perf.finish(
            cache_hit=False,
            low_confidence=bool(result.get("low_confidence")),
            external_called=bool(result.get("external_recognition")),
        )
        _cache_set(cache_key, result)

        return result

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi tìm kiếm ảnh: {exc}",
        )
