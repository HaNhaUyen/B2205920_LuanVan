import React from "react";

export default function Pagination({
  page = 1,
  totalPages = 1,
  onPageChange,
  compact = false,
}) {
  if (!totalPages || totalPages <= 1) return null;

  const current = Number(page || 1);
  const pages = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);

  if (start > 1) pages.push(1);
  if (start > 2) pages.push("dots-start");
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < totalPages - 1) pages.push("dots-end");
  if (end < totalPages) pages.push(totalPages);

  return (
    <div
      className={`app-pagination ${compact ? "compact" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        marginTop: compact ? "20px" : "40px",
        flexWrap: "wrap",
      }}
    >
      {/* Nút TRƯỚC */}
      <button
        type="button"
        className="page-nav-btn"
        onClick={() => onPageChange(current - 1)}
        disabled={current <= 1}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "10px 18px",
          borderRadius: "999px",
          border: "1px solid #e2e8f0",
          background: "#fff",
          color: current <= 1 ? "#94a3b8" : "#334155",
          fontWeight: 600,
          cursor: current <= 1 ? "not-allowed" : "pointer",
          opacity: current <= 1 ? 0.6 : 1,
          transition: "all 0.2s ease",
          boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
        }}
      >
        <svg
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        Trước
      </button>

      {/* Danh sách SỐ TRANG */}
      <div
        className="page-number-list"
        style={{ display: "flex", alignItems: "center", gap: "8px" }}
      >
        {pages.map((item) =>
          item.toString().includes("dots") ? (
            <span
              key={item}
              className="page-dots"
              style={{
                color: "#94a3b8",
                padding: "0 4px",
                fontWeight: "bold",
                letterSpacing: "2px",
              }}
            >
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`page-number-btn ${current === item ? "active" : ""}`}
              onClick={() => onPageChange(item)}
              style={
                current === item
                  ? {
                      // Style cho trạng thái ACTIVE
                      minWidth: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "none",
                      background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                      color: "#fff",
                      fontWeight: "bold",
                      fontSize: "1rem",
                      boxShadow: "0 4px 12px rgba(114, 180, 75, 0.3)",
                      cursor: "default",
                    }
                  : {
                      // Style cho trạng thái BÌNH THƯỜNG
                      minWidth: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      color: "#475569",
                      fontWeight: 600,
                      fontSize: "0.95rem",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }
              }
              // Thêm chút hover effect cho các nút chưa active
              onMouseOver={(e) => {
                if (current !== item) {
                  e.currentTarget.style.borderColor = "#72b44b";
                  e.currentTarget.style.color = "#72b44b";
                }
              }}
              onMouseOut={(e) => {
                if (current !== item) {
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.color = "#475569";
                }
              }}
            >
              {item}
            </button>
          ),
        )}
      </div>

      {/* Nút SAU */}
      <button
        type="button"
        className="page-nav-btn"
        onClick={() => onPageChange(current + 1)}
        disabled={current >= totalPages}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "10px 18px",
          borderRadius: "999px",
          border: "1px solid #e2e8f0",
          background: "#fff",
          color: current >= totalPages ? "#94a3b8" : "#334155",
          fontWeight: 600,
          cursor: current >= totalPages ? "not-allowed" : "pointer",
          opacity: current >= totalPages ? 0.6 : 1,
          transition: "all 0.2s ease",
          boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
        }}
      >
        Sau
        <svg
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </button>
    </div>
  );
}
