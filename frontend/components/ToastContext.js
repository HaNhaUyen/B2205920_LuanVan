import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const ToastContext = createContext({
  showToast: () => {},
  hideToast: () => {},
});

const ToastIcons = {
  success: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  error: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  ),
  warning: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),
  info: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  ),
};

const toastTheme = {
  success: {
    background: "#ecfdf5",
    color: "#064e3b",
    border: "#34d399",
    iconBackground: "#d1fae5",
    iconColor: "#047857",
    title: "Thành công",
  },
  warning: {
    // Nền kem sáng, chữ nâu rất đậm để bảo đảm dễ đọc.
    background: "#fff7ed",
    color: "#7c2d12",
    border: "#fb923c",
    iconBackground: "#ffedd5",
    iconColor: "#c2410c",
    title: "Thông báo",
  },
  error: {
    background: "#fef2f2",
    color: "#7f1d1d",
    border: "#f87171",
    iconBackground: "#fee2e2",
    iconColor: "#b91c1c",
    title: "Có lỗi xảy ra",
  },
  info: {
    background: "#eff6ff",
    color: "#1e3a8a",
    border: "#60a5fa",
    iconBackground: "#dbeafe",
    iconColor: "#1d4ed8",
    title: "Thông tin",
  },
};

function normalizeToastType(type) {
  return ["success", "warning", "error", "info"].includes(type) ? type : "info";
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const hideToast = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (message, type = "info", duration = 5200, options = {}) => {
      const safeMessage = String(message || "").trim();

      if (!safeMessage) {
        return null;
      }

      const safeType = normalizeToastType(type);
      const id = `${Date.now()}-${Math.random()}`;

      const item = {
        id,
        message: safeMessage,
        type: safeType,
        title: options?.title || toastTheme[safeType]?.title || "Thông báo",
      };

      setItems((current) => {
        const withoutDuplicate = current.filter(
          (toast) =>
            !(toast.message === item.message && toast.type === item.type),
        );

        return [...withoutDuplicate, item].slice(-4);
      });

      const safeDuration = Math.max(2200, Number(duration) || 5200);

      window.setTimeout(() => {
        hideToast(id);
      }, safeDuration);

      return id;
    },
    [hideToast],
  );

  const value = useMemo(
    () => ({
      showToast,
      hideToast,
    }),
    [showToast, hideToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        id="travela-toast-host"
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: "fixed",
          top: "92px",
          right: "24px",
          bottom: "auto",
          left: "auto",
          zIndex: 2147483000,
          width: "min(460px, calc(100vw - 32px))",
          display: "grid",
          gap: "12px",
          pointerEvents: "none",
        }}
      >
        {items.map((item) => {
          const theme = toastTheme[item.type] || toastTheme.info;

          return (
            <div
              key={item.id}
              className="travela-toast-card"
              data-toast-type={item.type}
              role={item.type === "error" ? "alert" : "status"}
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "42px minmax(0, 1fr) 28px",
                alignItems: "start",
                gap: "12px",
                padding: "16px",
                borderRadius: "16px",
                background: theme.background,
                color: theme.color,
                border: `1.5px solid ${theme.border}`,
                borderLeft: `5px solid ${theme.border}`,
                boxShadow: "0 20px 52px rgba(15, 23, 42, 0.24)",
                pointerEvents: "auto",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "12px",
                  background: theme.iconBackground,
                  color: theme.iconColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {ToastIcons[item.type] || ToastIcons.info}
              </div>

              <div
                style={{
                  minWidth: 0,
                  paddingTop: "1px",
                }}
              >
                <div
                  className="travela-toast-title"
                  style={{
                    marginBottom: "4px",
                    fontSize: "0.94rem",
                    fontWeight: 850,
                    lineHeight: 1.3,
                    color: theme.color,
                  }}
                >
                  {item.title}
                </div>

                <div
                  className="travela-toast-message"
                  style={{
                    fontSize: "0.94rem",
                    fontWeight: 650,
                    lineHeight: 1.5,
                    color: theme.color,
                    overflowWrap: "anywhere",
                  }}
                >
                  {item.message}
                </div>
              </div>

              <button
                type="button"
                aria-label="Đóng thông báo"
                onClick={() => hideToast(item.id)}
                style={{
                  width: "28px",
                  height: "28px",
                  border: "none",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.55)",
                  color: theme.color,
                  cursor: "pointer",
                  fontSize: "22px",
                  lineHeight: 1,
                  opacity: 0.9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <style jsx global>{`
        /*
         * Dùng selector riêng và !important để CSS .toast/.toast-warning
         * cũ của dự án không thể đổi chữ thành vàng hoặc trắng.
         */
        #travela-toast-host .travela-toast-card,
        #travela-toast-host .travela-toast-title,
        #travela-toast-host .travela-toast-message {
          opacity: 1 !important;
          text-shadow: none !important;
        }

        #travela-toast-host .travela-toast-card[data-toast-type="warning"],
        #travela-toast-host
          .travela-toast-card[data-toast-type="warning"]
          .travela-toast-title,
        #travela-toast-host
          .travela-toast-card[data-toast-type="warning"]
          .travela-toast-message {
          color: #7c2d12 !important;
        }

        #travela-toast-host .travela-toast-card[data-toast-type="success"],
        #travela-toast-host
          .travela-toast-card[data-toast-type="success"]
          .travela-toast-title,
        #travela-toast-host
          .travela-toast-card[data-toast-type="success"]
          .travela-toast-message {
          color: #064e3b !important;
        }

        #travela-toast-host .travela-toast-card[data-toast-type="error"],
        #travela-toast-host
          .travela-toast-card[data-toast-type="error"]
          .travela-toast-title,
        #travela-toast-host
          .travela-toast-card[data-toast-type="error"]
          .travela-toast-message {
          color: #7f1d1d !important;
        }

        #travela-toast-host .travela-toast-card[data-toast-type="info"],
        #travela-toast-host
          .travela-toast-card[data-toast-type="info"]
          .travela-toast-title,
        #travela-toast-host
          .travela-toast-card[data-toast-type="info"]
          .travela-toast-message {
          color: #1e3a8a !important;
        }

        @media (max-width: 640px) {
          #travela-toast-host {
            top: 76px !important;
            right: 12px !important;
            left: 12px !important;
            width: auto !important;
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
