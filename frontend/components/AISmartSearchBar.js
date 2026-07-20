import { useRef, useState } from "react";
import { aiFetch } from "@/lib/api";
import { useToast } from "@/components/ToastContext";
import { trackBehavior } from "@/lib/behavior";

const alias = {
  "phu quoc": "Phú Quốc",
  "phú quốc": "Phú Quốc",
  "nha trang": "Nha Trang",
  "da lat": "Đà Lạt",
  "đà lạt": "Đà Lạt",
  "da nang": "Đà Nẵng",
  "đà nẵng": "Đà Nẵng",
  "hoi an": "Hội An",
  "hội an": "Hội An",
  "quy nhon": "Quy Nhơn",
  "quy nhơn": "Quy Nhơn",
  "ha long": "Hạ Long",
  "hạ long": "Hạ Long",
  "can tho": "Cần Thơ",
  "cần thơ": "Cần Thơ",
  sapa: "Sa Pa",
  "sa pa": "Sa Pa",
  "tay ninh": "Tây Ninh",
  "tây ninh": "Tây Ninh",
  "nui ba den": "Tây Ninh",
  "núi bà đen": "Tây Ninh",
  "ba den": "Tây Ninh",
  "bà đen": "Tây Ninh",
  "an giang": "An Giang",
  "vung tau": "Vũng Tàu",
  "vũng tàu": "Vũng Tàu",
};

