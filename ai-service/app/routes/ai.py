from __future__ import annotations

import io
from typing import Any, Dict

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from PIL import Image

from app.services.external_vision_search import recognize_landmark
from app.services.vision_search import (
    get_vision_status,
    reload_vision_gallery,
    search_similar_destinations_from_pil,
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

        if not content:
            raise ValueError("File ảnh rỗng.")

        image = Image.open(
            io.BytesIO(content)
        ).convert("RGB")

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

        return result

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi tìm kiếm ảnh: {exc}",
        )
