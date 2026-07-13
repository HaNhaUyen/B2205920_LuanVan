# ai-service/app/services/vision_search.py
from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import time
import unicodedata
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import torch
import torch.nn.functional as F
from PIL import Image, ImageOps

try:
    from transformers import CLIPModel, CLIPProcessor
except Exception:  # pragma: no cover
    CLIPModel = None
    CLIPProcessor = None


# ============================================================
# CONFIG
# ============================================================

AI_SERVICE_ROOT = Path(__file__).resolve().parents[2]
DATASET_DIR = AI_SERVICE_ROOT / "dataset"
MANIFEST_FILE = AI_SERVICE_ROOT / "image_manifest.csv"
DESTINATIONS_FILE = AI_SERVICE_ROOT / "destinations.json"

CACHE_DIR = AI_SERVICE_ROOT / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

CACHE_FILE = CACHE_DIR / "clip_gallery_cache_v4.pt"

MODEL_NAME = os.getenv("VISION_CLIP_MODEL", "openai/clip-vit-base-patch32")
DEVICE = "cuda" if torch.cuda.is_available() and os.getenv("VISION_FORCE_CPU", "0") != "1" else "cpu"

VALID_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".jfif"}

CACHE_VERSION = "travela-vision-v4-image-text-prototype-rerank"

# Ngưỡng này nên điều chỉnh theo dữ liệu thật.
MIN_RAW_SCORE = float(os.getenv("VISION_MIN_RAW_SCORE", "0.22"))
MIN_CONFIDENCE = float(os.getenv("VISION_MIN_CONFIDENCE", "0.32"))
MIN_TOP_GAP = float(os.getenv("VISION_MIN_TOP_GAP", "0.012"))

MAX_EVIDENCE_PER_DESTINATION = int(os.getenv("VISION_MAX_EVIDENCE_PER_DESTINATION", "6"))

# Bật multi-view query giúp ảnh upload lệch/crop vẫn tìm tốt hơn, đổi lại chậm hơn một chút.
ENABLE_QUERY_MULTIVIEW = os.getenv("VISION_QUERY_MULTIVIEW", "1") == "1"

# Bật text rerank: so ảnh query với prompt tiếng Việt/Anh của từng điểm đến.
ENABLE_TEXT_RERANK = os.getenv("VISION_TEXT_RERANK", "1") == "1"

# Bật prototype rerank: so ảnh query với vector trung bình của từng điểm đến.
ENABLE_PROTOTYPE_RERANK = os.getenv("VISION_PROTOTYPE_RERANK", "1") == "1"


# ============================================================
# SCENE TAGS
# ============================================================

SCENE_PROMPTS = {
    "beach": [
        "a travel photo of a beautiful beach",
        "biển xanh, bãi cát, du lịch biển Việt Nam",
    ],
    "island": [
        "a travel photo of a tropical island",
        "đảo du lịch, biển đảo, phong cảnh đảo Việt Nam",
    ],
    "mountain": [
        "a travel photo of mountains and valleys",
        "núi non, đèo, thung lũng, phong cảnh miền núi Việt Nam",
    ],
    "forest": [
        "a travel photo of forest, pine trees, tea hills or green nature",
        "rừng cây, đồi thông, đồi chè, thiên nhiên xanh",
    ],
    "river": [
        "a travel photo of river, boat, floating market or waterway",
        "sông nước, thuyền, chợ nổi, miền Tây Việt Nam",
    ],
    "city": [
        "a travel photo of a city, bridge, street or modern urban landmark",
        "thành phố, cây cầu, đường phố, công trình hiện đại",
    ],
    "heritage": [
        "a travel photo of ancient town, imperial city, temple or heritage site",
        "phố cổ, cố đô, đền chùa, di sản văn hóa Việt Nam",
    ],
    "cave": [
        "a travel photo of cave, limestone mountains and boat tour",
        "hang động, núi đá vôi, Tràng An, Hạ Long, Ninh Bình",
    ],
    "sand_dune": [
        "a travel photo of sand dunes, desert like landscape and sunshine",
        "đồi cát, cồn cát, Mũi Né, Bàu Trắng",
    ],
    "waterfall": [
        "a travel photo of waterfall and highland nature",
        "thác nước, núi rừng, Tây Nguyên",
    ],
}