function strip(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findExactCatalogDestination(value = "", destinations = []) {
  const target = strip(value);

  if (!target) {
    return "";
  }

  const exact = destinations.find((item) => strip(item?.name) === target);

  return exact?.name || "";
}

function resolveExternalTheme(external = {}) {
  const tags = Array.isArray(external?.scene_tags)
    ? external.scene_tags.map((item) => strip(item)).filter(Boolean)
    : [];

  const evidence = Array.isArray(external?.visual_evidence)
    ? external.visual_evidence
        .map((item) => strip(item))
        .filter(Boolean)
        .join(" ")
    : "";

  const landmarkText = strip(
    [
      external?.landmark,
      external?.destination,
      external?.province,
      external?.country,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const fullText = strip(
    [landmarkText, external?.reason, ...tags, evidence]
      .filter(Boolean)
      .join(" "),
  );

  const containsAny = (text, values) =>
    values.some((value) => ` ${text} `.includes(` ${strip(value)} `));

  /*
   * Ưu tiên danh tính địa danh trước scene tags phụ.
   * Eiffel có sông Seine trong ảnh vẫn phải là kiến trúc đô thị.
   */

  if (
    containsAny(landmarkText, [
      "eiffel",
      "tháp eiffel",
      "paris",
      "tokyo tower",
      "skytree",
      "burj khalifa",
      "empire state",
      "landmark 81",
      "bitexco",
    ]) ||
    containsAny(tags.join(" "), [
      "city",
      "urban",
      "tower",
      "architecture",
      "modern architecture",
      "city landmark",
      "cityscape",
      "skyline",
    ]) ||
    containsAny(fullText, [
      "tháp",
      "tower",
      "kiến trúc",
      "architecture",
      "thành phố",
      "city",
      "cityscape",
      "skyline",
      "đô thị",
      "urban",
    ])
  ) {
    return {
      theme: "culture",
      label: "các tour thành phố, kiến trúc và văn hóa tương đồng",
      category: "urban_architecture",
    };
  }

  if (
    containsAny(landmarkText, [
      "giza",
      "pyramid",
      "kim tự tháp",
      "machu picchu",
      "angkor",
      "colosseum",
      "petra",
      "taj mahal",
      "acropolis",
    ]) ||
    containsAny(tags.join(" "), [
      "heritage",
      "temple",
      "pagoda",
      "ancient",
      "culture",
      "archaeology",
      "pyramid",
      "historical",
      "monument",
      "ruins",
    ]) ||
    containsAny(fullText, [
      "di sản",
      "văn hóa",
      "phố cổ",
      "đền",
      "chùa",
      "temple",
      "heritage",
      "ancient",
      "pyramid",
      "kim tự tháp",
      "khảo cổ",
      "archaeology",
      "monument",
      "di tích",
      "cổ đại",
      "lịch sử",
    ])
  ) {
    return {
      theme: "culture",
      label: "các tour văn hóa, di sản và kiến trúc tương đồng",
      category: "heritage",
    };
  }

  if (
    containsAny(landmarkText, [
      "fuji",
      "phú sĩ",
      "fansipan",
      "everest",
      "matterhorn",
      "mount fuji",
      "núi phú sĩ",
    ]) ||
    containsAny(tags.join(" "), [
      "mountain",
      "forest",
      "highland",
      "valley",
      "snow",
      "volcano",
      "trekking",
    ]) ||
    containsAny(fullText, [
      "núi",
      "mountain",
      "volcano",
      "snow",
      "cao nguyên",
      "thung lũng",
      "rừng",
      "trek",
      "fansipan",
      "phú sĩ",
      "fuji",
      "đỉnh núi",
    ])
  ) {
    return {
      theme: "mountain",
      label: "các tour núi và cao nguyên tương đồng",
      category: "mountain",
    };
  }

  if (
    containsAny(tags.join(" "), [
      "beach",
      "island",
      "sea",
      "ocean",
      "coast",
      "coastal",
    ]) ||
    containsAny(fullText, [
      "biển",
      "đảo",
      "beach",
      "island",
      "sea",
      "ocean",
      "coast",
      "ven biển",
      "cát trắng",
    ])
  ) {
    return {
      theme: "beach",
      label: "các tour biển và đảo tương đồng",
      category: "beach",
    };
  }

  if (
    containsAny(tags.join(" "), [
      "river",
      "lake",
      "waterway",
      "floating market",
      "wetland",
    ]) ||
    containsAny(fullText, [
      "sông",
      "hồ",
      "river",
      "lake",
      "waterway",
      "chợ nổi",
      "kênh rạch",
      "miền tây",
    ])
  ) {
    return {
      theme: "nature",
      label: "các tour thiên nhiên và sông nước tương đồng",
      category: "river_nature",
    };
  }

  return {
    theme: null,
    label: "các tour có cảnh quan và trải nghiệm tương đồng",
    category: "general",
  };
}

function filterCatalogMatches(matches = [], destinations = []) {
  const result = [];
  const used = new Set();

  for (const match of matches) {
    const rawName =
      match?.destination ||
      match?.destination_name ||
      match?.name ||
      match?.label ||
      "";

    const catalogName = findExactCatalogDestination(rawName, destinations);

    if (!catalogName) {
      continue;
    }

    const key = strip(catalogName);

    if (used.has(key)) {
      continue;
    }

    used.add(key);

    result.push({
      ...match,
      destination: catalogName,
      destination_name: catalogName,
    });
  }

  return result;
}

function normalizeDestination(value = "", destinations = []) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const mapped = alias[raw.toLowerCase()] || alias[strip(raw)] || raw;
  const exact = destinations.find((d) => strip(d.name) === strip(mapped));
  if (exact) return exact.name;
  const fuzzy = destinations.find(
    (d) =>
      strip(mapped).includes(strip(d.name)) ||
      strip(d.name).includes(strip(mapped)),
  );
  return fuzzy?.name || mapped;
}

function localParse(text = "", destinations = []) {
  const s = strip(text);
  const destination =
    destinations.find((d) => s.includes(strip(d.name)))?.name ||
    Object.entries(alias).find(([k]) => s.includes(strip(k)))?.[1] ||
    "";
  const priceMatch = s.match(
    /(?:duoi|toi da|khong qua|max)\s*(\d+(?:[.,]\d+)?)\s*(tr|trieu|m|cu)/,
  );
  const maxPrice = priceMatch
    ? Math.round(Number(priceMatch[1].replace(",", ".")) * 1000000)
    : null;
  const dayMatch = s.match(/(\d+)\s*ngay/);
  let theme = null;
  if (/bien|dao|nghi duong/.test(s)) theme = "beach";
  else if (/nui|sapa|san may|trek/.test(s)) theme = "mountain";
  else if (/van hoa|pho co|di tich/.test(s)) theme = "culture";
  else if (/gia dinh|tre em/.test(s)) theme = "family";
  return {
    search: text,
    destination: normalizeDestination(destination, destinations) || null,
    maxPrice,
    durationMax: dayMatch ? Number(dayMatch[1]) : null,
    theme,
  };
}

function destinationFromFilename(filename = "", destinations = []) {
  const s = strip(filename.replace(/[_-]/g, " "));
  const found = Object.entries(alias).find(([key]) => s.includes(strip(key)));
  if (found) return normalizeDestination(found[1], destinations);
  return destinations.find((d) => s.includes(strip(d.name)))?.name || "";
}

function buildImageDestinationQuery(
  topMatches = [],
  detectedDestination = "",
  destinations = [],
) {
  const byDestination = new Map();

  const pushDestination = (
    value,
    confidence = 0,
    raw = {},
    sourceIndex = 999,
  ) => {
    const name = normalizeDestination(value, destinations);
    if (!name) return;

    const key = strip(name);
    // Không ưu tiên `confidence` trước vì backend có thể đã clamp nhiều
    // điểm đến về 1.0, khiến Top 1/2/3 đều hiển thị 100%.
    // Dùng score ảnh thực tế trước để giữ chênh lệch giữa các kết quả.
    const scoreCandidates = [
      raw?.score,
      raw?.best_image_score,
      raw?.top3_avg_image_score,
      confidence,
      raw?.confidence,
      Number(raw?.confidence_percent || 0) / 100,
    ];

    const selectedScore = scoreCandidates.find((value) => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0;
    });

    const rawConfidence = Number(selectedScore || 0);
    const normalizedConfidence =
      rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;

    // Phần trăm similarity chỉ để hiển thị mức tương đồng, không phải xác suất.
    // Giới hạn 99% để tránh hiển thị 100% giả khi score bị làm tròn/clamp.
    const safeConfidence = Math.max(0, Math.min(normalizedConfidence, 0.99));
    const old = byDestination.get(key);

    // Nếu trùng địa điểm thì giữ confidence cao nhất.
    if (!old || safeConfidence > old.confidence) {
      byDestination.set(key, {
        ...raw,
        destination: name,
        confidence: Number.isFinite(safeConfidence) ? safeConfidence : 0,
        sourceIndex,
      });
    }
  };

  topMatches.forEach((match, index) => {
    const confidence = Number(
      match?.score ||
        match?.best_image_score ||
        match?.top3_avg_image_score ||
        match?.confidence ||
        Number(match?.confidence_percent || 0) / 100 ||
        0,
    );

    // Top 5 được lấy, nhưng chỉ giữ top thấp nếu % còn tương đối có ý nghĩa.
    // Sau đó sort lại theo confidence giảm dần.
    if (index < 3 || confidence >= 0.08) {
      pushDestination(
        match?.destination ||
          match?.destination_name ||
          match?.name ||
          match?.label,
        confidence,
        match,
        index,
      );
    }
  });

  if (!byDestination.size && detectedDestination) {
    pushDestination(
      detectedDestination,
      0.45,
      { destination: detectedDestination },
      0,
    );
  }

  const picked = Array.from(byDestination.values())
    .sort(
      (a, b) =>
        Number(b.confidence || 0) - Number(a.confidence || 0) ||
        Number(a.sourceIndex || 0) - Number(b.sourceIndex || 0),
    )
    .slice(0, 3);

  return {
    names: picked.map((item) => item.destination),
    matches: picked,
    scores: picked.map((item) => ({
      destination: item.destination,
      confidence: Number(item.confidence || 0),
    })),
  };
}

export default function AISmartSearchBar({
  destinations = [],
  onApplyQuery,
  placeholder = "Bạn muốn đi đâu? Kéo ảnh vào đây hoặc nhập từ khóa...",
}) {
  const { showToast } = useToast();
  const fileRef = useRef(null);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const [matches, setMatches] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [imagePreview, setImagePreview] = useState("");

  const apply = (query, text = "") => {
    onApplyQuery?.({ ...query, page: null });
    setSummary(text || "");
  };

  const searchText = async () => {
    const text = String(keyword || "").trim();
    const parsed = localParse(text, destinations);
    if (text) {
      trackBehavior({
        action: "search",
        keyword: text,
        score: 1,
        meta: { source: "ai_smart_search_text", parsed },
      });
    }
    apply(
      parsed,
      text ? `Đang tìm tour theo: “${text}”.` : "Đã xóa từ khóa tìm kiếm.",
    );
  };

  const imageSearch = async (file) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("Vui lòng chọn đúng file hình ảnh.", "warning", 5000, {
        title: "File không hợp lệ",
      });
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    const previewUrl = URL.createObjectURL(file);

    setImagePreview(previewUrl);
    setKeyword("");
    setBusy(true);
    setMatches([]);

    try {
      const form = new FormData();
      form.append("file", file);

      const result = await aiFetch("/image-search-upload?top_k=12", {
        method: "POST",
        body: form,
      });

      const lowConfidence = Boolean(result?.low_confidence);

      const external = result?.external_recognition || null;

      const externalRecognized = Boolean(
        external?.recognized && Number(external?.confidence || 0) >= 0.72,
      );

      const externalLocation =
        external?.province || external?.destination || external?.landmark || "";

      /*
       * Chỉ coi kết quả Vision là điểm đến nội bộ
       * khi tên đó khớp chính xác với dữ liệu destinations.
       *
       * Ví dụ:
       * - Tây Ninh: có trong hệ thống.
       * - Phú Sĩ/Paris: không có trong hệ thống.
       */
      const internalExternalDestination = externalRecognized
        ? findExactCatalogDestination(externalLocation, destinations)
        : "";

      /*
       * display_matches là danh sách AI service cho phép hiển thị.
       * Khi low_confidence=true, tuyệt đối không dùng top CLIP
       * để lọc tour trực tiếp.
       */
      const rawClipMatches =
        result?.display_matches ||
        (!lowConfidence ? result?.top_matches || result?.topMatches || [] : []);

      const catalogClipMatches = filterCatalogMatches(
        rawClipMatches,
        destinations,
      );

      let imageQuery = {
        names: [],
        matches: [],
        scores: [],
      };

      /*
       * 1. CLIP đủ tin cậy:
       * dùng các điểm đến nội bộ đã được kiểm tra.
       */
      if (!lowConfidence && catalogClipMatches.length) {
        imageQuery = buildImageDestinationQuery(
          catalogClipMatches,
          "",
          destinations,
        );
      }

      /*
       * 2. CLIP không chắc chắn nhưng Vision nhận ra
       * địa danh có trong database.
       *
       * Ví dụ Núi Bà Đen -> Tây Ninh.
       */
      if (lowConfidence && externalRecognized && internalExternalDestination) {
        const confidence = Math.max(
          0,
          Math.min(Number(external?.confidence || 0), 0.99),
        );

        imageQuery = {
          names: [internalExternalDestination],
          matches: [
            {
              destination: internalExternalDestination,
              confidence,
              source: `vision_${external?.provider || "external"}`,
              landmark: external?.landmark || null,
              province: external?.province || null,
              country: external?.country || null,
              reason: external?.reason || null,
            },
          ],
          scores: [
            {
              destination: internalExternalDestination,
              confidence,
            },
          ],
        };
      }

      /*
       * 3. Vision nhận đúng địa danh ngoài database:
       * không đưa tên ngoài hệ thống vào imageDestinations.
       * Thay vào đó giới thiệu tour theo chủ đề tương đồng.
       *
       * Ví dụ:
       * Núi Phú Sĩ -> theme=mountain
       * Eiffel -> theme=culture/city nếu model trả tag phù hợp
       */
      if (externalRecognized && !internalExternalDestination) {
        const similarTheme = resolveExternalTheme(external);

        const debugTopMatches = result?.top_matches || result?.topMatches || [];

        const validInternalMatches = filterCatalogMatches(
          debugTopMatches,
          destinations,
        );

        const similarQuery = buildImageDestinationQuery(
          validInternalMatches,
          "",
          destinations,
        );

        /*
         * Badge chỉ hiển thị các điểm đến nội bộ gần giống.
         * Không bao giờ hiển thị Phú Sĩ/Paris như một điểm đến
         * có tour trong hệ thống.
         */
        setMatches(similarQuery.matches);

        const recognizedLabel = [
          external?.landmark,
          external?.destination,
          external?.country,
        ]
          .filter(Boolean)
          .join(", ");

        apply(
          {
            theme: similarTheme.theme || null,
            imageDestinations: null,
            imageDestinationScores: null,
            destination: null,
            search: "",
          },
          "",
        );

        trackBehavior({
          action: "image_search",
          keyword: recognizedLabel || file.name,
          score: 2,
          meta: {
            source: "external_landmark_similar_theme",
            filename: file.name,
            externalRecognition: external,
            externalInCatalog: false,
            suggestedTheme: similarTheme.theme,
            suggestedCategory: similarTheme.category,
            similarDestinations: similarQuery.names,
          },
        });

        showToast(
          recognizedLabel
            ? `AI nhận diện đây có thể là ${recognizedLabel}. Travela hiện chưa có tour đến địa danh này, nên đang giới thiệu ${similarTheme.label} trong hệ thống.`
            : `Travela chưa có tour đến địa danh trong ảnh, nên đang giới thiệu ${similarTheme.label} trong hệ thống.`,
          "warning",
          8000,
          {
            title: "Gợi ý tour tương đồng",
          },
        );

        return;
      }

      /*
       * 4. Ảnh là tài liệu, screenshot, đồ vật
       * hoặc không nhận diện đủ chắc chắn.
       */
      if (lowConfidence && !externalRecognized) {
        setMatches([]);

        apply(
          {
            imageDestinations: null,
            imageDestinationScores: null,
            destination: null,
            search: "",
            theme: null,
          },
          "",
        );

        const imageType = String(
          external?.image_type || "unknown",
        ).toLowerCase();

        const technicalReason = String(external?.reason || "").toLowerCase();

        const isDocument = ["document", "screenshot"].includes(imageType);

        const isNonTravel = ["object", "food", "animal"].includes(imageType);

        const isTechnicalError =
          technicalReason.includes("json") ||
          technicalReason.includes("provider") ||
          technicalReason.includes("groq") ||
          technicalReason.includes("openrouter") ||
          technicalReason.includes("choices") ||
          technicalReason.includes("timeout") ||
          technicalReason.includes("api") ||
          technicalReason.includes("model");

        if (isDocument) {
          showToast(
            "Ảnh này là tài liệu, chữ viết hoặc ảnh chụp màn hình nên không thể dùng để tìm địa danh du lịch.",
            "warning",
            6500,
            {
              title: "Ảnh không phù hợp",
            },
          );

          return;
        }

        if (isNonTravel) {
          showToast(
            "Ảnh không phải phong cảnh hoặc công trình du lịch. Vui lòng chọn ảnh địa điểm rõ hơn.",
            "warning",
            6000,
            {
              title: "Không nhận diện được địa danh",
            },
          );

          return;
        }

        if (isTechnicalError) {
          showToast(
            "AI chưa thể xác định địa điểm trong ảnh ở lần thử này. Bạn hãy thử lại hoặc chọn một ảnh rõ hơn.",
            "warning",
            6500,
            {
              title: "Chưa thể nhận diện",
            },
          );

          return;
        }

        showToast(
          external?.reason ||
            "Không thể xác định chắc chắn địa điểm trong ảnh. Hãy chọn ảnh phong cảnh hoặc công trình du lịch rõ hơn.",
          "warning",
          6500,
          {
            title: "Chưa đủ độ tin cậy",
          },
        );

        return;
      }

      /*
       * 5. CLIP hoặc Vision trả điểm đến nội bộ hợp lệ.
       */
      setMatches(imageQuery.matches);

      trackBehavior({
        action: "image_search",
        keyword: imageQuery.names.join(", ") || externalLocation || file.name,
        score: 2,
        meta: {
          source: "ai_smart_image_search_validated",
          filename: file.name,
          imageDestinations: imageQuery.names,
          lowConfidence,
          externalRecognition: external,
        },
      });

      if (imageQuery.names.length) {
        const label = imageQuery.names.slice(0, 3).join(", ");

        apply(
          {
            imageDestinations: imageQuery.names.join("|"),
            imageDestinationScores: JSON.stringify(imageQuery.scores),
            destination: null,
            search: "",
            theme: null,
          },
          "",
        );

        const landmarkLabel =
          externalRecognized && external?.landmark
            ? ` AI nhận diện: ${external.landmark}${
                external?.province ? `, ${external.province}` : ""
              }.`
            : "";

        showToast(
          `Đã tìm thấy tour phù hợp tại ${label}.${landmarkLabel}`,
          "success",
          6000,
          {
            title: "Đã tìm thấy điểm đến",
          },
        );

        return;
      }

      apply(
        {
          imageDestinations: null,
          imageDestinationScores: null,
          destination: null,
          search: "",
          theme: null,
        },
        "",
      );

      showToast("Không tìm thấy điểm đến phù hợp từ ảnh.", "warning", 5500, {
        title: "Không có kết quả",
      });
    } catch (error) {
      setMatches([]);

      apply(
        {
          imageDestinations: null,
          imageDestinationScores: null,
          destination: null,
          search: "",
          theme: null,
        },
        "",
      );

      showToast(
        error?.message ||
          "AI service chưa phản hồi. Vui lòng kiểm tra cổng 8000.",
        "error",
        6500,
        {
          title: "Không thể tìm kiếm ảnh",
        },
      );
    } finally {
      setBusy(false);

      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        imageSearch(e.dataTransfer.files?.[0]);
      }}
      style={{ display: "grid", gap: 10, width: "100%" }}
    >
      <div
        className="smart-search-shell smart-search-hero-pill"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 88px 100px",
          gap: "10px",
          alignItems: "center",
          width: "100%",
          maxWidth: "100%",
          padding: "10px",
          border: dragging
            ? "2px dashed rgba(251, 146, 60, 0.9)"
            : "1px solid rgba(255, 255, 255, 0.65)",
          borderRadius: "999px",
          background: "rgba(255, 255, 255, 0.95)",
          boxShadow: "0 24px 50px rgba(0,0,0,0.20)",
          backdropFilter: "blur(14px)",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        <div
          className="smart-search-input-zone"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            minWidth: 0,
            width: "100%",
            minHeight: "56px",
            padding: "0 18px",
            borderRadius: "999px",
            background: "transparent",
            color: "#64748b",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <svg
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          {imagePreview && (
            <div
              style={{
                position: "relative",
                width: 76,
                height: 58,
                flex: "0 0 auto",
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                boxShadow: "0 6px 18px rgba(15, 23, 42, 0.12)",
              }}
            >
              <img
                src={imagePreview}
                alt="Ảnh đã tải lên"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              <button
                type="button"
                title="Xóa ảnh"
                onClick={() => {
                  URL.revokeObjectURL(imagePreview);
                  setImagePreview("");
                  setMatches([]);
                  setSummary("");
                  onApplyQuery?.({
                    imageDestinations: null,
                    imageDestinationScores: null,
                    destination: null,
                    search: "",
                    theme: null,
                    page: null,
                  });
                }}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 22,
                  height: 22,
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.8)",
                  background: "rgba(15, 23, 42, 0.72)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 15,
                  lineHeight: "18px",
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          )}

          <input
            className="smart-search-input"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              if (imagePreview) {
                URL.revokeObjectURL(imagePreview);
                setImagePreview("");
                setMatches([]);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchText();
            }}
            placeholder={
              dragging
                ? "Thả ảnh vào đây để AI nhận diện điểm đến..."
                : imagePreview
                  ? "Ảnh đã được tải lên, đang hiển thị tour tương đồng..."
                  : placeholder
            }
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 0,
              padding: "16px 0",
              fontSize: 16,
              background: "transparent",
              color: "#1f2937",
            }}
          />
        </div>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(e) => imageSearch(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn btn-light smart-search-upload"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{
            width: "88px",
            minWidth: "88px",
            minHeight: "56px",
            borderRadius: "999px",
            background: "#f8fafc",
            color: "#334155",
            border: "1px solid #e2e8f0",
            boxShadow: "none",
            fontWeight: 700,
          }}
        >
          {imagePreview ? "Đổi ảnh" : "Ảnh"}
        </button>
        <button
          type="button"
          className="btn btn-primary smart-search-submit"
          onClick={searchText}
          disabled={busy}
          style={{
            width: "100px",
            minWidth: "100px",
            minHeight: "56px",
            borderRadius: "999px",
            background: "linear-gradient(135deg, #ff9f1a, #fb923c)",
            border: "none",
            color: "#111827",
            boxShadow: "0 12px 28px rgba(251, 146, 60, 0.32)",
            fontWeight: 800,
          }}
        >
          {busy ? "Đang xử lý..." : "Tìm"}
        </button>
      </div>
      {summary && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 14,
            background: "#f8fafc",
            color: "#334155",
          }}
        >
          {summary}
        </div>
      )}
    </div>
  );
}
