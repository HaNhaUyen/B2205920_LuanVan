# ai-service/app/routes/ai.py
from __future__ import annotations

import io
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from PIL import Image

from app.services.vision_search import (
    get_vision_status,
    reload_vision_gallery,
    search_similar_destinations_from_pil,
)

router = APIRouter()


@router.get("/vision-status")
def vision_status(load: bool = Query(False)):
    return get_vision_status(load=load)


@router.post("/vision-reload")
def vision_reload(force_rebuild_cache: bool = Query(True)):
    return reload_vision_gallery(force_rebuild_cache=force_rebuild_cache)


@router.post("/image-search-upload")
async def image_search_upload(
    file: UploadFile = File(...),
    top_k: int = Query(5, ge=1, le=20),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Vui lòng upload một file ảnh.")

    try:
        content = await file.read()
        image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Không đọc được ảnh upload.")

    try:
        result = search_similar_destinations_from_pil(image, top_k=top_k)
        result["uploaded_filename"] = file.filename
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Lỗi tìm kiếm ảnh: {exc}")
