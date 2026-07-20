from __future__ import annotations

import base64
import copy
import io
import json
import os
import time
from typing import Any, Callable, Dict, Optional

import requests
from PIL import Image


TRAVEL_IMAGE_TYPES = {
    "travel_landscape",
    "building_landmark",
}

NON_TRAVEL_IMAGE_TYPES = {
    "document",
    "screenshot",
    "object",
    "food",
    "animal",
}

MIN_EXTERNAL_CONFIDENCE = float(
    os.getenv("VISION_EXTERNAL_MIN_CONFIDENCE", "0.68")
)

MIN_VISUAL_EVIDENCE = int(
    os.getenv("VISION_EXTERNAL_MIN_EVIDENCE", "2")
)


def _env_bool(
    name: str,
    default: bool = False,
) -> bool:
    value = os.getenv(name)

    if value is None:
        return default

    return value.strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _image_to_data_url(
    image: Image.Image,
) -> str:
    buffer = io.BytesIO()

    image.convert("RGB").save(
        buffer,
        format="JPEG",
        quality=88,
        optimize=True,
    )

    encoded = base64.b64encode(
        buffer.getvalue(),
    ).decode("utf-8")

    return f"data:image/jpeg;base64,{encoded}"


def _extract_json(
    content: Any,
) -> Optional[Dict[str, Any]]:
    if isinstance(content, list):
        content = "\n".join(
            str(item.get("text") or "")
            if isinstance(item, dict)
            else str(item)
            for item in content
        )

    text = str(content or "").strip()

    if not text:
        return None

    if "```" in text:
        for part in text.split("```"):
            candidate = part.strip()

            if candidate.lower().startswith("json"):
                candidate = candidate[4:].strip()

            try:
                parsed = json.loads(candidate)

                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                continue

    try:
        parsed = json.loads(text)

        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")

    if start >= 0 and end > start:
        try:
            parsed = json.loads(
                text[start : end + 1],
            )

            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None

    return None


def _empty_result(
    *,
    enabled: bool,
    provider: Optional[str],
    reason: str,
    image_type: str = "unknown",
    confidence: float = 0.0,
    errors: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "enabled": enabled,
        "image_type": image_type,
        "recognized": False,
        "landmark": None,
        "destination": None,
        "province": None,
        "country": None,
        "scene_tags": [],
        "visual_evidence": [],
        "confidence": confidence,
        "provider": provider,
        "reason": reason,
        "errors": errors or [],
    }


def _normalize_string_list(
    value: Any,
    limit: int,
) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        str(item).strip()
        for item in value
        if str(item).strip()
    ][:limit]


def _normalize_result(
    payload: Optional[Dict[str, Any]],
    provider: str,
) -> Dict[str, Any]:
    if not payload:
        return _empty_result(
            enabled=True,
            provider=provider,
            reason="Model không trả về JSON hợp lệ.",
        )

    try:
        confidence = float(
            payload.get("confidence") or 0.0,
        )
    except (TypeError, ValueError):
        confidence = 0.0

    confidence = max(
        0.0,
        min(confidence, 1.0),
    )

    image_type = str(
        payload.get("image_type") or "unknown",
    ).strip().lower()

    scene_tags = _normalize_string_list(
        payload.get("scene_tags"),
        10,
    )

    visual_evidence = _normalize_string_list(
        payload.get("visual_evidence"),
        8,
    )

    requested_recognized = bool(
        payload.get("recognized"),
    )

    landmark = (
        str(payload.get("landmark") or "").strip()
        or None
    )

    destination = (
        str(payload.get("destination") or "").strip()
        or None
    )

    province = (
        str(payload.get("province") or "").strip()
        or None
    )

    country = (
        str(payload.get("country") or "").strip()
        or None
    )

    recognized = (
        requested_recognized
        and image_type in TRAVEL_IMAGE_TYPES
        and confidence >= MIN_EXTERNAL_CONFIDENCE
        and len(visual_evidence)
        >= MIN_VISUAL_EVIDENCE
        and bool(
            landmark
            or destination
            or province
        )
    )

    reason = str(
        payload.get("reason") or "",
    ).strip()

    if not recognized:
        if image_type in NON_TRAVEL_IMAGE_TYPES:
            reason = (
                reason
                or "Ảnh không phải phong cảnh hoặc công trình du lịch."
            )
        elif confidence < MIN_EXTERNAL_CONFIDENCE:
            reason = (
                reason
                or "Độ tin cậy nhận diện địa danh còn thấp."
            )
        elif (
            len(visual_evidence)
            < MIN_VISUAL_EVIDENCE
        ):
            reason = (
                reason
                or "Không đủ dấu hiệu thị giác độc lập để xác nhận địa danh."
            )
        else:
            reason = (
                reason
                or "Không đủ bằng chứng để nhận diện địa danh."
            )

        result = _empty_result(
            enabled=True,
            provider=provider,
            reason=reason,
            image_type=image_type,
            confidence=confidence,
        )

        result["scene_tags"] = scene_tags
        result["visual_evidence"] = (
            visual_evidence
        )

        return result

    return {
        "enabled": True,
        "image_type": image_type,
        "recognized": True,
        "landmark": landmark,
        "destination": destination,
        "province": province,
        "country": country,
        "scene_tags": scene_tags,
        "visual_evidence": visual_evidence,
        "confidence": confidence,
        "provider": provider,
        "reason": reason or None,
        "errors": [],
    }


