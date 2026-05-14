export default function Loading({ text = "Đang tải dữ liệu..." }) {
  return (
    <div
      className="page-loading"
      style={{
        minHeight: "60vh", // Căn giữa theo chiều dọc của trang
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        background: "transparent", // Để tiệp màu với nền của trang chứa nó
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: "420px",
          width: "100%",
          textAlign: "center",
          background: "#fff",
          borderRadius: "24px",
          padding: "48px 32px",
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.04)",
          border: "1px solid #f1f5f9",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "20px",
        }}
      >
        {/* Vòng xoay Loading (Spinner) */}
        <div style={{ width: "48px", height: "48px", color: "#72b44b" }}>
          <svg
            style={{ animation: "travela-spin 1s linear infinite" }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeOpacity="0.2"
            ></circle>
            <path
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>

        <div>
          <div
            className="eyebrow"
            style={{
              background: "rgba(114, 180, 75, 0.1)",
              color: "#72b44b",
              marginBottom: "14px",
              display: "inline-flex",
              padding: "6px 14px",
              borderRadius: "999px",
              fontSize: "0.85rem",
              fontWeight: 700,
            }}
          >
            Travela
          </div>
          <h2
            style={{ margin: "0 0 8px", fontSize: "1.4rem", color: "#1f2937" }}
          >
            {text}
          </h2>
          <p
            className="muted"
            style={{ margin: 0, color: "#64748b", fontSize: "0.95rem" }}
          >
            Vui lòng đợi trong giây lát...
          </p>
        </div>
      </div>

      {/* Keyframe nội bộ cho animation vòng xoay */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes travela-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `,
        }}
      />
    </div>
  );
}
