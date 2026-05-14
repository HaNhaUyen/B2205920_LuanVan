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
  const picked = [];
  const seen = new Set();

  const pushDestination = (value, confidence = 0, raw = {}) => {
    const name = normalizeDestination(value, destinations);
    if (!name) return;
    const key = strip(name);
    if (seen.has(key)) return;
    seen.add(key);
    picked.push({
      ...raw,
      destination: name,
      confidence: Number(confidence || raw?.confidence || 0),
    });
  };

  topMatches.forEach((match, index) => {
    const confidence = Number(match?.confidence || 0);
    // Lấy nhiều điểm đến nếu ảnh có khả năng giống nhiều nơi.
    // Top 3 luôn được giữ để user có lựa chọn; Top 4-5 chỉ giữ nếu confidence đủ tốt.
    if (index < 3 || confidence >= 0.12) {
      pushDestination(
        match?.destination || match?.name || match?.label,
        confidence,
        match,
      );
    }
  });

  if (!picked.length && detectedDestination) {
    pushDestination(detectedDestination, 0.45, {
      destination: detectedDestination,
    });
  }

  return {
    names: picked.map((item) => item.destination),
    matches: picked,
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
      const result = await aiFetch("/image-search-upload?top_k=5", {
        method: "POST",
        body: form,
      });
      const detectedDestination =
        normalizeDestination(result?.detected?.destination, destinations) ||
        normalizeDestination(result?.destination, destinations) ||
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
          : "AI service chưa phản hồi, vui lòng kiểm tra ai-service port 8001.",
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
      style={{ display: "grid", gap: 10 }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 8,
          alignItems: "center",
          padding: 8,
          border: dragging ? "2px dashed #22c55e" : "1px solid #e2e8f0",
          borderRadius: 22,
          background: dragging ? "#ecfdf5" : "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
            paddingLeft: 8,
          }}
        >
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
              padding: "16px 6px",
              fontSize: 15,
              background: "transparent",
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
          className="btn btn-light"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {imagePreview ? "Đổi ảnh" : "Ảnh"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={searchText}
          disabled={busy}
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
          {matches.slice(0, 5).map((m, idx) => {
            const destinationName = normalizeDestination(
              m.destination || m.label,
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
                      search: destinationName,
                    },
                    `Đang lọc riêng tour ${destinationName}.`,
                  )
                }
                style={{ border: 0, cursor: "pointer" }}
              >
                {destinationName || m.label}{" "}
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