def _request_json_with_retry(
    *,
    url: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
    timeout: int,
    provider: str,
) -> Dict[str, Any]:
    """
    Thử tối đa ba lần:

    1. Dùng JSON mode.
    2. Bỏ JSON mode nếu model/provider không hỗ trợ.
    3. Dùng prompt ngắn, bắt buộc chỉ trả JSON.
    """

    attempts: list[Dict[str, Any]] = []

    payload_json_mode = copy.deepcopy(
        payload,
    )

    payload_json_mode["response_format"] = {
        "type": "json_object",
    }

    attempts.append(payload_json_mode)

    payload_normal = copy.deepcopy(
        payload,
    )

    payload_normal.pop(
        "response_format",
        None,
    )

    attempts.append(payload_normal)

    payload_short = copy.deepcopy(
        payload_normal,
    )

    payload_short["messages"][-1][
        "content"
    ][0]["text"] = (
        "Chỉ trả về đúng một JSON object hợp lệ. "
        "Phân loại ảnh và nhận diện địa danh nổi tiếng nếu ảnh đủ rõ. "
        "Không markdown, không giải thích ngoài JSON."
    )

    attempts.append(payload_short)

    errors: list[str] = []

    for index, current_payload in enumerate(
        attempts,
    ):
        try:
            response = requests.post(
                url,
                headers=headers,
                json=current_payload,
                timeout=timeout,
            )

            if (
                response.status_code
                in {400, 404, 422}
                and index == 0
            ):
                errors.append(
                    f"attempt {index + 1}: "
                    f"HTTP {response.status_code}"
                )
                continue

            response.raise_for_status()

            body = response.json()

            choices = (
                body.get("choices") or []
            )

            if not choices:
                raise RuntimeError(
                    f"{provider} không trả về choices.",
                )

            content = (
                choices[0]
                .get("message", {})
                .get("content", "")
            )

            parsed = _extract_json(
                content,
            )

            if parsed:
                return parsed

            errors.append(
                f"attempt {index + 1}: "
                "JSON không hợp lệ",
            )

        except Exception as exc:
            errors.append(
                f"attempt {index + 1}: {exc}",
            )

        if index < len(attempts) - 1:
            time.sleep(0.35)

    raise RuntimeError(
        "; ".join(errors),
    )


def _request_vision(
    *,
    provider: str,
    base_url: str,
    api_key: str,
    model: str,
    image: Image.Image,
) -> Dict[str, Any]:
    timeout = max(
        5,
        int(
            os.getenv(
                "VISION_REQUEST_TIMEOUT_SECONDS",
                "35",
            ),
        ),
    )

    data_url = _image_to_data_url(
        image,
    )

    system_prompt = """
Bạn là bộ kiểm định và nhận diện địa danh du lịch từ hình ảnh.

Thực hiện đúng thứ tự:

Bước 1 - phân loại ảnh thành đúng một loại:
- travel_landscape: phong cảnh hoặc địa danh du lịch thật.
- building_landmark: công trình, tượng, tháp hoặc kiến trúc nổi tiếng.
- document: giấy tờ, chữ viết tay, bảng biểu, sơ đồ, bài tập hoặc tài liệu.
- screenshot: ảnh chụp màn hình, giao diện hoặc nội dung số.
- object: đồ vật thông thường.
- food: món ăn.
- animal: động vật.
- unknown: không xác định.

Bước 2:
Chỉ nhận diện địa danh khi image_type là travel_landscape
hoặc building_landmark.

Bước 3:
Chỉ đặt recognized=true khi có ít nhất hai dấu hiệu thị giác
độc lập và cụ thể.

Ví dụ:
- Núi Phú Sĩ thuộc Nhật Bản.
- Kim tự tháp Giza thuộc Ai Cập.
- Tháp Eiffel thuộc Paris, Pháp.
- Núi Bà Đen thuộc Tây Ninh, Việt Nam.
- Giấy viết tay phải là document và recognized=false.

Không được suy đoán kiểu:
- có núi nên đoán Núi Bà Đen;
- có biển nên đoán Phú Quốc;
- có tòa nhà nên đoán Đà Nẵng;
- ảnh tài liệu nhưng vẫn đoán thành địa danh.

Chỉ trả về một JSON object hợp lệ, không markdown:

{
  "image_type": "building_landmark",
  "recognized": true,
  "landmark": "Tháp Eiffel",
  "destination": "Paris",
  "province": null,
  "country": "Pháp",
  "scene_tags": [
    "tower",
    "city",
    "architecture"
  ],
  "visual_evidence": [
    "khung thép dạng tháp đặc trưng",
    "bốn chân tháp hội tụ lên đỉnh"
  ],
  "confidence": 0.94,
  "reason": "Có đủ dấu hiệu nhận diện."
}
""".strip()

    payload: Dict[str, Any] = {
        "model": model,
        "temperature": 0.0,
        "max_tokens": 900,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Phân loại ảnh trước rồi nhận diện địa danh nổi tiếng. "
                            "Nếu là tài liệu thì recognized=false. "
                            "Chỉ trả JSON."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": data_url,
                        },
                    },
                ],
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    if provider == "openrouter":
        headers["HTTP-Referer"] = (
            os.getenv(
                "APP_URL",
                "http://localhost:3000",
            )
        )

        headers["X-Title"] = os.getenv(
            "APP_NAME",
            "Travela",
        )

    parsed = _request_json_with_retry(
        url=(
            f"{base_url.rstrip('/')}"
            "/chat/completions"
        ),
        headers=headers,
        payload=payload,
        timeout=timeout,
        provider=provider,
    )

    return _normalize_result(
        parsed,
        provider,
    )


