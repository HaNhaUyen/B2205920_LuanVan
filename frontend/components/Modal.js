import { useEffect } from "react";

export default function Modal({
  open,
  title,
  description,
  size = "md",
  onClose,
  children,
  footer,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    // Khóa cuộn trang nền khi mở Modal
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      // Mở lại cuộn trang khi đóng Modal
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Bảng map kích thước Modal (rất tiện khi dùng cho form nhỏ hoặc bảng dữ liệu lớn)
  const sizeMap = {
    sm: "480px",
    md: "640px",
    lg: "860px",
    xl: "1140px",
  };
  const maxWidth = sizeMap[size] || sizeMap.md;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)", // Nền xám đen mờ
        backdropFilter: "blur(6px)", // Hiệu ứng mờ kính
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        zIndex: 9999, // Đảm bảo luôn nằm trên cùng
      }}
    >
      <div
        className={`modal-shell modal-${size}`}
        onClick={(event) => event.stopPropagation()} // Ngăn chặn sự kiện click lan ra ngoài backdrop
        style={{
          width: "100%",
          maxWidth: maxWidth,
          maxHeight: "calc(100vh - 48px)", // Tránh modal bị tràn màn hình dọc
          background: "#fff",
          borderRadius: "24px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      >
        {/* Modal Header */}
        <div
          className="modal-head"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            padding: "24px 24px 16px",
          }}
        >
          <div>
            <h3
              style={{
                margin: "0 0 6px",
                fontSize: "1.35rem",
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              {title}
            </h3>
            {description ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: "0.95rem",
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            ) : null}
          </div>

          {/* Nút Close có hiệu ứng Hover */}
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "none",
              background: "#f1f5f9",
              color: "#475569",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#e2e8f0";
              e.currentTarget.style.color = "#0f172a";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#f1f5f9";
              e.currentTarget.style.color = "#475569";
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
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Modal Body (Tự động xuất hiện thanh cuộn nếu nội dung quá dài) */}
        <div
          className="modal-body"
          style={{
            padding: "0 24px 24px",
            overflowY: "auto",
            flexGrow: 1, // Điền đầy khoảng trống nếu có
          }}
        >
          {children}
        </div>

        {/* Modal Footer (Khu vực chứa các nút hành động Hủy/Lưu) */}
        {footer ? (
          <div
            className="modal-footer"
            style={{
              padding: "16px 24px",
              background: "#f8fafc",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "flex-end", // Căn phải các nút
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>

      {/* Khai báo animation nội bộ cho Modal */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes modalFadeIn {
          from { opacity: 0; transform: translateY(15px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `,
        }}
      />
    </div>
  );
}
