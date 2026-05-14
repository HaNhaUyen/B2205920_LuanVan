import { getTourFilterOptions } from "@/lib/tour";
import { mapLabel } from "@/lib/labels";
import { formatCurrency } from "@/lib/format";

const themeOptions = [
  "beach",
  "mountain",
  "city",
  "culture",
  "family",
  "luxury",
  "adventure",
  "eco",
];
const typeOptions = ["group", "private"];

export default function FilterSidebar({
  destinations,
  query,
  onSubmit,
  onReset,
  onQuickDestination,
  onRemoveChip,
}) {
  const options = getTourFilterOptions(destinations);

  const chips = [
    ["search", "Từ khóa", query.search],
    ["destination", "Điểm đến", query.destination],
    ["province", "Khu vực", query.province],
    ["theme", "Chủ đề", query.theme ? mapLabel("theme", query.theme) : ""],
    ["type", "Loại tour", query.type ? mapLabel("type", query.type) : ""],
    ["month", "Khởi hành", query.month ? `Tháng ${query.month}` : ""],
    [
      "minPrice",
      "Giá từ",
      query.minPrice ? formatCurrency(query.minPrice) : "",
    ],
    [
      "maxPrice",
      "Giá đến",
      query.maxPrice ? formatCurrency(query.maxPrice) : "",
    ],
    [
      "durationMax",
      "Tối đa",
      query.durationMax ? `${query.durationMax} ngày` : "",
    ],
    [
      "minRating",
      "Đánh giá khách hàng",
      query.minRating ? `${query.minRating}★+` : "",
    ],
  ].filter(([, , value]) => value);

  if (query.featured === "1")
    chips.push(["featured", "Tour nổi bật", "Đang bật"]);
  if (query.bestDeal === "1") chips.push(["bestDeal", "Giá tốt", "Đang bật"]);

  return (
    <aside
      className="filter-panel filter-panel-premium sticky-sidebar travel-filter-panel"
      style={{
        background: "#fff",
        borderRadius: "24px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.03)",
        border: "1px solid #f1f5f9",
        padding: "24px",
      }}
    >
      {/* Header Sidebar */}
      <div
        className="filter-panel-head"
        style={{
          marginBottom: "20px",
          paddingBottom: "16px",
          borderBottom: "1px solid #f1f5f9",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "6px",
            }}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="#72b44b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            <h3 style={{ margin: 0, fontSize: "1.2rem", color: "#1f2937" }}>
              Lọc tìm kiếm
            </h3>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Thiết kế chuyến đi của riêng bạn.
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={onReset}
          style={{
            color: "#ef4444",
            background: "#fef2f2",
            border: "none",
            borderRadius: "8px",
            padding: "6px 12px",
          }}
        >
          Xóa lọc
        </button>
      </div>

      {/* UX Tối ưu: Đưa phần Filter đang áp dụng lên đầu tiên */}
      {chips.length > 0 && (
        <div
          className="filter-section"
          style={{
            background: "#f8fafc",
            padding: "16px",
            borderRadius: "16px",
            marginBottom: "24px",
            border: "1px dashed #cbd5e1",
          }}
        >
          <div
            style={{
              fontSize: "0.85rem",
              color: "#64748b",
              marginBottom: "12px",
              fontWeight: 600,
            }}
          >
            Đang áp dụng:
          </div>
          <div
            className="chips"
            style={{ gap: "8px", display: "flex", flexWrap: "wrap" }}
          >
            {chips.map(([key, label, value]) => (
              <button
                key={key}
                type="button"
                className="badge removable-badge"
                onClick={() => onRemoveChip(key)}
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  color: "#334155",
                  padding: "6px 12px",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "#ef4444";
                  e.currentTarget.style.color = "#ef4444";
                  e.currentTarget.style.background = "#fef2f2";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.color = "#334155";
                  e.currentTarget.style.background = "#fff";
                }}
              >
                <span style={{ color: "#94a3b8" }}>{label}:</span>{" "}
                <strong style={{ fontWeight: 600 }}>{value}</strong>
                <svg
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Form Lọc Chính */}
      <form
        className="filter-form-premium"
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "24px" }}
      >
        {/* Section: Tìm kiếm */}
        <div
          className="filter-section"
          style={{ padding: 0, background: "transparent", border: "none" }}
        >
          <div
            className="filter-section-title"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#1f2937",
              marginBottom: "12px",
              fontWeight: 600,
            }}
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            Tìm nhanh
          </div>
          <div className="field">
            <input
              name="search"
              defaultValue={query.search || ""}
              placeholder="Ví dụ: cáp treo, lặn san hô..."
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "12px",
              }}
            />
          </div>
        </div>

        {/* Section: Vị trí */}
        <div
          className="filter-section"
          style={{ padding: 0, background: "transparent", border: "none" }}
        >
          <div
            className="filter-section-title"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#1f2937",
              marginBottom: "12px",
              fontWeight: 600,
            }}
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            Khu vực & Điểm đến
          </div>
          <div className="field" style={{ marginBottom: "12px" }}>
            <select
              name="destination"
              defaultValue={query.destination || ""}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "12px",
              }}
            >
              <option value="">Tất cả điểm đến</option>
              {destinations.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: "12px" }}>
            <select
              name="province"
              defaultValue={query.province || ""}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "12px",
              }}
            >
              <option value="">Tất cả tỉnh thành</option>
              {options.provinces.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {/* Gợi ý nhanh */}
          <div
            className="chips chips-scroll"
            style={{
              gap: "8px",
              marginTop: "12px",
              display: "flex",
              flexWrap: "wrap",
            }}
          >
            {destinations.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                className="badge badge-soft-action"
                onClick={() => onQuickDestination(item.name)}
                style={{
                  fontSize: "0.8rem",
                  background: "#f1f5f9",
                  color: "#475569",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: "999px",
                  cursor: "pointer",
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        {/* Section: Trải nghiệm */}
        <div
          className="filter-section"
          style={{ padding: 0, background: "transparent", border: "none" }}
        >
          <div
            className="filter-section-title"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#1f2937",
              marginBottom: "12px",
              fontWeight: 600,
            }}
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
            </svg>
            Trải nghiệm
          </div>
          <div className="field" style={{ marginBottom: "12px" }}>
            <select
              name="theme"
              defaultValue={query.theme || ""}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "12px",
              }}
            >
              <option value="">Bất kỳ chủ đề nào</option>
              {themeOptions.map((item) => (
                <option key={item} value={item}>
                  {mapLabel("theme", item)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <select
              name="type"
              defaultValue={query.type || ""}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "12px",
              }}
            >
              <option value="">Loại hình tour</option>
              {typeOptions.map((item) => (
                <option key={item} value={item}>
                  {mapLabel("type", item)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Section: Ngân sách */}
        <div
          className="filter-section"
          style={{ padding: 0, background: "transparent", border: "none" }}
        >
          <div
            className="filter-section-title"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#1f2937",
              marginBottom: "12px",
              fontWeight: 600,
            }}
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            Ngân sách & Lịch trình
          </div>
          <div
            className="subgrid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <div className="field">
              <input
                name="minPrice"
                type="number"
                defaultValue={query.minPrice || ""}
                placeholder="Giá từ (VND)"
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "12px",
                  fontSize: "0.9rem",
                }}
              />
            </div>
            <div className="field">
              <input
                name="maxPrice"
                type="number"
                defaultValue={query.maxPrice || ""}
                placeholder="Đến (VND)"
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "12px",
                  fontSize: "0.9rem",
                }}
              />
            </div>
          </div>
          <div
            className="subgrid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div className="field">
              <input
                name="durationMax"
                type="number"
                defaultValue={query.durationMax || ""}
                placeholder="Tối đa (ngày)"
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "12px",
                  fontSize: "0.9rem",
                }}
              />
            </div>
            <div className="field">
              <select
                name="month"
                defaultValue={query.month || ""}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "12px",
                  fontSize: "0.9rem",
                }}
              >
                <option value="">Tháng đi</option>
                {options.months.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section: Dịch vụ & Nổi bật */}
        <div
          className="filter-section"
          style={{ padding: 0, background: "transparent", border: "none" }}
        >
          <div
            className="filter-section-title"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#1f2937",
              marginBottom: "12px",
              fontWeight: 600,
            }}
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            Dịch vụ & Tiện ích
          </div>
          <div className="field" style={{ marginBottom: "16px" }}>
            <select
              name="minRating"
              defaultValue={query.minRating || ""}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "12px",
              }}
            >
              <option value="">Đánh giá khách hàng</option>
              {options.ratingOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div
            className="toggle-grid"
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <label
              className="toggle-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "#fff",
                border: "1px solid #e2e8f0",
                padding: "12px",
                borderRadius: "12px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                name="featured"
                defaultChecked={query.featured === "1"}
                style={{
                  width: "18px",
                  height: "18px",
                  accentColor: "#ef4444",
                }}
              />
              <span style={{ fontSize: "0.95rem", color: "#334155" }}>
                🔥 Chỉ tour Bán chạy
              </span>
            </label>
            <label
              className="toggle-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "#fff",
                border: "1px solid #e2e8f0",
                padding: "12px",
                borderRadius: "12px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                name="bestDeal"
                defaultChecked={query.bestDeal === "1"}
                style={{
                  width: "18px",
                  height: "18px",
                  accentColor: "#f59e0b",
                }}
              />
              <span style={{ fontSize: "0.95rem", color: "#334155" }}>
                ⭐ Chỉ tour Giá tốt
              </span>
            </label>
          </div>
        </div>

        {/* Nút Submit */}
        <div
          className="form-actions-stacked"
          style={{
            marginTop: "8px",
            paddingTop: "24px",
            borderTop: "1px solid #f1f5f9",
          }}
        >
          <button
            className="btn btn-primary btn-block"
            type="submit"
            style={{
              width: "100%",
              padding: "16px",
              fontSize: "1.05rem",
              background: "linear-gradient(135deg, #72b44b, #5a9d34)",
              color: "#fff",
              border: "none",
              borderRadius: "999px",
              fontWeight: 700,
              boxShadow: "0 8px 20px rgba(114, 180, 75, 0.25)",
              cursor: "pointer",
            }}
          >
            Lọc kết quả
          </button>
        </div>
      </form>
    </aside>
  );
}
