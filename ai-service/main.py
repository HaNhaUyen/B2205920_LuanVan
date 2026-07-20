from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.ai import router as ai_router
from app.routes.embeddings import router as embeddings_router
from app.services.vision_search import vision_search_service

app = FastAPI(title="TourAI Service", version="2.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router)
app.include_router(embeddings_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "vision": vision_search_service.status_snapshot(),
        "embedding_endpoint": "/embeddings/text",
        "image_search_endpoint": "/image-search-upload",
    }
