import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  Clock,
  Eye,
  MailOpen,
  RefreshCcw,
  Search,
} from "lucide-react";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ToastContext";

const PAGE_SIZE = 8;

export default function GuideNotificationsPanel({ notificationId = null }) {
  const { showToast } = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/notifications/me");
      const rows = Array.isArray(result) ? result : [];
      setItems(rows);

      if (notificationId) {
        const matched = rows.find(
          (item) => String(item.id) === String(notificationId),
        );
        if (matched) {
          setSelected(matched);
          if (!matched.isRead) await markRead(matched, false);
        }
      }
    } catch (error) {
      showToast(error?.message || "Không tải được thông báo.", "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, keyword]);

  const filtered = useMemo(() => {
    const key = keyword.trim().toLowerCase();

    return items.filter((item) => {
      const matchesRead =
        filter === "all" ||
        (filter === "unread" && !item.isRead) ||
        (filter === "read" && item.isRead);

      const text = [item.title, item.message, item.content]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesRead && (!key || text.includes(key));
    });
  }, [items, filter, keyword]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const unreadCount = items.filter((item) => !item.isRead).length;

  const markRead = async (item, showMessage = true) => {
    if (item.isRead) {
      setSelected(item);
      return;
    }

    try {
      await apiFetch(`/notifications/${item.id}/read`, { method: "POST" });

      const nextItem = {
        ...item,
        isRead: true,
        readAt: new Date().toISOString(),
      };

      setItems((current) =>
        current.map((entry) =>
          String(entry.id) === String(item.id) ? nextItem : entry,
        ),
      );
      setSelected(nextItem);
      window.dispatchEvent(new Event("travela-notifications-changed"));

      if (showMessage) {
        showToast("Đã đánh dấu thông báo là đã xem.", "success");
      }
    } catch (error) {
      showToast(error?.message || "Không cập nhật được thông báo.", "error");
    }
  };

  const markAllRead = async () => {
    const unreadItems = items.filter((item) => !item.isRead);
    if (!unreadItems.length) return;

    try {
      setMarkingAll(true);

      for (const item of unreadItems) {
        await apiFetch(`/notifications/${item.id}/read`, {
          method: "POST",
        });
      }

      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((item) => ({
          ...item,
          isRead: true,
          readAt: item.readAt || readAt,
        })),
      );

      if (selected) {
        setSelected((current) =>
          current ? { ...current, isRead: true, readAt } : current,
        );
      }

      window.dispatchEvent(new Event("travela-notifications-changed"));
      showToast("Đã đánh dấu tất cả thông báo là đã xem.", "success");
    } catch (error) {
      showToast(error?.message || "Không cập nhật được thông báo.", "error");
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading) {
    return <Loading text="Đang tải thông báo hướng dẫn viên..." />;
  }

  return (
    <div className="guide-notification-page fade-in">
      <div className="notification-heading">
        <div>
          <span>TRUNG TÂM THÔNG BÁO</span>
          <h2>Thông báo của hướng dẫn viên</h2>
          <p>
            Theo dõi phản hồi sự cố, kết quả duyệt chứng chỉ, lịch bận và thông
            tin điều hành từ Admin.
          </p>
        </div>

        <div className="notification-summary">
          <Bell size={22} />
          <div>
            <strong>{unreadCount}</strong>
            <span>chưa xem</span>
          </div>
        </div>
      </div>

      <div className="notification-toolbar">
        <div className="notification-search">
          <Search size={19} />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Tìm tiêu đề hoặc nội dung thông báo..."
          />
        </div>

        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">Tất cả thông báo</option>
          <option value="unread">Chưa xem</option>
          <option value="read">Đã xem</option>
        </select>

        <button type="button" className="refresh" onClick={load}>
          <RefreshCcw size={17} />
          Tải lại
        </button>

        <button
          type="button"
          className="mark-all"
          onClick={markAllRead}
          disabled={!unreadCount || markingAll}
        >
          <CheckCheck size={17} />
          {markingAll ? "Đang cập nhật..." : "Đánh dấu tất cả đã xem"}
        </button>
      </div>

      <div className="notification-layout">
        <div className="notification-list-card">
          <div className="notification-list-meta">
            <span>
              Hiển thị <strong>{pagedItems.length}</strong> /{" "}
              <strong>{filtered.length}</strong> thông báo
            </span>
            <span>
              Trang {page} / {totalPages}
            </span>
          </div>

          {!pagedItems.length ? (
            <div className="notification-empty">
              <MailOpen size={42} />
              <strong>Không có thông báo phù hợp</strong>
              <p>Hãy thử đổi bộ lọc hoặc từ khóa tìm kiếm.</p>
            </div>
          ) : (
            <div className="notification-items">
              {pagedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`notification-item ${
                    item.isRead ? "read" : "unread"
                  } ${
                    String(selected?.id) === String(item.id) ? "selected" : ""
                  }`}
                  onClick={() => markRead(item, false)}
                >
                  <div className="notification-item-icon">
                    {item.isRead ? <MailOpen size={20} /> : <Bell size={20} />}
                  </div>

                  <div className="notification-item-content">
                    <div className="notification-item-head">
                      <strong>{item.title}</strong>
                      {!item.isRead && <span className="unread-dot" />}
                    </div>

                    <p>{item.message || item.content}</p>

                    <span className="notification-time">
                      <Clock size={13} />
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>

                  <Eye size={18} className="notification-eye" />
                </button>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="notification-pagination">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>

        <div className="notification-detail-card">
          {!selected ? (
            <div className="notification-empty detail">
              <Eye size={42} />
              <strong>Chọn một thông báo</strong>
              <p>Nội dung chi tiết sẽ được hiển thị tại đây.</p>
            </div>
          ) : (
            <>
              <div className="detail-head">
                <div>
                  <span>{selected.isRead ? "Đã xem" : "Chưa xem"}</span>
                  <h3>{selected.title}</h3>
                </div>
                <div
                  className={selected.isRead ? "read-badge" : "unread-badge"}
                >
                  {selected.isRead ? "Đã xem" : "Mới"}
                </div>
              </div>

              <div className="detail-time">
                <Clock size={16} />
                {formatDateTime(selected.createdAt)}
              </div>

              {selected.message && (
                <div className="detail-message">{selected.message}</div>
              )}

              <div className="detail-content">
                {String(selected.content || selected.message || "")
                  .split("\n")
                  .map((line, index) => (
                    <p key={`${selected.id}-${index}`}>{line || "\u00A0"}</p>
                  ))}
              </div>

              {selected.createdByUser && (
                <div className="detail-sender">
                  <span>Người gửi</span>
                  <strong>
                    {selected.createdByUser.fullName ||
                      selected.createdByUser.email ||
                      "Travela Admin"}
                  </strong>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .guide-notification-page {
          display: grid;
          gap: 20px;
        }

        .notification-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          padding: 26px;
          border-radius: 20px;
          background: #fff;
          border: 1px solid #e2e8f0;
        }

        .notification-heading > div:first-child > span {
          color: #2563eb;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .notification-heading h2 {
          margin: 7px 0;
          color: #0f172a;
          font-size: 28px;
        }

        .notification-heading p {
          margin: 0;
          color: #64748b;
        }

        .notification-summary {
          min-width: 170px;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 14px 16px;
          border-radius: 14px;
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #bfdbfe;
        }

        .notification-summary div {
          display: grid;
        }

        .notification-summary strong {
          color: #0f172a;
          font-size: 22px;
        }

        .notification-summary span {
          color: #64748b;
          font-size: 12px;
        }

        .notification-toolbar {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 180px auto auto;
          gap: 12px;
          padding: 16px;
          border-radius: 16px;
          background: #fff;
          border: 1px solid #e2e8f0;
        }

        .notification-search {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 13px;
          border: 1px solid #cbd5e1;
          border-radius: 11px;
          color: #94a3b8;
        }

        .notification-search input,
        .notification-toolbar select {
          width: 100%;
          min-height: 42px;
          border: 0;
          outline: none;
          background: #fff;
          color: #0f172a;
        }

        .notification-toolbar select {
          border: 1px solid #cbd5e1;
          border-radius: 11px;
          padding: 0 12px;
        }

        .notification-toolbar button {
          min-height: 42px;
          border-radius: 11px;
          padding: 0 14px;
          border: 0;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          cursor: pointer;
        }

        .notification-toolbar .refresh {
          background: #fff;
          color: #475569;
          border: 1px solid #e2e8f0;
        }

        .notification-toolbar .mark-all {
          background: #2563eb;
          color: #fff;
        }

        .notification-toolbar button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .notification-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
          gap: 20px;
          align-items: start;
        }

        .notification-list-card,
        .notification-detail-card {
          border-radius: 18px;
          background: #fff;
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }

        .notification-list-meta {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 18px;
          background: #f8fafc;
          color: #64748b;
          font-size: 13px;
          border-bottom: 1px solid #e2e8f0;
        }

        .notification-items {
          padding: 10px;
          display: grid;
          gap: 8px;
        }

        .notification-item {
          width: 100%;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) 20px;
          gap: 12px;
          align-items: center;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid transparent;
          text-align: left;
          cursor: pointer;
          transition: 0.18s ease;
        }

        .notification-item.unread {
          background: #eff6ff;
          border-color: #bfdbfe;
        }

        .notification-item.read {
          background: #f8fafc;
          color: #64748b;
        }

        .notification-item.selected {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }

        .notification-item-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: #fff;
          color: #2563eb;
          border: 1px solid #dbeafe;
        }

        .notification-item-head {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }

        .notification-item-head strong {
          color: #0f172a;
          font-size: 14px;
        }

        .unread-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #2563eb;
          flex-shrink: 0;
        }

        .notification-item-content p {
          margin: 5px 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .notification-time {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #94a3b8;
          font-size: 11px;
        }

        .notification-eye {
          color: #94a3b8;
        }

        .notification-pagination {
          display: flex;
          justify-content: center;
          padding: 16px;
          border-top: 1px solid #e2e8f0;
        }

        .notification-detail-card {
          position: sticky;
          top: 92px;
          padding: 22px;
          min-height: 360px;
        }

        .detail-head {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 16px;
        }

        .detail-head > div:first-child > span {
          color: #2563eb;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .detail-head h3 {
          margin: 7px 0 0;
          color: #0f172a;
          font-size: 21px;
          line-height: 1.4;
        }

        .read-badge,
        .unread-badge {
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 900;
          white-space: nowrap;
        }

        .read-badge {
          background: #f1f5f9;
          color: #475569;
        }

        .unread-badge {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .detail-time {
          margin-top: 15px;
          display: flex;
          align-items: center;
          gap: 7px;
          color: #64748b;
          font-size: 13px;
        }

        .detail-message {
          margin-top: 16px;
          padding: 12px 14px;
          border-radius: 12px;
          background: #eff6ff;
          color: #1e40af;
          font-weight: 700;
          line-height: 1.5;
        }

        .detail-content {
          margin-top: 17px;
          color: #334155;
          line-height: 1.7;
        }

        .detail-content p {
          margin: 0 0 9px;
        }

        .detail-sender {
          margin-top: 22px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
          display: grid;
          gap: 4px;
        }

        .detail-sender span {
          color: #64748b;
          font-size: 12px;
        }

        .detail-sender strong {
          color: #0f172a;
        }

        .notification-empty {
          min-height: 280px;
          display: grid;
          place-content: center;
          justify-items: center;
          text-align: center;
          color: #94a3b8;
          gap: 8px;
          padding: 20px;
        }

        .notification-empty strong {
          color: #334155;
        }

        .notification-empty p {
          margin: 0;
        }

        .notification-empty.detail {
          min-height: 320px;
        }

        @media (max-width: 1100px) {
          .notification-layout {
            grid-template-columns: 1fr;
          }

          .notification-detail-card {
            position: static;
          }
        }

        @media (max-width: 850px) {
          .notification-toolbar {
            grid-template-columns: 1fr;
          }

          .notification-heading {
            flex-direction: column;
          }

          .notification-summary {
            width: 100%;
            box-sizing: border-box;
          }
        }
      `}</style>
    </div>
  );
}
