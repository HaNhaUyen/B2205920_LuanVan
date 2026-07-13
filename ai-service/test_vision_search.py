# ai-service/test_vision_search.py
from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image

from app.services.vision_search import reload_vision_gallery, search_similar_destinations_from_pil


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True, help="Đường dẫn ảnh cần test")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()

    if args.rebuild:
        print("Rebuild gallery...")
        print(reload_vision_gallery(force_rebuild_cache=True))

    image_path = Path(args.image)
    image = Image.open(image_path).convert("RGB")

    result = search_similar_destinations_from_pil(image, top_k=args.top_k)

    print("Engine:", result.get("engine"))
    print("Low confidence:", result.get("low_confidence"))
    print("Scene scores:", result.get("scene_scores"))

    print("\nTop matches:")
    for i, item in enumerate(result.get("top_matches", []), start=1):
        print(
            f"{i}. {item['destination_name']} "
            f"| score={item['score']} "
            f"| conf={item['confidence_percent']}% "
            f"| image={item['best_image_score']} "
            f"| proto={item['prototype_score']} "
            f"| text={item['text_score']} "
            f"| hits={item['hit_count']} "
            f"| scenes={item.get('matched_scene_tags')}"
        )
        for ev in item.get("evidence_images", [])[:3]:
            print(f"   - {ev['filename']} | {ev['score']} | {ev['image_path']}")


if __name__ == "__main__":
    main()
