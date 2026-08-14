import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  RefreshCcw,
  Search,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import Modal from "@/components/Modal";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { formatDateTime, formatDate } from "@/lib/format";

const STATUS_LABELS = {
  pending: "Chờ duyệt",
  active: "Đã duyệt",
  rejected: "Đã từ chối",
  cancelled: "Đã hủy",
};

const TYPE_LABELS = {
  unavailable: "Không thể nhận tour",
  leave: "Nghỉ phép",
  training: "Đào tạo",
  personal: "Việc cá nhân",
  available: "Có thể nhận tour",
};

function formatGuideAvailabilityCreatedAt(value) {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateTime(value);

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
  }).format(date);
}

export default function AdminGuideAvailabilitiesPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [replacementGuides, setReplacementGuides] = useState([]);
  const [replacementGuideId, setReplacementGuideId] = useState("");
  const [replacementNote, setReplacementNote] = useState("");
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 10,
    search: "",
    status: "pending",
    urgency: "all",
  });
  const [data, setData] = useState({
    items: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== "" && value != null) params.set(key, String(value));
    });
    return params.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await apiFetch(
        `/operations-v2/admin/guide-availabilities?${query}`,
      );
      setData(result);
    } catch (error) {
      showToast(error.message || "Không tải được lịch bận HDV.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [query]);

  const loadReplacementGuides = async (item) => {
    const assignment = item?.replacementAssignment;
    if (!assignment) {
      setReplacementGuides([]);
      return;
    }

    try {
      const startDate = new Date(assignment.startDate)
        .toISOString()
        .slice(0, 10);
      const endDate = new Date(assignment.endDate).toISOString().slice(0, 10);
      const rows = await apiFetch(
        `/guides/available?startDate=${startDate}&endDate=${endDate}`,
      );
      setReplacementGuides(
        (rows || []).filter(
          (guide) => String(guide.id) !== String(item.guideId),
        ),
      );
    } catch (error) {
      setReplacementGuides([]);
      showToast(
        error.message || "Không tải được danh sách HDV thay thế.",
        "error",
      );
    }
  };

  const openDetail = async (item) => {
    setSelected(item);
    setReplacementGuideId("");
    setReplacementNote("");

    // Yêu cầu đã quá ngày bắt đầu chỉ được xem, không cần tải HDV thay thế.
    if (item.replacementRequired && !item.isExpired) {
      await loadReplacementGuides(item);
    } else {
      setReplacementGuides([]);
    }
  };

  const review = async (item, action, reason = "") => {
    if (!["approve", "reject"].includes(action))
      return showToast("Thao tác duyệt không hợp lệ.", "error");
    if (String(reason || "").trim().length > 1000)
      return showToast("Lý do phản hồi tối đa 1000 ký tự.", "error");
    if (action === "reject" && !String(reason || "").trim())
      return showToast("Vui lòng nhập lý do từ chối.", "error");
    try {
      setProcessing(true);
      await apiFetch(
        `/operations-v2/admin/guide-availabilities/${item.id}/review`,
        {
          method: "PATCH",
          body: JSON.stringify({ action, reason }),
        },
      );
      showToast(
        action === "approve" ? "Đã duyệt lịch bận." : "Đã từ chối yêu cầu.",
        "success",
      );
      setSelected(null);
      setRejecting(null);
      setRejectReason("");
      await load();
    } catch (error) {
      showToast(error.message || "Không thể xử lý yêu cầu.", "error");
    } finally {
      setProcessing(false);
    }
  };

  const replaceAndApprove = async () => {
    if (!selected || !replacementGuideId) {
      showToast("Vui lòng chọn hướng dẫn viên thay thế.", "error");
      return;
    }

    try {
      setProcessing(true);
      await apiFetch(
        `/operations-v2/admin/guide-availabilities/${selected.id}/replace-and-approve`,
        {
          method: "POST",
          body: JSON.stringify({
            replacementGuideId,
            note: replacementNote,
          }),
        },
      );
      showToast("Đã thay HDV và duyệt lịch bận.", "success");
      setSelected(null);
      setReplacementGuideId("");
      setReplacementNote("");
      await load();
    } catch (error) {
      showToast(error.message || "Không thể thay hướng dẫn viên.", "error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AdminLayout
      current="/admin/guide-availabilities"
      title="Duyệt lịch bận Hướng dẫn viên"
      subtitle="Yêu cầu mới nhất luôn hiển thị ở đầu danh sách"
    >
      <div className="ga-page">
        <GuideManagementTabs />
        <section className="ga-hero">
          <div>
            <span>ĐIỀU PHỐI HƯỚNG DẪN VIÊN</span>
            <h2>Yêu cầu không thể nhận tour</h2>
          </div>
          <div className="ga-hero-actions">
            <Link href="/admin/guides">
              <ArrowLeft size={16} /> Danh sách HDV
            </Link>
            <button onClick={load} disabled={loading}>
              <RefreshCcw size={16} /> Làm mới
            </button>
          </div>
        </section>

        <section className="ga-filters">
          <div className="ga-search">
            <Search size={18} />
            <input
              value={filters.search}
              placeholder="Tìm tên HDV, tour, booking, lý do..."
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                  page: 1,
                }))
              }
            />
          </div>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value,
                page: 1,
              }))
            }
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ duyệt</option>
            <option value="active">Đã duyệt</option>
            <option value="rejected">Đã từ chối</option>
            <option value="cancelled">Đã hủy</option>
          </select>

          <select
            value={filters.urgency}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                urgency: event.target.value,
                page: 1,
              }))
            }
            title="Lọc theo mức độ cần xử lý"
          >
            <option value="all">Tất cả mức độ</option>
            <option value="urgent">Cần xử lý gấp</option>
          </select>

          <strong>{data.pagination?.total || 0} yêu cầu</strong>
        </section>

        <section className="ga-list-card">
          {loading ? (
            <Loading text="Đang tải yêu cầu lịch bận..." />
          ) : !data.items?.length ? (
            <div className="ga-empty">
              <CalendarClock size={42} />
              <strong>Không có yêu cầu phù hợp</strong>
            </div>
          ) : (
            <div className="ga-list">
              {data.items.map((item) => {
                const assignment = item.replacementAssignment;
                return (
                  <article
                    className={`ga-row ${item.isExpired ? "expired" : ""}`}
                    key={item.id}
                  >
                    <div className={`ga-icon ${item.status}`}>
                      {item.replacementRequired ? (
                        <AlertTriangle size={21} />
                      ) : (
                        <Clock3 size={21} />
                      )}
                    </div>
                    <div className="ga-main">
                      <div className="ga-head">
                        <div>
                          <div className="ga-head-labels">
                            <span>{TYPE_LABELS[item.availabilityType]}</span>
                            {item.isExpired && item.status === "pending" ? (
                              <b className="ga-expired-badge">
                                <Clock3 size={12} />
                                Đã quá ngày · Chỉ xem
                              </b>
                            ) : item.isUrgent && item.status === "pending" ? (
                              <b className="ga-urgent-badge">
                                <AlertTriangle size={12} />
                                Cần xử lý gấp
                              </b>
                            ) : null}
                          </div>
                          <h3>{item.guide?.fullName || "Hướng dẫn viên"}</h3>
                        </div>
                        <em className={item.status}>
                          {STATUS_LABELS[item.status] || item.status}
                        </em>
                      </div>

                      <div className="ga-time">
                        <strong>{formatDate(item.startAt)}</strong>
                        <span>→</span>
                        <strong>{formatDate(item.endAt)}</strong>
                        <span>· Cả ngày</span>
                        {item.status === "pending" &&
                        Number.isFinite(Number(item.daysUntilStart)) ? (
                          <span
                            className={
                              item.isUrgent
                                ? "ga-days-left urgent"
                                : "ga-days-left"
                            }
                          >
                            {Number(item.daysUntilStart) < 0
                              ? `Đã quá ngày bắt đầu ${Math.abs(
                                  Number(item.daysUntilStart),
                                )} ngày`
                              : Number(item.daysUntilStart) === 0
                                ? "Bắt đầu hôm nay"
                                : `Còn ${Number(item.daysUntilStart)} ngày`}
                          </span>
                        ) : null}
                      </div>

                      <div className="ga-meta">
                        <span>{item.guide?.phone || "Chưa có SĐT"}</span>
                        <span>{item.reason || "Không nhập lý do"}</span>
                        <span>
                          Báo lúc:{" "}
                          {formatGuideAvailabilityCreatedAt(item.createdAt)}
                        </span>
                      </div>

                      {assignment && (
                        <div className="ga-tour-box">
                          <strong>
                            {assignment.tour?.name || "Tour cần thay HDV"}
                          </strong>
                          <span>
                            Booking: {assignment.booking?.bookingCode || "--"}
                          </span>
                          <span>
                            {formatDate(assignment.startDate)} -{" "}
                            {formatDate(assignment.endDate)}
                          </span>
                        </div>
                      )}

                      {item.otherConflictCount > 0 && (
                        <div className="ga-conflict">
                          Còn {item.otherConflictCount} tour khác trùng lịch.
                          Cần xử lý trước khi duyệt.
                        </div>
                      )}
                    </div>
                    <div className="ga-actions">
                      <button className="view" onClick={() => openDetail(item)}>
                        Xem chi tiết
                      </button>
                      {item.status === "pending" &&
                        !item.isExpired &&
                        !item.replacementRequired && (
                          <button
                            className="approve"
                            disabled={processing || item.otherConflictCount > 0}
                            onClick={() => review(item, "approve")}
                          >
                            <CheckCircle2 size={16} /> Duyệt
                          </button>
                        )}
                      {item.status === "pending" &&
                        !item.isExpired &&
                        item.replacementRequired && (
                          <button
                            className="replace"
                            disabled={processing}
                            onClick={() => openDetail(item)}
                          >
                            <UserRoundCheck size={16} /> Thay HDV
                          </button>
                        )}
                      {item.status === "pending" && !item.isExpired && (
                        <button
                          className="reject"
                          disabled={processing}
                          onClick={() => setRejecting(item)}
                        >
                          <XCircle size={16} /> Từ chối
                        </button>
                      )}
                      {item.status === "pending" && item.isExpired ? (
                        <span className="ga-view-only-note">Chỉ được xem</span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {data.pagination?.totalPages > 1 && (
            <div className="ga-pagination">
              <Pagination
                page={data.pagination.page}
                totalPages={data.pagination.totalPages}
                onPageChange={(page) =>
                  setFilters((current) => ({ ...current, page }))
                }
              />
            </div>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => !processing && setSelected(null)}
        title="Chi tiết yêu cầu lịch bận"
        size="lg"
      >
        {selected && (
          <div className="ga-detail">
            <div className="ga-detail-grid">
              <Info label="Hướng dẫn viên" value={selected.guide?.fullName} />
              <Info
                label="Loại yêu cầu"
                value={TYPE_LABELS[selected.availabilityType]}
              />
              <Info label="Ngày bắt đầu" value={formatDate(selected.startAt)} />
              <Info label="Ngày kết thúc" value={formatDate(selected.endAt)} />
              <Info
                label="Lý do"
                value={selected.reason || "Không nhập lý do"}
                full
              />
              <Info
                label="Thời điểm báo"
                value={formatGuideAvailabilityCreatedAt(selected.createdAt)}
                full
              />
            </div>

            {selected.isExpired && selected.status === "pending" ? (
              <div className="ga-expired-alert">
                <Clock3 size={18} />
                <div>
                  <strong>Yêu cầu đã quá ngày bắt đầu</strong>
                  <span>
                    Yêu cầu này chỉ được xem lịch sử. Không thể duyệt, từ chối
                    hoặc thay hướng dẫn viên.
                  </span>
                </div>
              </div>
            ) : null}

            {selected.replacementAssignment && !selected.isExpired && (
              <section className="ga-replacement-card">
                <h3>
                  {selected.status === "active"
                    ? "Thông tin phân công sau khi duyệt"
                    : "Tour cần phân công lại"}
                </h3>
                <strong>{selected.replacementAssignment.tour?.name}</strong>
                <p>
                  Booking:{" "}
                  {selected.replacementAssignment.booking?.bookingCode || "--"}
                </p>
                <p>
                  Thời gian:{" "}
                  {formatDate(selected.replacementAssignment.startDate)} -{" "}
                  {formatDate(selected.replacementAssignment.endDate)}
                </p>

                {selected.status === "active" && selected.replacementGuide ? (
                  <div
                    style={{
                      padding: "11px 12px",
                      borderRadius: 10,
                      background: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                      color: "#166534",
                    }}
                  >
                    <strong style={{ display: "block", marginBottom: 4 }}>
                      HDV đã được thay thế
                    </strong>
                    <span>
                      {selected.replacementGuide.fullName}
                      {selected.replacementGuide.phone
                        ? ` · ${selected.replacementGuide.phone}`
                        : ""}
                    </span>
                  </div>
                ) : null}

                {selected.status === "pending" ? (
                  <>
                    <label>Chọn hướng dẫn viên thay thế</label>
                    <select
                      value={replacementGuideId}
                      onChange={(event) =>
                        setReplacementGuideId(event.target.value)
                      }
                    >
                      <option value="">-- Chọn HDV đang rảnh --</option>
                      {replacementGuides.map((guide) => (
                        <option key={guide.id} value={guide.id}>
                          {guide.fullName} · {guide.phone || "Chưa có SĐT"}
                        </option>
                      ))}
                    </select>

                    <label>Ghi chú phân công</label>
                    <textarea
                      value={replacementNote}
                      onChange={(event) =>
                        setReplacementNote(event.target.value)
                      }
                      placeholder="Ví dụ: Thay HDV do người cũ có việc đột xuất"
                    />

                    {selected.otherConflictCount > 0 && (
                      <div className="ga-conflict">
                        HDV cũ còn {selected.otherConflictCount} tour khác trùng
                        thời gian. Hệ thống chỉ thay tour đang gắn với yêu cầu
                        này.
                      </div>
                    )}

                    <button
                      className="ga-primary-action"
                      onClick={replaceAndApprove}
                      disabled={processing || !replacementGuideId}
                    >
                      <UserRoundCheck size={18} />
                      {processing
                        ? "Đang xử lý..."
                        : "Phân công HDV mới và duyệt"}
                    </button>
                  </>
                ) : null}
              </section>
            )}

            {!selected.replacementRequired &&
              selected.status === "pending" &&
              !selected.isExpired && (
                <div className="ga-modal-actions">
                  <button
                    className="approve"
                    disabled={processing || selected.otherConflictCount > 0}
                    onClick={() => review(selected, "approve")}
                  >
                    Duyệt lịch bận
                  </button>
                  <button
                    className="reject"
                    onClick={() => setRejecting(selected)}
                  >
                    Từ chối
                  </button>
                </div>
              )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => !processing && setRejecting(null)}
        title="Từ chối yêu cầu"
        size="sm"
      >
        <div className="ga-reject-modal">
          <textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Nhập lý do từ chối..."
          />
          <div>
            <button onClick={() => setRejecting(null)} disabled={processing}>
              Hủy
            </button>
            <button
              className="reject"
              onClick={() => review(rejecting, "reject", rejectReason)}
              disabled={processing || !rejectReason.trim()}
            >
              Xác nhận từ chối
            </button>
          </div>
        </div>
      </Modal>

      <style jsx global>{`
        .ga-page {
          display: grid;
          gap: 18px;
          color: #0f172a;
        }
        .ga-hero,
        .ga-filters,
        .ga-list-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
        }
        .ga-hero {
          padding: 22px 24px;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: center;
        }
        .ga-hero span {
          color: #ea580c;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }
        .ga-hero h2 {
          margin: 5px 0;
          font-size: 24px;
        }
        .ga-hero p {
          margin: 0;
          color: #64748b;
        }
        .ga-hero-actions {
          display: flex;
          gap: 8px;
        }
        .ga-hero-actions a,
        .ga-hero-actions button {
          min-height: 40px;
          padding: 0 14px;
          border: 1px solid #dbe3ef;
          border-radius: 10px;
          background: #fff;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          text-decoration: none;
          color: #334155;
        }
        .ga-filters {
          padding: 14px;
          display: grid;
          grid-template-columns: minmax(280px, 1fr) 175px 180px auto;
          gap: 11px;
          align-items: center;
        }
        .ga-search {
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 0 12px;
          color: #94a3b8;
        }
        .ga-search input {
          width: 100%;
          min-height: 42px;
          border: 0;
          outline: 0;
        }
        .ga-filters select {
          min-height: 42px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 0 10px;
        }
        .ga-list-card {
          padding: 18px;
        }
        .ga-list {
          display: grid;
          gap: 12px;
        }
        .ga-row {
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr) 150px;
          gap: 14px;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
        }
        .ga-icon {
          width: 46px;
          height: 46px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          background: #fff7ed;
          color: #ea580c;
        }
        .ga-icon.active {
          background: #ecfdf5;
          color: #059669;
        }
        .ga-icon.rejected,
        .ga-icon.cancelled {
          background: #f1f5f9;
          color: #64748b;
        }
        .ga-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .ga-head span {
          font-size: 11px;
          color: #64748b;
        }
        .ga-head-labels {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ga-urgent-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 7px;
          border-radius: 999px;
          background: #fee2e2;
          color: #b91c1c;
          font-size: 10px;
          font-weight: 900;
          line-height: 1;
          white-space: nowrap;
        }
        .ga-expired-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 7px;
          border-radius: 999px;
          background: #f1f5f9;
          color: #64748b;
          font-size: 10px;
          font-weight: 900;
          line-height: 1;
          white-space: nowrap;
        }
        .ga-row.expired {
          background: #f8fafc;
          border-color: #e2e8f0;
        }
        .ga-row.expired .ga-main {
          opacity: 0.88;
        }
        .ga-view-only-note {
          min-height: 37px;
          border-radius: 9px;
          padding: 0 11px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #64748b;
          font-weight: 800;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ga-expired-alert {
          padding: 13px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 11px;
          background: #f8fafc;
          color: #475569;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .ga-expired-alert > div {
          display: grid;
          gap: 4px;
        }
        .ga-expired-alert strong {
          color: #334155;
          font-size: 13px;
        }
        .ga-expired-alert span {
          color: #64748b;
          font-size: 12px;
          line-height: 1.5;
        }
        .ga-head h3 {
          margin: 3px 0 0;
          font-size: 17px;
        }
        .ga-head em {
          font-style: normal;
          font-size: 10px;
          font-weight: 900;
          border-radius: 999px;
          padding: 5px 8px;
          height: fit-content;
        }
        .ga-head em.pending {
          background: #fef3c7;
          color: #92400e;
        }
        .ga-head em.active {
          background: #dcfce7;
          color: #166534;
        }
        .ga-head em.rejected,
        .ga-head em.cancelled {
          background: #fee2e2;
          color: #991b1b;
        }
        .ga-time,
        .ga-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 7px 13px;
          margin-top: 9px;
          color: #64748b;
          font-size: 12px;
        }
        .ga-time strong {
          color: #334155;
        }
        .ga-days-left {
          padding: 3px 7px;
          border-radius: 999px;
          background: #f1f5f9;
          color: #475569 !important;
          font-weight: 800;
        }
        .ga-days-left.urgent {
          background: #fff1f2;
          color: #be123c !important;
        }
        .ga-tour-box {
          margin-top: 10px;
          padding: 11px 12px;
          border-radius: 11px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          display: grid;
          gap: 4px;
        }
        .ga-tour-box strong {
          color: #1d4ed8;
        }
        .ga-tour-box span {
          color: #475569;
          font-size: 12px;
        }
        .ga-conflict {
          margin-top: 10px;
          padding: 9px 11px;
          border-radius: 9px;
          background: #fef2f2;
          color: #991b1b;
          font-size: 12px;
        }
        .ga-actions {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .ga-actions button,
        .ga-modal-actions button,
        .ga-reject-modal button,
        .ga-primary-action {
          min-height: 37px;
          border-radius: 9px;
          padding: 0 11px;
          border: 1px solid #dbe3ef;
          background: #fff;
          font-weight: 800;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
        }
        .ga-actions .approve,
        .ga-modal-actions .approve {
          background: #ecfdf5;
          color: #047857;
          border-color: #a7f3d0;
        }
        .ga-actions .replace,
        .ga-primary-action {
          background: #eff6ff;
          color: #1d4ed8;
          border-color: #bfdbfe;
        }
        .ga-actions .reject,
        .ga-modal-actions .reject,
        .ga-reject-modal .reject {
          background: #fef2f2;
          color: #b91c1c;
          border-color: #fecaca;
        }
        .ga-actions button:disabled,
        .ga-primary-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ga-empty {
          min-height: 260px;
          display: grid;
          place-content: center;
          justify-items: center;
          gap: 8px;
          color: #64748b;
        }
        .ga-pagination {
          display: flex;
          justify-content: center;
          margin-top: 16px;
        }
        .ga-detail {
          display: grid;
          gap: 18px;
        }
        .ga-detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 11px;
        }
        .ga-info {
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
          display: grid;
          gap: 4px;
        }
        .ga-info.full {
          grid-column: 1/-1;
        }
        .ga-info span {
          font-size: 11px;
          color: #64748b;
        }
        .ga-replacement-card {
          padding: 16px;
          border-radius: 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          display: grid;
          gap: 10px;
        }
        .ga-replacement-card h3 {
          margin: 0;
        }
        .ga-replacement-card p {
          margin: 0;
          color: #64748b;
        }
        .ga-replacement-card label {
          font-size: 12px;
          font-weight: 800;
          color: #334155;
          margin-top: 4px;
        }
        .ga-replacement-card select,
        .ga-replacement-card textarea,
        .ga-reject-modal textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 11px;
        }
        .ga-replacement-card textarea,
        .ga-reject-modal textarea {
          min-height: 100px;
        }
        .ga-modal-actions,
        .ga-reject-modal > div {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .ga-reject-modal {
          display: grid;
          gap: 12px;
        }
        @media (max-width: 800px) {
          .ga-filters {
            grid-template-columns: 1fr;
          }
          .ga-row {
            grid-template-columns: 46px 1fr;
          }
          .ga-actions {
            grid-column: 2;
            flex-direction: row;
            flex-wrap: wrap;
          }
          .ga-hero {
            flex-direction: column;
            align-items: stretch;
          }
          .ga-detail-grid {
            grid-template-columns: 1fr;
          }
          .ga-info.full {
            grid-column: auto;
          }
        }
      `}</style>
    </AdminLayout>
  );
}

function GuideManagementTabs() {
  const tabs = [
    { href: "/admin/guides", label: "Tổng quan HDV" },
    { href: "/admin/guide-competencies", label: "Duyệt chứng chỉ" },
    { href: "/admin/incidents", label: "Duyệt sự cố" },
    { href: "/admin/guide-availabilities", label: "Duyệt lịch bận" },
    { href: "/admin/trip-reports", label: "Báo cáo chuyến đi" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        padding: 8,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
      }}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          style={{
            minHeight: 42,
            padding: "0 16px",
            borderRadius: 11,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            fontWeight: 800,
            color:
              tab.href === "/admin/guide-availabilities" ? "#fff" : "#475569",
            background:
              tab.href === "/admin/guide-availabilities"
                ? "#2563eb"
                : "transparent",
            boxShadow:
              tab.href === "/admin/guide-availabilities"
                ? "0 6px 16px rgba(37, 99, 235, .22)"
                : "none",
          }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function Info({ label, value, full = false }) {
  return (
    <div className={`ga-info ${full ? "full" : ""}`}>
      <span>{label}</span>
      <strong>{value || "--"}</strong>
    </div>
  );
}
