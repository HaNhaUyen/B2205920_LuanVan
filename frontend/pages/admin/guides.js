import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/admin/AdminLayout";
import Modal from "@/components/Modal";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { exportAdminSmartReport } from "@/lib/exportExcel";
import { formatDate } from "@/lib/format";

const emptyPage = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  },
};

function toDateInput(value) {
  const d = value ? new Date(value) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
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
      [
        "assigned",
        "accepted",
        "in_progress",
        "confirmed",
        "issue",
        "active",
      ].includes(String(item?.status || "").toLowerCase()),
    ) ||
    assignments[0] ||
    null
  );
}

function getCurrentGuide(booking) {
  const assignment = getCurrentGuideAssignment(booking);
  return assignment?.guide || booking?.guide || null;
}

function getIssueAssignments(guide) {
  return (
    guide?.issueAssignments ||
    (guide?.assignments || []).filter(
      (item) => String(item?.status || "").toLowerCase() === "issue",
    )
  );
}

function getBookingIssueAssignment(booking) {
  const assignments = booking?.guideAssignments || booking?.assignments || [];

  return assignments.find(
    (item) => String(item?.status || "").toLowerCase() === "issue",
  );
}

function GuideStatusBadge({ status }) {
  const map = {
    active: {
      bg: "#dcfce7",
      color: "#166534",
      label: "Đang hoạt động",
    },
    inactive: {
      bg: "#fef3c7",
      color: "#92400e",
      label: "Tạm ngưng",
    },
    locked: {
      bg: "#fee2e2",
      color: "#b91c1c",
      label: "Đã khóa",
    },
  };

  const current = map[status] || {
    bg: "#f1f5f9",
    color: "#475569",
    label: status || "--",
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
        fontWeight: 700,
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

  const [data, setData] = useState(emptyPage);
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 10,
    search: "",
    status: "all",
  });

  const [bookings, setBookings] = useState([]);
  const [available, setAvailable] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [calendarModal, setCalendarModal] = useState(null);
  const [reassignContext, setReassignContext] = useState(null);

  const [form, setForm] = useState({
    id: "",
    fullName: "",
    phone: "",
    email: "",
    identityNumber: "",
    languages: "Tiếng Việt",
    experienceYears: 1,
    status: "active",
    note: "",
    createAccount: true,
    password: "123456",
  });

  const [assignForm, setAssignForm] = useState({
    departureId: "",
    guideId: "",
    note: "",
  });

  const qs = useMemo(() => {
    const query = new URLSearchParams();

    query.set("page", filters.page);
    query.set("pageSize", filters.pageSize);

    if (filters.search) {
      query.set("search", filters.search);
    }

    if (filters.status && filters.status !== "all") {
      query.set("status", filters.status);
    }

    return query.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);

    try {
      const [guidesRes, bookingPage] = await Promise.all([
        apiFetch(`/guides?${qs}`).catch(() => emptyPage),
        apiFetch("/admin/bookings?page=1&pageSize=200&status=confirmed").catch(
          () => ({ items: [] }),
        ),
      ]);

      const bookingItems = bookingPage.items || bookingPage || [];
      setBookings(bookingItems);

      if (Array.isArray(guidesRes)) {
        let filtered = guidesRes;

        if (filters.status !== "all") {
          if (filters.status === "issue") {
            filtered = filtered.filter(
              (guide) => getIssueAssignments(guide).length > 0,
            );
          } else {
            filtered = filtered.filter(
              (guide) => guide.status === filters.status,
            );
          }
        }

        if (filters.search) {
          const kw = filters.search.toLowerCase();

          filtered = filtered.filter(
            (guide) =>
              guide.fullName?.toLowerCase().includes(kw) ||
              guide.phone?.toLowerCase().includes(kw) ||
              guide.email?.toLowerCase().includes(kw) ||
              guide.identityNumber?.toLowerCase().includes(kw),
          );
        }

        const total = filtered.length;
        const totalPages = Math.ceil(total / filters.pageSize) || 1;
        const safePage = Math.min(filters.page, totalPages);
        const start = (safePage - 1) * filters.pageSize;

        setData({
          items: filtered.slice(start, start + filters.pageSize),
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
      showToast(
        e.message || "Không tải được danh sách hướng dẫn viên.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  const openCreate = () => {
    setForm({
      id: "",
      fullName: "",
      phone: "",
      email: "",
      identityNumber: "",
      languages: "Tiếng Việt",
      experienceYears: 1,
      status: "active",
      note: "",
      createAccount: true,
      password: "123456",
    });
    setFormOpen(true);
  };

  const openEdit = (guide) => {
    setForm({
      id: String(guide.id || ""),
      fullName: guide.fullName || "",
      phone: guide.phone || "",
      email: guide.email || "",
      identityNumber: guide.identityNumber || "",
      languages: guide.languages || "Tiếng Việt",
      experienceYears: Number(guide.experienceYears || 0),
      status: guide.status || "active",
      note: guide.note || "",
      createAccount: false,
      password: "",
    });
    setFormOpen(true);
  };

  const saveGuide = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        fullName: form.fullName,
        phone: form.phone,
        email: form.email || null,
        identityNumber: form.identityNumber || null,
        languages: form.languages || null,
        experienceYears: Number(form.experienceYears || 0),
        status: form.status || "active",
        note: form.note || null,
        createAccount: Boolean(form.createAccount),
        password: form.password || undefined,
      };

      if (form.id) {
        await apiFetch(`/guides/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        showToast("Đã cập nhật hướng dẫn viên.", "success");
      } else {
        await apiFetch("/guides", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        showToast("Đã thêm hướng dẫn viên.", "success");
      }

      setFormOpen(false);
      await load();
    } catch (e) {
      showToast(e.message || "Không lưu được hướng dẫn viên.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const loadAvailableGuidesForBooking = async (
    booking,
    issueGuideId = null,
  ) => {
    if (!booking) {
      setAvailable([]);
      return;
    }

    try {
      const startDate = toDateInput(
        booking.departureDate || booking.departure?.departureDate,
      );
      const endDate = toDateInput(
        booking.endDate || booking.departure?.endDate,
      );

      const rows = await apiFetch(
        `/guides/available?startDate=${startDate}&endDate=${endDate}`,
      );

      const filteredRows = (rows || []).filter((guide) => {
        if (!issueGuideId) return true;
        return String(guide.id) !== String(issueGuideId);
      });

      setAvailable(filteredRows);
    } catch (e) {
      showToast(e.message || "Không tải được danh sách HDV rảnh.", "error");
    }
  };

  const departureOptions = useMemo(() => {
    const map = new Map();

    for (const booking of bookings) {
      const departureId =
        booking.departureId || booking.departure?.id || booking.departure_id;

      if (!departureId) continue;

      const key = String(departureId);
      const current = map.get(key);
      const guestCount =
        Number(booking.adultCount || 0) + Number(booking.childCount || 0);

      if (!current) {
        map.set(key, {
          departureId: key,
          representativeBookingId: String(booking.id),
          tourName:
            booking.tour?.name || booking.tourName || "Tour chưa cập nhật",
          tourCode: booking.tour?.code || booking.tourCode || "",
          departureDate:
            booking.departureDate || booking.departure?.departureDate,
          endDate: booking.endDate || booking.departure?.endDate,
          destinationName:
            booking.tour?.destination?.name ||
            booking.destinationName ||
            booking.tour?.destinationName ||
            "Chưa cập nhật",
          bookingCount: 1,
          guestCount,
          bookings: [booking],
        });
      } else {
        current.bookingCount += 1;
        current.guestCount += guestCount;
        current.bookings.push(booking);
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(a.departureDate) - new Date(b.departureDate),
    );
  }, [bookings]);

  const onSelectDeparture = async (departureId) => {
    const option = departureOptions.find(
      (item) => String(item.departureId) === String(departureId),
    );

    const representativeBooking = option?.bookings?.[0] || null;

    setAssignForm((prev) => ({
      ...prev,
      departureId: String(departureId || ""),
      guideId: "",
    }));

    await loadAvailableGuidesForBooking(representativeBooking);
  };

  const openReassignIssue = async (guide, assignment) => {
    const bookingId = assignment.bookingId || assignment.booking?.id;
    const tourName =
      assignment.tour?.name ||
      assignment.booking?.tourName ||
      assignment.booking?.tour?.name ||
      "tour";

    const issueBooking =
      bookings.find((item) => String(item.id) === String(bookingId)) ||
      assignment.booking ||
      null;

    const normalizedBooking = issueBooking
      ? {
          ...issueBooking,
          id: bookingId,
          tour: issueBooking.tour || assignment.tour,
          tourName,
          guideAssignments: issueBooking.guideAssignments ||
            issueBooking.assignments || [
              {
                ...assignment,
                guide,
                status: "issue",
              },
            ],
        }
      : null;

    if (normalizedBooking) {
      setBookings((prev) => {
        const existed = prev.some(
          (item) => String(item.id) === String(normalizedBooking.id),
        );

        if (existed) return prev;

        return [normalizedBooking, ...prev];
      });
    }

    setReassignContext({
      guide,
      assignment,
      booking: normalizedBooking,
      tourName,
    });

    setAssignOpen(true);

    const departureId =
      normalizedBooking?.departureId ||
      normalizedBooking?.departure?.id ||
      assignment?.booking?.departureId ||
      assignment?.booking?.departure?.id ||
      "";

    setAssignForm({
      departureId: String(departureId || ""),
      guideId: "",
      note: `Phân công lại do HDV ${guide.fullName} báo sự cố cho ${tourName}: ${
        assignment.note || "Chưa có ghi chú"
      }`,
    });

    await loadAvailableGuidesForBooking(normalizedBooking, guide.id);
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
      setAssignForm({
        departureId: "",
        guideId: "",
        note: "",
      });

      await load();

      showToast("Đã phân công lại hướng dẫn viên.", "success");
    } catch (e) {
      showToast(e.message || "Không phân công được hướng dẫn viên.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleGuideLock = async (guide) => {
    const isLocked = guide.status === "locked";

    const ok = window.confirm(
      isLocked
        ? `Mở khóa hướng dẫn viên ${guide.fullName}?`
        : `Khóa hướng dẫn viên ${guide.fullName}?`,
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
      showToast(e.message || "Không cập nhật được trạng thái HDV.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);

    try {
      await exportAdminSmartReport("guides", filters || {});
      showToast("Đã xuất Excel.", "success");
    } catch (e) {
      showToast(e.message || "Lỗi xuất Excel.", "error");
    } finally {
      setExporting(false);
    }
  };

  const selectedDeparture = useMemo(
    () =>
      departureOptions.find(
        (item) => String(item.departureId) === String(assignForm.departureId),
      ) || null,
    [departureOptions, assignForm.departureId],
  );

  const selectedBooking = selectedDeparture?.bookings?.[0] || null;

  const currentGuide = useMemo(() => {
    for (const booking of selectedDeparture?.bookings || []) {
      const guide = getCurrentGuide(booking);
      if (guide) return guide;
    }
    return null;
  }, [selectedDeparture]);

  const availableForReplacement = useMemo(() => {
    const issueGuideId = reassignContext?.guide?.id || currentGuide?.id || null;

    return (available || []).filter((guide) => {
      if (!issueGuideId) return true;
      return String(guide.id) !== String(issueGuideId);
    });
  }, [available, currentGuide, reassignContext]);

  const activeAssignments = calendarModal?.guide?.assignments || [];
  const guideUnavailability =
    calendarModal?.guide?.unavailability ||
    calendarModal?.guide?.unavailabilities ||
    calendarModal?.guide?.busySchedules ||
    [];

  const dayMap = useMemo(() => {
    const map = new Map();

    const addToMap = (startValue, endValue, payload) => {
      const start = new Date(startValue);
      const end = new Date(endValue || startValue);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return;
      }

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = toDateInput(d);

        if (!map.has(key)) {
          map.set(key, []);
        }

        map.get(key).push(payload);
      }
    };

    activeAssignments.forEach((assignment) => {
      addToMap(
        assignment.startDate ||
          assignment.departureDate ||
          assignment.departure?.departureDate,
        assignment.endDate ||
          assignment.departure?.endDate ||
          assignment.startDate,
        {
          ...assignment,
          calendarType: "assignment",
        },
      );
    });

    guideUnavailability.forEach((busyItem) => {
      addToMap(busyItem.startDate, busyItem.endDate || busyItem.startDate, {
        ...busyItem,
        calendarType: "unavailability",
      });
    });

    return map;
  }, [activeAssignments, guideUnavailability]);

  const days = buildMonthDays(
    calendarModal?.month || new Date().toISOString().slice(0, 7),
  );

  const filterTabs = [
    {
      id: "all",
      label: "Tất cả",
    },
    {
      id: "active",
      label: "Đang hoạt động",
    },
    {
      id: "inactive",
      label: "Tạm ngưng",
    },
    {
      id: "locked",
      label: "Đã khóa",
    },
  ];

  if (loading && data.items.length === 0) {
    return <Loading text="Đang tải dữ liệu HDV..." />;
  }

  return (
    <AdminLayout
      current="/admin/guides"
      title="Quản lý Hướng dẫn viên"
      subtitle="Thông tin hồ sơ, chuyên môn, trạng thái và lịch làm việc của hướng dẫn viên"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .guide-input {
              width: 100%;
              padding: 12px 14px;
              border-radius: 12px;
              border: 1px solid #e2e8f0;
              background: #fff;
              color: #0f172a;
              outline: none;
              font-size: 0.95rem;
            }

            .guide-input:focus {
              border-color: #2563eb;
              box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
            }

            .guide-btn {
              border: none;
              border-radius: 12px;
              padding: 11px 16px;
              font-weight: 800;
              cursor: pointer;
              white-space: nowrap;
            }

            .guide-btn:disabled {
              opacity: 0.6;
              cursor: not-allowed;
            }

            .guide-management-switch {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 14px;
              padding: 16px 18px;
              border: 1px solid #dbeafe;
              border-radius: 16px;
              background: linear-gradient(135deg, #eff6ff, #f8fafc);
            }
            .guide-management-switch > div { display: grid; gap: 4px; }
            .guide-management-switch span { color: #64748b; font-size: .9rem; }
            .guide-review-link {
              text-decoration: none;
              background: #2563eb;
              color: #fff;
              padding: 11px 15px;
              border-radius: 11px;
              font-weight: 800;
              white-space: nowrap;
            }



            .guide-management-tabs {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
              padding: 8px;
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 16px;
              box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
            }

            .guide-management-tab {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              min-height: 42px;
              padding: 0 16px;
              border-radius: 11px;
              color: #475569;
              font-weight: 800;
              text-decoration: none;
              transition: all .2s ease;
            }

            .guide-management-tab:hover {
              background: #f8fafc;
              color: #1d4ed8;
            }

            .guide-management-tab.active {
              background: #2563eb;
              color: #ffffff;
              box-shadow: 0 6px 16px rgba(37, 99, 235, .22);
            }

            .guide-table-wrap {
              width: 100%;
              overflow-x: auto;
              background: #fff;
              border: 1px solid #e2e8f0;
              border-radius: 20px;
              box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
            }

            .guide-table {
              width: 100%;
              min-width: 1100px;
              border-collapse: collapse;
            }

            .guide-table th {
              padding: 16px 20px;
              background: #f8fafc;
              color: #64748b;
              text-transform: uppercase;
              font-size: 0.78rem;
              letter-spacing: 0.05em;
              text-align: left;
              border-bottom: 1px solid #e2e8f0;
            }

            .guide-table td {
              padding: 16px 20px;
              border-bottom: 1px solid #f1f5f9;
              vertical-align: top;
            }

            .guide-table tr:hover td {
              background: #f8fafc;
            }

            .guide-tabs {
              display: inline-flex;
              flex-wrap: wrap;
              gap: 6px;
              background: #f1f5f9;
              padding: 6px;
              border-radius: 14px;
            }

            .guide-tab {
              border: none;
              background: transparent;
              border-radius: 10px;
              padding: 10px 16px;
              font-weight: 800;
              color: #64748b;
              cursor: pointer;
            }

            .guide-tab.active {
              background: #fff;
              color: #0f172a;
              box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
            }

            .calendar-grid {
              display: grid;
              grid-template-columns: repeat(7, minmax(0, 1fr));
              gap: 8px;
            }

            .calendar-head {
              text-align: center;
              font-weight: 800;
              color: #64748b;
              padding-bottom: 6px;
            }

            @media (max-width: 768px) {
              .guide-toolbar {
                flex-direction: column;
                align-items: stretch !important;
              }

              .guide-actions {
                flex-direction: column;
              }

              .guide-actions button {
                width: 100%;
              }
            }
          `,
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div className="guide-management-tabs">
          <Link href="/admin/guides" className="guide-management-tab active">
            Tổng quan HDV
          </Link>
          <Link
            href="/admin/guide-competencies"
            className="guide-management-tab"
          >
            Duyệt chứng chỉ
          </Link>
          <Link href="/admin/incidents" className="guide-management-tab">
            Duyệt sự cố
          </Link>
          <Link
            href="/admin/guide-availabilities"
            className="guide-management-tab"
          >
            Duyệt lịch bận
          </Link>
        </div>

        <div
          className="guide-toolbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div className="guide-tabs">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`guide-tab ${filters.status === tab.id ? "active" : ""}`}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    status: tab.id,
                    page: 1,
                  }))
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            className="guide-actions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <input
              className="guide-input"
              style={{ width: 280 }}
              placeholder="Tìm tên, SĐT, email, CCCD..."
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  search: e.target.value,
                  page: 1,
                }))
              }
            />

            <button
              type="button"
              className="guide-btn"
              onClick={exportExcel}
              disabled={exporting}
              style={{
                background: "#fff",
                color: "#0f172a",
                border: "1px solid #e2e8f0",
              }}
            >
              {exporting ? "Đang xuất..." : "Xuất Excel"}
            </button>

            <button
              type="button"
              className="guide-btn"
              onClick={openCreate}
              style={{
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "#fff",
              }}
            >
              Thêm HDV
            </button>
          </div>
        </div>

        <div className="guide-table-wrap">
          <table className="guide-table">
            <thead>
              <tr>
                <th>Hồ sơ HDV</th>
                <th>Liên hệ</th>
                <th>Chuyên môn</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: "center" }}>Lịch làm việc</th>
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
                      padding: "48px 20px",
                      color: "#64748b",
                    }}
                  >
                    Không có hướng dẫn viên phù hợp.
                  </td>
                </tr>
              ) : (
                data.items.map((guide) => {
                  return (
                    <tr key={String(guide.id)}>
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
                                "linear-gradient(135deg, #dbeafe, #bfdbfe)",
                              color: "#1d4ed8",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 900,
                              fontSize: "1.15rem",
                              flexShrink: 0,
                            }}
                          >
                            {guide.fullName?.charAt(0)?.toUpperCase() || "G"}
                          </div>

                          <div>
                            <strong
                              style={{
                                display: "block",
                                color: "#0f172a",
                                marginBottom: 3,
                              }}
                            >
                              {guide.fullName}
                            </strong>

                            <div
                              style={{ color: "#64748b", fontSize: "0.85rem" }}
                            >
                              CCCD: {guide.identityNumber || "--"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div style={{ color: "#0f172a", fontWeight: 700 }}>
                          {guide.phone || "--"}
                        </div>
                        <div style={{ color: "#64748b", fontSize: "0.85rem" }}>
                          {guide.email || "--"}
                        </div>
                      </td>

                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              background: "#f1f5f9",
                              color: "#334155",
                              padding: "5px 10px",
                              borderRadius: 8,
                              fontSize: "0.85rem",
                              fontWeight: 700,
                            }}
                          >
                            {guide.languages || "--"}
                          </span>

                          <span
                            style={{
                              color: "#2563eb",
                              fontSize: "0.85rem",
                              fontWeight: 800,
                            }}
                          >
                            {guide.experienceYears || 0} năm KN
                          </span>
                        </div>
                      </td>

                      <td>
                        <GuideStatusBadge status={guide.status} />
                      </td>

                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="guide-btn"
                          onClick={() =>
                            setCalendarModal({
                              guide,
                              month: new Date().toISOString().slice(0, 7),
                            })
                          }
                          style={{
                            background: "#eff6ff",
                            color: "#2563eb",
                            border: "1px solid #bfdbfe",
                          }}
                        >
                          Xem lịch
                        </button>
                      </td>

                      <td style={{ textAlign: "right" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            className="guide-btn"
                            onClick={() => openEdit(guide)}
                            disabled={submitting}
                            style={{
                              background: "#eff6ff",
                              color: "#2563eb",
                              border: "1px solid #bfdbfe",
                            }}
                          >
                            Sửa
                          </button>

                          <button
                            type="button"
                            className="guide-btn"
                            onClick={() => toggleGuideLock(guide)}
                            disabled={submitting}
                            style={{
                              background:
                                guide.status === "locked"
                                  ? "#eff6ff"
                                  : "#fef2f2",
                              color:
                                guide.status === "locked"
                                  ? "#2563eb"
                                  : "#b91c1c",
                              border:
                                guide.status === "locked"
                                  ? "1px solid #bfdbfe"
                                  : "1px solid #fecaca",
                            }}
                          >
                            {guide.status === "locked" ? "Mở khóa" : "Khóa"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {data.pagination.totalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "12px 0 24px",
            }}
          >
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPageChange={(page) =>
                setFilters((prev) => ({
                  ...prev,
                  page,
                }))
              }
            />
          </div>
        )}
      </div>

      <Modal
        open={!!calendarModal}
        onClose={() => setCalendarModal(null)}
        title={`Lịch trình của HDV: ${calendarModal?.guide?.fullName || ""}`}
        size="lg"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              padding: 14,
              borderRadius: 14,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
            }}
          >
            <strong>Chọn tháng</strong>

            <input
              type="month"
              className="guide-input"
              style={{ width: 180 }}
              value={calendarModal?.month || ""}
              onChange={(e) =>
                setCalendarModal((prev) => ({
                  ...prev,
                  month: e.target.value,
                }))
              }
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              fontSize: "0.85rem",
              color: "#475569",
            }}
          >
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "#dcfce7",
                color: "#166534",
                fontWeight: 800,
              }}
            >
              Xanh: Có tour
            </span>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "#fee2e2",
                color: "#991b1b",
                fontWeight: 800,
              }}
            >
              Đỏ: Lịch bận đã duyệt
            </span>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "#fef3c7",
                color: "#92400e",
                fontWeight: 800,
              }}
            >
              Vàng: Lịch bận chờ duyệt
            </span>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "#fff",
                border: "1px solid #e2e8f0",
                fontWeight: 800,
              }}
            >
              Trắng: Trống lịch
            </span>
          </div>

          <div className="calendar-grid">
            {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((day) => (
              <div key={day} className="calendar-head">
                {day}
              </div>
            ))}

            {days.map((day, index) => {
              const key = day ? toDateInput(day) : `blank-${index}`;
              const busy = day ? dayMap.get(key) || [] : [];

              const hasApprovedBusy = busy.some(
                (item) =>
                  item.calendarType === "unavailability" &&
                  ["approved", "verified"].includes(
                    String(
                      item.reviewStatus ||
                        item.approvalStatus ||
                        item.status ||
                        "",
                    ).toLowerCase(),
                  ),
              );

              const hasPendingBusy = busy.some(
                (item) =>
                  item.calendarType === "unavailability" &&
                  String(
                    item.reviewStatus ||
                      item.approvalStatus ||
                      item.status ||
                      "",
                  ).toLowerCase() === "pending",
              );

              return (
                <div
                  key={key}
                  style={{
                    minHeight: 94,
                    borderRadius: 12,
                    padding: 8,
                    border: day ? "1px solid #e2e8f0" : "none",
                    background: !day
                      ? "transparent"
                      : hasApprovedBusy
                        ? "#fee2e2"
                        : hasPendingBusy
                          ? "#fef3c7"
                          : busy.length
                            ? "#dcfce7"
                            : "#fff",
                  }}
                >
                  {day && (
                    <>
                      <strong
                        style={{
                          display: "block",
                          textAlign: "right",
                          color: hasApprovedBusy
                            ? "#b91c1c"
                            : hasPendingBusy
                              ? "#92400e"
                              : busy.length
                                ? "#166534"
                                : "#475569",
                        }}
                      >
                        {day.getDate()}
                      </strong>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          marginTop: 6,
                        }}
                      >
                        {busy.slice(0, 3).map((item) => {
                          const isUnavailability =
                            item.calendarType === "unavailability";

                          const reviewStatus = String(
                            item.reviewStatus ||
                              item.approvalStatus ||
                              item.status ||
                              "",
                          ).toLowerCase();

                          let background = "#bbf7d0";
                          let color = "#14532d";

                          if (isUnavailability && reviewStatus === "pending") {
                            background = "#fde68a";
                            color = "#92400e";
                          } else if (
                            isUnavailability &&
                            ["approved", "verified"].includes(reviewStatus)
                          ) {
                            background = "#fecaca";
                            color = "#991b1b";
                          } else if (
                            isUnavailability &&
                            reviewStatus === "rejected"
                          ) {
                            background = "#e2e8f0";
                            color = "#475569";
                          }

                          const label = isUnavailability
                            ? reviewStatus === "pending"
                              ? `Chờ duyệt: ${item.reason || "Lịch bận"}`
                              : reviewStatus === "rejected"
                                ? `Đã từ chối: ${item.reason || "Lịch bận"}`
                                : `Lịch bận: ${item.reason || "Không thể nhận tour"}`
                            : `${
                                item.tour?.name ||
                                item.booking?.tour?.name ||
                                "Đang có tour"
                              }`;

                          return (
                            <div
                              key={`${item.calendarType}-${item.id}`}
                              title={label}
                              style={{
                                fontSize: "0.72rem",
                                padding: "4px 6px",
                                borderRadius: 6,
                                background,
                                color,
                                fontWeight: 800,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {label}
                            </div>
                          );
                        })}

                        {busy.length > 2 && (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              color: "#64748b",
                            }}
                          >
                            +{busy.length - 2} lịch khác
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ textAlign: "right" }}>
            <button
              type="button"
              className="guide-btn"
              onClick={() => setCalendarModal(null)}
              style={{
                background: "#fff",
                color: "#475569",
                border: "1px solid #e2e8f0",
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => !submitting && setFormOpen(false)}
        title={
          form.id ? "Sửa hồ sơ Hướng dẫn viên" : "Thêm hồ sơ Hướng dẫn viên"
        }
        size="lg"
      >
        <form
          onSubmit={saveGuide}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 16,
            }}
          >
            <div>
              <label style={{ fontWeight: 800 }}>Họ và tên *</label>
              <input
                className="guide-input"
                value={form.fullName}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    fullName: e.target.value,
                  }))
                }
                required
              />
            </div>

            <div>
              <label style={{ fontWeight: 800 }}>Số điện thoại *</label>
              <input
                className="guide-input"
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    phone: e.target.value,
                  }))
                }
                required
              />
            </div>

            <div>
              <label style={{ fontWeight: 800 }}>Email</label>
              <input
                className="guide-input"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label style={{ fontWeight: 800 }}>Số CCCD *</label>
              <input
                className="guide-input"
                value={form.identityNumber}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    identityNumber: e.target.value,
                  }))
                }
                required
              />
            </div>

            <div>
              <label style={{ fontWeight: 800 }}>Ngôn ngữ</label>
              <input
                className="guide-input"
                value={form.languages}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    languages: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label style={{ fontWeight: 800 }}>Số năm kinh nghiệm</label>
              <input
                className="guide-input"
                type="number"
                min="0"
                value={form.experienceYears}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    experienceYears: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label style={{ fontWeight: 800 }}>Trạng thái</label>
              <select
                className="guide-input"
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    status: e.target.value,
                  }))
                }
              >
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Tạm ngưng</option>
                <option value="locked">Đã khóa</option>
              </select>
            </div>

            <div
              style={{
                gridColumn: "1 / -1",
                padding: 14,
                borderRadius: 14,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            >
              <label
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(form.createAccount)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      createAccount: e.target.checked,
                    }))
                  }
                />
                Tạo / liên kết tài khoản đăng nhập cho HDV
              </label>

              {form.createAccount && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                    gap: 12,
                    marginTop: 12,
                  }}
                >
                  <input
                    className="guide-input"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    placeholder="Email đăng nhập"
                    required
                  />

                  <input
                    className="guide-input"
                    type="text"
                    value={form.password}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    placeholder="Mật khẩu mặc định"
                  />
                </div>
              )}
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontWeight: 800 }}>Ghi chú chuyên môn</label>
              <textarea
                className="guide-input"
                rows={3}
                value={form.note}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    note: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              borderTop: "1px solid #e2e8f0",
              paddingTop: 16,
            }}
          >
            <button
              type="button"
              className="guide-btn"
              onClick={() => setFormOpen(false)}
              style={{
                background: "#fff",
                color: "#475569",
                border: "1px solid #e2e8f0",
              }}
            >
              Hủy
            </button>

            <button
              type="submit"
              className="guide-btn"
              disabled={submitting}
              style={{
                background: "#2563eb",
                color: "#fff",
              }}
            >
              {submitting ? "Đang lưu..." : form.id ? "Cập nhật" : "Lưu HDV"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => {
          if (submitting) return;
          setAssignOpen(false);
          setReassignContext(null);
        }}
        title="Phân công HDV theo lịch khởi hành"
        size="lg"
      >
        <form
          onSubmit={assignGuide}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: reassignContext ? "#fef2f2" : "#f8fafc",
              border: reassignContext
                ? "1px solid #fecaca"
                : "1px solid #e2e8f0",
            }}
          >
            <h4
              style={{
                margin: "0 0 10px",
                color: reassignContext ? "#991b1b" : "#0f172a",
              }}
            >
              {reassignContext
                ? "Bước 1: Chuyến cần phân công lại"
                : "Bước 1: Chọn lịch khởi hành"}
            </h4>

            {reassignContext ? (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #fecaca",
                  borderRadius: 12,
                  padding: "14px 16px",
                  color: "#7f1d1d",
                }}
              >
                <strong
                  style={{
                    display: "block",
                    fontSize: "1rem",
                    marginBottom: 6,
                    color: "#991b1b",
                  }}
                >
                  {reassignContext.tourName}
                </strong>

                <div style={{ lineHeight: 1.7, fontSize: "0.92rem" }}>
                  Booking:{" "}
                  <b>
                    {reassignContext.booking?.bookingCode ||
                      reassignContext.assignment?.booking?.bookingCode ||
                      "--"}
                  </b>
                  <br />
                  Ngày khởi hành:{" "}
                  <b>
                    {formatDate(
                      reassignContext.booking?.departureDate ||
                        reassignContext.booking?.departure?.departureDate ||
                        reassignContext.assignment?.startDate,
                    )}
                  </b>
                  <br />
                  HDV báo sự cố:{" "}
                  <b>{reassignContext.guide?.fullName || "--"}</b>
                  <br />
                  Lý do:{" "}
                  <b>{reassignContext.assignment?.note || "HDV báo sự cố"}</b>
                </div>

                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#b91c1c",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                  }}
                >
                  Lịch khởi hành này đã được chọn sẵn. Admin chỉ cần chọn HDV
                  mới bên dưới.
                </p>
              </div>
            ) : (
              <>
                <select
                  className="guide-input"
                  value={assignForm.departureId}
                  onChange={(event) => onSelectDeparture(event.target.value)}
                  required
                >
                  <option value="">-- Chọn lịch khởi hành --</option>
                  {departureOptions.map((item) => (
                    <option key={item.departureId} value={item.departureId}>
                      {item.tourName} · {formatDate(item.departureDate)} ·{" "}
                      {item.bookingCount} booking · {item.guestCount} khách
                    </option>
                  ))}
                </select>

                {selectedDeparture && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 12,
                      background: currentGuide ? "#eff6ff" : "#fff7ed",
                      border: currentGuide
                        ? "1px solid #bfdbfe"
                        : "1px solid #fed7aa",
                      color: currentGuide ? "#1e40af" : "#9a3412",
                    }}
                  >
                    <strong style={{ display: "block", marginBottom: 4 }}>
                      HDV hiện tại
                    </strong>

                    {currentGuide ? (
                      <div style={{ lineHeight: 1.6 }}>
                        <b>{currentGuide.fullName}</b>
                        <br />
                        SĐT: {currentGuide.phone || "--"} · Email:{" "}
                        {currentGuide.email || "--"}
                      </div>
                    ) : (
                      <span>Chuyến này chưa có HDV.</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
            }}
          >
            <h4 style={{ margin: "0 0 10px", color: "#166534" }}>
              Bước 2: Chọn HDV mới đang rảnh
            </h4>

            <select
              className="guide-input"
              value={assignForm.guideId}
              onChange={(e) =>
                setAssignForm((prev) => ({
                  ...prev,
                  guideId: e.target.value,
                }))
              }
              required
              disabled={!assignForm.departureId}
            >
              <option value="">
                {assignForm.departureId
                  ? "-- Chọn HDV mới --"
                  : "Vui lòng chọn lịch khởi hành trước"}
              </option>

              {availableForReplacement.map((guide) => (
                <option key={String(guide.id)} value={String(guide.id)}>
                  {guide.fullName} - {guide.phone}
                </option>
              ))}
            </select>

            {assignForm.departureId && availableForReplacement.length === 0 && (
              <p
                style={{
                  margin: "8px 0 0",
                  color: "#b91c1c",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                }}
              >
                Không có HDV mới nào rảnh trong khoảng thời gian này.
              </p>
            )}
          </div>

          <div>
            <label style={{ fontWeight: 800 }}>Ghi chú phân công</label>

            <textarea
              className="guide-input"
              rows={3}
              value={assignForm.note}
              onChange={(e) =>
                setAssignForm((prev) => ({
                  ...prev,
                  note: e.target.value,
                }))
              }
              placeholder="VD: Đổi HDV do HDV cũ báo bận..."
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              borderTop: "1px solid #e2e8f0",
              paddingTop: 16,
            }}
          >
            <button
              type="button"
              className="guide-btn"
              onClick={() => {
                setAssignOpen(false);
                setReassignContext(null);
              }}
              style={{
                background: "#fff",
                color: "#475569",
                border: "1px solid #e2e8f0",
              }}
            >
              Đóng
            </button>

            <button
              type="submit"
              className="guide-btn"
              disabled={
                submitting || !assignForm.departureId || !assignForm.guideId
              }
              style={{
                background: "#16a34a",
                color: "#fff",
              }}
            >
              {submitting ? "Đang phân công..." : "Xác nhận phân công"}
            </button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
}
