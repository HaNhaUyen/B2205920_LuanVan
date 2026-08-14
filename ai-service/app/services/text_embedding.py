from __future__ import annotations

import os
from threading import Lock
from typing import Iterable, List

try:
    import torch
except Exception:  # pragma: no cover
    torch = None

from sentence_transformers import SentenceTransformer


DEFAULT_MODEL_NAME = os.getenv(
    "TEXT_EMBEDDING_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)

# Model này hỗ trợ tiếng Việt tốt, nhẹ hơn các model lớn, phù hợp chạy demo laptop.
# Nếu máy yếu, lần đầu tải model sẽ hơi lâu. Sau đó model được cache ở ~/.cache.
DEFAULT_BATCH_SIZE = int(os.getenv("TEXT_EMBEDDING_BATCH_SIZE", "32"))


_TEXT_MODEL: SentenceTransformer | None = None
_TEXT_MODEL_LOCK = Lock()


def get_text_model() -> SentenceTransformer:
    global _TEXT_MODEL

    if _TEXT_MODEL is not None:
        return _TEXT_MODEL

    # FastAPI chạy endpoint sync trong threadpool. Ở lần gọi đầu tiên,
    # nhiều request có thể cùng vào đây trước khi model được cache xong.
    # Khóa phần khởi tạo để SentenceTransformer chỉ được load đúng một lần,
    # tránh tình trạng một model còn ở meta tensor nhưng đã bị .to(device).
    with _TEXT_MODEL_LOCK:
        if _TEXT_MODEL is not None:
            return _TEXT_MODEL

        if torch is not None and torch.cuda.is_available():
            device = "cuda"
        else:
            device = "cpu"

        _TEXT_MODEL = SentenceTransformer(
            DEFAULT_MODEL_NAME,
            device=device,
        )
        return _TEXT_MODEL


def embed_texts(texts: Iterable[str]) -> List[List[float]]:
    clean_texts = [str(text or "").strip() for text in texts]
    if not clean_texts:
        return []

    model = get_text_model()
    vectors = model.encode(
        clean_texts,
        batch_size=DEFAULT_BATCH_SIZE,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    return [[float(value) for value in row] for row in vectors]


def status_snapshot() -> dict:
    model_loaded = get_text_model()
    return {
        "status": "ok",
        "model": DEFAULT_MODEL_NAME,
        "dimension": int(model_loaded.get_sentence_embedding_dimension()),
        "device": str(model_loaded.device),
    }
