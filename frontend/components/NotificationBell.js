import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ToastContext";

export default function NotificationBell({ user }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const rootRef = useRef(null);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [recent, unread] = await Promise.all([
        apiFetch("/notifications/me?limit=5"),
        apiFetch("/notifications/me/unread-count"),
      ]);
      setItems(recent || []);
      setUnreadCount(Number(unread?.total || 0));
    } catch (error) {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const sync = () => loadData();
    loadData();
    const timer = window.setInterval(loadData, 45000);
    window.addEventListener("travela-notifications-changed", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("travela-notifications-changed", sync);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const openNotification = async (item) => {
    try {
      if (!item.isRead) {
        await apiFetch(`/notifications/${item.id}/read`, { method: "POST" });
        setItems((prev) =>
          prev.map((entry) =>
            String(entry.id) === String(item.id)
              ? { ...entry, isRead: true, readAt: new Date().toISOString() }
              : entry,
          ),
        );
        setUnreadCount((prev) => Math.max(prev - 1, 0));
        window.dispatchEvent(new Event("travela-notifications-changed"));
      }
      setOpen(false);
      router.push(`/notifications?notificationId=${item.id}`);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  if (!user) return null;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) loadData();
        }}
        title="Thông báo"
        style={{
          position: "relative",
          width: 42,
          height: 42,
          borderRadius: "50%",
          border: "1px solid #e2e8f0",
          background: open ? "#f0fdf4" : "#fff",
          color: open ? "#16a34a" : "#334155",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: open ? "0 10px 24px rgba(34,197,94,0.12)" : "none",
        }}
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"></path>
          <path d="M9 17a3 3 0 0 0 6 0"></path>
        </svg>
        {unreadCount > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -2,
              minWidth: 20,
              height: 20,
              padding: "0 6px",
              borderRadius: 999,
              background: "#ef4444",
              color: "#fff",
              fontSize: 11,
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #fff",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 52,
            width: 380,
            maxWidth: "min(92vw, 380px)",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            boxShadow: "0 24px 50px rgba(15,23,42,0.14)",
            overflow: "hidden",
            zIndex: 80,
          }}
        >
          <div
            style={{
              padding: "18px 18px 14px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <strong style={{ display: "block", color: "#0f172a" }}>Thông báo</strong>
              <span style={{ color: "#64748b", fontSize: 13 }}>
                {unreadCount} chưa xem
              </span>
            </div>
            <Link href="/notifications" style={{ color: "#16a34a", fontWeight: 700, fontSize: 13 }}>
              Xem tất cả
            </Link>
          </div>

          <div style={{ maxHeight: 420, overflowY: "auto", padding: 10 }}>
            {loading ? (
              <div style={{ padding: 18, color: "#64748b" }}>Đang tải thông báo...</div>
            ) : items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openNotification(item)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: item.isRead ? "#f8fafc" : "#f0fdf4",
                    opacity: item.isRead ? 0.62 : 1,
                    padding: 14,
                    borderRadius: 16,
                    marginBottom: 8,
                    cursor: "pointer",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <strong style={{ color: "#0f172a", fontSize: 14 }}>{item.title}</strong>
                    {!item.isRead ? (
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                    ) : null}
                  </div>
                  <span style={{ color: "#475569", fontSize: 13, lineHeight: 1.5 }}>
                    {item.message || item.content}
                  </span>
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{formatDateTime(item.createdAt)}</span>
                </button>
              ))
            ) : (
              <div style={{ padding: 18, color: "#64748b" }}>Chưa có thông báo nào.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
