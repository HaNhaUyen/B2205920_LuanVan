import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const ToastContext = createContext({ showToast: () => {} });

// Bộ icon SVG cho các trạng thái thông báo
const ToastIcons = {
  success: (
    <svg
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  ),
  error: (
    <svg
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>
  ),
  warning: (
    <svg
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  ),
  info: (
    <svg
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  ),
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const showToast = useCallback((message, type = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems((current) => [...current, { id, message, type }]);

    // Tự động ẩn sau 3.2 giây
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div id="toast-host" className="toast-host">
        {items.map((item) => (
          <div
            key={item.id}
            className={`toast toast-${item.type} show`}
            style={{
              display: "flex",
              alignItems: "flex-start", // Căn trên cùng đề phòng text dài xuống dòng
              gap: "12px",
              padding: "16px 20px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
              border: "none", // Xóa border thừa nếu có ở CSS cũ
            }}
          >
            {/* Box chứa Icon */}
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {ToastIcons[item.type] || ToastIcons.info}
            </div>

            {/* Box chứa Nội dung */}
            <div
              style={{
                flexGrow: 1,
                fontSize: "0.95rem",
                lineHeight: "1.5",
                marginTop: "1px",
              }}
            >
              {item.message}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
