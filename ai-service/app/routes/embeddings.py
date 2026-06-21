from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.text_embedding import embed_texts, status_snapshot

router = APIRouter(prefix="/embeddings", tags=["embeddings"])


class TextEmbeddingRequest(BaseModel):
    texts: List[str] = Field(default_factory=list, description="Danh sách văn bản cần vector hóa")


class TextEmbeddingResponse(BaseModel):
    model: str
    dimension: int
    embeddings: List[List[float]]


@router.get("/status")
def embedding_status():
    return status_snapshot()


@router.post("/text", response_model=TextEmbeddingResponse)
def text_embedding(payload: TextEmbeddingRequest):
    texts = [text.strip() for text in payload.texts if text and text.strip()]
    if not texts:
        raise HTTPException(status_code=400, detail="texts không được rỗng")

    snapshot = status_snapshot()
    vectors = embed_texts(texts)

    return {
        "model": snapshot["model"],
        "dimension": snapshot["dimension"],
        "embeddings": vectors,
    }