DESTINATION_TAG_RULES = {
    "phu-quoc": ["beach", "island"],
    "nha-trang": ["beach", "island", "city"],
    "con-dao": ["beach", "island", "heritage"],
    "vung-tau": ["beach", "city"],
    "mui-ne": ["beach", "sand_dune"],
    "quy-nhon": ["beach", "island", "heritage"],
    "ha-long": ["beach", "island", "cave"],
    "da-lat": ["mountain", "forest", "city"],
    "sa-pa": ["mountain", "forest"],
    "ha-giang": ["mountain"],
    "moc-chau": ["mountain", "forest"],
    "buon-ma-thuot": ["waterfall", "forest"],
    "ninh-binh": ["cave", "river", "heritage"],
    "hoi-an": ["heritage", "river", "city"],
    "hue": ["heritage", "river", "city"],
    "da-nang": ["beach", "city", "mountain"],
    "can-tho": ["river", "city"],
    "ca-mau": ["river", "forest"],
    "an-giang": ["river", "mountain", "forest", "heritage"],
    "tay-ninh": ["mountain", "heritage"],
}


# ============================================================
# UTILS
# ============================================================

def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        value = float(value)
        if math.isnan(value) or math.isinf(value):
            return default
        return value
    except Exception:
        return default


def _remove_accents(text: str) -> str:
    text = str(text or "").strip().lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return text


def normalize_slug(text: str) -> str:
    text = _remove_accents(text)
    text = text.replace("_", "-").replace(" ", "-")
    keep = []
    for ch in text:
        if ch.isalnum() or ch == "-":
            keep.append(ch)
    slug = "".join(keep)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


def _public_image_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(AI_SERVICE_ROOT.resolve())).replace("\\", "/")
    except Exception:
        return str(path).replace("\\", "/")


def _resolve_image_path(value: str) -> Optional[Path]:
    if not value:
        return None

    raw = str(value).strip().replace("\\", "/")

    candidates = [
        AI_SERVICE_ROOT / raw,
        DATASET_DIR / raw,
        Path(raw),
    ]

    for p in candidates:
        if p.exists():
            return p

    return None


def _is_valid_image(path: Path) -> bool:
    if not path.is_file():
        return False
    if path.suffix.lower() not in VALID_IMAGE_EXTS:
        return False

    try:
        with Image.open(path) as img:
            img.verify()
        return True
    except Exception:
        return False


def _sha1_for_files(paths: Iterable[Path]) -> str:
    h = hashlib.sha1()
    for p in sorted(paths, key=lambda x: str(x).lower()):
        try:
            stat = p.stat()
            h.update(str(p.resolve()).encode("utf-8", errors="ignore"))
            h.update(str(stat.st_mtime_ns).encode("utf-8"))
            h.update(str(stat.st_size).encode("utf-8"))
        except Exception:
            continue
    return h.hexdigest()


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _mean_pool(vectors: List[torch.Tensor]) -> Optional[torch.Tensor]:
    if not vectors:
        return None
    x = torch.stack(vectors).float()
    x = F.normalize(x, dim=-1)
    return F.normalize(x.mean(dim=0), dim=-1)


def _resize_for_crop(image: Image.Image, size: int = 256) -> Image.Image:
    image = image.convert("RGB")
    return ImageOps.fit(image, (size, size), method=Image.Resampling.BICUBIC, centering=(0.5, 0.5))


