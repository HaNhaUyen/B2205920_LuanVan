import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";

const POLLING_INTERVAL_MS = 5000;
const RECENT_NOTIFICATION_LIMIT = 5;

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
      "Hồ sơ năng lực đã được duyệt",
      "Hồ sơ năng lực bị từ chối",
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

function getNotificationSortTimestamp(item) {
  if (!item?.createdAt) return 0;

  const parsed = new Date(item.createdAt);
  if (Number.isNaN(parsed.getTime())) return 0;

  return isLegacyGuideNotification(item)
    ? parsed.getTime() - 7 * 60 * 60 * 1000
    : parsed.getTime();
}

function sortNotificationsNewestFirst(items = []) {
  return [...items].sort((a, b) => {
    const timeDiff =
      getNotificationSortTimestamp(b) - getNotificationSortTimestamp(a);

    if (timeDiff !== 0) return timeDiff;

    // Cùng thời điểm thì ưu tiên id lớn hơn để thứ tự luôn ổn định.
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

function getNotificationListUrl(user) {
  return user?.role === "guide" ? "/guide?tab=notifications" : "/notifications";
}

function getNotificationDetailUrl(user, notificationId) {
  return user?.role === "guide"
    ? `/guide?tab=notifications&notificationId=${notificationId}`
    : `/notifications?notificationId=${notificationId}`;
}

function normalizeNotificationItems(value) {
  return sortNotificationsNewestFirst(Array.isArray(value) ? value : []);
}

function shorten(text = "", maxLength = 145) {
  const normalized = String(text || "").trim();

  if (!normalized) return "Không có nội dung mô tả.";

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

export default function NotificationBell({ user }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const rootRef = useRef(null);
  const mountedRef = useRef(false);
  const loadingRef = useRef(false);
  const lastUserIdRef = useRef(null);

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      if (!user?.id || loadingRef.current) return;

      loadingRef.current = true;

      if (!silent) {
        setLoading(true);
      }

      try {
        const [recent, unread] = await Promise.all([
          apiFetch(`/notifications/me?limit=${RECENT_NOTIFICATION_LIMIT}`),
          apiFetch("/notifications/me/unread-count"),
        ]);

        if (!mountedRef.current) return;

        setItems(normalizeNotificationItems(recent));
        setUnreadCount(Math.max(Number(unread?.total || 0), 0));
      } catch (error) {
        if (!silent) {
          console.error("Không tải được thông báo:", error);
        }
      } finally {
        loadingRef.current = false;

        if (mountedRef.current && !silent) {
          setLoading(false);
        }
      }
    },
    [user?.id],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setItems([]);
      setUnreadCount(0);
      setOpen(false);
      return;
    }

    if (String(lastUserIdRef.current) !== String(user.id)) {
      lastUserIdRef.current = user.id;
      setItems([]);
      setUnreadCount(0);
      setOpen(false);
    }

    const sync = () => {
      void loadData({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sync();
      }
    };

    const handleFocus = () => {
      sync();
    };

    /*
     * Tải ngay khi component xuất hiện.
     */
    void loadData();

    /*
     * Polling giúp khách hàng và HDV nhìn thấy thông báo tự động
     * hoặc thông báo do Admin vừa tạo mà không cần F5.
     */
    const timer = window.setInterval(sync, POLLING_INTERVAL_MS);

    window.addEventListener("travela-notifications-changed", sync);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);

      window.removeEventListener("travela-notifications-changed", sync);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user?.id, loadData]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const onEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  const openNotification = async (item) => {
    try {
      if (!item?.id) return;

      if (!item.isRead) {
        await apiFetch(`/notifications/${item.id}/read`, {
          method: "POST",
        });

        if (!mountedRef.current) return;

        setItems((current) =>
          current.map((entry) =>
            String(entry.id) === String(item.id)
              ? {
                  ...entry,
                  isRead: true,
                  readAt: new Date().toISOString(),
                }
              : entry,
          ),
        );

        setUnreadCount((current) => Math.max(current - 1, 0));

        /*
         * Báo cho các component thông báo khác trong cùng tab
         * cập nhật ngay.
         */
        window.dispatchEvent(
          new CustomEvent("travela-notifications-changed", {
            detail: {
              action: "read",
              notificationId: item.id,
            },
          }),
        );
      }

      setOpen(false);

      await router.push(getNotificationDetailUrl(user, item.id));
    } catch (error) {
      showToast(error?.message || "Không mở được thông báo.", "error");
    }
  };

  const handleToggle = () => {
    setOpen((current) => {
      const nextOpen = !current;

      if (nextOpen) {
        void loadData();
      }

      return nextOpen;
    });
  };

  if (!user) return null;

  const allUrl = getNotificationListUrl(user);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Mở thông báo"
        aria-expanded={open}
        onClick={handleToggle}
        title="Thông báo"
        style={{
          position: "relative",
          width: 42,
          height: 42,
          borderRadius: "50%",
          border: "1px solid #e2e8f0",
          background: open ? "#eff6ff" : "#ffffff",
          color: open ? "#2563eb" : "#334155",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: open ? "0 10px 24px rgba(37,99,235,0.12)" : "none",
          transition:
            "background .2s ease, color .2s ease, box-shadow .2s ease",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
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
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #ffffff",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Danh sách thông báo gần đây"
          style={{
            position: "absolute",
            right: 0,
            top: 52,
            width: 380,
            maxWidth: "min(92vw, 380px)",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            boxShadow: "0 24px 50px rgba(15,23,42,0.14)",
            overflow: "hidden",
            zIndex: 180,
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
              <strong
                style={{
                  display: "block",
                  color: "#0f172a",
                }}
              >
                Thông báo
              </strong>

              <span
                style={{
                  color: "#64748b",
                  fontSize: 13,
                }}
              >
                {unreadCount > 0
                  ? `${unreadCount} chưa xem`
                  : "Bạn đã xem tất cả"}
              </span>
            </div>

            <Link
              href={allUrl}
              onClick={() => setOpen(false)}
              style={{
                color: "#2563eb",
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              Xem tất cả
            </Link>
          </div>

          <div
            style={{
              maxHeight: 420,
              overflowY: "auto",
              padding: 10,
            }}
          >
            {loading && !items.length ? (
              <div
                style={{
                  padding: 18,
                  color: "#64748b",
                  textAlign: "center",
                }}
              >
                Đang tải thông báo...
              </div>
            ) : items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openNotification(item)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: item.isRead
                      ? "1px solid transparent"
                      : "1px solid #bfdbfe",
                    background: item.isRead ? "#f8fafc" : "#eff6ff",
                    opacity: item.isRead ? 0.78 : 1,
                    padding: 14,
                    borderRadius: 16,
                    marginBottom: 8,
                    cursor: "pointer",
                    display: "grid",
                    gap: 6,
                    transition:
                      "background .2s ease, border-color .2s ease, opacity .2s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <strong
                      style={{
                        color: "#0f172a",
                        fontSize: 14,
                        lineHeight: 1.4,
                      }}
                    >
                      {item.title || "Thông báo từ Travela"}
                    </strong>

                    {!item.isRead && (
                      <span
                        aria-label="Chưa đọc"
                        style={{
                          width: 9,
                          height: 9,
                          marginTop: 5,
                          borderRadius: "50%",
                          background: "#2563eb",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>

                  <span
                    style={{
                      color: "#475569",
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {shorten(item.message || item.content)}
                  </span>

                  <span
                    style={{
                      color: "#94a3b8",
                      fontSize: 12,
                    }}
                  >
                    {formatNotificationDateTime(item.createdAt, item)}
                  </span>
                </button>
              ))
            ) : (
              <div
                style={{
                  padding: 24,
                  color: "#64748b",
                  textAlign: "center",
                }}
              >
                Chưa có thông báo nào.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
