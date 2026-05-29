from __future__ import annotations

import re
import unicodedata
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.data.destination_catalog import DESTINATION_CATALOG
from app.services.vision_search import vision_search_service

router = APIRouter()

MAX_UPLOAD_SIZE_MB = 10
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024


class VoiceSearchRequest(BaseModel):
    text: str


class ImageSearchRequest(BaseModel):
    image_name: str


class ChatRequest(BaseModel):
    question: str


def clean_transcript(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[.,/#!$%^&*;:{}=_`~()?\[\]\"“”‘’]+", " ", text or "")).strip()


class VisionStatusResponse(BaseModel):
    engine: str
    model: str
    device: str
    status: str
    destination_count: int
    gallery_image_count: int
    manifest_file: str | None = None
    dataset_dir: str | None = None
    cache_file: str | None = None
    cache_used: bool = False
    error: str | None = None


NUMBER_WORDS = {
    "mot": 1,
    "một": 1,
    "hai": 2,
    "ba": 3,
    "bon": 4,
    "bốn": 4,
    "tu": 4,
    "tư": 4,
    "nam": 5,
    "năm": 5,
    "sau": 6,
    "sáu": 6,
    "bay": 7,
    "bảy": 7,
    "tam": 8,
    "tám": 8,
    "chin": 9,
    "chín": 9,
    "muoi": 10,
    "mười": 10,
}


def strip_text(value: str) -> str:
    value = unicodedata.normalize("NFD", value or "")
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-zA-Z0-9]+", " ", value.lower())
    return value.strip()


def detect_destination(source: str):
    normalized = strip_text(clean_transcript(source))
    for item in DESTINATION_CATALOG:
        if strip_text(item["destination"]) in normalized:
            return item
        if strip_text(item["province"]) in normalized:
            return item
        for alias in item.get("aliases", []):
            if alias in normalized:
                return item
    return None


def parse_number_token(token: str) -> int | None:
    if not token:
        return None
    if token.isdigit():
        return int(token)
    return NUMBER_WORDS.get(token)


def parse_money(normalized: str) -> int | None:
    under_match = re.search(r"(duoi|dưới|toi da|tối đa|max|khong qua|không quá)\s*(\d+(?:[\.,]\d+)?)\s*(trieu|triệu|cu|củ|m|tr)", normalized)
    if under_match:
        return int(float(under_match.group(2).replace(',', '.')) * 1_000_000)

    range_match = re.search(r"(\d+(?:[\.,]\d+)?)\s*(?:-|den|đến)\s*(\d+(?:[\.,]\d+)?)\s*(trieu|triệu|cu|củ|m|tr)", normalized)
    if range_match:
        return int(float(range_match.group(2).replace(',', '.')) * 1_000_000)

    match = re.search(r"(\d+(?:[\.,]\d+)?)\s*(trieu|triệu|cu|củ|m|tr)", normalized)
    if match:
        amount = float(match.group(1).replace(',', '.'))
        if re.search(rf"{re.escape(match.group(0))}\s*(ruoi|rưỡi)", normalized):
            amount += 0.5
        return int(amount * 1_000_000)

    word_match = re.search(r"(mot|một|hai|ba|bon|bốn|tu|tư|nam|năm|sau|sáu|bay|bảy|tam|tám|chin|chín|muoi|mười)\s*(trieu|triệu|cu|củ|tr)", normalized)
    if word_match:
        number = parse_number_token(word_match.group(1))
        if number is not None:
            return int(number * 1_000_000)
    return None


def parse_days(normalized: str) -> int | None:
    match = re.search(r"(\d+|mot|một|hai|ba|bon|bốn|tu|tư|nam|năm|sau|sáu|bay|bảy|tam|tám|chin|chín|muoi|mười)\s*(ngay|ngày)", normalized)
    if match:
        return parse_number_token(match.group(1))
    night_match = re.search(r"(\d+|mot|một|hai|ba|bon|bốn|tu|tư|nam|năm|sau|sáu|bay|bảy|tam|tám|chin|chín|muoi|mười)\s*(dem|đêm)", normalized)
    if night_match:
        nights = parse_number_token(night_match.group(1))
        return nights + 1 if nights is not None else None
    return None


def parse_people(normalized: str) -> int | None:
    match = re.search(r"(\d+|mot|một|hai|ba|bon|bốn|tu|tư|nam|năm|sau|sáu|bay|bảy|tam|tám|chin|chín|muoi|mười)\s*(nguoi|người)", normalized)
    if match:
        return parse_number_token(match.group(1))
    if "gia dinh" in normalized or "gia đình" in normalized:
        return 4
    if "cap doi" in normalized or "cặp đôi" in normalized:
        return 2
    return None


def detect_theme(normalized: str) -> str | None:
    theme_map = {
        "beach": ["bien", "biển", "dao", "đảo", "nghi duong", "resort", "ngam bien", "tắm biển"],
        "mountain": ["nui", "núi", "san may", "săn mây", "fansipan", "doi", "đồi", "cao nguyen", "cao nguyên"],
        "city": ["thanh pho", "thành phố", "city", "pho co", "phố cổ", "check in"],
        "culture": ["van hoa", "văn hóa", "di tich", "di tích", "chua", "chùa", "co do", "cố đô"],
        "family": ["gia dinh", "gia đình", "tre em", "trẻ em", "con nho", "con nhỏ"],
        "luxury": ["cao cap", "cao cấp", "sang trong", "sang trọng", "5 sao", "villa", "honeymoon"],
        "adventure": ["kham pha", "khám phá", "trek", "leo nui", "leo núi", "camping", "cắm trại"],
        "eco": ["sinh thai", "sinh thái", "green", "eco", "thac", "thác"],
    }
    for theme, keywords in theme_map.items():
        if any(keyword in normalized for keyword in keywords):
            return theme
    return None


def detect_tour_type(normalized: str) -> str | None:
    if any(word in normalized for word in ["rieng", "riêng", "private", "ca nhan", "cá nhân"]):
        return "private"
    if any(word in normalized for word in ["doan", "đoàn", "group", "nhom", "nhóm"]):
        return "group"
    return None


def parse_hotel_stars(normalized: str) -> int | None:
    match = re.search(r"(3|4|5)\s*(sao|star)", normalized)
    return int(match.group(1)) if match else None


def rank_destinations(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    ranked = []
    for item in DESTINATION_CATALOG:
        score = 0.0
        reasons = []
        if parsed.get("destination") == item["destination"]:
            score += 6
            reasons.append("khớp đúng điểm đến")
        theme = parsed.get("theme")
        if theme and theme in item.get("scene_tags", []):
            score += 3
            reasons.append(f"hợp chủ đề {theme}")
        if parsed.get("party_size") and parsed["party_size"] >= 4 and "gia đình" in item.get("best_for", []):
            score += 1.5
            reasons.append("phù hợp đi gia đình")
        max_price = parsed.get("max_price")
        if max_price:
            budget_hint = item.get("budget_hint", "")
            budget_numbers = [float(x.replace(',', '.')) for x in re.findall(r"(\d+(?:[\.,]\d+)?)", budget_hint)]
            if budget_numbers and budget_numbers[0] * 1_000_000 <= max_price + 1_000_000:
                score += 1.5
                reasons.append("có vẻ vừa ngân sách")
        days = parsed.get("duration_days")
        if days:
            recommended = item.get("recommended_duration", "")
            duration_numbers = [int(x) for x in re.findall(r"(\d+)", recommended)]
            if duration_numbers and min(duration_numbers) <= days <= max(duration_numbers):
                score += 1.2
                reasons.append("khớp thời lượng đi")
        ranked.append({
            "destination": item["destination"],
            "score": round(score, 2),
            "summary": item["summary"],
            "budget_hint": item.get("budget_hint"),
            "recommended_duration": item.get("recommended_duration"),
            "best_for": item.get("best_for", []),
            "reasons": reasons,
        })

    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked[:3]


def build_chat_answer(question: str) -> tuple[str, list[str], list[dict[str, Any]]]:
    normalized = strip_text(question)
    detected = detect_destination(question)
    parsed = {
        "destination": detected["destination"] if detected else None,
        "theme": detect_theme(normalized),
        "max_price": parse_money(normalized),
        "duration_days": parse_days(normalized),
        "party_size": parse_people(normalized),
        "tourType": detect_tour_type(normalized),
        "hotelStars": parse_hotel_stars(normalized),
        "minRating": None,
    }
    ranking = rank_destinations(parsed)

    if detected:
        item = detected
        answer = (
            f"Nếu bạn đang nghiêng về {item['destination']}, đây là điểm đến hợp với {', '.join(item.get('best_for', [])[:3])}. "
            f"Thời lượng đẹp thường là {item.get('recommended_duration', '2-4 ngày')}, và mức ngân sách tham khảo là {item.get('budget_hint', 'tuỳ hạng tour')}. "
            f"{item['summary']} Bạn có thể lọc thêm theo số ngày, mức giá và loại tour để chốt nhanh hơn."
        )
        grounding = ["destination_catalog", "travel_consulting", "tour_filtering"]
        return answer, grounding, ranking

    if ranking and ranking[0]["score"] > 0:
        lead = ranking[0]
        alternatives = ", ".join(item["destination"] for item in ranking[1:3])
        reason_text = ", ".join(lead["reasons"]) if lead["reasons"] else "mức phù hợp tổng thể tốt"
        answer = (
            f"Dựa trên nhu cầu bạn vừa hỏi, mình ưu tiên {lead['destination']} vì {reason_text}. "
            f"Gợi ý phụ thêm: {alternatives or 'hãy thử mở rộng thêm ngân sách hoặc thời lượng'}. "
            f"Bạn cũng có thể nói rõ hơn kiểu như ‘đi biển 4 ngày dưới 6 triệu cho gia đình’ để hệ thống lọc sát hơn nữa."
        )
        grounding = ["destination_catalog", "smart_travel_ranking", "voice_parser"]
        return answer, grounding, ranking

    answer = (
        "Mình có thể tư vấn theo điểm đến, ngân sách, số ngày, loại tour, khách sạn, nhóm đi và cả ảnh/giọng nói. "
        "Bạn thử nhắn theo mẫu như: ‘đi biển 3 ngày dưới 6 triệu cho 2 người’, hoặc ‘muốn tour núi có khách sạn 4 sao’."
    )
    grounding = ["travel_consulting", "voice_parser"]
    return answer, grounding, ranking


@router.get("/vision-status", response_model=VisionStatusResponse)
def vision_status(load: bool = False):
    if load:
        vision_search_service.ensure_loaded()
    return vision_search_service.status_snapshot()


@router.post("/voice-search")
def voice_search(payload: VoiceSearchRequest):
    text = clean_transcript(payload.text)
    normalized = strip_text(text)
    detected = detect_destination(text)

    max_price = parse_money(normalized)
    days = parse_days(normalized)
    people = parse_people(normalized)
    theme = detect_theme(normalized)
    tour_type = detect_tour_type(normalized)
    hotel_stars = parse_hotel_stars(normalized)

    destination_name = detected["destination"] if detected else None
    suggestions = rank_destinations(
        {
            "destination": destination_name,
            "duration_days": days,
            "max_price": max_price,
            "party_size": people,
            "theme": theme,
            "tourType": tour_type,
            "hotelStars": hotel_stars,
            "minRating": None,
        }
    )

    summary_parts = [
        f"điểm đến {destination_name or 'chưa rõ'}",
        f"thời lượng {days or 'chưa rõ'} ngày",
        f"ngân sách {max_price or 'chưa rõ'}",
        f"số người {people or 'chưa rõ'}",
    ]
    if theme:
        summary_parts.append(f"chủ đề {theme}")
    if tour_type:
        summary_parts.append(f"loại tour {tour_type}")
    if hotel_stars:
        summary_parts.append(f"khách sạn {hotel_stars} sao")

    return {
        "original_text": payload.text,
        "parsed_query": {
            "destination": destination_name,
            "duration_days": days,
            "max_price": max_price,
            "party_size": people,
            "theme": theme,
            "tourType": tour_type,
            "hotelStars": hotel_stars,
            "minRating": None,
        },
        "suggestions": suggestions,
        "summary": "Đã phân tích giọng nói: " + ", ".join(summary_parts) + ".",
        "message": "Voice query parsed successfully.",
    }


@router.post("/image-search")
def image_search(payload: ImageSearchRequest):
    detected = detect_destination(payload.image_name or "")
    if not detected:
        return {
            "image_name": payload.image_name,
            "detected": {"landmark": "Không nhận ra landmark rõ ràng", "destination": "", "confidence": 0.0},
            "summary": "Endpoint text-only này chỉ dùng tên ảnh để gợi ý nhanh. Để chạy model vision thật, frontend sẽ gọi /image-search-upload với file ảnh.",
            "message": "Image-based destination hint generated.",
            "fallback": True,
        }

    first_landmark = detected["landmarks"][0]["label"]
    return {
        "image_name": payload.image_name,
        "detected": {"landmark": first_landmark, "destination": detected["destination"], "confidence": 0.42},
        "summary": detected["summary"],
        "message": "Image-based destination hint generated.",
        "fallback": True,
    }


@router.post("/image-search-upload")
async def image_search_upload(
    file: UploadFile = File(...),
    top_k: int = Query(5, ge=1, le=10, description="Số điểm đến gần nhất cần trả về"),
    text_query: str | None = Query(None, description="Nhu cầu đi kèm ảnh, ví dụ: đi biển 3 ngày, nghỉ dưỡng"),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Thiếu tên file ảnh.")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file ảnh.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Ảnh tải lên đang rỗng.")
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"Ảnh vượt quá {MAX_UPLOAD_SIZE_MB}MB.")

    try:
        return vision_search_service.detect_from_image_bytes(
            content,
            filename=file.filename,
            top_k=top_k,
            text_query=text_query,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/chat")
def chat(payload: ChatRequest):
    answer, grounding, suggestions = build_chat_answer(payload.question)
    return {
        "question": payload.question,
        "answer": answer,
        "grounding": grounding,
        "suggestions": suggestions,
    }