def _make_query_views(image: Image.Image) -> List[Image.Image]:
    """
    Tạo nhiều view cho ảnh upload.
    Mục tiêu: ảnh user crop lệch/zoom gần vẫn có embedding ổn hơn.
    """
    image = image.convert("RGB")

    if not ENABLE_QUERY_MULTIVIEW:
        return [image]

    w, h = image.size
    views = [image]

    # Center square crop
    side = min(w, h)
    left = max(0, (w - side) // 2)
    top = max(0, (h - side) // 2)
    views.append(image.crop((left, top, left + side, top + side)))

    # 80% center crop
    side80 = int(side * 0.82)
    left80 = max(0, (w - side80) // 2)
    top80 = max(0, (h - side80) // 2)
    views.append(image.crop((left80, top80, left80 + side80, top80 + side80)))

    # Nếu ảnh ngang, crop trái/phải nhẹ để bắt landmark lệch
    if w > h * 1.25:
        crop_w = int(w * 0.72)
        views.append(image.crop((0, 0, crop_w, h)))
        views.append(image.crop((w - crop_w, 0, w, h)))

    # Nếu ảnh dọc, crop trên/dưới nhẹ
    if h > w * 1.25:
        crop_h = int(h * 0.72)
        views.append(image.crop((0, 0, w, crop_h)))
        views.append(image.crop((0, h - crop_h, w, h)))

    return views


# ============================================================
# DATA STRUCTURES
# ============================================================

@dataclass
class GalleryImage:
    image_id: str
    image_path: str
    public_path: str
    destination_slug: str
    destination_name: str
    province: Optional[str] = None
    filename: Optional[str] = None
    source: str = "folder"
    caption: Optional[str] = None


@dataclass
class VisionStatus:
    engine: str
    model: str
    device: str
    status: str
    destination_count: int
    gallery_image_count: int
    manifest_file: str
    destinations_file: str
    dataset_dir: str
    cache_file: str
    cache_used: bool
    cache_version: str
    dataset_fingerprint: Optional[str] = None
    has_text_embeddings: bool = False
    has_destination_prototypes: bool = False
    error: Optional[str] = None


# ============================================================
# ENGINE
# ============================================================

class VisionSearchEngine:
    def __init__(self) -> None:
        self.model_name = MODEL_NAME
        self.device = DEVICE

        self.model = None
        self.processor = None

        self.gallery_images: List[GalleryImage] = []
        self.gallery_embeddings: Optional[torch.Tensor] = None

        self.destinations: Dict[str, Dict[str, Any]] = {}
        self.destination_prototypes: Dict[str, torch.Tensor] = {}
        self.destination_text_embeddings: Dict[str, torch.Tensor] = {}
        self.scene_text_embeddings: Dict[str, torch.Tensor] = {}

        self.cache_used = False
        self.loaded = False
        self.error: Optional[str] = None
        self.dataset_fingerprint: Optional[str] = None

    # ------------------------------------------------------------
    # Model
    # ------------------------------------------------------------

    def _load_model(self) -> None:
        if self.model is not None and self.processor is not None:
            return

        if CLIPModel is None or CLIPProcessor is None:
            raise RuntimeError("Thiếu transformers hoặc torch. Hãy cài: pip install transformers torch pillow")

        self.processor = CLIPProcessor.from_pretrained(self.model_name)
        self.model = CLIPModel.from_pretrained(self.model_name)
        self.model.to(self.device)
        self.model.eval()

    @torch.no_grad()
    def encode_pil_image(self, image: Image.Image) -> torch.Tensor:
        self._load_model()

        image = image.convert("RGB")
        inputs = self.processor(images=image, return_tensors="pt")
        pixel_values = inputs["pixel_values"].to(self.device)

        # Cách lấy image feature ổn định giữa các version transformers.
        vision_outputs = self.model.vision_model(pixel_values=pixel_values)
        pooled_output = vision_outputs.pooler_output
        image_features = self.model.visual_projection(pooled_output)
        image_features = F.normalize(image_features, dim=-1)

        return image_features.squeeze(0).detach().cpu()

    @torch.no_grad()
    def encode_query_image(self, image: Image.Image) -> torch.Tensor:
        views = _make_query_views(image)
        vectors = []

        for view in views:
            try:
                vectors.append(self.encode_pil_image(view))
            except Exception:
                continue

        if not vectors:
            raise RuntimeError("Không encode được ảnh truy vấn.")

        query = _mean_pool(vectors)
        if query is None:
            raise RuntimeError("Không tạo được vector ảnh truy vấn.")

        return query.float()

    @torch.no_grad()
    def encode_texts(self, texts: List[str]) -> torch.Tensor:
        self._load_model()

        clean_texts = [str(t).strip() for t in texts if str(t).strip()]
        if not clean_texts:
            clean_texts = ["a travel photo"]

        inputs = self.processor(text=clean_texts, return_tensors="pt", padding=True, truncation=True)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        text_features = self.model.get_text_features(**inputs)
        text_features = F.normalize(text_features, dim=-1)

        return text_features.detach().cpu()

    def encode_image_file(self, image_path: Path) -> torch.Tensor:
        with Image.open(image_path) as img:
            return self.encode_pil_image(img.convert("RGB"))

    # ------------------------------------------------------------
    # Destination metadata
    # ------------------------------------------------------------

    def _load_destinations(self) -> Dict[str, Dict[str, Any]]:
        raw = _load_json(DESTINATIONS_FILE)
        result: Dict[str, Dict[str, Any]] = {}

        for key, item in raw.items():
            if not isinstance(item, dict):
                continue

            slug = normalize_slug(item.get("datasetFolder") or item.get("slug") or key)
            tags = item.get("scene_tags") or item.get("sceneTags") or DESTINATION_TAG_RULES.get(slug, [])

            result[slug] = {
                **item,
                "slug": slug,
                "name": item.get("name") or slug.replace("-", " ").title(),
                "province": item.get("province"),
                "datasetFolder": item.get("datasetFolder") or slug,
                "aliases": item.get("aliases") or [],
                "scene_tags": tags,
            }

        # Nếu destinations.json thiếu destination nào nhưng folder có, vẫn tạo metadata.
        if DATASET_DIR.exists():
            for folder in DATASET_DIR.iterdir():
                if folder.is_dir():
                    slug = normalize_slug(folder.name)
                    if slug not in result:
                        result[slug] = {
                            "slug": slug,
                            "name": slug.replace("-", " ").title(),
                            "province": None,
                            "datasetFolder": slug,
                            "aliases": [],
                            "scene_tags": DESTINATION_TAG_RULES.get(slug, []),
                        }

        return result

    def _destination_prompts(self, slug: str, meta: Dict[str, Any]) -> List[str]:
        name = meta.get("name") or slug.replace("-", " ").title()
        province = meta.get("province") or ""
        aliases = meta.get("aliases") or []
        tags = meta.get("scene_tags") or DESTINATION_TAG_RULES.get(slug, [])

        prompts = [
            f"a travel photo of {name}, Vietnam",
            f"tourist destination {name} in Vietnam",
            f"ảnh du lịch {name}",
            f"địa điểm du lịch {name}",
        ]

        if province:
            prompts.extend([
                f"a travel photo of {name}, {province}, Vietnam",
                f"ảnh du lịch {name}, {province}",
            ])

        for alias in aliases[:6]:
            prompts.append(f"a travel photo of {alias}")
            prompts.append(f"ảnh du lịch {alias}")

        for tag in tags:
            for scene_prompt in SCENE_PROMPTS.get(tag, [])[:1]:
                prompts.append(f"{scene_prompt}, {name}")

        return list(dict.fromkeys([p for p in prompts if p]))

    # ------------------------------------------------------------
    # Gallery scan
    # ------------------------------------------------------------

    def _scan_manifest(self, destinations: Dict[str, Dict[str, Any]]) -> List[GalleryImage]:
        items: List[GalleryImage] = []

        if not MANIFEST_FILE.exists():
            return items

        try:
            with open(MANIFEST_FILE, "r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)

                for row in reader:
                    path_value = (
                        row.get("path")
                        or row.get("relative_path")
                        or row.get("image_path")
                        or row.get("file_path")
                    )

                    img_path = _resolve_image_path(path_value or "")
                    if not img_path or not _is_valid_image(img_path):
                        continue

                    slug = normalize_slug(row.get("destination_slug") or row.get("label") or img_path.parent.name)
                    meta = destinations.get(slug, {})

                    image_id = hashlib.sha1(str(img_path.resolve()).encode("utf-8")).hexdigest()

                    items.append(
                        GalleryImage(
                            image_id=image_id,
                            image_path=str(img_path.resolve()),
                            public_path=_public_image_path(img_path),
                            destination_slug=slug,
                            destination_name=row.get("destination_name") or meta.get("name") or slug,
                            province=row.get("province") or meta.get("province"),
                            filename=row.get("filename") or img_path.name,
                            source="manifest",
                            caption=row.get("caption") or row.get("description"),
                        )
                    )
        except Exception as exc:
            print("[VisionSearch] Cannot read manifest:", exc)

        return items

    def _scan_dataset_folder(self, destinations: Dict[str, Dict[str, Any]]) -> List[GalleryImage]:
        items: List[GalleryImage] = []

        if not DATASET_DIR.exists():
            return items

        for img_path in sorted(DATASET_DIR.rglob("*")):
            if not _is_valid_image(img_path):
                continue

            try:
                rel = img_path.resolve().relative_to(DATASET_DIR.resolve())
                folder = rel.parts[0] if len(rel.parts) > 1 else img_path.parent.name
            except Exception:
                folder = img_path.parent.name

            slug = normalize_slug(folder)
            meta = destinations.get(slug, {})

            image_id = hashlib.sha1(str(img_path.resolve()).encode("utf-8")).hexdigest()

            items.append(
                GalleryImage(
                    image_id=image_id,
                    image_path=str(img_path.resolve()),
                    public_path=_public_image_path(img_path),
                    destination_slug=slug,
                    destination_name=meta.get("name") or slug.replace("-", " ").title(),
                    province=meta.get("province"),
                    filename=img_path.name,
                    source="folder",
                    caption=None,
                )
            )

        return items

    def _build_gallery_index(self) -> List[GalleryImage]:
        destinations = self._load_destinations()
        self.destinations = destinations

        manifest_items = self._scan_manifest(destinations)
        folder_items = self._scan_dataset_folder(destinations)

        merged: Dict[str, GalleryImage] = {}

        for item in manifest_items:
            merged[item.image_id] = item

        for item in folder_items:
            if item.image_id not in merged:
                merged[item.image_id] = item

        items = list(merged.values())
        items.sort(key=lambda x: (x.destination_slug, x.filename or x.public_path))

        return items

    def _current_dataset_fingerprint(self, images: List[GalleryImage]) -> str:
        paths = [Path(item.image_path) for item in images]
        h = hashlib.sha1()
        h.update(CACHE_VERSION.encode("utf-8"))
        h.update(self.model_name.encode("utf-8"))
        h.update(str(ENABLE_QUERY_MULTIVIEW).encode("utf-8"))
        h.update(str(ENABLE_TEXT_RERANK).encode("utf-8"))
        h.update(str(ENABLE_PROTOTYPE_RERANK).encode("utf-8"))
        h.update(_sha1_for_files(paths).encode("utf-8"))

        if DESTINATIONS_FILE.exists():
            h.update(_sha1_for_files([DESTINATIONS_FILE]).encode("utf-8"))
        if MANIFEST_FILE.exists():
            h.update(_sha1_for_files([MANIFEST_FILE]).encode("utf-8"))

        return h.hexdigest()

    # ------------------------------------------------------------
    # Cache
    # ------------------------------------------------------------

    def _load_cache(self, fingerprint: str) -> bool:
        if not CACHE_FILE.exists():
            return False

        try:
            payload = torch.load(CACHE_FILE, map_location="cpu")

            if payload.get("cache_version") != CACHE_VERSION:
                return False
            if payload.get("model_name") != self.model_name:
                return False
            if payload.get("dataset_fingerprint") != fingerprint:
                return False

            images_data = payload.get("gallery_images") or []
            embeddings = payload.get("gallery_embeddings")

            if embeddings is None or not images_data:
                return False

            self.gallery_images = [GalleryImage(**item) for item in images_data]
            self.gallery_embeddings = F.normalize(embeddings.float(), dim=-1)

            raw_prototypes = payload.get("destination_prototypes") or {}
            self.destination_prototypes = {
                slug: F.normalize(vec.float(), dim=-1)
                for slug, vec in raw_prototypes.items()
            }

            raw_text = payload.get("destination_text_embeddings") or {}
            self.destination_text_embeddings = {
                slug: F.normalize(vec.float(), dim=-1)
                for slug, vec in raw_text.items()
            }

            raw_scene = payload.get("scene_text_embeddings") or {}
            self.scene_text_embeddings = {
                tag: F.normalize(vec.float(), dim=-1)
                for tag, vec in raw_scene.items()
            }

            self.dataset_fingerprint = fingerprint
            self.cache_used = True
            return True

        except Exception as exc:
            print("[VisionSearch] Cannot load cache:", exc)
            return False

    def _save_cache(self, fingerprint: str) -> None:
        if self.gallery_embeddings is None:
            return

        try:
            payload = {
                "cache_version": CACHE_VERSION,
                "model_name": self.model_name,
                "dataset_fingerprint": fingerprint,
                "created_at": time.time(),
                "gallery_images": [asdict(item) for item in self.gallery_images],
                "gallery_embeddings": self.gallery_embeddings.cpu(),
                "destination_prototypes": {
                    slug: vec.cpu()
                    for slug, vec in self.destination_prototypes.items()
                },
                "destination_text_embeddings": {
                    slug: vec.cpu()
                    for slug, vec in self.destination_text_embeddings.items()
                },
                "scene_text_embeddings": {
                    tag: vec.cpu()
                    for tag, vec in self.scene_text_embeddings.items()
                },
            }
            torch.save(payload, CACHE_FILE)
        except Exception as exc:
            print("[VisionSearch] Cannot save cache:", exc)

    # ------------------------------------------------------------
    # Build extra rerank data
    # ------------------------------------------------------------

    def _build_destination_prototypes(self) -> None:
        self.destination_prototypes = {}

        if self.gallery_embeddings is None:
            return

        by_slug: Dict[str, List[torch.Tensor]] = {}

        for idx, item in enumerate(self.gallery_images):
            by_slug.setdefault(item.destination_slug, []).append(self.gallery_embeddings[idx])

        for slug, vectors in by_slug.items():
            proto = _mean_pool(vectors)
            if proto is not None:
                self.destination_prototypes[slug] = proto.float()

    def _build_destination_text_embeddings(self) -> None:
        self.destination_text_embeddings = {}

        if not ENABLE_TEXT_RERANK:
            return

        self._load_model()

        for slug, meta in self.destinations.items():
            prompts = self._destination_prompts(slug, meta)
            try:
                text_vectors = self.encode_texts(prompts)
                proto = _mean_pool([v for v in text_vectors])
                if proto is not None:
                    self.destination_text_embeddings[slug] = proto.float()
            except Exception as exc:
                print(f"[VisionSearch] Cannot encode text prompts for {slug}: {exc}")

    def _build_scene_text_embeddings(self) -> None:
        self.scene_text_embeddings = {}

        if not ENABLE_TEXT_RERANK:
            return

        for tag, prompts in SCENE_PROMPTS.items():
            try:
                text_vectors = self.encode_texts(prompts)
                proto = _mean_pool([v for v in text_vectors])
                if proto is not None:
                    self.scene_text_embeddings[tag] = proto.float()
            except Exception:
                continue

    # ------------------------------------------------------------
    # Load / reload
    # ------------------------------------------------------------

    def load(self, force_rebuild_cache: bool = False) -> VisionStatus:
        try:
            self.error = None
            self.cache_used = False

            gallery_items = self._build_gallery_index()
            fingerprint = self._current_dataset_fingerprint(gallery_items)
            self.dataset_fingerprint = fingerprint

            if not force_rebuild_cache and self._load_cache(fingerprint):
                self.loaded = True
                return self.status()

            self._load_model()

            if not gallery_items:
                raise RuntimeError(f"Không tìm thấy ảnh trong dataset: {DATASET_DIR}")

            embeddings: List[torch.Tensor] = []
            valid_images: List[GalleryImage] = []

            for item in gallery_items:
                try:
                    emb = self.encode_image_file(Path(item.image_path))
                    embeddings.append(emb.cpu())
                    valid_images.append(item)
                except Exception as exc:
                    print(f"[VisionSearch] Skip invalid image {item.image_path}: {exc}")

            if not embeddings:
                raise RuntimeError("Không encode được ảnh nào trong gallery.")

            self.gallery_images = valid_images
            self.gallery_embeddings = F.normalize(torch.stack(embeddings).float(), dim=-1)

            self._build_destination_prototypes()
            self._build_destination_text_embeddings()
            self._build_scene_text_embeddings()

            self._save_cache(fingerprint)

            self.loaded = True
            return self.status()

        except Exception as exc:
            self.error = str(exc)
            self.loaded = False
            return self.status()

    def reload(self, force_rebuild_cache: bool = True) -> VisionStatus:
        self.loaded = False
        self.gallery_images = []
        self.gallery_embeddings = None
        self.destination_prototypes = {}
        self.destination_text_embeddings = {}
        self.scene_text_embeddings = {}
        self.cache_used = False

        if force_rebuild_cache and CACHE_FILE.exists():
            try:
                CACHE_FILE.unlink()
            except Exception:
                pass

        return self.load(force_rebuild_cache=force_rebuild_cache)

    def _ensure_loaded(self) -> None:
        if not self.loaded or self.gallery_embeddings is None or not self.gallery_images:
            self.load(force_rebuild_cache=False)

        if not self.loaded or self.gallery_embeddings is None or not self.gallery_images:
            raise RuntimeError(self.error or "Vision gallery chưa sẵn sàng.")

    # ------------------------------------------------------------
    # Search
    # ------------------------------------------------------------

    def search_pil_image(self, image: Image.Image, top_k: int = 5) -> Dict[str, Any]:
        self._ensure_loaded()

        query = self.encode_query_image(image).float()
        query = F.normalize(query, dim=-1)

        scores = torch.matmul(self.gallery_embeddings, query)

        # Lấy nhiều ảnh raw hơn để ranking theo destination ổn định hơn.
        top_n = min(max(top_k * 12, 80), len(self.gallery_images))
        top_scores, top_indices = torch.topk(scores, k=top_n)

        raw_matches: List[Dict[str, Any]] = []
        for score, idx in zip(top_scores.tolist(), top_indices.tolist()):
            item = self.gallery_images[int(idx)]
            raw_matches.append(
                {
                    "score": float(score),
                    "image_id": item.image_id,
                    "image_path": item.public_path,
                    "filename": item.filename,
                    "destination_slug": item.destination_slug,
                    "destination_name": item.destination_name,
                    "province": item.province,
                    "source": item.source,
                    "caption": item.caption,
                }
            )

        scene_scores = self._detect_scene_scores(query)
        ranked = self._rank_destinations(raw_matches, query=query, scene_scores=scene_scores, top_k=top_k)

        detected = ranked[0] if ranked else None
        final_score = float(detected["score"]) if detected else 0.0
        confidence = float(detected["confidence"]) if detected else 0.0
        second_score = float(ranked[1]["score"]) if len(ranked) > 1 else 0.0
        top_gap = final_score - second_score

        low_confidence = (
            not detected
            or float(detected.get("best_image_score", 0.0)) < MIN_RAW_SCORE
            or confidence < MIN_CONFIDENCE
            or (len(ranked) > 1 and top_gap < MIN_TOP_GAP)
        )

        return {
            "engine": "clip_image_gallery_retrieval_v4",
            "model": self.model_name,
            "device": self.device,
            "fallback": False,
            "low_confidence": low_confidence,
            "message": (
                "Tìm thấy các điểm đến có hình ảnh tương đồng."
                if not low_confidence
                else "Ảnh chưa đủ rõ để xác định chắc chắn; dưới đây là các gợi ý gần giống nhất."
            ),
            "detected": detected,
            "top_matches": ranked,
            "raw_matches": raw_matches[: min(30, len(raw_matches))],
            "scene_scores": scene_scores[:5],
            "vision_status": asdict(self.status()),
        }

    def search_image_file(self, image_path: Path, top_k: int = 5) -> Dict[str, Any]:
        with Image.open(image_path) as img:
            return self.search_pil_image(img.convert("RGB"), top_k=top_k)

    def _detect_scene_scores(self, query: torch.Tensor) -> List[Dict[str, Any]]:
        if not self.scene_text_embeddings:
            return []

        rows = []
        for tag, vec in self.scene_text_embeddings.items():
            score = float(torch.dot(query, vec))
            rows.append({"tag": tag, "score": round(score, 4)})

        rows.sort(key=lambda x: x["score"], reverse=True)
        return rows

    def _scene_bonus_for_destination(self, slug: str, scene_scores: List[Dict[str, Any]]) -> float:
        meta = self.destinations.get(slug, {})
        tags = meta.get("scene_tags") or DESTINATION_TAG_RULES.get(slug, [])

        if not tags or not scene_scores:
            return 0.0

        score_map = {row["tag"]: float(row["score"]) for row in scene_scores}

        matched_scores = [score_map[tag] for tag in tags if tag in score_map]
        if not matched_scores:
            return 0.0

        # scene CLIP text score thường khoảng 0.18-0.35.
        best = max(matched_scores)
        return max(0.0, min(0.035, (best - 0.18) * 0.12))

    def _rank_destinations(
        self,
        raw_matches: List[Dict[str, Any]],
        query: torch.Tensor,
        scene_scores: List[Dict[str, Any]],
        top_k: int,
    ) -> List[Dict[str, Any]]:
        by_dest: Dict[str, Dict[str, Any]] = {}

        for match in raw_matches:
            slug = match["destination_slug"]
            score = _safe_float(match["score"])

            if slug not in by_dest:
                by_dest[slug] = {
                    "destination_slug": slug,
                    "destination_name": match.get("destination_name") or slug,
                    "province": match.get("province"),
                    "image_scores": [],
                    "evidence_images": [],
                }

            bucket = by_dest[slug]
            bucket["image_scores"].append(score)

            if len(bucket["evidence_images"]) < MAX_EVIDENCE_PER_DESTINATION:
                bucket["evidence_images"].append(
                    {
                        "image_path": match.get("image_path"),
                        "filename": match.get("filename"),
                        "score": round(score, 4),
                        "caption": match.get("caption"),
                    }
                )

        ranked: List[Dict[str, Any]] = []

        # Bổ sung destination chưa xuất hiện trong raw top nếu prototype/text rất mạnh.
        candidate_slugs = set(by_dest.keys())
        candidate_slugs.update(self.destination_prototypes.keys())
        candidate_slugs.update(self.destination_text_embeddings.keys())

        for slug in candidate_slugs:
            item = by_dest.get(
                slug,
                {
                    "destination_slug": slug,
                    "destination_name": self.destinations.get(slug, {}).get("name") or slug,
                    "province": self.destinations.get(slug, {}).get("province"),
                    "image_scores": [],
                    "evidence_images": [],
                },
            )

            image_scores = sorted(item["image_scores"], reverse=True)

            best_image = image_scores[0] if image_scores else 0.0
            top3_avg = sum(image_scores[:3]) / min(3, len(image_scores)) if image_scores else 0.0
            top5_avg = sum(image_scores[:5]) / min(5, len(image_scores)) if image_scores else 0.0
            hit_count = len(image_scores)

            prototype_score = 0.0
            if ENABLE_PROTOTYPE_RERANK and slug in self.destination_prototypes:
                prototype_score = float(torch.dot(query, self.destination_prototypes[slug]))

            text_score = 0.0
            if ENABLE_TEXT_RERANK and slug in self.destination_text_embeddings:
                text_score = float(torch.dot(query, self.destination_text_embeddings[slug]))

            hit_bonus = min(hit_count / 18.0, 1.0) * 0.035
            scene_bonus = self._scene_bonus_for_destination(slug, scene_scores)

            # Công thức ưu tiên image retrieval, text/prototype chỉ rerank nhẹ.
            final_score = (
                0.50 * best_image
                + 0.22 * top3_avg
                + 0.08 * top5_avg
                + 0.12 * prototype_score
                + 0.05 * text_score
                + hit_bonus
                + scene_bonus
            )

            # Nếu destination không xuất hiện trong raw top, chỉ cho vào nếu prototype/text khá mạnh.
            if hit_count == 0 and final_score < 0.25:
                continue

            confidence = max(0.0, min(1.0, (final_score - 0.17) / 0.36))

            ranked.append(
                {
                    "destination_slug": slug,
                    "destination_name": item["destination_name"],
                    "province": item.get("province"),
                    "score": round(float(final_score), 4),
                    "confidence": round(float(confidence), 4),
                    "confidence_percent": round(float(confidence) * 100, 1),
                    "best_image_score": round(float(best_image), 4),
                    "top3_avg_image_score": round(float(top3_avg), 4),
                    "prototype_score": round(float(prototype_score), 4),
                    "text_score": round(float(text_score), 4),
                    "scene_bonus": round(float(scene_bonus), 4),
                    "hit_count": hit_count,
                    "evidence_images": item["evidence_images"],
                    "matched_scene_tags": self.destinations.get(slug, {}).get("scene_tags")
                    or DESTINATION_TAG_RULES.get(slug, []),
                }
            )

        ranked.sort(key=lambda x: x["score"], reverse=True)
        return ranked[:top_k]

    # ------------------------------------------------------------
    # Status
    # ------------------------------------------------------------

    def status(self) -> VisionStatus:
        destination_count = len({img.destination_slug for img in self.gallery_images})
        gallery_count = len(self.gallery_images)

        status = "ready" if self.loaded and gallery_count > 0 and self.error is None else "not_ready"

        return VisionStatus(
            engine="clip_image_gallery_retrieval_v4",
            model=self.model_name,
            device=self.device,
            status=status,
            destination_count=destination_count,
            gallery_image_count=gallery_count,
            manifest_file=str(MANIFEST_FILE),
            destinations_file=str(DESTINATIONS_FILE),
            dataset_dir=str(DATASET_DIR),
            cache_file=str(CACHE_FILE),
            cache_used=self.cache_used,
            cache_version=CACHE_VERSION,
            dataset_fingerprint=self.dataset_fingerprint,
            has_text_embeddings=bool(self.destination_text_embeddings),
            has_destination_prototypes=bool(self.destination_prototypes),
            error=self.error,
        )


vision_search_engine = VisionSearchEngine()
vision_search_service = vision_search_engine


def get_vision_status(load: bool = False) -> Dict[str, Any]:
    if load:
        return asdict(vision_search_engine.load(force_rebuild_cache=False))
    return asdict(vision_search_engine.status())


def reload_vision_gallery(force_rebuild_cache: bool = True) -> Dict[str, Any]:
    return asdict(vision_search_engine.reload(force_rebuild_cache=force_rebuild_cache))


def search_similar_destinations_from_pil(image: Image.Image, top_k: int = 5) -> Dict[str, Any]:
    return vision_search_engine.search_pil_image(image, top_k=top_k)


def search_similar_destinations_from_file(image_path: Path, top_k: int = 5) -> Dict[str, Any]:
    return vision_search_engine.search_image_file(image_path, top_k=top_k)

