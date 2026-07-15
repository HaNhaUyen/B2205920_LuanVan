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
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return showToast("Vui lòng chọn file ảnh.", "error");

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
      const detectedDestination =
        normalizeDestination(
          result?.detected?.destination || result?.detected?.destination_name,
          destinations,
        ) ||
        normalizeDestination(
          result?.destination || result?.destination_name,
          destinations,
        ) ||
        destinationFromFilename(file.name, destinations);
      const topMatches = result?.top_matches || result?.topMatches || [];
      const imageQuery = buildImageDestinationQuery(
        topMatches,
        detectedDestination,
        destinations,
      );

      setMatches(imageQuery.matches);
      trackBehavior({
        action: "image_search",
        keyword:
          imageQuery.names.join(", ") || detectedDestination || file.name,
        score: 2,
        meta: {
          source: "ai_smart_image_search_multi_destination",
          filename: file.name,
          detectedDestination,
          imageDestinations: imageQuery.names,
          topMatches,
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
          },
          "",
        );
        showToast(`Đã tìm tour tương đồng: ${label}`, "success");
      } else {
        const fallback = destinationFromFilename(file.name, destinations);
        apply(
          {
            destination: fallback || null,
            imageDestinations: null,
            search: fallback || file.name,
          },
          fallback
            ? `AI dùng fallback từ tên file và gợi ý ${fallback}.`
            : "Ảnh chưa nhận diện rõ, hệ thống lọc theo tên ảnh.",
        );
      }
    } catch (error) {
      const fallback = destinationFromFilename(file.name, destinations);
      apply(
        { destination: fallback || null, search: fallback || file.name },
        fallback
          ? `AI service chưa phản hồi, fallback theo tên file: ${fallback}.`
          : "AI service chưa phản hồi, vui lòng kiểm tra ai-service port 8000.",
      );
      showToast(error.message, "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
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
      {!!matches.length && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {matches.slice(0, 3).map((m, idx) => {
            const destinationName = normalizeDestination(
              m.destination || m.destination_name || m.label,
              destinations,
            );
            return (
              <button
                key={`${destinationName}-${idx}`}
                type="button"
                className="badge"
                title="Bấm để chỉ lọc riêng điểm đến này"
                onClick={() =>
                  apply(
                    {
                      destination: destinationName,
                      imageDestinations: null,
                      imageDestinationScores: null,
                      search: destinationName,
                    },
                    `Đang lọc riêng tour ${destinationName}.`,
                  )
                }
                style={{
                  border: 0,
                  cursor: "pointer",
                  fontWeight: idx === 0 ? 800 : 700,
                  background: idx === 0 ? "#dcfce7" : "#f8fafc",
                }}
              >
                Top {idx + 1}: {destinationName || m.label}{" "}
                {typeof m.confidence === "number"
                  ? `${Math.round(m.confidence * 100)}%`
                  : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
