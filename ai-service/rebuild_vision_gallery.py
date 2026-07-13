# ai-service/rebuild_vision_gallery.py
from __future__ import annotations

from app.services.vision_search import reload_vision_gallery


if __name__ == "__main__":
    status = reload_vision_gallery(force_rebuild_cache=True)

    print("Vision gallery reloaded")
    for key, value in status.items():
        print(f"{key}: {value}")