import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/format";

const emptyPage = {
  items: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
};

const initialFilters = {
  page: 1,
  pageSize: 10,
  search: "",
  isPublished: "",
};

const initialForm = {
  id: "",
  title: "",
  message: "",
  content: "",
  isPublished: true,
};

const initialBulkFilters = {
  days: "7",
  destinationId: "",
  search: "",
  onlyMissingGuide: false,
  onlyUnpaid: false,
};

const initialBulkForm = {
  type: "reminder",
  channels: ["notification"],
  title: "",
  message: "",
  content: "",
};

function buildQuery(filters) {
  const qs = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "boolean") qs.set(key, value ? "true" : "false");
    else qs.set(key, String(value));
  });
  return qs.toString();
}

function shorten(text = "", max = 90) {
  if (!text) return "--";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function statusBadge(isPublished) {
  return isPublished ? "Đang hiển thị" : "Đang ẩn";
}

function bulkTypeLabel(type) {
  const map = {
    reminder: "Nhắc lịch khởi hành",
    pickup_info: "Thông tin điểm đón",
    itinerary_change: "Thay đổi lịch trình",
    guide_change: "Đổi hướng dẫn viên",
    custom: "Nội dung tùy chỉnh",
  };
  return map[type] || type;
}

function channelLabel(channels = []) {
  if (channels.includes("both")) return "Thông báo + Email";
  if (channels.includes("email") && channels.includes("notification"))
    return "Thông báo + Email";
  if (channels.includes("email")) return "Email";
  return "Thông báo trong hệ thống";
}

function buildDefaultBulkContent(type, target) {
  if (!target) return { title: "", message: "", content: "" };
  const tourName = target.tourName || "tour của Travela";
  const destination = target.destinationName || "điểm đến";
  const departureDate = formatDate(target.departureDate);
  const endDate = formatDate(target.endDate);
  const first = target.bookings?.[0] || {};
  const pickupName = first.pickupName || "Travela sẽ liên hệ xác nhận";
  const pickupAddress = first.pickupAddress || "đang cập nhật";
  const pickupTime = first.pickupTime
    ? formatDateTime(first.pickupTime).slice(-5)
    : "Travela sẽ liên hệ";
  const guideNames = target.guideNames?.length
    ? target.guideNames.join(", ")
    : "Travela sẽ cập nhật trong thời gian sớm nhất";

  if (type === "pickup_info") {
    return {
      title: `Thông tin điểm đón tour ${tourName}`,
      message: `Cập nhật điểm đón cho tour khởi hành ngày ${departureDate}.`,
      content: `Travela thông báo thông tin điểm đón tour ${tourName} (${destination}) khởi hành ngày ${departureDate}. Điểm đón: ${pickupName}. Địa chỉ: ${pickupAddress}. Thời gian đón: ${pickupTime}. Quý khách vui lòng có mặt trước giờ đón 15 phút.`,
    };
  }

  if (type === "itinerary_change") {
    return {
      title: `Cập nhật lịch trình tour ${tourName}`,
      message: `Travela có cập nhật lịch trình tour ${departureDate}.`,
      content: `Travela thông báo tour ${tourName} (${destination}) khởi hành ngày ${departureDate} có điều chỉnh lịch trình. Nội dung chi tiết sẽ được nhân viên Travela liên hệ xác nhận. Rất mong quý khách thông cảm và theo dõi thông báo mới nhất.`,
    };
  }

  if (type === "guide_change") {
    return {
      title: `Cập nhật hướng dẫn viên tour ${tourName}`,
      message: "Thông tin hướng dẫn viên đã được cập nhật.",
      content: `Travela thông báo hướng dẫn viên phụ trách tour ${tourName} (${destination}) khởi hành ngày ${departureDate}: ${guideNames}. Quý khách vui lòng theo dõi thông báo và liên hệ Travela nếu cần hỗ trợ.`,
    };
  }

  if (type === "custom") {
    return {
      title: "Thông báo từ Travela",
      message: "Travela gửi thông báo đến quý khách.",
      content: "Travela gửi thông báo đến quý khách.",
    };
  }

  return {
    title: `Nhắc lịch khởi hành tour ${tourName}`,
    message: `Tour sẽ khởi hành ngày ${departureDate}.`,
    content: `Travela nhắc lịch tour ${tourName} (${destination}) sẽ khởi hành ngày ${departureDate} và kết thúc ngày ${endDate}. Điểm đón: ${pickupName}. Địa chỉ: ${pickupAddress}. Thời gian đón: ${pickupTime}. Quý khách vui lòng kiểm tra email, chuẩn bị giấy tờ tùy thân và có mặt trước giờ đón 15 phút.`,
  };
}

const cardStyle = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 20,
  boxShadow: "0 10px 30px rgba(15,23,42,.04)",
};

