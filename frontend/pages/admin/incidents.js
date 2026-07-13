import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import Modal from "@/components/Modal";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ToastContext";
import { formatDate, formatDateTime } from "@/lib/format";

const PAGE_SIZE = 6;

const STATUS_LABELS = {
  open: "Mới",
  acknowledged: "Đã tiếp nhận",
  in_progress: "Đang xử lý",
  resolved: "Đã giải quyết",
  closed: "Đã đóng",
  rejected: "Đã từ chối",
};

const SEVERITY_LABELS = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  critical: "Khẩn cấp",
};

const EMPTY_PAGINATION = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

export default function AdminGuideIncidentsPage() {
  const { showToast } = useToast();

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [reply, setReply] = useState("");
  const [resolution, setResolution] = useState("");

  const queryString = useMemo(() => {
    const query = new URLSearchParams();
    query.set("page", String(page));
    query.set("pageSize", String(PAGE_SIZE));
    query.set("status", status);
    query.set("severity", severity);
    if (appliedKeyword.trim()) query.set("search", appliedKeyword.trim());
    return query.toString();
  }, [page, status, severity, appliedKeyword]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await apiFetch(
        `/trip-operations/admin/incidents/all?${queryString}`,
      );

      setItems(Array.isArray(result?.items) ? result.items : []);
      setPagination(result?.pagination || EMPTY_PAGINATION);

      if (selectedIncident) {
        const refreshed = (result?.items || []).find(
          (item) => String(item.id) === String(selectedIncident.id),
        );
        if (refreshed) setSelectedIncident(refreshed);
      }
    } catch (error) {
      showToast(error?.message || "Không tải được danh sách sự cố.", "error");
      setItems([]);
      setPagination(EMPTY_PAGINATION);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  useEffect(() => {
    setPage(1);
  }, [status, severity]);

  const applySearch = (event) => {
    event?.preventDefault();
    setPage(1);
    setAppliedKeyword(keyword.trim());
  };

  const openDetail = (item) => {
    setSelectedIncident(item);
    setReply("");
    setResolution(item.resolution || "");
  };

  const updateStatus = async (item, nextStatus) => {
    try {
      setUpdatingId(item.id);
      await apiFetch(`/trip-operations/incidents/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextStatus,
          resolution: resolution.trim() || undefined,
        }),
      });

      showToast("Đã cập nhật trạng thái và gửi thông báo cho HDV.", "success");
      await load();
    } catch (error) {
      showToast(error?.message || "Không cập nhật được sự cố.", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const submitReply = async (event) => {
    event.preventDefault();

    if (!selectedIncident || !reply.trim()) {
      showToast("Vui lòng nhập nội dung phản hồi.", "error");
      return;
    }

    try {
      setUpdatingId(selectedIncident.id);

      const result = await apiFetch(
        `/trip-operations/incidents/${selectedIncident.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            comment: reply.trim(),
            isInternal: false,
          }),
        },
      );

      setReply("");

      showToast(
        result?.notificationSent
          ? "Đã gửi phản hồi và thông báo cho HDV."
          : "Đã lưu phản hồi nhưng HDV chưa có tài khoản liên kết.",
        result?.notificationSent ? "success" : "warning",
      );

      await load();

      window.dispatchEvent(new Event("travela-notifications-changed"));
    } catch (error) {
      showToast(error?.message || "Không gửi được phản hồi.", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <AdminLayout
      current="/admin/guides"
      title="Duyệt sự cố Hướng dẫn viên"
      subtitle="Tiếp nhận, phản hồi và theo dõi xử lý sự cố trong quá trình vận hành tour"
    >
      <div className="incident-page">
        <div className="guide-management-tabs">
          <Link href="/admin/guides" className="guide-management-tab">
            Tổng quan HDV
          </Link>
          <Link
            href="/admin/guide-competencies"
            className="guide-management-tab"
          >
            Duyệt chứng chỉ
          </Link>
          <Link href="/admin/incidents" className="guide-management-tab active">
            Duyệt sự cố
          </Link>
          <Link
            href="/admin/guide-availabilities"
            className="guide-management-tab"
          >
            Duyệt lịch bận
          </Link>
        </div>

        <form className="incident-toolbar" onSubmit={applySearch}>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Tìm tour, HDV, mã sự cố, nội dung..."
          />

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="open">Mới</option>
            <option value="acknowledged">Đã tiếp nhận</option>
            <option value="in_progress">Đang xử lý</option>
            <option value="resolved">Đã giải quyết</option>
            <option value="closed">Đã đóng</option>
            <option value="rejected">Đã từ chối</option>
          </select>

          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
          >
            <option value="all">Tất cả mức độ</option>
            <option value="critical">Khẩn cấp</option>
            <option value="high">Cao</option>
            <option value="medium">Trung bình</option>
            <option value="low">Thấp</option>
          </select>

          <button type="submit">Tìm kiếm</button>

          <button
            type="button"
            className="secondary"
            onClick={() => {
              setKeyword("");
              setAppliedKeyword("");
              setStatus("all");
              setSeverity("all");
              setPage(1);
            }}
          >
            Xóa lọc
          </button>
        </form>

        <div className="incident-result-meta">
          <span>
            Tổng cộng <strong>{pagination.total}</strong> sự cố
          </span>
          <span>
            Trang <strong>{pagination.page}</strong> / {pagination.totalPages}
          </span>
        </div>

        {loading ? (
          <Loading text="Đang tải danh sách sự cố..." />
        ) : (
          <>
            <div className="incident-table-wrap">
              <table className="incident-table">
                <thead>
                  <tr>
                    <th>Tour</th>
                    <th>Hướng dẫn viên</th>
                    <th>Thời gian</th>
                    <th>Địa điểm</th>
                    <th>Nội dung sự cố</th>
                    <th>Phản hồi gần nhất</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>

                <tbody>
                  {!items.length ? (
                    <tr>
                      <td colSpan="8" className="empty-row">
                        Không có sự cố phù hợp.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const comments = Array.isArray(item.comments)
                        ? item.comments.filter((comment) => !comment.isInternal)
                        : [];
                      const latestComment = comments[comments.length - 1];
                      const currentStatus = String(item.status || "open");
                      const currentSeverity = String(item.severity || "medium");

                      return (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.tourName || "--"}</strong>
                            <span>{item.ticketCode || "--"}</span>
                          </td>

                          <td>
                            <strong>
                              {item.reporterName || "Chưa xác định"}
                            </strong>
                            <span>{item.reporterPhone || "--"}</span>
                          </td>

                          <td>
                            <strong>{formatDate(item.departureDate)}</strong>
                            <span>
                              {item.endDate
                                ? `Đến ${formatDate(item.endDate)}`
                                : "Chưa cập nhật"}
                            </span>
                          </td>

                          <td>
                            <strong>
                              {item.locationName ||
                                item.destinationName ||
                                item.tourName ||
                                "--"}
                            </strong>
                            <span>{item.destinationProvince || ""}</span>
                          </td>

                          <td>
                            <div className={`severity ${currentSeverity}`}>
                              {SEVERITY_LABELS[currentSeverity] ||
                                currentSeverity}
                            </div>
                            <strong>{item.title || "Sự cố vận hành"}</strong>
                            <p>{item.description || "--"}</p>
                          </td>

                          <td>
                            {latestComment ? (
                              <>
                                <p className="response-text">
                                  {latestComment.comment}
                                </p>
                                <span>
                                  {latestComment.authorName || "Admin"} ·{" "}
                                  {formatDateTime(latestComment.createdAt)}
                                </span>
                              </>
                            ) : (
                              <span>Chưa có phản hồi</span>
                            )}
                          </td>

                          <td>
                            <span className={`status ${currentStatus}`}>
                              {STATUS_LABELS[currentStatus] || currentStatus}
                            </span>
                          </td>

                          <td>
                            <button
                              type="button"
                              className="detail-btn"
                              onClick={() => openDetail(item)}
                            >
                              Xem và phản hồi
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="pagination-wrap">
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        open={Boolean(selectedIncident)}
        onClose={() => !updatingId && setSelectedIncident(null)}
        title={`Chi tiết sự cố ${selectedIncident?.ticketCode || ""}`}
        size="lg"
      >
        {selectedIncident && (
          <div className="incident-detail">
            <div className="detail-grid">
              <Info label="Tour" value={selectedIncident.tourName} />
              <Info
                label="HDV báo sự cố"
                value={selectedIncident.reporterName}
              />
              <Info
                label="Thời gian"
                value={`${formatDate(selectedIncident.departureDate)} - ${formatDate(
                  selectedIncident.endDate,
                )}`}
              />
              <Info
                label="Địa điểm"
                value={
                  selectedIncident.locationName ||
                  selectedIncident.destinationName ||
                  "--"
                }
              />
            </div>

            <section className="detail-section">
              <h3>Nội dung sự cố</h3>
              <div className={`severity ${selectedIncident.severity}`}>
                {SEVERITY_LABELS[selectedIncident.severity] ||
                  selectedIncident.severity}
              </div>
              <strong>{selectedIncident.title}</strong>
              <p>{selectedIncident.description}</p>
            </section>

            <section className="detail-section">
              <h3>Lịch sử phản hồi</h3>
              {!selectedIncident.comments?.length ? (
                <p>Chưa có phản hồi nào.</p>
              ) : (
                <div className="comment-list">
                  {selectedIncident.comments
                    .filter((comment) => {
                      const internal =
                        comment.isInternal === true ||
                        Number(comment.isInternal) === 1;

                      return !internal;
                    })
                    .map((comment) => (
                      <article key={comment.id}>
                        <div>
                          <strong>{comment.authorName || "Người dùng"}</strong>

                          <span>
                            {comment.authorRole === "admin" ? "Admin" : "HDV"} ·{" "}
                            {formatDateTime(comment.createdAt)}
                          </span>
                        </div>

                        <p>{comment.comment}</p>
                      </article>
                    ))}
                </div>
              )}
            </section>

            <form className="reply-form" onSubmit={submitReply}>
              <label>
                Phản hồi / hướng xử lý
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Nhập nội dung phản hồi gửi cho hướng dẫn viên..."
                  rows={4}
                />
              </label>

              <button
                type="submit"
                disabled={updatingId === selectedIncident.id || !reply.trim()}
              >
                {updatingId === selectedIncident.id
                  ? "Đang gửi..."
                  : "Gửi phản hồi cho HDV"}
              </button>
            </form>
          </div>
        )}
      </Modal>

      <style jsx>{`
        .incident-page {
          display: grid;
          gap: 20px;
        }
        .guide-management-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding: 8px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
        }
        :global(.guide-management-tab) {
          min-height: 42px;
          padding: 0 16px;
          border-radius: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #475569;
          font-weight: 800;
          text-decoration: none;
        }
        :global(.guide-management-tab.active) {
          background: #2563eb;
          color: #fff;
        }
        .incident-toolbar {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 190px 180px auto auto;
          gap: 12px;
          padding: 16px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
        }
        .incident-toolbar input,
        .incident-toolbar select,
        textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 11px;
          padding: 11px 13px;
          background: #fff;
          outline: none;
        }
        .incident-toolbar button,
        .detail-btn,
        .reply-form button,
        .status-actions button {
          border: 0;
          border-radius: 10px;
          padding: 10px 13px;
          font-weight: 800;
          cursor: pointer;
        }
        .incident-toolbar button {
          background: #2563eb;
          color: #fff;
        }
        .incident-toolbar .secondary {
          background: #fff;
          color: #475569;
          border: 1px solid #e2e8f0;
        }
        .incident-result-meta {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          background: #fff;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          color: #64748b;
        }
        .incident-table-wrap {
          overflow-x: auto;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          background: #fff;
        }
        .incident-table {
          width: 100%;
          min-width: 1450px;
          border-collapse: collapse;
        }
        .incident-table th {
          padding: 15px;
          background: #f8fafc;
          color: #64748b;
          text-align: left;
          font-size: 0.76rem;
          text-transform: uppercase;
          border-bottom: 1px solid #e2e8f0;
        }
        .incident-table td {
          padding: 16px 15px;
          vertical-align: top;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }
        .incident-table td strong,
        .incident-table td span {
          display: block;
        }
        .incident-table td span {
          margin-top: 5px;
          color: #64748b;
          font-size: 0.82rem;
        }
        .incident-table p {
          margin: 7px 0 0;
          max-width: 280px;
          color: #64748b;
          line-height: 1.5;
        }
        .severity {
          width: fit-content;
          margin-bottom: 8px;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 900;
        }
        .severity.low {
          background: #ecfdf5;
          color: #047857;
        }
        .severity.medium {
          background: #fef3c7;
          color: #92400e;
        }
        .severity.high {
          background: #ffedd5;
          color: #c2410c;
        }
        .severity.critical {
          background: #fee2e2;
          color: #b91c1c;
        }
        .status {
          width: fit-content;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 900;
          white-space: nowrap;
        }
        .status.open {
          background: #fee2e2;
          color: #b91c1c;
        }
        .status.acknowledged {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .status.in_progress {
          background: #fef3c7;
          color: #92400e;
        }
        .status.resolved,
        .status.closed {
          background: #dcfce7;
          color: #166534;
        }
        .detail-btn {
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
        }
        .empty-row {
          text-align: center;
          padding: 50px !important;
        }
        .pagination-wrap {
          display: flex;
          justify-content: center;
          padding: 8px 0 24px;
        }
        .incident-detail {
          display: grid;
          gap: 18px;
        }
        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .detail-section {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px;
          background: #fff;
        }
        .detail-section h3 {
          margin: 0 0 12px;
          color: #0f172a;
        }
        .detail-section p {
          color: #475569;
          line-height: 1.6;
        }
        .comment-list {
          display: grid;
          gap: 10px;
        }
        .comment-list article {
          padding: 12px;
          border-radius: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }
        .comment-list article > div {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .comment-list article span {
          color: #64748b;
          font-size: 12px;
        }
        .reply-form {
          display: grid;
          gap: 12px;
          border: 1px solid #bfdbfe;
          border-radius: 16px;
          padding: 16px;
          background: #eff6ff;
        }
        .reply-form label,
        .detail-section label {
          display: grid;
          gap: 8px;
          font-weight: 700;
          color: #334155;
        }
        .reply-form button {
          background: #2563eb;
          color: #fff;
          justify-self: end;
        }
        .status-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
        }
        .status-actions button {
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
        }
        .status-actions .success {
          background: #dcfce7;
          color: #166534;
          border-color: #bbf7d0;
        }
        .status-actions .muted {
          background: #f1f5f9;
          color: #475569;
          border-color: #cbd5e1;
        }
        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        @media (max-width: 900px) {
          .incident-toolbar {
            grid-template-columns: 1fr;
          }
          .detail-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </AdminLayout>
  );
}

function Info({ label, value }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
      }}
    >
      <span style={{ display: "block", color: "#64748b", fontSize: 12 }}>
        {label}
      </span>
      <strong style={{ display: "block", color: "#0f172a", marginTop: 5 }}>
        {value || "--"}
      </strong>
    </div>
  );
}
