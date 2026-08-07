import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Loading from "@/components/Loading";
import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/storage";
import { useToast } from "@/components/ToastContext";

function isLegacyGuideNotification(item) {
  const title = String(item?.title || "").trim();
  const type = String(item?.metadata?.type || "").trim();

  /*
   * Các thông báo HDV đã tạo trước bản sửa backend được INSERT bằng SQL NOW().
   * MySQL trả chúng như chuỗi UTC dù giá trị thực tế đã là giờ Việt Nam.
   * Chỉ giữ tương thích cho dữ liệu cũ chưa có metadata type.
   */
  return (
    !type &&
    [
      "Đã có hướng dẫn viên phụ trách",
      "Hướng dẫn viên đã được cập nhật",
    ].includes(title)
  );
}

function formatNotificationDateTime(value, item = null) {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  /*
   * Chuẩn mới: timestamp được tạo bởi Prisma và được xem là thời điểm UTC thật.
   * Giao diện luôn hiển thị theo múi giờ Việt Nam (UTC+7).
   * Ví dụ 11:40Z -> 18:40 tại Việt Nam.
   *
   * Riêng dữ liệu HDV cũ tạo bằng SQL NOW() bị gắn nhãn UTC sai thì giữ nguyên
   * phần giờ UTC để 18:31 cũ vẫn hiển thị 18:31, không thành 01:31 hôm sau.
   */
  const timeZone = isLegacyGuideNotification(item) ? "UTC" : "Asia/Ho_Chi_Minh";

  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
    timeZone,
  }).format(parsed);
}

export default function NotificationsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const loadNotifications = async () => {
    const data = await apiFetch("/notifications/me");
    setItems(data || []);
    const queryId = router.query?.notificationId;
    const nextId = queryId || data?.[0]?.id || null;
    setSelectedId(nextId ? String(nextId) : null);
  };

  useEffect(() => {
    const user = getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    loadNotifications()
      .catch((error) => showToast(error.message, "error"))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(
    () => items.find((item) => String(item.id) === String(selectedId)) || null,
    [items, selectedId],
  );
  const selectedActionUrl =
    selected?.actionUrl || selected?.metadata?.actionUrl || null;
  const selectedActionLabel =
    selected?.actionLabel ||
    selected?.metadata?.actionLabel ||
    "Cập nhật tài khoản nhận hoàn";

  useEffect(() => {
    if (router.query?.notificationId) {
      setSelectedId(String(router.query.notificationId));
    }
  }, [router.query?.notificationId]);

  const unreadCount = items.filter((item) => !item.isRead).length;

  const openItem = async (item) => {
    setSelectedId(String(item.id));
    if (item.isRead) return;
    try {
      await apiFetch(`/notifications/${item.id}/read`, { method: "POST" });
      setItems((prev) =>
        prev.map((entry) =>
          String(entry.id) === String(item.id)
            ? { ...entry, isRead: true, readAt: new Date().toISOString() }
            : entry,
        ),
      );
      window.dispatchEvent(new Event("travela-notifications-changed"));
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  if (loading) return <Loading text="Đang tải thông báo..." />;

  return (
    <section style={{ padding: "32px 0 60px", background: "#f8fafc" }}>
      <div className="container" style={{ display: "grid", gap: 20 }}>
        <div
          style={{
            padding: 24,
            borderRadius: 28,
            background: "linear-gradient(135deg, #0f172a, #1e293b)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ color: "#86efac", fontWeight: 700, marginBottom: 8 }}>
              Trung tâm thông báo
            </div>
            <h1 style={{ margin: "0 0 8px", fontSize: "2rem" }}>
              Thông báo của bạn
            </h1>
            <p
              style={{
                margin: 0,
                color: "rgba(255,255,255,0.78)",
                maxWidth: 680,
              }}
            >
              Khi bấm xem, thông báo sẽ được đánh dấu đã đọc và hiển thị mờ hơn
              để bạn dễ quản lý.
            </p>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div style={statCardStyle}>
              <strong style={{ fontSize: 26 }}>{items.length}</strong>
              <span>Tổng thông báo</span>
            </div>
            <div style={statCardStyle}>
              <strong style={{ fontSize: 26 }}>{unreadCount}</strong>
              <span>Chưa xem</span>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(300px, 380px) minmax(0, 1fr)",
            gap: 20,
          }}
        >
          <aside
            style={{
              background: "#fff",
              borderRadius: 24,
              border: "1px solid #e2e8f0",
              padding: 16,
              boxShadow: "0 16px 34px rgba(15,23,42,0.05)",
              maxHeight: "75vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                padding: "8px 6px 14px",
                color: "#64748b",
                fontWeight: 700,
              }}
            >
              Danh sách thông báo
            </div>
            {items.length ? (
              items.map((item) => {
                const active = String(item.id) === String(selectedId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: active
                        ? "1px solid #bbf7d0"
                        : "1px solid #f1f5f9",
                      background: active ? "#f0fdf4" : "#fff",
                      opacity: item.isRead ? 0.58 : 1,
                      borderRadius: 18,
                      padding: 16,
                      marginBottom: 10,
                      cursor: "pointer",
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <strong style={{ color: "#0f172a", fontSize: 14 }}>
                        {item.title}
                      </strong>
                      {!item.isRead ? (
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: "#22c55e",
                            flexShrink: 0,
                          }}
                        />
                      ) : null}
                    </div>
                    <span
                      style={{
                        color: "#475569",
                        lineHeight: 1.5,
                        fontSize: 13,
                      }}
                    >
                      {item.message || item.content}
                    </span>
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>
                      {formatNotificationDateTime(item.createdAt, item)}
                    </span>
                  </button>
                );
              })
            ) : (
              <div style={{ padding: 16, color: "#64748b" }}>
                Hiện chưa có thông báo nào.
              </div>
            )}
          </aside>

          <article
            style={{
              background: "#fff",
              borderRadius: 24,
              border: "1px solid #e2e8f0",
              padding: 24,
              boxShadow: "0 16px 34px rgba(15,23,42,0.05)",
              minHeight: 420,
            }}
          >
            {selected ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: selected.isRead ? "#94a3b8" : "#16a34a",
                        fontWeight: 800,
                        marginBottom: 8,
                      }}
                    >
                      {selected.isRead ? "Đã xem" : "Mới"}
                    </div>
                    <h2 style={{ margin: 0, color: "#0f172a" }}>
                      {selected.title}
                    </h2>
                  </div>
                  <span style={{ color: "#94a3b8", fontSize: 13 }}>
                    {formatNotificationDateTime(selected.createdAt, selected)}
                  </span>
                </div>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.75,
                    color: "#334155",
                    fontSize: 15,
                  }}
                >
                  {selected.content}
                </div>
                {selectedActionUrl ? (
                  <Link href={selectedActionUrl} legacyBehavior>
                    <a
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 22,
                        padding: "12px 18px",
                        borderRadius: 999,
                        background: "#16a34a",
                        color: "#fff",
                        fontWeight: 800,
                        textDecoration: "none",
                        boxShadow: "0 12px 24px rgba(22, 163, 74, 0.22)",
                      }}
                    >
                      {selectedActionLabel}
                    </a>
                  </Link>
                ) : null}
              </>
            ) : (
              <div style={{ color: "#64748b" }}>
                Chọn một thông báo để xem chi tiết.
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}

const statCardStyle = {
  minWidth: 138,
  padding: "16px 18px",
  borderRadius: 18,
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.12)",
  display: "grid",
  gap: 4,
};
