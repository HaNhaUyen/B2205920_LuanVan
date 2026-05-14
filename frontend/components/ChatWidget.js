import { useRouter } from "next/router";
import { useState } from "react";

export default function ChatWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const currentPath = router.pathname || "/";
  const isAssistantPage = currentPath === "/assistant";
  const isAdminPage = currentPath.startsWith("/admin");
  const isAuthPage = ["/login", "/register"].includes(currentPath);

  if (isAssistantPage || isAdminPage || isAuthPage) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Đóng chat AI" : "Mở chat AI"}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          width: 60,
          height: 60,
          borderRadius: "50%",
          border: "none",
          background: "linear-gradient(135deg, #16a34a, #22c55e)",
          color: "#fff",
          boxShadow: "0 18px 40px rgba(34, 197, 94, 0.28)",
          cursor: "pointer",
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {open ? (
          <span style={{ fontSize: 28, lineHeight: 1 }}>×</span>
        ) : (
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {open ? (
        <div
          style={{
            position: "fixed",
            right: 12,
            bottom: 84,
            width: "min(410px, calc(100vw - 24px))",
            height: "min(78vh, calc(100vh - 96px))",
            minHeight: "min(560px, calc(100vh - 96px))",
            maxHeight: "calc(100vh - 96px)",
            background: "#fff",
            borderRadius: 28,
            overflow: "hidden",
            border: "1px solid rgba(226, 232, 240, 0.95)",
            boxShadow: "0 32px 80px rgba(15, 23, 42, 0.22)",
            zIndex: 999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              background: "linear-gradient(135deg, #16a34a, #22c55e)",
              color: "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
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
                  <path d="M12 8V4H8" />
                  <rect width="16" height="12" x="4" y="8" rx="2" />
                </svg>
              </div>
              <div>
                <strong style={{ display: "block", fontSize: "0.98rem" }}>
                  Travela AI
                </strong>
                <span style={{ fontSize: 12, opacity: 0.92 }}>
                  Tư vấn như Messenger/Zalo
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.16)",
                border: "none",
                color: "#fff",
                fontSize: 22,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          </div>

          <iframe
            title="Travela AI"
            src="/assistant?embed=1"
            style={{
              width: "100%",
              flex: 1,
              minHeight: 0,
              border: "none",
              background: "#fff",
            }}
          />
        </div>
      ) : null}
    </>
  );
}