export default function AdminNotificationsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("list");
  const [submitting, setSubmitting] = useState(false);

  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(emptyPage);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(initialForm);

  const [bulkFilters, setBulkFilters] = useState(initialBulkFilters);
  const [bulkData, setBulkData] = useState({
    items: [],
    destinations: [],
    summary: {},
  });
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedBookingIds, setSelectedBookingIds] = useState([]);
  const [bulkForm, setBulkForm] = useState(initialBulkForm);
  const [bulkResult, setBulkResult] = useState(null);

  const loadData = async (nextFilters = filters) => {
    setData(await apiFetch(`/admin/notifications?${buildQuery(nextFilters)}`));
  };

  const loadBulkTargets = async (nextFilters = bulkFilters) => {
    setBulkLoading(true);
    try {
      const result = await apiFetch(
        `/admin/notifications/bulk-targets?${buildQuery(nextFilters)}`,
      );
      setBulkData(result);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBulkLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([loadData(initialFilters), loadBulkTargets(initialBulkFilters)])
      .catch((error) => showToast(error.message, "error"))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading)
      loadData(filters).catch((error) => showToast(error.message, "error"));
  }, [filters.page, filters.search, filters.isPublished]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const items = data.items || [];
    return {
      total: data.pagination?.total || 0,
      published: items.filter((item) => item.isPublished).length,
      hidden: items.filter((item) => !item.isPublished).length,
      reads: items.reduce(
        (sum, item) => sum + Number(item?._count?.reads || 0),
        0,
      ),
    };
  }, [data]);

  const bulkStats = bulkData.summary || {};

  const openCreate = () => {
    setForm(initialForm);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setForm({
      id: String(item.id),
      title: item.title || "",
      message: item.message || "",
      content: item.content || "",
      isPublished: Boolean(item.isPublished),
    });
    setModalOpen(true);
  };

  const openDetail = async (id) => {
    try {
      setDetail(await apiFetch(`/admin/notifications/${id}`));
      setDetailOpen(true);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const submitForm = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      showToast("Cần nhập tiêu đề và nội dung thông báo.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: form.title,
        message: form.message,
        content: form.content,
        isPublished: form.isPublished,
        targetRole: "user",
      };

      if (form.id) {
        await apiFetch(`/admin/notifications/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        showToast("Đã cập nhật thông báo.", "success");
      } else {
        await apiFetch(`/admin/notifications`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("Đã tạo thông báo mới.", "success");
      }
      setModalOpen(false);
      setForm(initialForm);
      await loadData();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const removeItem = async (id) => {
    if (!window.confirm("Xóa thông báo này?")) return;
    try {
      await apiFetch(`/admin/notifications/${id}`, { method: "DELETE" });
      showToast("Đã xóa thông báo.", "success");
      await loadData();
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const openBulkModal = (target) => {
    const defaults = buildDefaultBulkContent("reminder", target);
    setSelectedTarget(target);
    setSelectedBookingIds((target.bookings || []).map((b) => String(b.id)));
    setBulkForm({ ...initialBulkForm, ...defaults });
    setBulkResult(null);
    setBulkModalOpen(true);
  };

  const changeBulkType = (type) => {
    const defaults = buildDefaultBulkContent(type, selectedTarget);
    setBulkForm((prev) => ({ ...prev, type, ...defaults }));
  };

  const toggleChannel = (channel) => {
    setBulkForm((prev) => {
      const exists = prev.channels.includes(channel);
      const channels = exists
        ? prev.channels.filter((item) => item !== channel)
        : [...prev.channels, channel];
      return {
        ...prev,
        channels: channels.length ? channels : ["notification"],
      };
    });
  };

  const toggleBooking = (bookingId) => {
    setSelectedBookingIds((prev) => {
      const id = String(bookingId);
      return prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];
    });
  };

  const submitBulk = async () => {
    if (!selectedTarget) return;
    if (!selectedBookingIds.length) {
      showToast("Cần chọn ít nhất 1 booking để gửi.", "error");
      return;
    }
    if (!bulkForm.title.trim() || !bulkForm.content.trim()) {
      showToast("Cần nhập tiêu đề và nội dung gửi.", "error");
      return;
    }

    setSubmitting(true);
    setBulkResult(null);
    try {
      const result = await apiFetch(`/admin/notifications/bulk-send`, {
        method: "POST",
        body: JSON.stringify({
          departureId: selectedTarget.departureId,
          bookingIds: selectedBookingIds,
          ...bulkForm,
        }),
      });
      setBulkResult(result);
      showToast("Đã xử lý gửi hàng loạt.", "success");
      await Promise.all([loadData(), loadBulkTargets()]);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading text="Đang tải quản lý thông báo..." />;

  return (
    <AdminLayout
      current="/admin/notifications"
      title="Quản lý thông báo"
      subtitle="Tạo thông báo thường và gửi thông báo/email hàng loạt theo lịch khởi hành."
    >
      <style jsx global>{`
        .row-actions,
        .admin-inline-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .row-actions .btn,
        .admin-inline-actions .btn {
          height: 30px;
          min-width: 58px;
          padding: 0 14px;
          border-radius: 8px;
          border: 1px solid transparent;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
          box-shadow: none;
          gap: 6px;
          white-space: nowrap;
        }
        .row-actions .btn-light,
        .admin-inline-actions .btn-light {
          background: #ffffff;
          color: #111827;
          border-color: #e5e7eb;
        }
        .row-actions .btn-light:hover,
        .admin-inline-actions .btn-light:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .row-actions .btn-primary,
        .admin-inline-actions .btn-primary {
          background: #ffffff;
          color: #111827;
          border-color: #e5e7eb;
        }
        .row-actions .btn-primary:hover,
        .admin-inline-actions .btn-primary:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .row-actions .btn-danger,
        .admin-inline-actions .btn-danger {
          background: #fee2e2;
          color: #dc2626;
          border-color: #fee2e2;
        }
        .row-actions .btn-danger:hover,
        .admin-inline-actions .btn-danger:hover {
          background: #fecaca;
          border-color: #fecaca;
        }
        .notify-tabs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .notify-tab {
          border: 1px solid #dbe3ef;
          background: #fff;
          color: #334155;
          border-radius: 999px;
          padding: 10px 16px;
          font-weight: 700;
          cursor: pointer;
        }
        .notify-tab.active {
          background: #0f172a;
          color: white;
          border-color: #0f172a;
        }
        .smart-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 20px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
        }
        .smart-input {
          width: 100%;
          border: 1px solid #dbe3ef;
          background: #f8fafc;
          border-radius: 12px;
          padding: 11px 13px;
          outline: none;
        }
        .smart-input:focus {
          border-color: #72b44b;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(114, 180, 75, 0.13);
        }
        .smart-grid {
          display: grid;
          gap: 16px;
        }
        .smart-stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }
        .smart-stat {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px;
        }
        .smart-stat strong {
          display: block;
          font-size: 1.6rem;
          color: #0f172a;
        }
        .smart-stat span {
          color: #64748b;
          font-size: 0.9rem;
        }
        .target-card {
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 18px;
          background: #fff;
          display: grid;
          gap: 14px;
        }
        .target-card.warn {
          border-color: #fed7aa;
          background: #fffaf5;
        }
        .target-header {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 0.8rem;
          font-weight: 700;
          background: #f1f5f9;
          color: #334155;
        }
        .pill.green {
          background: #dcfce7;
          color: #166534;
        }
        .pill.red {
          background: #fee2e2;
          color: #991b1b;
        }
        .pill.yellow {
          background: #fef3c7;
          color: #92400e;
        }
        .pill.blue {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .checklist {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 8px;
        }
        .checkitem {
          padding: 9px 10px;
          border-radius: 12px;
          background: #f8fafc;
          color: #475569;
          font-size: 0.88rem;
          font-weight: 600;
        }
        .checkitem.ok {
          background: #ecfdf5;
          color: #047857;
        }
        .checkitem.bad {
          background: #fff7ed;
          color: #c2410c;
        }
        .table-wrap {
          overflow: auto;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          background: #fff;
        }
        .notify-table {
          width: 100%;
          min-width: 760px;
          border-collapse: collapse;
        }
        .notify-table th {
          text-align: left;
          background: #f8fafc;
          color: #475569;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 14px 16px;
          border-bottom: 1px solid #e2e8f0;
        }
        .notify-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #eef2f7;
          vertical-align: top;
        }
        .bulk-booking-list {
          max-height: 300px;
          overflow: auto;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
        }
        .bulk-booking-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid #eef2f7;
        }
        @media (max-width: 768px) {
          .target-header {
            display: grid;
          }
        }
      `}</style>

      <div className="notify-tabs">
        <button
          className={`notify-tab ${tab === "list" ? "active" : ""}`}
          onClick={() => setTab("list")}
        >
          Danh sách thông báo
        </button>
        <button
          className={`notify-tab ${tab === "bulk" ? "active" : ""}`}
          onClick={() => setTab("bulk")}
        >
          Gửi hàng loạt theo tour
        </button>
      </div>

      {tab === "list" && (
        <>
          <section className="smart-stat-grid">
            <div className="smart-stat">
              <strong>{formatNumber(stats.total)}</strong>
              <span>Tổng thông báo</span>
            </div>
            <div className="smart-stat">
              <strong>{formatNumber(stats.published)}</strong>
              <span>Đang hiển thị</span>
            </div>
            <div className="smart-stat">
              <strong>{formatNumber(stats.hidden)}</strong>
              <span>Đang ẩn</span>
            </div>
            <div className="smart-stat">
              <strong>{formatNumber(stats.reads)}</strong>
              <span>Lượt đã xem</span>
            </div>
          </section>

          <section className="smart-card" style={{ marginBottom: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 180px auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <input
                className="smart-input"
                placeholder="Tìm tiêu đề, mô tả, nội dung..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    search: e.target.value,
                    page: 1,
                  }))
                }
              />
              <select
                className="smart-input"
                value={filters.isPublished}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    isPublished: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả trạng thái</option>
                <option value="true">Đang hiển thị</option>
                <option value="false">Đang ẩn</option>
              </select>
              <button
                type="button"
                className="btn btn-primary"
                onClick={openCreate}
              >
                + Tạo thông báo
              </button>
            </div>
          </section>

          <div className="table-wrap">
            <table className="notify-table">
              <thead>
                <tr>
                  <th>Thông báo</th>
                  <th>Trạng thái</th>
                  <th>Lượt xem</th>
                  <th>Ngày tạo</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).length ? (
                  data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.title}</strong>
                        <div style={{ color: "#64748b", marginTop: 4 }}>
                          {shorten(item.message || item.content, 110)}
                        </div>
                        {item.targetUser && (
                          <div className="pill blue" style={{ marginTop: 8 }}>
                            Gửi riêng: {item.targetUser.fullName}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`pill ${item.isPublished ? "green" : "yellow"}`}
                        >
                          {statusBadge(item.isPublished)}
                        </span>
                      </td>
                      <td>{formatNumber(item?._count?.reads || 0)}</td>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td style={{ textAlign: "right" }}>
                        <div className="admin-inline-actions">
                          <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={() => openDetail(item.id)}
                          >
                            Xem
                          </button>
                          <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={() => openEdit(item)}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => removeItem(item.id)}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: "center",
                        padding: 40,
                        color: "#64748b",
                      }}
                    >
                      Chưa có thông báo phù hợp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: 16,
            }}
          >
            <Pagination
              page={data.pagination?.page}
              totalPages={data.pagination?.totalPages}
              onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
              compact
            />
          </div>
        </>
      )}

      {tab === "bulk" && (
        <>
          <section className="smart-stat-grid">
            <div className="smart-stat">
              <strong>{formatNumber(bulkStats.totalDepartures || 0)}</strong>
              <span>Lịch có booking</span>
            </div>
            <div className="smart-stat">
              <strong>{formatNumber(bulkStats.totalBookings || 0)}</strong>
              <span>Booking có thể gửi</span>
            </div>
            <div className="smart-stat">
              <strong>{formatNumber(bulkStats.totalGuests || 0)}</strong>
              <span>Tổng số khách</span>
            </div>
            <div className="smart-stat">
              <strong>{formatNumber(bulkStats.missingGuide || 0)}</strong>
              <span>Booking chưa có HDV</span>
            </div>
            <div className="smart-stat">
              <strong>{formatNumber(bulkStats.unpaid || 0)}</strong>
              <span>Booking chưa thanh toán</span>
            </div>
          </section>

          <section className="smart-card" style={{ marginBottom: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 220px 1fr 180px 180px auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <select
                className="smart-input"
                value={bulkFilters.days}
                onChange={(e) =>
                  setBulkFilters((p) => ({ ...p, days: e.target.value }))
                }
              >
                <option value="1">1 ngày tới</option>
                <option value="3">3 ngày tới</option>
                <option value="7">7 ngày tới</option>
                <option value="14">14 ngày tới</option>
                <option value="30">30 ngày tới</option>
              </select>
              <select
                className="smart-input"
                value={bulkFilters.destinationId}
                onChange={(e) =>
                  setBulkFilters((p) => ({
                    ...p,
                    destinationId: e.target.value,
                  }))
                }
              >
                <option value="">Tất cả điểm đến</option>
                {(bulkData.destinations || []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <input
                className="smart-input"
                placeholder="Tìm tour, booking, khách..."
                value={bulkFilters.search}
                onChange={(e) =>
                  setBulkFilters((p) => ({ ...p, search: e.target.value }))
                }
              />
              <label
                className="pill"
                style={{ justifyContent: "center", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={bulkFilters.onlyMissingGuide}
                  onChange={(e) =>
                    setBulkFilters((p) => ({
                      ...p,
                      onlyMissingGuide: e.target.checked,
                    }))
                  }
                />{" "}
                Chưa có HDV
              </label>
              <label
                className="pill"
                style={{ justifyContent: "center", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={bulkFilters.onlyUnpaid}
                  onChange={(e) =>
                    setBulkFilters((p) => ({
                      ...p,
                      onlyUnpaid: e.target.checked,
                    }))
                  }
                />{" "}
                Chưa thanh toán
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={bulkLoading}
                onClick={() => loadBulkTargets()}
              >
                {bulkLoading ? "Đang lọc..." : "Lọc"}
              </button>
            </div>
          </section>

          <div className="smart-grid">
            {(bulkData.items || []).length ? (
              bulkData.items.map((target) => {
                const hasWarn =
                  target.missingGuideCount ||
                  target.unpaidCount ||
                  target.missingPickupCount;
                return (
                  <article
                    key={target.departureId}
                    className={`target-card ${hasWarn ? "warn" : ""}`}
                  >
                    <div className="target-header">
                      <div>
                        <h3 style={{ margin: 0, color: "#0f172a" }}>
                          {target.tourName}
                        </h3>
                        <div style={{ color: "#64748b", marginTop: 4 }}>
                          {target.destinationName} · Khởi hành{" "}
                          {formatDate(target.departureDate)} →{" "}
                          {formatDate(target.endDate)}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            marginTop: 10,
                          }}
                        >
                          <span className="pill blue">
                            {formatNumber(target.bookingCount)} booking
                          </span>
                          <span className="pill">
                            {formatNumber(target.totalGuests)} khách
                          </span>
                          <span
                            className={
                              target.unpaidCount ? "pill yellow" : "pill green"
                            }
                          >
                            {target.unpaidCount
                              ? `${target.unpaidCount} chưa thanh toán`
                              : "Đã thanh toán đủ"}
                          </span>
                          <span
                            className={
                              target.missingGuideCount
                                ? "pill red"
                                : "pill green"
                            }
                          >
                            {target.missingGuideCount
                              ? `${target.missingGuideCount} chưa có HDV`
                              : "Đã có HDV"}
                          </span>
                          <span
                            className={
                              target.missingPickupCount
                                ? "pill yellow"
                                : "pill green"
                            }
                          >
                            {target.missingPickupCount
                              ? `${target.missingPickupCount} thiếu điểm đón`
                              : "Đủ điểm đón"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openBulkModal(target)}
                      >
                        Gửi hàng loạt
                      </button>
                    </div>

                    <div className="checklist">
                      <div
                        className={`checkitem ${target.checklist?.hasAllPaid ? "ok" : "bad"}`}
                      >
                        Thanh toán:{" "}
                        {target.checklist?.hasAllPaid ? "Đã đủ" : "Còn đơn chờ"}
                      </div>
                      <div
                        className={`checkitem ${target.checklist?.hasAllGuides ? "ok" : "bad"}`}
                      >
                        HDV:{" "}
                        {target.checklist?.hasAllGuides
                          ? "Đã phân công"
                          : "Cần phân công"}
                      </div>
                      <div
                        className={`checkitem ${target.checklist?.hasAllPickupPoints ? "ok" : "bad"}`}
                      >
                        Điểm đón:{" "}
                        {target.checklist?.hasAllPickupPoints
                          ? "Đã có"
                          : "Cần kiểm tra"}
                      </div>
                      <div className="checkitem">
                        HDV:{" "}
                        {target.guideNames?.length
                          ? target.guideNames.join(", ")
                          : "Chưa có"}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div
                className="smart-card"
                style={{ textAlign: "center", color: "#64748b" }}
              >
                Không có lịch khởi hành phù hợp bộ lọc.
              </div>
            )}
          </div>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!submitting) {
            setModalOpen(false);
            setForm(initialForm);
          }
        }}
        title={form.id ? "Sửa thông báo" : "Thêm thông báo"}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-light"
              onClick={() => setModalOpen(false)}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitForm}
              disabled={submitting}
            >
              {submitting ? "Đang lưu..." : "Lưu thông báo"}
            </button>
          </>
        }
      >
        <div className="smart-grid">
          <label>
            Tiêu đề
            <input
              className="smart-input"
              value={form.title}
              onChange={(e) =>
                setForm((p) => ({ ...p, title: e.target.value }))
              }
            />
          </label>
          <label>
            Mô tả ngắn
            <input
              className="smart-input"
              value={form.message}
              onChange={(e) =>
                setForm((p) => ({ ...p, message: e.target.value }))
              }
            />
          </label>
          <label>
            Nội dung
            <textarea
              className="smart-input"
              rows={7}
              value={form.content}
              onChange={(e) =>
                setForm((p) => ({ ...p, content: e.target.value }))
              }
            />
          </label>
          <label>
            Trạng thái
            <select
              className="smart-input"
              value={form.isPublished ? "true" : "false"}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  isPublished: e.target.value === "true",
                }))
              }
            >
              <option value="true">Đang hiển thị</option>
              <option value="false">Lưu nháp / Ẩn</option>
            </select>
          </label>
        </div>
      </Modal>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Chi tiết thông báo"
        size="lg"
      >
        {detail && (
          <div className="smart-grid">
            <div className="smart-card">
              <h3 style={{ marginTop: 0 }}>{detail.title}</h3>
              <p style={{ color: "#64748b" }}>
                {detail.message || "Không có mô tả ngắn"}
              </p>
              <div style={{ whiteSpace: "pre-wrap" }}>{detail.content}</div>
            </div>
            <div className="smart-card">
              <strong>Người đã xem ({detail.reads?.length || 0})</strong>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {(detail.reads || []).slice(0, 20).map((read) => (
                  <div
                    key={read.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span>{read.user?.fullName || read.user?.email}</span>
                    <span style={{ color: "#64748b" }}>
                      {formatDateTime(read.readAt)}
                    </span>
                  </div>
                ))}
                {!detail.reads?.length && (
                  <span style={{ color: "#64748b" }}>Chưa có lượt xem.</span>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={bulkModalOpen}
        onClose={() => {
          if (!submitting) setBulkModalOpen(false);
        }}
        title="Gửi thông báo/email hàng loạt"
        size="xl"
        footer={
          <>
            <button
              type="button"
              className="btn btn-light"
              onClick={() => setBulkModalOpen(false)}
            >
              Đóng
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitBulk}
              disabled={submitting}
            >
              {submitting ? "Đang gửi..." : "Gửi hàng loạt"}
            </button>
          </>
        }
      >
        {selectedTarget && (
          <div className="smart-grid">
            <div className="smart-card">
              <strong>{selectedTarget.tourName}</strong>
              <div style={{ color: "#64748b", marginTop: 4 }}>
                {selectedTarget.destinationName} ·{" "}
                {formatDate(selectedTarget.departureDate)} →{" "}
                {formatDate(selectedTarget.endDate)} ·{" "}
                {selectedBookingIds.length}/{selectedTarget.bookingCount}{" "}
                booking được chọn
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <label>
                Loại gửi
                <select
                  className="smart-input"
                  value={bulkForm.type}
                  onChange={(e) => changeBulkType(e.target.value)}
                >
                  <option value="reminder">Gửi thông báo nhắc lịch</option>
                  <option value="pickup_info">
                    Gửi email/thông báo thông tin điểm đón
                  </option>
                  <option value="itinerary_change">
                    Gửi email/thông báo thay đổi lịch trình
                  </option>
                  <option value="guide_change">
                    Gửi thông báo đổi hướng dẫn viên
                  </option>
                  <option value="custom">Nội dung tùy chỉnh</option>
                </select>
              </label>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Kênh gửi</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <label className="pill" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={bulkForm.channels.includes("notification")}
                      onChange={() => toggleChannel("notification")}
                    />{" "}
                    Thông báo
                  </label>
                  <label className="pill" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={bulkForm.channels.includes("email")}
                      onChange={() => toggleChannel("email")}
                    />{" "}
                    Email
                  </label>
                </div>
                <div style={{ color: "#64748b", marginTop: 8 }}>
                  Đang chọn: {channelLabel(bulkForm.channels)}
                </div>
              </div>
            </div>

            <div className="smart-grid">
              <label>
                Tiêu đề
                <input
                  className="smart-input"
                  value={bulkForm.title}
                  onChange={(e) =>
                    setBulkForm((p) => ({ ...p, title: e.target.value }))
                  }
                />
              </label>
              <label>
                Mô tả ngắn
                <input
                  className="smart-input"
                  value={bulkForm.message}
                  onChange={(e) =>
                    setBulkForm((p) => ({ ...p, message: e.target.value }))
                  }
                />
              </label>
              <label>
                Nội dung
                <textarea
                  rows={7}
                  className="smart-input"
                  value={bulkForm.content}
                  onChange={(e) =>
                    setBulkForm((p) => ({ ...p, content: e.target.value }))
                  }
                />
              </label>
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <strong>Danh sách booking nhận thông báo/email</strong>
                <button
                  type="button"
                  className="btn btn-light btn-sm"
                  onClick={() =>
                    setSelectedBookingIds(
                      (selectedTarget.bookings || []).map((b) => String(b.id)),
                    )
                  }
                >
                  Chọn tất cả
                </button>
              </div>
              <div className="bulk-booking-list">
                {(selectedTarget.bookings || []).map((booking) => (
                  <label key={booking.id} className="bulk-booking-row">
                    <input
                      type="checkbox"
                      checked={selectedBookingIds.includes(String(booking.id))}
                      onChange={() => toggleBooking(booking.id)}
                    />
                    <div>
                      <strong>{booking.bookingCode}</strong> ·{" "}
                      {booking.contactName}
                      <div style={{ color: "#64748b", fontSize: ".9rem" }}>
                        {booking.contactEmail} · {booking.contactPhone} ·{" "}
                        {booking.paymentStatus || "chưa có payment"} ·{" "}
                        {booking.guideNames?.length
                          ? booking.guideNames.join(", ")
                          : "chưa có HDV"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 700 }}>
                      {formatCurrency(booking.finalAmount)}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {bulkResult && (
              <div
                className="smart-card"
                style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}
              >
                <strong>Kết quả gửi</strong>
                <div style={{ marginTop: 8 }}>
                  Booking xử lý:{" "}
                  {formatNumber(bulkResult.counts?.bookings || 0)} · Thông báo
                  tạo:{" "}
                  {formatNumber(bulkResult.counts?.notificationCreated || 0)} ·
                  Email thành công:{" "}
                  {formatNumber(bulkResult.counts?.emailSuccess || 0)} · Email
                  lỗi: {formatNumber(bulkResult.counts?.emailFailed || 0)}
                </div>
                {!!bulkResult.emailErrors?.length && (
                  <div style={{ marginTop: 10, color: "#b91c1c" }}>
                    {bulkResult.emailErrors.slice(0, 5).map((err) => (
                      <div key={`${err.bookingCode}-${err.email}`}>
                        {err.bookingCode} - {err.email}: {err.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