def _groq_handler(
    image: Image.Image,
) -> Optional[Dict[str, Any]]:
    api_key = os.getenv(
        "GROQ_API_KEY",
        "",
    ).strip()

    model = os.getenv(
        "GROQ_VISION_MODEL",
        "",
    ).strip()

    if not api_key or not model:
        return None

    return _request_vision(
        provider="groq",
        base_url=os.getenv(
            "GROQ_BASE_URL",
            "https://api.groq.com/openai/v1",
        ),
        api_key=api_key,
        model=model,
        image=image,
    )


def _openrouter_handler(
    image: Image.Image,
) -> Optional[Dict[str, Any]]:
    api_key = os.getenv(
        "OPENROUTER_API_KEY",
        "",
    ).strip()

    model = os.getenv(
        "OPENROUTER_VISION_MODEL",
        "",
    ).strip()

    if not api_key or not model:
        return None

    return _request_vision(
        provider="openrouter",
        base_url=os.getenv(
            "OPENROUTER_BASE_URL",
            "https://openrouter.ai/api/v1",
        ),
        api_key=api_key,
        model=model,
        image=image,
    )


def recognize_landmark(
    image: Image.Image,
) -> Dict[str, Any]:
    if not _env_bool(
        "VISION_EXTERNAL_ENABLED",
        False,
    ):
        return _empty_result(
            enabled=False,
            provider=None,
            reason=(
                "Nhận diện Vision bên ngoài đang tắt."
            ),
        )

    provider = os.getenv(
        "VISION_PROVIDER",
        "auto",
    ).strip().lower()

    handlers: list[
        Callable[
            [Image.Image],
            Optional[Dict[str, Any]],
        ]
    ]

    if provider == "groq":
        handlers = [
            _groq_handler,
        ]

    elif provider == "openrouter":
        handlers = [
            _openrouter_handler,
        ]

    else:
        handlers = [
            _groq_handler,
            _openrouter_handler,
        ]

    errors: list[str] = []

    last_result: Optional[
        Dict[str, Any]
    ] = None

    for handler in handlers:
        try:
            result = handler(
                image,
            )

            if result is None:
                continue

            last_result = result

            if result.get(
                "recognized",
            ):
                return result

            image_type = str(
                result.get(
                    "image_type",
                )
                or "unknown",
            ).lower()

            if (
                image_type
                in NON_TRAVEL_IMAGE_TYPES
            ):
                return result

            errors.append(
                f"{result.get('provider')}: "
                f"{result.get('reason') or 'không nhận diện chắc chắn'}",
            )

        except Exception as exc:
            errors.append(
                f"{handler.__name__}: {exc}",
            )

    if last_result is not None:
        last_result["errors"] = (
            errors
        )

        return last_result

    reason = (
        "; ".join(errors)
        if errors
        else (
            "Chưa cấu hình "
            "GROQ_VISION_MODEL hoặc "
            "OPENROUTER_VISION_MODEL."
        )
    )

    return _empty_result(
        enabled=True,
        provider=None,
        reason=reason,
        errors=errors,
    )