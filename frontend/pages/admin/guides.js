import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import Modal from "@/components/Modal";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";

const emptyPage = {
  items: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
};

function toDateInput(value) {
  const d = value ? new Date(value) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildMonthDays(month) {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(year, m - 1, 1);
  const total = new Date(year, m, 0).getDate();
  const blanks = Array.from({ length: first.getDay() }, () => null);
  const days = Array.from(
    { length: total },
    (_, i) => new Date(year, m - 1, i + 1),
  );
  return [...blanks, ...days];
}

function getCurrentGuideAssignment(booking) {
  const assignments = booking?.guideAssignments || booking?.assignments || [];
  return (
    assignments.find((item) =>
      ["assigned", "active"].includes(String(item?.status || "").toLowerCase()),
    ) ||
    assignments[0] ||
    null
  );
}

function getCurrentGuide(booking) {
  const assignment = getCurrentGuideAssignment(booking);
  return assignment?.guide || booking?.guide || null;
}

function GuideStatusBadge({ status }) {
  const map = {
    active: { bg: "#dcfce7", color: "#166534", label: "Đang hoạt động" },
    inactive: { bg: "#fef3c7", color: "#92400e", label: "Tạm ngưng" },
    locked: { bg: "#fee2e2", color: "#b91c1c", label: "Đã khóa" },
  };

  const current = map[status] || {
    bg: "#f1f5f9",
    color: "#475569",
    label: status,
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "999px",
        background: current.bg,
        color: current.color,
        fontSize: "0.85rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {current.label}
    </span>
  );
}

export default function AdminGuidesPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pagination & Filters State
  const [data, setData] = useState(emptyPage);
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 10,
    search: "",
    status: "all",
  });

  const [bookings, setBookings] = useState([]);
  const [available, setAvailable] = useState([]);

  // Modals State
  const [formOpen, setFormOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [calendarModal, setCalendarModal] = useState(null); // { guide, month }

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    identityNumber: "",
    languages: "Tiếng Việt",
    experienceYears: 1,
    status: "active",
    note: "",
  });

  const [assignForm, setAssignForm] = useState({
    bookingId: "",
    guideId: "",
    note: "",
  });

  // HÀM MỞ FORM THÊM MỚI HDV
  const openCreate = () => {
    setForm({
      fullName: "",
      phone: "",
      email: "",
      identityNumber: "",
      languages: "Tiếng Việt",
      experienceYears: 1,
      status: "active",
      note: "",
    });
    setFormOpen(true);
  };

  const qs = useMemo(() => {
    const query = new URLSearchParams();
    query.set("page", filters.page);
    query.set("pageSize", filters.pageSize);
    if (filters.search) query.set("search", filters.search);
    if (filters.status && filters.status !== "all")
      query.set("status", filters.status);
    return query.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    try {
      const [guidesRes, bookingPage] = await Promise.all([
        apiFetch(`/guides?${qs}`).catch(() => []),
        apiFetch("/admin/bookings?page=1&pageSize=100&status=confirmed").catch(
          () => ({ items: [] }),
        ),
      ]);

      setBookings(bookingPage.items || bookingPage || []);

      // Smart Fallback Phân trang Client-side
      if (Array.isArray(guidesRes)) {
        let filtered = guidesRes;

        if (filters.status !== "all") {
          filtered = filtered.filter((r) => r.status === filters.status);
        }

        if (filters.search) {
          const kw = filters.search.toLowerCase();
          filtered = filtered.filter(
            (r) =>
              r.fullName?.toLowerCase().includes(kw) ||
              r.phone?.toLowerCase().includes(kw) ||
              r.email?.toLowerCase().includes(kw) ||
              r.identityNumber?.toLowerCase().includes(kw),
          );
        }

        const total = filtered.length;
        const totalPages = Math.ceil(total / filters.pageSize) || 1;
        const safePage = Math.min(filters.page, totalPages);
        const start = (safePage - 1) * filters.pageSize;
        const items = filtered.slice(start, start + filters.pageSize);

        setData({
          items,
          pagination: {
            page: safePage,
            pageSize: filters.pageSize,
            total,
            totalPages,
          },
        });
      } else {
        setData(guidesRes || emptyPage);
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  const saveGuide = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/guides", { method: "POST", body: JSON.stringify(form) });
      setFormOpen(false);
      setForm({
        fullName: "",
        phone: "",
        email: "",
        identityNumber: "",
        languages: "Tiếng Việt",
        experienceYears: 1,
        status: "active",
        note: "",
      });
      await load();
      showToast("Đã thêm hướng dẫn viên thành công.", "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const onSelectBooking = async (bookingId) => {
    const booking = bookings.find((b) => String(b.id) === String(bookingId));
    setAssignForm((p) => ({ ...p, bookingId, guideId: "" }));
    if (!booking) return;
    try {
      const rows = await apiFetch(
        `/guides/available?startDate=${toDateInput(booking.departureDate || booking.departure?.departureDate)}&endDate=${toDateInput(booking.endDate || booking.departure?.endDate)}`,
      );
      setAvailable(rows || []);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const assignGuide = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/guides/assign", {
        method: "POST",
        body: JSON.stringify(assignForm),
      });
      setAssignOpen(false);
      setAssignForm({ bookingId: "", guideId: "", note: "" });
      await load();
      showToast(
        "Đã phân công HDV và gửi thông báo cho khách thành công.",
        "success",
      );
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleGuideLock = async (guide) => {
    const isLocked = guide.status === "locked";

    const ok = window.confirm(
      isLocked
        ? `Mở khóa hướng dẫn viên ${guide.fullName}?`
        : `Khóa hướng dẫn viên ${guide.fullName}? Sau khi khóa, HDV này sẽ không thể được phân công tour.`,
    );

    if (!ok) return;

    setSubmitting(true);
    try {
      await apiFetch(`/guides/${guide.id}/toggle-lock`, {
        method: "PATCH",
      });

      await load();

      showToast(
        isLocked ? "Đã mở khóa hướng dẫn viên." : "Đã khóa hướng dẫn viên.",
        "success",
      );
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const exportData = data.items.map((g) => ({
        "Họ Tên": g.fullName || "",
        "Số Điện Thoại": g.phone || "",
        Email: g.email || "",
        CCCD: g.identityNumber || "",
        "Ngôn Ngữ": g.languages || "",
        "Kinh Nghiệm": `${g.experienceYears} năm`,
        "Trạng Thái":
          g.status === "active"
            ? "Đang hoạt động"
            : g.status === "locked"
              ? "Đã khóa"
              : "Tạm ngưng",
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, "Guides");
      XLSX.writeFile(wb, `DanhSachHDV_${Date.now()}.xlsx`);

      showToast("Đã xuất file Excel thành công.", "success");
    } catch (error) {
      showToast("Lỗi xuất Excel. Vui lòng thử lại.", "error");
    } finally {
      setExporting(false);
    }
  };

  // Logic tính toán lịch cho Modal hiển thị lịch HDV
  const activeAssignments = calendarModal?.guide?.assignments || [];
  const dayMap = useMemo(() => {
    const map = new Map();
    activeAssignments.forEach((a) => {
      const start = new Date(a.startDate);
      const end = new Date(a.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = toDateInput(d);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(a);
      }
    });
    return map;
  }, [activeAssignments]);

  const days = buildMonthDays(
    calendarModal?.month || new Date().toISOString().slice(0, 7),
  );
  const filterTabs = [
    { id: "all", label: "Tất cả" },
    { id: "active", label: "Đang hoạt động" },
    { id: "inactive", label: "Tạm ngưng" },
    { id: "locked", label: "Đã khóa" },
  ];

  const selectedBooking = useMemo(
    () => bookings.find((b) => String(b.id) === String(assignForm.bookingId)),
    [bookings, assignForm.bookingId],
  );
  const currentGuide = useMemo(
    () => getCurrentGuide(selectedBooking),
    [selectedBooking],
  );
  const availableForReplacement = useMemo(
    () =>
      (available || []).filter(
        (g) => !currentGuide?.id || String(g.id) !== String(currentGuide.id),
      ),
    [available, currentGuide],
  );

  if (loading && data.items.length === 0)
    return <Loading text="Đang tải dữ liệu HDV..." />;

  return (
    <AdminLayout
      current="/admin/guides"
      title="Quản lý Hướng dẫn viên"
      subtitle="Theo dõi thông tin HDV, chỉ định lịch dẫn đoàn và tra cứu lịch cá nhân."
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .modern-input { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #1f2937; font-size: 0.95rem; transition: all 0.2s ease; outline: none; }
          .modern-input:focus { background: #fff; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
          .admin-table-row { transition: background-color 0.2s; }
          .admin-table-row:hover { background-color: #f8fafc; }
          .stat-text { color: #64748b; font-size: 0.85rem; margin-top: 4px; }
          
          /* TABS */
          .filter-tabs { display: inline-flex; background: #f1f5f9; padding: 6px; border-radius: 12px; gap: 6px; flex-wrap: wrap; }
          .filter-tab { padding: 10px 20px; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; border: none; background: transparent; color: #64748b; transition: all 0.2s ease; }
          .filter-tab:hover { color: #0f172a; }
          .filter-tab.active { background: #ffffff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

          /* TABLE */
          .table-responsive-container { width: 100%; overflow-x: auto; border-radius: 20px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 10px 30px rgba(15,23,42,0.03); }
          .table-responsive-container::-webkit-scrollbar { height: 8px; }
          .table-responsive-container::-webkit-scrollbar-track { background: #f8fafc; border-radius: 0 0 20px 20px; }
          .table-responsive-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
          .table-responsive-container::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
          
          .console-table { width: 100%; min-width: 1000px; border-collapse: collapse; }
          .console-table th { padding: 16px 24px; text-align: left; color: #64748b; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
          .console-table td { padding: 16px 24px; vertical-align: middle; border-bottom: 1px solid #f1f5f9; color: #1f2937; }
          
          /* CALENDAR */
          .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
          .calendar-day-header { text-align: center; color: #64748b; font-weight: 700; font-size: 0.9rem; padding-bottom: 8px; text-transform: uppercase; }

          @media (max-width: 768px) {
            .header-actions { flex-direction: column; align-items: stretch !important; }
            .toolbar-actions { width: 100%; display: flex; flex-direction: column; gap: 12px; }
            .toolbar-actions button { width: 100%; justify-content: center; }
            .search-box { max-width: 100% !important; width: 100%; }
          }
        `,
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* HEADER & THAO TÁC */}
        <div
          className="header-actions"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div className="filter-tabs">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                className={`filter-tab ${filters.status === tab.id ? "active" : ""}`}
                onClick={() =>
                  setFilters((p) => ({ ...p, status: tab.id, page: 1 }))
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              flex: 1,
              justifyContent: "flex-end",
            }}
          >
            <div
              className="search-box"
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "300px",
                minWidth: "200px",
              }}
            >
              <svg
                width="18"
                height="18"
                fill="none"
                stroke="#64748b"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                className="modern-input"
                style={{ paddingLeft: "42px", background: "#fff" }}
                placeholder="Tìm tên, SĐT, CCCD..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, search: e.target.value, page: 1 }))
                }
              />
            </div>

            <div
              className="toolbar-actions"
              style={{ display: "flex", gap: "12px" }}
            >
              <button
                type="button"
                onClick={exportExcel}
                disabled={exporting}
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  color: "#1f2937",
                  fontWeight: 600,
                  padding: "12px 20px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {exporting ? "Đang xuất..." : "Xuất Excel"}
              </button>

              <button
                type="button"
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #dcfce7",
                  color: "#16a34a",
                  fontWeight: 600,
                  padding: "12px 20px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
                onClick={() => setAssignOpen(true)}
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
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <polyline points="17 11 19 13 23 9"></polyline>
                </svg>
                Phân công / Đổi HDV
              </button>

              <button
                type="button"
                style={{
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  border: "none",
                  color: "#fff",
                  fontWeight: 600,
                  padding: "12px 20px",
                  borderRadius: "12px",
                  boxShadow: "0 4px 12px rgba(59, 130, 246, 0.2)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
                onClick={openCreate}
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
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Thêm HDV
              </button>
            </div>
          </div>
        </div>

        {/* BẢNG DỮ LIỆU HDV */}
        <div className="table-responsive-container">
          <table className="console-table">
            <thead>
              <tr>
                <th>Hồ sơ HDV</th>
                <th>Thông tin liên hệ</th>
                <th>Chuyên môn</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: "center" }}>Lịch trình</th>
                <th style={{ textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    style={{
                      textAlign: "center",
                      padding: "60px 20px",
                      color: "#64748b",
                    }}
                  >
                    <svg
                      width="48"
                      height="48"
                      fill="none"
                      stroke="#cbd5e1"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ margin: "0 auto 12px", display: "block" }}
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    Không có Hướng dẫn viên nào phù hợp với tìm kiếm.
                  </td>
                </tr>
              ) : (
                data.items.map((g) => (
                  <tr key={String(g.id)} className="admin-table-row">
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            background:
                              "linear-gradient(135deg, #e0f2fe, #bae6fd)",
                            color: "#0284c7",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: "bold",
                            fontSize: "1.2rem",
                            flexShrink: 0,
                          }}
                        >
                          {g.fullName?.charAt(0)?.toUpperCase() || "G"}
                        </div>
                        <div>
                          <strong
                            style={{
                              display: "block",
                              color: "#0f172a",
                              fontSize: "1.05rem",
                              marginBottom: "2px",
                            }}
                          >
                            {g.fullName}
                          </strong>
                          <div className="stat-text">
                            CCCD: {g.identityNumber || "--"}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ color: "#0f172a", fontWeight: 500 }}>
                        {g.phone}
                      </div>
                      <div className="stat-text">{g.email || "--"}</div>
                    </td>

                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            background: "#f1f5f9",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            color: "#334155",
                            fontSize: "0.85rem",
                            fontWeight: 500,
                          }}
                        >
                          {g.languages || "--"}
                        </span>
                        <strong
                          style={{ color: "#3b82f6", fontSize: "0.85rem" }}
                        >
                          {g.experienceYears} năm KN
                        </strong>
                      </div>
                    </td>

                    <td>
                      <GuideStatusBadge status={g.status} />
                    </td>

                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        style={{
                          padding: "8px 16px",
                          background: "#eff6ff",
                          color: "#2563eb",
                          border: "1px solid #bfdbfe",
                          borderRadius: "8px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                        onClick={() =>
                          setCalendarModal({
                            guide: g,
                            month: new Date().toISOString().slice(0, 7),
                          })
                        }
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
                          <rect
                            x="3"
                            y="4"
                            width="18"
                            height="18"
                            rx="2"
                            ry="2"
                          ></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        Xem lịch
                      </button>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => toggleGuideLock(g)}
                        disabled={submitting}
                        style={{
                          padding: "8px 14px",
                          background:
                            g.status === "locked" ? "#eff6ff" : "#fef2f2",
                          color: g.status === "locked" ? "#2563eb" : "#b91c1c",
                          border:
                            g.status === "locked"
                              ? "1px solid #bfdbfe"
                              : "1px solid #fecaca",
                          borderRadius: "8px",
                          fontWeight: 700,
                          cursor: submitting ? "not-allowed" : "pointer",
                          opacity: submitting ? 0.7 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {g.status === "locked" ? "Mở khóa" : "Khóa"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PHÂN TRANG */}
        {data.pagination.totalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: "12px",
              paddingBottom: "24px",
            }}
          >
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
            />
          </div>
        )}
      </div>

      {/* MODAL XEM LỊCH HDV */}
      <Modal
        open={!!calendarModal}
        onClose={() => setCalendarModal(null)}
        title={`Lịch trình của HDV: ${calendarModal?.guide?.fullName || ""}`}
        size="lg"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#f8fafc",
              padding: "12px 20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
            }}
          >
            <label style={{ fontWeight: 600, color: "#334155" }}>
              Chọn tháng hiển thị:
            </label>
            <input
              type="month"
              className="modern-input"
              style={{
                width: "auto",
                cursor: "pointer",
                background: "#fff",
                padding: "8px 12px",
              }}
              value={calendarModal?.month || ""}
              onChange={(e) =>
                setCalendarModal((p) => ({ ...p, month: e.target.value }))
              }
            />
          </div>

          <div className="calendar-grid" style={{ gap: "6px" }}>
            {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d) => (
              <div key={d} className="calendar-day-header">
                {d}
              </div>
            ))}

            {days.map((day, idx) => {
              const key = day ? toDateInput(day) : `blank-${idx}`;
              const busy = day ? dayMap.get(key) || [] : [];
              const isToday =
                day && toDateInput(day) === toDateInput(new Date());

              return (
                <div
                  key={key}
                  style={{
                    minHeight: "100px",
                    border: day ? "1px solid #e2e8f0" : "none",
                    borderRadius: "12px",
                    padding: "8px",
                    background: busy.length
                      ? "#dcfce7"
                      : day
                        ? "#fff"
                        : "transparent",
                    borderColor: busy.length
                      ? "#86efac"
                      : day
                        ? "#e2e8f0"
                        : "transparent",
                    transition: "0.2s",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {day && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          marginBottom: "4px",
                        }}
                      >
                        <strong
                          style={{
                            color: isToday
                              ? "#fff"
                              : busy.length
                                ? "#166534"
                                : "#475569",
                            background: isToday ? "#3b82f6" : "transparent",
                            width: "26px",
                            height: "26px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "50%",
                            fontSize: "0.9rem",
                          }}
                        >
                          {day.getDate()}
                        </strong>
                      </div>

                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        {busy.slice(0, 3).map((a) => (
                          <div
                            key={String(a.id)}
                            style={{
                              fontSize: "0.75rem",
                              padding: "4px 6px",
                              borderRadius: "6px",
                              background: "#bbf7d0",
                              color: "#14532d",
                              fontWeight: 600,
                              lineHeight: "1.3",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={a.tour?.name}
                          >
                            {a.tour?.name || "Đang có Tour"}
                          </div>
                        ))}
                        {busy.length > 3 && (
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "#16a34a",
                              fontWeight: 700,
                              textAlign: "center",
                            }}
                          >
                            +{busy.length - 3} lịch khác
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              paddingTop: "16px",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <button
              type="button"
              onClick={() => setCalendarModal(null)}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontWeight: 600,
                background: "#fff",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Đóng lại
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL THÊM HDV */}
      <Modal
        open={formOpen}
        onClose={() => !submitting && setFormOpen(false)}
        title="Thêm hồ sơ Hướng dẫn viên"
        size="lg"
      >
        <form
          onSubmit={saveGuide}
          style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "20px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                Họ và tên <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                className="modern-input"
                value={form.fullName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, fullName: e.target.value }))
                }
                required
                placeholder="Nguyễn Văn A"
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                Số điện thoại <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                className="modern-input"
                value={form.phone}
                onChange={(e) =>
                  setForm((p) => ({ ...p, phone: e.target.value }))
                }
                required
                placeholder="0901234567"
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                Email
              </label>
              <input
                className="modern-input"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
                placeholder="example@gmail.com"
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                Số CCCD <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                className="modern-input"
                value={form.identityNumber}
                onChange={(e) =>
                  setForm((p) => ({ ...p, identityNumber: e.target.value }))
                }
                required
                placeholder="079..."
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                Ngôn ngữ
              </label>
              <input
                className="modern-input"
                value={form.languages}
                onChange={(e) =>
                  setForm((p) => ({ ...p, languages: e.target.value }))
                }
                placeholder="Tiếng Việt, Tiếng Anh..."
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                Số năm kinh nghiệm
              </label>
              <input
                className="modern-input"
                type="number"
                min="0"
                value={form.experienceYears}
                onChange={(e) =>
                  setForm((p) => ({ ...p, experienceYears: e.target.value }))
                }
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                Trạng thái
              </label>
              <select
                className="modern-input"
                style={{ cursor: "pointer" }}
                value={form.status}
                onChange={(e) =>
                  setForm((p) => ({ ...p, status: e.target.value }))
                }
              >
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Tạm ngưng</option>
                <option value="locked">Đã khóa</option>
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                Ghi chú chuyên môn
              </label>
              <textarea
                className="modern-input"
                rows={3}
                value={form.note}
                onChange={(e) =>
                  setForm((p) => ({ ...p, note: e.target.value }))
                }
                placeholder="Các kỹ năng đặc biệt, tuyến đường quen thuộc..."
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
              paddingTop: "20px",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontWeight: 600,
                background: "#fff",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                padding: "12px 24px",
                borderRadius: "12px",
                boxShadow: "0 4px 12px rgba(59, 130, 246, 0.2)",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Đang lưu..." : "Lưu HDV"}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL PHÂN CÔNG HDV */}
      <Modal
        open={assignOpen}
        onClose={() => !submitting && setAssignOpen(false)}
        title="Phân công / Đổi HDV cho Tour"
      >
        <form
          onSubmit={assignGuide}
          style={{ display: "flex", flexDirection: "column", gap: "20px" }}
        >
          <div
            style={{
              background: "#f8fafc",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h4
              style={{
                margin: "0 0 12px 0",
                color: "#0f172a",
                fontSize: "0.95rem",
              }}
            >
              Bước 1: Chọn lịch trình đã xác nhận
            </h4>
            <select
              className="modern-input"
              style={{ cursor: "pointer", background: "#fff" }}
              value={assignForm.bookingId}
              onChange={(e) => onSelectBooking(e.target.value)}
              required
            >
              <option value="">-- Click để chọn Booking --</option>
              {bookings.map((b) => {
                const guide = getCurrentGuide(b);
                return (
                  <option key={String(b.id)} value={String(b.id)}>
                    [{b.bookingCode}] {b.tour?.name || b.tourName} -{" "}
                    {guide?.fullName
                      ? `Đang có HDV: ${guide.fullName}`
                      : "Chưa có HDV"}{" "}
                    ({formatDate(b.departureDate || b.departure?.departureDate)}
                    )
                  </option>
                );
              })}
            </select>

            {selectedBooking ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  background: currentGuide ? "#eff6ff" : "#fff7ed",
                  border: currentGuide
                    ? "1px solid #bfdbfe"
                    : "1px solid #fed7aa",
                  color: currentGuide ? "#1e40af" : "#9a3412",
                }}
              >
                <strong style={{ display: "block", marginBottom: 4 }}>
                  HDV hiện tại của booking này
                </strong>
                {currentGuide ? (
                  <div style={{ lineHeight: 1.6 }}>
                    <div>
                      <b>{currentGuide.fullName}</b>
                    </div>
                    <div style={{ fontSize: "0.9rem" }}>
                      SĐT: {currentGuide.phone || "--"} · Email:{" "}
                      {currentGuide.email || "--"}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "0.9rem" }}>
                    Booking này chưa được phân công hướng dẫn viên.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div
            style={{
              background: "#f0fdf4",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid #dcfce7",
            }}
          >
            <h4
              style={{
                margin: "0 0 12px 0",
                color: "#166534",
                fontSize: "0.95rem",
              }}
            >
              Bước 2: Chọn HDV mới đang rảnh
            </h4>
            <select
              className="modern-input"
              style={{
                cursor: "pointer",
                background: "#fff",
                borderColor: "#bbf7d0",
              }}
              value={assignForm.guideId}
              onChange={(e) =>
                setAssignForm((p) => ({ ...p, guideId: e.target.value }))
              }
              required
              disabled={!assignForm.bookingId}
            >
              <option value="">
                {assignForm.bookingId
                  ? "-- Click để chọn HDV --"
                  : "Vui lòng chọn booking trước"}
              </option>
              {availableForReplacement.map((g) => (
                <option key={String(g.id)} value={String(g.id)}>
                  {g.fullName} - {g.phone}
                </option>
              ))}
            </select>
            {assignForm.bookingId && availableForReplacement.length === 0 && (
              <p
                style={{
                  margin: "8px 0 0 0",
                  color: "#e11d48",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                }}
              >
                Không có HDV mới nào rảnh trong khoảng thời gian này. Hệ thống
                đã loại HDV hiện tại và các HDV bị trùng lịch.
              </p>
            )}
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              Ghi chú phân công (Gửi cho khách)
            </label>
            <textarea
              className="modern-input"
              rows={3}
              value={assignForm.note}
              onChange={(e) =>
                setAssignForm((p) => ({ ...p, note: e.target.value }))
              }
              placeholder="VD: Anh A sẽ liên hệ quý khách trước 1 ngày khởi hành..."
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
              paddingTop: "16px",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <button
              type="button"
              onClick={() => setAssignOpen(false)}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontWeight: 600,
                background: "#fff",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={
                submitting || !assignForm.bookingId || !assignForm.guideId
              }
              style={{
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                padding: "12px 24px",
                borderRadius: "12px",
                boxShadow: "0 4px 12px rgba(34, 197, 94, 0.2)",
                cursor:
                  submitting || !assignForm.guideId ? "not-allowed" : "pointer",
                opacity: submitting || !assignForm.guideId ? 0.7 : 1,
              }}
            >
              {submitting ? "Đang phân công..." : "Xác nhận & Báo khách"}
            </button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
}
