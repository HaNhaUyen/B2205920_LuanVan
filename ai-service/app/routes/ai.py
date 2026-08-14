from __future__ import annotations

import asyncio
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
    search_exact_match_from_pil,
    search_similar_destinations_from_pil,
    vision_search_service,
)

router = APIRouter()

ALLOWED_EXTERNAL_IMAGE_TYPES = {
    "travel_landscape",
    "building_landmark",
}

NON_TRAVEL_EXTERNAL_IMAGE_TYPES = {
    "document",
    "screenshot",
    "object",
    "food",
    "animal",
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

EXTERNAL_ALWAYS_VERIFY = os.getenv(
    "VISION_EXTERNAL_ALWAYS_VERIFY", "0"
).strip().lower() in {"1", "true", "yes", "on"}

REQUIRE_EXTERNAL_VERIFICATION = os.getenv(
    "VISION_REQUIRE_EXTERNAL_VERIFICATION", "0"
).strip().lower() in {"1", "true", "yes", "on"}

EXTERNAL_STRONG_CONFIDENCE = float(
    os.getenv("VISION_EXTERNAL_STRONG_CONFIDENCE", "0.84")
)

VISION_PARALLEL_EXTERNAL = os.getenv(
    "VISION_PARALLEL_EXTERNAL", "1"
).strip().lower() in {"1", "true", "yes", "on"}

VISION_SCENE_FALLBACK_ENABLED = os.getenv(
    "VISION_SCENE_FALLBACK_ENABLED", "1"
).strip().lower() in {"1", "true", "yes", "on"}

VISION_SCENE_FALLBACK_MIN_SCORE = float(
    os.getenv("VISION_SCENE_FALLBACK_MIN_SCORE", "0.20")
)

VISION_SCENE_FALLBACK_TOP_K = max(
    1,
    min(5, int(os.getenv("VISION_SCENE_FALLBACK_TOP_K", "3"))),
)


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
    result_source = str(result.get("result_source") or "").strip().lower()

    # Tài liệu / screenshot là một kết quả phân loại ổn định dù recognized=false.
    # Cho phép cache đúng kết quả cuối cùng để lần truy vấn lại cùng ảnh không
    # phải gọi Groq/OpenRouter lần nữa.
    external_image_type = (
        str(external.get("image_type") or "").strip().lower()
        if isinstance(external, dict)
        else ""
    )
    cacheable_non_travel = (
        isinstance(external, dict)
        and external.get("enabled")
        and not external.get("recognized")
        and external_image_type in {"document", "screenshot"}
    )

    # Các trường hợp recognized=false khác vẫn giữ nguyên logic cũ:
    # không cache để provider còn cơ hội nhận diện lại nếu lần trước timeout,
    # 429, lỗi kỹ thuật hoặc chưa đủ độ tin cậy.
    if (
        isinstance(external, dict)
        and external.get("enabled")
        and not external.get("recognized")
        and not cacheable_non_travel
    ):
        return

    # Chỉ lưu những kết quả đã đủ ổn định:
    # - internal_exact: ảnh trùng/gần trùng dataset
    # - internal_verified: local + external cùng xác nhận
    # - external_global: external nhận diện landmark ngoài dataset
    # - internal_clip: local được chấp nhận trong cấu hình không bắt buộc verify
    # - document/screenshot: giữ nguyên toàn bộ kết quả cuối của lần đầu.
    cacheable_sources = {
        "internal_exact",
        "internal_verified",
        "external_global",
        "internal_clip",
    }

    if result_source not in cacheable_sources and not cacheable_non_travel:
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



def _norm_place(value: Any) -> str:
    import unicodedata
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return " ".join(text.split())


def _external_to_detected(external: Dict[str, Any]) -> Dict[str, Any]:
    destination_name = (
        external.get("landmark")
        or external.get("destination")
        or external.get("province")
        or "Địa danh"
    )
    confidence = float(external.get("confidence") or 0.0)
    return {
        "destination_slug": None,
        "destination_name": destination_name,
        "landmark": external.get("landmark"),
        "destination": external.get("destination"),
        "province": external.get("province"),
        "country": external.get("country"),
        "score": round(confidence, 4),
        "confidence": round(confidence, 4),
        "confidence_percent": round(confidence * 100, 1),
        "best_image_score": 0.0,
        "top3_avg_image_score": 0.0,
        "prototype_score": 0.0,
        "text_score": 0.0,
        "scene_bonus": 0.0,
        "hit_count": 0,
        "evidence_images": [],
        "matched_scene_tags": external.get("scene_tags") or [],
        "visual_evidence": external.get("visual_evidence") or [],
        "match_type": "external_landmark",
        "source": "external_vision",
    }


def _local_external_agree(
    local_detected: Dict[str, Any] | None,
    external: Dict[str, Any] | None,
) -> bool:
    if not local_detected or not external or not external.get("recognized"):
        return False

    local_values = {
        _norm_place(local_detected.get("destination_name")),
        _norm_place(local_detected.get("province")),
    }
    external_values = {
        _norm_place(external.get("landmark")),
        _norm_place(external.get("destination")),
        _norm_place(external.get("province")),
    }
    local_values.discard("")
    external_values.discard("")

    for a in local_values:
        for b in external_values:
            if a == b or a in b or b in a:
                return True
    return False


SCENE_TO_DESTINATION_TAGS = {
    "beach": {"beach", "island"},
    "island": {"island", "beach"},
    "mountain": {"mountain", "forest"},
    "forest": {"forest", "mountain"},
    "river": {"river"},
    "city": {"city", "heritage"},
    "heritage": {"heritage", "city"},
    "cave": {"cave", "river", "heritage"},
    "sand_dune": {"sand_dune", "beach"},
    "waterfall": {"waterfall", "forest", "mountain"},
}

SCENE_LABELS_VI = {
    "beach": "biển",
    "island": "biển đảo",
    "mountain": "núi",
    "forest": "thiên nhiên rừng",
    "river": "sông nước",
    "city": "thành phố và kiến trúc",
    "heritage": "văn hóa và di sản",
    "cave": "hang động và núi đá",
    "sand_dune": "biển và đồi cát",
    "waterfall": "thác nước và thiên nhiên",
}


def _pick_scene(result: Dict[str, Any]) -> tuple[str | None, float]:
    rows = result.get("scene_scores") or []
    if not rows:
        return None, 0.0

    first = rows[0] or {}
    tag = str(first.get("tag") or "").strip().lower()

    try:
        score = float(first.get("score") or 0.0)
    except (TypeError, ValueError):
        score = 0.0

    if not tag or score < VISION_SCENE_FALLBACK_MIN_SCORE:
        return None, score

    return tag, score


def _scene_similar_destinations(
    result: Dict[str, Any],
    *,
    limit: int = 3,
) -> list[Dict[str, Any]]:
    scene, _score = _pick_scene(result)
    if not scene:
        return []

    wanted_tags = SCENE_TO_DESTINATION_TAGS.get(scene, {scene})
    rows = list(result.get("top_matches") or [])

    def rank_key(item: Dict[str, Any]):
        tags = {
            str(tag or "").strip().lower()
            for tag in (item.get("matched_scene_tags") or [])
        }
        overlap = len(tags.intersection(wanted_tags))
        return (
            overlap,
            float(item.get("confidence") or 0.0),
            float(item.get("score") or 0.0),
            float(item.get("best_image_score") or 0.0),
        )

    themed = [
        item
        for item in rows
        if rank_key(item)[0] > 0
    ]
    themed.sort(key=rank_key, reverse=True)

    picked = themed if themed else rows

    result_rows: list[Dict[str, Any]] = []
    seen = set()

    for item in picked:
        key = str(
            item.get("destination_slug")
            or item.get("destination_name")
            or ""
        ).strip().lower()

        if not key or key in seen:
            continue

        seen.add(key)
        result_rows.append(item)

        if len(result_rows) >= limit:
            break

    return result_rows


def _apply_scene_fallback(
    result: Dict[str, Any],
) -> bool:
    if not VISION_SCENE_FALLBACK_ENABLED:
        return False

    scene, score = _pick_scene(result)
    if not scene:
        return False

    similar = _scene_similar_destinations(
        result,
        limit=VISION_SCENE_FALLBACK_TOP_K,
    )

    if not similar:
        return False

    label = SCENE_LABELS_VI.get(scene, "du lịch")

    result["accepted"] = True
    result["result_source"] = "scene_similar"
    result["verified_by_external"] = False
    result["display_matches"] = similar
    result["similar_destinations"] = similar
    result["similarity_themes"] = [scene]
    result["scene_detected"] = scene
    result["scene_confidence"] = score
    result["message"] = (
        f"AI chưa xác định chắc chắn địa danh cụ thể, "
        f"nhưng nhận biết ảnh thuộc chủ đề {label}. "
        "Travela đang giới thiệu các tour có cảnh quan/chủ đề tương tự."
    )
    return True


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
        # FAST PATH DUY NHẤT:
        # ảnh thực sự trùng/gần trùng dataset => trả ngay, không chờ external.
        # Nếu không trùng, toàn bộ logic CLIP + external bên dưới giữ nguyên.
        exact_result = await asyncio.to_thread(
            search_exact_match_from_pil,
            image,
        )
        perf.mark("exact_dataset_check")

        if exact_result is not None:
            exact_result["uploaded_filename"] = file.filename
            exact_result["external_recognition"] = None
            exact_result["accepted"] = True
            exact_result["result_source"] = "internal_exact"
            exact_result["verified_by_external"] = False
            exact_result["display_matches"] = exact_result.get("top_matches") or []
            exact_result["cache_hit"] = False
            exact_result["perf"] = perf.finish(
                cache_hit=False,
                low_confidence=False,
                external_called=False,
                exact_match=True,
            )
            _cache_set(cache_key, exact_result)
            return exact_result

        # Khi cấu hình luôn verify, chạy CLIP và external song song.
        # Trước đây chạy tuần tự nên thời gian ~= CLIP + API ngoài.
        # Bản này thời gian gần ~= max(CLIP, API ngoài).
        if VISION_PARALLEL_EXTERNAL and (
            EXTERNAL_ALWAYS_VERIFY
            or REQUIRE_EXTERNAL_VERIFICATION
        ):
            local_task = asyncio.to_thread(
                search_similar_destinations_from_pil,
                image,
                top_k,
            )
            external_task = asyncio.to_thread(
                recognize_landmark,
                image,
            )

            result, external = await asyncio.gather(
                local_task,
                external_task,
            )
            perf.mark("clip_external_parallel")
        else:
            result = await asyncio.to_thread(
                search_similar_destinations_from_pil,
                image,
                top_k,
            )
            perf.mark("clip_search")
            external = None

        result["uploaded_filename"] = file.filename
        result["external_recognition"] = None

        local_detected = result.get("detected") or None
        local_low_confidence = bool(result.get("low_confidence"))
        exact_match = bool(result.get("exact_match"))

        should_call_external = (
            local_low_confidence
            or EXTERNAL_ALWAYS_VERIFY
            or REQUIRE_EXTERNAL_VERIFICATION
        )

        if should_call_external and external is None:
            external = await asyncio.to_thread(
                recognize_landmark,
                image,
            )
            perf.mark("external_vision")

        if external is not None:

            image_type = str(
                external.get("image_type") or "unknown"
            ).lower()

            try:
                confidence = float(
                    external.get("confidence") or 0.0
                )
            except (TypeError, ValueError):
                confidence = 0.0

            evidence = external.get("visual_evidence")
            if not isinstance(evidence, list):
                evidence = []

            valid_external = (
                bool(external.get("recognized"))
                and image_type in ALLOWED_EXTERNAL_IMAGE_TYPES
                and confidence >= float(
                    os.getenv("VISION_EXTERNAL_MIN_CONFIDENCE", "0.68")
                )
                and len(evidence) >= int(
                    os.getenv("VISION_EXTERNAL_MIN_EVIDENCE", "2")
                )
            )

            if not valid_external:
                external["recognized"] = False
                external["landmark"] = None
                external["destination"] = None
                external["province"] = None
                if image_type not in ALLOWED_EXTERNAL_IMAGE_TYPES:
                    external["country"] = None

            external["reason"] = _safe_external_reason(external)
            external["errors"] = []
            print("\n[EXTERNAL VISION RAW]")
            print(external)
            print("[END EXTERNAL VISION RAW]\n")
            result["external_recognition"] = external

        agree = _local_external_agree(local_detected, external)

        # Quyết định cuối:
        # 1) Ảnh trùng/gần trùng trong DB => ưu tiên DB.
        # 2) Local + external đồng ý => ưu tiên local và đánh dấu verified.
        # 3) External nhận diện landmark quốc tế mạnh => cho phép kết quả ngoài dataset.
        # 4) Nếu bắt buộc external verify mà external không xác minh => không accept local.
        if exact_match and local_detected:
            result["accepted"] = True
            result["result_source"] = "internal_exact"
            result["verified_by_external"] = bool(agree)
            result["display_matches"] = result.get("top_matches") or []
        elif agree and local_detected:
            result["accepted"] = True
            result["result_source"] = "internal_verified"
            result["verified_by_external"] = True
            result["display_matches"] = result.get("top_matches") or []
        elif (
            external
            and external.get("recognized")
            and float(external.get("confidence") or 0.0)
                >= EXTERNAL_STRONG_CONFIDENCE
        ):
            detected_external = _external_to_detected(external)
            result["accepted"] = True
            result["detected"] = detected_external
            result["result_source"] = "external_global"
            result["verified_by_external"] = True
            # Landmark ngoài dataset không giả tạo local matches.
            result["display_matches"] = [detected_external]
        elif REQUIRE_EXTERNAL_VERIFICATION and should_call_external:
            external_image_type = str(
                (external or {}).get("image_type") or "unknown"
            ).strip().lower()

            # Chỉ chỉnh đúng trường hợp ảnh không phải ảnh du lịch:
            # - document/screenshot/object/food/animal: tuyệt đối không lấy CLIP
            #   scene fallback để "đoán" thành một địa danh/tour.
            # - unknown: external chưa xác minh được loại ảnh, nên trong chế độ
            #   REQUIRE_EXTERNAL_VERIFICATION cũng không được suy diễn từ scene.
            #
            # Ảnh travel_landscape/building_landmark vẫn giữ nguyên scene fallback
            # cũ khi external chưa đủ mạnh để xác nhận một landmark cụ thể.
            if external_image_type in NON_TRAVEL_EXTERNAL_IMAGE_TYPES:
                result["accepted"] = False
                result["result_source"] = "non_travel"
                result["verified_by_external"] = False
                result["display_matches"] = []
                result["similar_destinations"] = []
                result["similarity_themes"] = []
                result["message"] = _safe_external_reason(external or {})
            elif external_image_type == "unknown":
                result["accepted"] = False
                result["result_source"] = "unverified"
                result["verified_by_external"] = False
                result["display_matches"] = []
                result["similar_destinations"] = []
                result["similarity_themes"] = []
                result["message"] = _safe_external_reason(external or {})
            else:
                # Giữ nguyên logic cũ cho ảnh được external phân loại là
                # phong cảnh/công trình du lịch nhưng chưa xác định chắc landmark.
                if not _apply_scene_fallback(result):
                    result["accepted"] = False
                    result["result_source"] = "unverified"
                    result["verified_by_external"] = False
                    result["display_matches"] = []
        else:
            result["accepted"] = not local_low_confidence
            result["result_source"] = (
                "internal_clip" if result["accepted"] else "uncertain"
            )
            result["verified_by_external"] = False
            result["display_matches"] = (
                result.get("top_matches") or []
                if result["accepted"]
                else []
            )

            if not result["accepted"]:
                _apply_scene_fallback(result)


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
