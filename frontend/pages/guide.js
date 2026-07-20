import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  CalendarDays,
  Clock,
  Eye,
  Info,
  ListFilter,
  LogOut,
  MapPin,
  Phone,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  User,
  Users,
  ClipboardList,
  ChevronRight,
  CheckCircle,
  LockKeyhole,
  BadgeCheck,
  Ban,
  FilePlus2,
  Trash2,
  BellRing,
} from "lucide-react";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/ToastContext";
import NotificationBell from "@/components/NotificationBell";
import GuideOperationsPanel from "@/components/guide/GuideOperationsPanel";
import GuideCompetenciesPanel from "@/components/guide/GuideCompetenciesPanel";
import GuideNotificationsPanel from "@/components/guide/GuideNotificationsPanel";
import GuideChatbotWidget from "@/components/guide/GuideChatbotWidget";
import { apiFetch } from "@/lib/api";
import { getToken, getUser, clearSession } from "@/lib/storage";
import { formatCurrency, formatDate } from "@/lib/format";

const PAGE_SIZE = 4;

const statusLabels = {
  assigned: "Đã phân công",
  accepted: "Đã nhận tour",
  in_progress: "Đang dẫn tour",
  completed: "Đã hoàn thành",
  issue: "Có sự cố",
  pending: "Chờ duyệt",
  active: "Đã duyệt",
  rejected: "Bị từ chối",
  cancelled: "Đã hủy",
  replaced: "Đã thay thế",
};

const statusOptions = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "assigned", label: "Đã phân công" },
  { value: "accepted", label: "Đã nhận tour" },
  { value: "completed", label: "Đã hoàn thành" },
];

const statusTones = {
  assigned: ["#eff6ff", "#1d4ed8", "#bfdbfe"],
  accepted: ["#f0fdf4", "#15803d", "#bbf7d0"],
  in_progress: ["#fffbeb", "#b45309", "#fde68a"],
  completed: ["#f0fdfa", "#0f766e", "#ccfbf1"],
  issue: ["#fef2f2", "#b91c1c", "#fecaca"],
  replaced: ["#f8fafc", "#64748b", "#cbd5e1"],
};

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function includesText(value, keyword) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .includes(
      String(keyword || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
    );
}

function StatusPill({ status }) {
  const [bg, color, border] = statusTones[status] || [
    "#f8fafc",
    "#475569",
    "#e2e8f0",
  ];

  return (
    <span
      className="status-pill"
      style={{
        background: bg,
        color,
        border: `1px solid ${border}`,
      }}
    >
      {statusLabels[status] || status || "--"}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="stat-card">
      <div className="stat-icon-wrapper">
        <Icon size={24} strokeWidth={2.5} />
      </div>
      <div className="stat-content">
        <p>{label}</p>
        <strong>{value}</strong>
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="info-box">
      <span>{label}</span>
      <strong>{value || "--"}</strong>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="section-header">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export default function GuidePage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  const [guide, setGuide] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [dayViewDate, setDayViewDate] = useState(todayInput());
  const [page, setPage] = useState(1);

  const [profileForm, setProfileForm] = useState({
    email: "",
    phone: "",
    identityNumber: "",
    note: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const currentUser = useMemo(() => getUser(), []);

  const tabs = [
    { key: "dashboard", label: "Tổng quan", icon: ClipboardList },
    { key: "calendar", label: "Lịch trình tour", icon: CalendarDays },
    { key: "operations", label: "Điều hành chuyến đi", icon: ShieldAlert },
    { key: "assignments", label: "Danh sách phân công", icon: ListFilter },
    { key: "notifications", label: "Thông báo", icon: BellRing },
    { key: "profile", label: "Hồ sơ cá nhân", icon: User },
  ];

  const loadDashboard = async () => {
    const data = await apiFetch("/guide-portal/dashboard");

    setDashboard(data);
    setGuide(data.guide || null);

    setProfileForm({
      email: data.guide?.email || "",
      phone: data.guide?.phone || "",
      identityNumber: data.guide?.identityNumber || "",
      note: data.guide?.note || "",
    });
  };

  const loadAssignments = async () => {
    const data = await apiFetch("/guide-portal/assignments");
    setAssignments(Array.isArray(data) ? data : []);
  };

  const loadAll = async () => {
    await Promise.all([loadDashboard(), loadAssignments()]);
  };

  useEffect(() => {
    const token = getToken();
    const user = getUser();

    if (!token || !user) {
      clearSession();
      window.location.href = "/login";
      return;
    }

    if (user.role !== "guide" && user.role !== "admin") {
      showToast("Tài khoản này không phải hướng dẫn viên.", "error");
      window.location.href = "/";
      return;
    }

    loadAll()
      .catch((error) => {
        showToast(
          error.message || "Không tải được dữ liệu hướng dẫn viên.",
          "error",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    const requestedTab = String(router.query.tab || "");
    const validTabs = [
      "dashboard",
      "calendar",
      "operations",
      "assignments",
      "notifications",
      "profile",
    ];

    if (validTabs.includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [router.isReady, router.query.tab]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, keyword, dateFilter]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((item) => {
      const booking = item.booking || {};
      const tour = item.tour || {};
      const destination = tour.destination || {};

      const matchStatus =
        statusFilter === "all" || String(item.status) === statusFilter;

      const matchDate =
        !dateFilter ||
        toDateInput(item.startDate) === dateFilter ||
        toDateInput(item.endDate) === dateFilter ||
        toDateInput(booking?.departure?.departureDate) === dateFilter;

      const matchKeyword =
        !keyword.trim() ||
        includesText(tour.name, keyword) ||
        includesText(tour.code, keyword) ||
        includesText(booking.bookingCode, keyword) ||
        includesText(booking.contactName, keyword) ||
        includesText(booking.contactPhone, keyword) ||
        includesText(destination.name, keyword) ||
        includesText(destination.province, keyword) ||
        includesText(booking.pickupName, keyword) ||
        includesText(booking.pickupAddress, keyword);

      return matchStatus && matchDate && matchKeyword;
    });
  }, [assignments, statusFilter, keyword, dateFilter]);

  const dayAssignments = useMemo(() => {
    return assignments.filter((item) => {
      return (
        toDateInput(item.startDate) === dayViewDate ||
        toDateInput(item.endDate) === dayViewDate ||
        toDateInput(item.booking?.departure?.departureDate) === dayViewDate
      );
    });
  }, [assignments, dayViewDate]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAssignments.length / PAGE_SIZE),
  );

  const pagedAssignments = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAssignments.slice(start, start + PAGE_SIZE);
  }, [filteredAssignments, page]);

  const logout = () => {
    clearSession();
    window.location.href = "/login";
  };

  const resetFilters = () => {
    setStatusFilter("all");
    setKeyword("");
    setDateFilter("");
    setPage(1);
  };

  const saveProfile = async (event) => {
    event.preventDefault();

    try {
      setSavingProfile(true);

      const updated = await apiFetch("/guide-portal/me", {
        method: "PATCH",
        body: JSON.stringify({
          email: profileForm.email,
          phone: profileForm.phone,
          identityNumber: profileForm.identityNumber,
          note: profileForm.note,
        }),
      });

      setGuide(updated);
      showToast("Đã cập nhật thông tin cá nhân.", "success");
    } catch (error) {
      showToast(error.message || "Cập nhật thông tin thất bại.", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();

    if (passwordForm.newPassword.length < 6) {
      showToast("Mật khẩu mới phải có ít nhất 6 ký tự.", "error");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast("Xác nhận mật khẩu mới không khớp.", "error");
      return;
    }

    try {
      setSavingPassword(true);
      await apiFetch("/auth/me/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      showToast("Đã đổi mật khẩu.", "success");
    } catch (error) {
      showToast(error.message || "Đổi mật khẩu thất bại.", "error");
    } finally {
      setSavingPassword(false);
    }
  };

  const openAssignmentDetail = async (assignmentId) => {
    try {
      const detail = await apiFetch(
        `/guide-portal/assignments/${assignmentId}`,
      );
      setSelectedAssignment(detail);
    } catch (error) {
      showToast(error.message || "Không tải được chi tiết tour.", "error");
    }
  };

  const updateAssignmentStatus = async (
    assignmentId,
    nextStatus,
    note = "",
  ) => {
    try {
      setSavingStatus(true);

      const updated = await apiFetch(
        `/guide-portal/assignments/${assignmentId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: nextStatus,
            note,
          }),
        },
      );

      setAssignments((items) =>
        items.map((item) => (item.id === assignmentId ? updated : item)),
      );

      if (selectedAssignment?.id === assignmentId) {
        const detail = await apiFetch(
          `/guide-portal/assignments/${assignmentId}`,
        );
        setSelectedAssignment(detail);
      }

      await loadDashboard();

      showToast("Đã xác nhận nhận tour.", "success");
    } catch (error) {
      showToast(error.message || "Không cập nhật được trạng thái.", "error");
    } finally {
      setSavingStatus(false);
    }
  };

  const quickStatus = async (assignmentId, nextStatus) => {
    if (nextStatus !== "accepted") return;
    await updateAssignmentStatus(assignmentId, "accepted", "");
  };

  const reportUnavailable = async (assignmentId) => {
    const reason = window.prompt(
      "Nhập lý do bạn không thể nhận tour này (bận lịch, sức khỏe, việc cá nhân...):",
    );
    if (!reason?.trim()) return;

    try {
      setSavingStatus(true);
      await apiFetch(`/guide-portal/assignments/${assignmentId}/unavailable`, {
        method: "POST",
        body: JSON.stringify({
          availabilityType: "unavailable",
          reason: reason.trim(),
        }),
      });
      showToast(
        "Đã gửi yêu cầu không thể nhận tour. Admin sẽ xem và phân công HDV thay thế.",
        "success",
      );
      await loadAll();
    } catch (error) {
      showToast(error.message || "Không gửi được yêu cầu.", "error");
    } finally {
      setSavingStatus(false);
    }
  };

  if (loading) return <Loading text="Đang tải hệ thống hướng dẫn viên..." />;

  return (
    <section className="guide-page">
      <aside className="guide-sidebar">
        <div className="brand">
          <div className="brand-logo">
            {guide?.fullName?.charAt(0)?.toUpperCase() || "G"}
          </div>

          <div className="brand-text">
            <h1>Travela Portal</h1>
            <p>Dành cho Hướng dẫn viên</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                className={active ? "active" : ""}
                onClick={() => {
                  setActiveTab(tab.key);
                  router.replace(
                    {
                      pathname: "/guide",
                      query: tab.key === "dashboard" ? {} : { tab: tab.key },
                    },
                    undefined,
                    { shallow: true },
                  );
                }}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <button type="button" onClick={logout} className="logout-btn">
            <LogOut size={20} />
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="guide-main">
        <header className="guide-topbar">
          <div className="topbar-left">
            <button type="button" className="menu-btn">
              ☰
            </button>

            <h2 className="topbar-title">
              {tabs.find((item) => item.key === activeTab)?.label ||
                "Dashboard"}
            </h2>
          </div>

          <div className="topbar-user">
            <NotificationBell user={currentUser} />
            <div className="topbar-details">
              <strong>{guide?.fullName || currentUser?.fullName}</strong>
              <span>HDV Chính</span>
            </div>

            <div className="topbar-avatar">
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                  guide?.fullName || "G",
                )}&background=2563eb&color=fff`}
                alt="Avatar"
              />
            </div>
          </div>
        </header>

        <div className="content-wrap">
          {activeTab === "dashboard" && (
            <div className="fade-in">
              <SectionHeader
                eyebrow="Tổng quan hệ thống"
                title={`Xin chào, ${guide?.fullName || "hướng dẫn viên"} 👋`}
                description="Theo dõi lịch trình, quản lý công việc và khách hàng của bạn trong tuần này."
              />

              <div className="stat-grid">
                <StatCard
                  icon={ClipboardList}
                  label="Tổng phân công"
                  value={dashboard?.stats?.totalAssignments || 0}
                  hint="Tất cả tour được gán"
                />

                <StatCard
                  icon={Clock}
                  label="Sắp khởi hành"
                  value={dashboard?.stats?.upcomingAssignments || 0}
                  hint="Các tour chờ bắt đầu"
                />

                <StatCard
                  icon={Users}
                  label="Khách phục vụ"
                  value={dashboard?.stats?.totalGuests || 0}
                  hint="Dự kiến phục vụ"
                />

                <StatCard
                  icon={ShieldAlert}
                  label="Cần lưu ý"
                  value={dashboard?.stats?.issueAssignments || 0}
                  hint="Tour có sự cố"
                />
              </div>

              <div className="dashboard-grid">
                <div className="admin-card">
                  <SectionHeader
                    title="Tour gần nhất"
                    description="Đoàn khách tiếp theo bạn cần chuẩn bị."
                  />

                  {dashboard?.nextAssignment ? (
                    <AssignmentCard
                      item={dashboard.nextAssignment}
                      onViewDetail={openAssignmentDetail}
                      onQuickStatus={quickStatus}
                      onReportUnavailable={reportUnavailable}
                      featured
                    />
                  ) : (
                    <EmptyState text="Bạn chưa có tour sắp khởi hành." />
                  )}
                </div>

                <div className="admin-card">
                  <SectionHeader
                    title="Lịch trình hôm nay"
                    description="Danh sách hoạt động trong ngày."
                  />

                  <div className="day-toolbar mini">
                    <input
                      type="date"
                      value={dayViewDate}
                      onChange={(event) => setDayViewDate(event.target.value)}
                    />

                    <button
                      type="button"
                      className="btn-light"
                      onClick={() => setDayViewDate(todayInput())}
                    >
                      Hôm nay
                    </button>
                  </div>

                  {!dayAssignments.length ? (
                    <EmptyState
                      text="Hôm nay bạn có lịch trống."
                      icon={CalendarDays}
                    />
                  ) : (
                    <div className="day-list">
                      {dayAssignments.slice(0, 4).map((item) => (
                        <DayScheduleItem
                          key={item.id}
                          item={item}
                          onViewDetail={openAssignmentDetail}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="admin-card mt-6">
                <div className="card-head-row">
                  <SectionHeader title="Mới phân công" />

                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => setActiveTab("assignments")}
                  >
                    Xem tất cả <ChevronRight size={18} />
                  </button>
                </div>

                {!dashboard?.upcomingAssignments?.length ? (
                  <EmptyState text="Chưa có dữ liệu phân công." />
                ) : (
                  <div className="assignment-list">
                    {dashboard.upcomingAssignments.slice(0, 3).map((item) => (
                      <AssignmentCard
                        key={item.id}
                        item={item}
                        onViewDetail={openAssignmentDetail}
                        onQuickStatus={quickStatus}
                        onReportUnavailable={reportUnavailable}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "calendar" && (
            <div className="admin-card fade-in">
              <div className="card-head-row">
                <SectionHeader
                  eyebrow="Quản lý lịch trình"
                  title="Lịch theo ngày"
                  description="Chọn ngày để xem chi tiết các chuyến đi."
                />

                <div className="day-toolbar">
                  <input
                    type="date"
                    value={dayViewDate}
                    onChange={(event) => setDayViewDate(event.target.value)}
                  />

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setDayViewDate(todayInput())}
                  >
                    Về hôm nay
                  </button>
                </div>
              </div>

              <div className="calendar-summary">
                <InfoBox
                  label="Ngày đang xem"
                  value={formatDate(dayViewDate)}
                />

                <InfoBox
                  label="Số lượng đoàn"
                  value={`${dayAssignments.length} tour`}
                />

                <InfoBox
                  label="Tổng khách phục vụ"
                  value={`${dayAssignments.reduce(
                    (sum, item) => sum + Number(item.booking?.totalGuests || 0),
                    0,
                  )} khách`}
                />

                <InfoBox
                  label="Trạng thái lưu ý"
                  value={`${dayAssignments.filter((item) => item.status === "issue").length} tour sự cố`}
                />
              </div>

              {!dayAssignments.length ? (
                <EmptyState
                  text="Không có hoạt động nào trong ngày này."
                  icon={CalendarDays}
                />
              ) : (
                <div className="timeline">
                  {dayAssignments.map((item) => (
                    <TimelineItem
                      key={item.id}
                      item={item}
                      onViewDetail={openAssignmentDetail}
                      onQuickStatus={quickStatus}
                      onReportUnavailable={reportUnavailable}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "assignments" && (
            <div className="assignments-page fade-in">
              <div className="assignments-sticky-toolbar">
                <div className="assignment-title-row">
                  <div>
                    <span className="eyebrow">Tất cả phân công</span>
                    <h2>Danh sách tour của bạn</h2>
                    <p>Quản lý và cập nhật trạng thái các chuyến đi.</p>
                  </div>

                  <button type="button" className="btn-light" onClick={loadAll}>
                    <RefreshCcw size={18} />
                    Tải lại
                  </button>
                </div>

                <div className="filter-panel">
                  <div className="search-box">
                    <Search size={20} color="#94a3b8" />
                    <input
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder="Tìm mã tour, tên khách, số điện thoại..."
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="filter-select"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}
                    className="filter-date"
                  />

                  <button
                    type="button"
                    className="btn-light"
                    onClick={resetFilters}
                  >
                    Xóa lọc
                  </button>
                </div>

                <div className="result-meta">
                  <span>
                    Đang hiển thị <strong>{pagedAssignments.length}</strong> /{" "}
                    <strong>{filteredAssignments.length}</strong> kết quả
                  </span>

                  {totalPages > 1 && (
                    <span>
                      Trang <strong>{page}</strong> / {totalPages}
                    </span>
                  )}
                </div>
              </div>

              <div className="assignments-table-card">
                {!pagedAssignments.length ? (
                  <EmptyState text="Không tìm thấy chuyến đi nào phù hợp với bộ lọc." />
                ) : (
                  <AssignmentTable
                    items={pagedAssignments}
                    onViewDetail={openAssignmentDetail}
                    onQuickStatus={quickStatus}
                    onReportUnavailable={reportUnavailable}
                  />
                )}

                {totalPages > 1 && (
                  <div className="pagination-wrapper">
                    <Pagination
                      page={page}
                      totalPages={totalPages}
                      onPageChange={setPage}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "operations" && (
            <div className="fade-in">
              <GuideOperationsPanel guide={guide} />
            </div>
          )}

          {activeTab === "notifications" && (
            <GuideNotificationsPanel
              notificationId={router.query.notificationId || null}
            />
          )}

          {activeTab === "profile" && (
            <div className="profile-page fade-in">
              <div className="profile-container">
                <div className="admin-card card-left">
                  <SectionHeader
                    title="Thông tin cơ bản"
                    description="Thông tin định danh của hướng dẫn viên."
                  />
                  <div className="profile-static">
                    <div className="avatar-large">
                      {guide?.fullName?.charAt(0)?.toUpperCase() || "G"}
                    </div>
                    <h3>{guide?.fullName}</h3>
                    <span className="badge-role">
                      CCCD: {guide?.identityNumber || "Chưa cập nhật"}
                    </span>
                    <div className="mt-6 info-stacked">
                      <InfoBox
                        label="Kinh nghiệm"
                        value={`${guide?.experienceYears || 0} năm`}
                      />
                      <InfoBox
                        label="Trạng thái HĐ"
                        value={
                          guide?.status === "active"
                            ? "Đang hoạt động"
                            : guide?.status
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="admin-card card-right">
                  <SectionHeader
                    title="Cập nhật hồ sơ"
                    description="Chỉ cập nhật thông tin liên hệ, CCCD và phần giới thiệu."
                  />
                  <form onSubmit={saveProfile} className="profile-form">
                    <div className="input-group">
                      <label>Địa chỉ Email</label>
                      <input
                        type="email"
                        value={profileForm.email}
                        onChange={(e) =>
                          setProfileForm((p) => ({
                            ...p,
                            email: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="input-group">
                      <label>Số điện thoại</label>
                      <input
                        type="tel"
                        value={profileForm.phone}
                        onChange={(e) =>
                          setProfileForm((p) => ({
                            ...p,
                            phone: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="input-group full">
                      <label>Số CCCD/CMND</label>
                      <input
                        inputMode="numeric"
                        maxLength={12}
                        value={profileForm.identityNumber}
                        onChange={(e) =>
                          setProfileForm((p) => ({
                            ...p,
                            identityNumber: e.target.value.replace(/\D/g, ""),
                          }))
                        }
                        placeholder="Nhập 9 hoặc 12 chữ số"
                      />
                    </div>
                    <div className="input-group full">
                      <label>Giới thiệu / Ghi chú điều hành</label>
                      <textarea
                        value={profileForm.note}
                        onChange={(e) =>
                          setProfileForm((p) => ({
                            ...p,
                            note: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={savingProfile}
                      >
                        <Save size={18} />
                        {savingProfile ? "Đang lưu..." : "Lưu thay đổi"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              <GuideCompetenciesPanel />

              <div className="admin-card profile-wide-card">
                <SectionHeader
                  title="Đổi mật khẩu"
                  description="Mật khẩu mới phải có ít nhất 6 ký tự."
                />
                <form onSubmit={changePassword} className="password-grid">
                  <div className="input-group">
                    <label>Mật khẩu hiện tại</label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({
                          ...p,
                          currentPassword: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="input-group">
                    <label>Mật khẩu mới</label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({
                          ...p,
                          newPassword: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="input-group">
                    <label>Xác nhận mật khẩu mới</label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({
                          ...p,
                          confirmPassword: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingPassword}
                  >
                    <LockKeyhole size={18} />
                    {savingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      {selectedAssignment && (
        <AssignmentDetailModal
          assignment={selectedAssignment}
          onClose={() => setSelectedAssignment(null)}
        />
      )}

      <style jsx global>{`
        body {
          margin: 0;
          font-family:
            Inter,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          background: #f4f7fb;
          color: #1e293b;
        }

        .guide-page {
          min-height: 100vh;
          display: flex;
          background: #f4f7fb;
        }

        .fade-in {
          animation: fadeIn 0.35s ease-in-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .guide-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          width: 280px;
          background: #0f172a;
          color: #f8fafc;
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          z-index: 50;
          box-shadow: 4px 0 24px rgba(0, 0, 0, 0.05);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 30px;
          padding-left: 8px;
        }

        .brand-logo {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 20px;
          font-weight: 800;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }

        .brand-text h1 {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .brand-text p {
          margin: 2px 0 0;
          color: #94a3b8;
          font-size: 13px;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }

        .sidebar-nav button,
        .logout-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 12px;
          border: none;
          background: transparent;
          color: #cbd5e1;
          cursor: pointer;
          font-size: 15px;
          font-weight: 500;
          text-align: left;
          transition: all 0.2s ease;
        }

        .sidebar-nav button:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .sidebar-nav button.active {
          background: #2563eb;
          color: #fff;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
        }

        .sidebar-bottom {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 16px;
        }

        .logout-btn {
          color: #ef4444;
          justify-content: center;
          background: rgba(239, 68, 68, 0.1);
        }

        .logout-btn:hover {
          background: #ef4444;
          color: #fff;
        }

        .guide-main {
          flex: 1;
          margin-left: 280px;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .guide-topbar {
          height: 72px;
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          position: sticky;
          top: 0;
          z-index: 90;
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .topbar-title {
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }

        .menu-btn {
          display: none;
          border: none;
          background: transparent;
          font-size: 24px;
          cursor: pointer;
        }

        .topbar-user {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .topbar-details {
          text-align: right;
        }

        .topbar-details strong {
          display: block;
          font-size: 14px;
          color: #1e293b;
        }

        .topbar-details span {
          color: #64748b;
          font-size: 12px;
        }

        .topbar-avatar img {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid #e2e8f0;
        }

        .content-wrap {
          padding: 32px;
          max-width: 1440px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }

        .section-header {
          margin-bottom: 24px;
        }

        .eyebrow {
          display: inline-block;
          color: #3b82f6;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }

        .section-header h2,
        .assignment-title-row h2 {
          margin: 0;
          font-size: 28px;
          color: #0f172a;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .section-header p,
        .assignment-title-row p {
          margin: 8px 0 0;
          color: #64748b;
          font-size: 15px;
        }

        .stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: #fff;
          border-radius: 20px;
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
          border: 1px solid #f1f5f9;
          transition:
            transform 0.2s,
            box-shadow 0.2s;
        }

        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.06);
        }

        .stat-icon-wrapper {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: #eff6ff;
          color: #2563eb;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stat-content p {
          margin: 0 0 4px;
          color: #64748b;
          font-size: 13px;
          font-weight: 600;
        }

        .stat-content strong {
          display: block;
          font-size: 26px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1;
        }

        .stat-content span {
          display: inline-block;
          margin-top: 6px;
          font-size: 12px;
          color: #10b981;
          font-weight: 600;
          background: #ecfdf5;
          padding: 2px 8px;
          border-radius: 10px;
        }

        .admin-card,
        .assignments-table-card {
          background: #fff;
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.03);
          border: 1px solid #f1f5f9;
        }

        .mt-6 {
          margin-top: 24px;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 24px;
        }

        .card-head-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 20px;
        }

        .btn-primary {
          background: #2563eb;
          color: #fff;
          border: none;
          padding: 10px 20px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.2s;
        }

        .btn-primary:hover {
          background: #1d4ed8;
        }

        .btn-light {
          background: #fff;
          color: #334155;
          border: 1px solid #e2e8f0;
          padding: 10px 16px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .btn-light:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        .btn-text {
          background: transparent;
          color: #2563eb;
          border: none;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .btn-text:hover {
          color: #1d4ed8;
          text-decoration: underline;
        }

        .assignments-page {
          display: flex;
          flex-direction: column;
          gap: 0;
          overflow: visible;
          position: relative;
        }

        .assignments-sticky-toolbar {
          position: static !important;
          top: auto !important;
          z-index: auto;
          width: 100%;
          background: transparent;
          backdrop-filter: none;
          padding: 0;
          margin-bottom: 18px;
          align-self: stretch;
        }

        .assignment-title-row {
          background: #fff;
          border: 1px solid #f1f5f9;
          border-radius: 20px 20px 0 0;
          padding: 24px 28px 18px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
        }

        .filter-panel {
          display: grid;
          grid-template-columns: minmax(320px, 1fr) 220px 180px 120px;
          gap: 14px;
          background: #fff;
          padding: 18px 28px 20px;
          border-left: 1px solid #f1f5f9;
          border-right: 1px solid #f1f5f9;
          border-bottom: 1px solid #e2e8f0;
          box-shadow: 0 18px 32px rgba(15, 23, 42, 0.08);
        }

        .search-box {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          display: flex;
          align-items: center;
          padding: 0 16px;
          height: 44px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        }

        .search-box input {
          border: none;
          outline: none;
          width: 100%;
          margin-left: 10px;
          font-size: 14px;
          color: #0f172a;
        }

        .filter-select,
        .filter-date {
          height: 44px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 0 16px;
          background: #fff;
          color: #334155;
          font-weight: 500;
          outline: none;
        }

        .filter-select:focus,
        .filter-date:focus,
        .search-box:focus-within {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .result-meta {
          background: #fff;
          border-left: 1px solid #f1f5f9;
          border-right: 1px solid #f1f5f9;
          border-bottom: 1px solid #f1f5f9;
          border-radius: 0 0 20px 20px;
          color: #64748b;
          font-size: 14px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 28px 16px;
        }

        .result-meta strong {
          color: #0f172a;
        }

        .assignments-table-card {
          padding: 0;
          overflow: hidden;
        }

        .table-responsive {
          width: 100%;
          overflow-x: auto;
        }

        .assignment-table {
          width: 100%;
          min-width: 1160px;
          border-collapse: separate;
          border-spacing: 0;
        }

        .assignment-table thead th {
          background: #f8fafc;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          text-align: left;
          padding: 16px 18px;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }

        .assignment-table tbody td {
          padding: 18px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
          color: #334155;
          font-size: 14px;
        }

        .assignment-table tbody tr {
          transition: all 0.18s ease;
        }

        .assignment-table tbody tr:hover {
          background: #f8fafc;
        }

        .assignment-table tbody tr:last-child td {
          border-bottom: none;
        }

        .tour-cell {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 260px;
        }

        .booking-code {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          padding: 4px 9px;
          border-radius: 999px;
          background: #eff6ff;
          color: #2563eb;
          font-size: 12px;
          font-weight: 800;
        }

        .tour-title {
          color: #0f172a;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.35;
        }

        .tour-destination {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #64748b;
          font-size: 13px;
        }

        .date-cell,
        .customer-cell,
        .pickup-cell {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .date-cell strong,
        .customer-cell strong,
        .pickup-cell strong {
          color: #0f172a;
          font-size: 14px;
        }

        .date-cell span,
        .customer-cell span,
        .pickup-cell span {
          color: #64748b;
          font-size: 13px;
          line-height: 1.4;
        }

        .value-price {
          color: #ef4444;
          font-weight: 900;
          white-space: nowrap;
        }

        .guest-count {
          display: inline-flex;
          width: fit-content;
          padding: 4px 9px;
          border-radius: 999px;
          background: #f1f5f9;
          color: #334155;
          font-size: 12px;
          font-weight: 800;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          padding: 6px 12px;
          border-radius: 99px;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
        }

        .table-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          min-width: 240px;
        }

        .table-detail-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 36px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #2563eb;
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
        }

        .table-status-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-height: 36px;
          padding: 0 10px;
          border-radius: 10px;
          border: 1px solid;
          font-weight: 800;
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.18s ease;
        }

        .table-status-btn:hover,
        .table-detail-btn:hover {
          filter: brightness(0.97);
          transform: translateY(-1px);
        }

        .assignment-list {
          display: grid;
          gap: 16px;
        }

        .assignment-card {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: #fff;
          padding: 24px;
          transition: all 0.2s ease;
        }

        .assignment-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
        }

        .assignment-card.featured {
          border: 2px solid #3b82f6;
          background: linear-gradient(to right, #ffffff, #f0f6ff);
        }

        .assignment-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 20px;
        }

        .assignment-code {
          display: inline-block;
          background: #eff6ff;
          color: #2563eb;
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .assignment-card h3 {
          margin: 0 0 8px;
          font-size: 20px;
          color: #0f172a;
          line-height: 1.4;
        }

        .assignment-place {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #64748b;
          font-size: 14px;
        }

        .assignment-mini-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }

        .mini-box {
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          border-radius: 12px;
          padding: 12px 16px;
        }

        .mini-box span {
          display: block;
          color: #64748b;
          font-size: 12px;
          margin-bottom: 4px;
          font-weight: 500;
        }

        .mini-box strong {
          color: #0f172a;
          font-size: 15px;
        }

        .assignment-info {
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
          display: grid;
          gap: 8px;
          color: #475569;
          font-size: 14px;
        }

        .assignment-info strong {
          color: #1e293b;
        }

        .assignment-actions {
          margin-top: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }

        .small-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .small-actions button {
          padding: 8px 16px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          border: 1px solid;
          transition: all 0.2s;
        }

        .small-actions button:hover {
          filter: brightness(0.95);
        }

        .day-toolbar {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .day-toolbar input {
          height: 42px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 0 14px;
          background: #fff;
          color: #334155;
          font-weight: 600;
          outline: none;
        }

        .day-toolbar.mini input {
          height: 38px;
        }

        .day-toolbar.mini button {
          height: 38px;
          padding: 0 12px;
        }

        .day-item {
          border-left: 4px solid #3b82f6;
          background: #fff;
          border-radius: 0 12px 12px 0;
          padding: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          border-top: 1px solid #f1f5f9;
          border-right: 1px solid #f1f5f9;
          border-bottom: 1px solid #f1f5f9;
        }

        .day-item h4 {
          margin: 0 0 4px;
          font-size: 15px;
        }

        .day-item p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }

        .calendar-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 32px;
        }

        .info-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px 20px;
        }

        .info-box span {
          display: block;
          color: #64748b;
          font-size: 13px;
          margin-bottom: 6px;
        }

        .info-box strong {
          display: block;
          color: #0f172a;
          font-size: 18px;
        }

        .timeline {
          position: relative;
          padding-left: 20px;
        }

        .timeline::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #e2e8f0;
        }

        .timeline-item {
          position: relative;
          margin-bottom: 24px;
          padding-left: 24px;
        }

        .timeline-item::before {
          content: "";
          position: absolute;
          left: -6px;
          top: 24px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #3b82f6;
          border: 3px solid #fff;
          box-shadow: 0 0 0 2px #bfdbfe;
        }

        .timeline-time {
          font-weight: 700;
          color: #3b82f6;
          margin-bottom: 8px;
        }

        .profile-container {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 24px;
        }

        .profile-static {
          text-align: center;
        }

        .avatar-large {
          width: 100px;
          height: 100px;
          margin: 0 auto 16px;
          background: linear-gradient(135deg, #3b82f6, #1e3a8a);
          color: #fff;
          font-size: 40px;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
        }

        .profile-static h3 {
          margin: 0 0 8px;
          font-size: 22px;
        }

        .badge-role {
          background: #f1f5f9;
          color: #475569;
          padding: 4px 12px;
          border-radius: 99px;
          font-size: 13px;
          font-weight: 600;
        }

        .info-stacked {
          text-align: left;
          display: grid;
          gap: 12px;
        }

        .profile-form {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .input-group.full {
          grid-column: 1 / -1;
        }

        .input-group label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 600;
          color: #334155;
        }

        .input-group input,
        .input-group textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 15px;
          outline: none;
          transition: all 0.2s;
          box-sizing: border-box;
        }

        .input-group textarea {
          min-height: 120px;
          resize: vertical;
        }

        .input-group input:focus,
        .input-group textarea:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-actions {
          grid-column: 1 / -1;
          text-align: right;
          margin-top: 10px;
        }

        .pagination-wrapper {
          display: flex;
          justify-content: center;
          padding: 24px 20px;
          border-top: 1px solid #f1f5f9;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .modal-card {
          background: #fff;
          width: 100%;
          max-width: 960px;
          border-radius: 24px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
          overflow: hidden;
        }

        .modal-header {
          padding: 24px 32px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          background: #f8fafc;
        }

        .modal-header h2 {
          margin: 8px 0;
          font-size: 24px;
          color: #0f172a;
        }

        .modal-header p {
          margin: 0;
          color: #64748b;
        }

        .close-btn {
          background: #e2e8f0;
          border: none;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          font-size: 20px;
          cursor: pointer;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .close-btn:hover {
          background: #cbd5e1;
        }

        .modal-body {
          padding: 32px;
          overflow-y: auto;
          display: grid;
          gap: 24px;
        }

        .modal-grid-4 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .modal-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .guest-table {
          width: 100%;
          border-collapse: collapse;
        }

        .guest-table th {
          background: #f8fafc;
          padding: 12px 16px;
          text-align: left;
          color: #64748b;
          font-weight: 600;
          font-size: 13px;
          border-bottom: 1px solid #e2e8f0;
        }

        .guest-table td {
          padding: 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
          font-size: 14px;
        }

        .itinerary-list {
          display: grid;
          gap: 16px;
        }

        .itinerary-item {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
        }

        .itinerary-item span {
          color: #2563eb;
          font-weight: 700;
          font-size: 14px;
          display: block;
          margin-bottom: 8px;
        }

        .itinerary-item strong {
          font-size: 16px;
          color: #0f172a;
        }

        .itinerary-item p {
          margin: 8px 0 0;
          color: #64748b;
          line-height: 1.6;
        }

        @media (max-width: 1200px) {
          .stat-grid,
          .calendar-summary {
            grid-template-columns: repeat(2, 1fr);
          }

          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .filter-panel {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 992px) {
          .profile-container {
            grid-template-columns: 1fr;
          }

          .guide-sidebar {
            transform: translateX(-100%);
            transition: 0.3s;
          }

          .guide-main {
            margin-left: 0;
          }

          .menu-btn {
            display: block;
          }

          .modal-grid-4 {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .content-wrap {
            padding: 20px;
          }

          .stat-grid,
          .calendar-summary {
            grid-template-columns: 1fr;
          }

          .filter-panel,
          .modal-grid-2,
          .profile-form {
            grid-template-columns: 1fr;
          }

          .assignment-title-row {
            flex-direction: column;
          }

          .assignment-mini-grid {
            grid-template-columns: 1fr;
          }
        }

        .profile-page {
          display: grid;
          gap: 24px;
        }
        .profile-wide-card {
          padding: 28px;
        }
        .credential-grid {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 28px;
        }
        .credential-form {
          display: grid;
          gap: 14px;
          align-content: start;
        }
        .credential-list {
          display: grid;
          gap: 12px;
        }
        .credential-item {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 16px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #fff;
        }
        .credential-item strong,
        .credential-item span {
          display: block;
        }
        .credential-item span {
          margin-top: 4px;
          color: #64748b;
          font-size: 13px;
        }
        .credential-item.approved {
          background: #f0fdf4;
          border-color: #bbf7d0;
        }
        .credential-item.pending {
          background: #fffbeb;
          border-color: #fde68a;
        }
        .credential-item.rejected {
          background: #fef2f2;
          border-color: #fecaca;
        }
        .sub-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 14px;
        }
        .icon-danger {
          border: 0;
          background: #fee2e2;
          color: #b91c1c;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .password-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
          gap: 16px;
          align-items: end;
        }
        .availability-form {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        .availability-list {
          display: grid;
          gap: 12px;
        }
        .availability-item {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: center;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px 18px;
          background: #fff;
        }
        .availability-item strong,
        .availability-item span {
          display: block;
        }
        .availability-item span {
          color: #475569;
          margin-top: 6px;
          font-size: 13px;
        }
        .availability-item p {
          margin: 7px 0 0;
          color: #64748b;
        }
        .availability-side {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .input-group select {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 12px 16px;
          background: #fff;
        }
        @media (max-width: 1000px) {
          .credential-grid,
          .password-grid,
          .availability-form {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <GuideChatbotWidget />
    </section>
  );
}

function AssignmentTable({
  items,
  onViewDetail,
  onQuickStatus,
  onReportUnavailable,
}) {
  return (
    <div className="table-responsive">
      <table className="assignment-table">
        <thead>
          <tr>
            <th>Tour / Booking</th>
            <th>Lịch trình</th>
            <th>Khách đại diện</th>
            <th>Điểm đón</th>
            <th>Giá trị</th>
            <th>Trạng thái</th>
            <th style={{ textAlign: "right" }}>Thao tác</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => {
            const booking = item.booking || {};
            const tour = item.tour || {};
            const destination = tour.destination || {};

            return (
              <tr key={item.id}>
                <td>
                  <div className="tour-cell">
                    <span className="booking-code">
                      {booking.bookingCode || tour.code || "--"}
                    </span>

                    <div className="tour-title">{tour.name || "--"}</div>

                    <div className="tour-destination">
                      <MapPin size={15} />
                      {destination.name || "--"}
                      {destination.province ? ` • ${destination.province}` : ""}
                    </div>
                  </div>
                </td>

                <td>
                  <div className="date-cell">
                    <strong>{formatDate(item.startDate)}</strong>
                    <span>Kết thúc: {formatDate(item.endDate)}</span>
                    <span className="guest-count">
                      {booking.totalGuests || 0} khách
                    </span>
                  </div>
                </td>

                <td>
                  <div className="customer-cell">
                    <strong>{booking.contactName || "--"}</strong>
                    <span>{booking.contactPhone || "--"}</span>
                    <span>{booking.contactEmail || "--"}</span>
                  </div>
                </td>

                <td>
                  <div className="pickup-cell">
                    <strong>{booking.pickupName || "Travela liên hệ"}</strong>
                    <span>{booking.pickupAddress || "Đang cập nhật"}</span>
                  </div>
                </td>

                <td>
                  <span className="value-price">
                    {formatCurrency(booking.finalAmount)}
                  </span>
                </td>

                <td>
                  <StatusPill status={item.status} />
                </td>

                <td>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="table-detail-btn"
                      onClick={() => onViewDetail(item.id)}
                    >
                      <Eye size={16} />
                      Xem chi tiết
                    </button>

                    {item.status === "assigned" && (
                      <button
                        type="button"
                        className="table-status-btn"
                        style={{
                          background: "#ecfdf5",
                          color: "#047857",
                          borderColor: "#a7f3d0",
                        }}
                        onClick={() => onQuickStatus(item.id, "accepted")}
                      >
                        <CheckCircle size={15} />
                        Đã nhận
                      </button>
                    )}

                    {["assigned", "accepted"].includes(item.status) &&
                      new Date(item.endDate).getTime() >=
                        new Date(new Date().setHours(0, 0, 0, 0)).getTime() && (
                        <button
                          type="button"
                          className="table-status-btn"
                          style={{
                            background: "#fff7ed",
                            color: "#c2410c",
                            borderColor: "#fed7aa",
                          }}
                          onClick={() => onReportUnavailable(item.id)}
                        >
                          <Ban size={15} />
                          Không thể nhận
                        </button>
                      )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AssignmentCard({
  item,
  onViewDetail,
  onQuickStatus,
  onReportUnavailable,
  featured = false,
}) {
  const booking = item.booking || {};
  const tour = item.tour || {};
  const destination = tour.destination || {};

  return (
    <div className={`assignment-card ${featured ? "featured" : ""}`}>
      <div className="assignment-top">
        <div>
          <span className="assignment-code">
            {booking.bookingCode || tour.code || "--"}
          </span>

          <h3>{tour.name || "--"}</h3>

          <div className="assignment-place">
            <MapPin size={16} />
            {destination.name || "--"}{" "}
            {destination.province ? `• ${destination.province}` : ""}
          </div>
        </div>

        <StatusPill status={item.status} />
      </div>

      <div className="assignment-mini-grid">
        <div className="mini-box">
          <span>Ngày khởi hành</span>
          <strong>{formatDate(item.startDate)}</strong>
        </div>

        <div className="mini-box">
          <span>Quy mô đoàn</span>
          <strong>{booking.totalGuests || 0} khách</strong>
        </div>

        <div className="mini-box">
          <span>Giá trị hợp đồng</span>
          <strong style={{ color: "#ef4444" }}>
            {formatCurrency(booking.finalAmount)}
          </strong>
        </div>
      </div>

      <div className="assignment-info">
        <div>
          <strong>Người đại diện:</strong> {booking.contactName || "--"}{" "}
          {booking.contactPhone ? `• ${booking.contactPhone}` : ""}
        </div>

        <div>
          <strong>Điểm đón:</strong>{" "}
          {booking.pickupName || "Travela sẽ liên hệ"}
        </div>
      </div>

      <div className="assignment-actions">
        <button
          type="button"
          className="btn-light"
          onClick={() => onViewDetail(item.id)}
        >
          <Eye size={18} /> Xem chi tiết
        </button>

        <div className="small-actions">
          {item.status === "assigned" && (
            <button
              type="button"
              style={{
                background: "#ecfdf5",
                color: "#047857",
                borderColor: "#a7f3d0",
              }}
              onClick={() => onQuickStatus(item.id, "accepted")}
            >
              Đã nhận
            </button>
          )}

          {["assigned", "accepted"].includes(item.status) &&
            new Date(item.endDate).getTime() >=
              new Date(new Date().setHours(0, 0, 0, 0)).getTime() && (
              <button
                type="button"
                style={{
                  background: "#fff7ed",
                  color: "#c2410c",
                  borderColor: "#fed7aa",
                }}
                onClick={() => onReportUnavailable(item.id)}
              >
                Không thể nhận
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

function DayScheduleItem({ item, onViewDetail }) {
  const booking = item.booking || {};
  const tour = item.tour || {};

  return (
    <div className="day-item">
      <div>
        <h4>{tour.name || "--"}</h4>
        <p>
          {booking.bookingCode || "--"} • {booking.totalGuests || 0} khách
        </p>
      </div>

      <button
        type="button"
        className="btn-light"
        style={{ padding: "6px 12px" }}
        onClick={() => onViewDetail(item.id)}
      >
        <Eye size={16} />
      </button>
    </div>
  );
}

function TimelineItem({
  item,
  onViewDetail,
  onQuickStatus,
  onReportUnavailable,
}) {
  const booking = item.booking || {};
  const pickupTime = booking.pickupTime
    ? new Date(booking.pickupTime).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  return (
    <div className="timeline-item">
      <div className="timeline-time">{pickupTime}</div>

      <AssignmentCard
        item={item}
        onViewDetail={onViewDetail}
        onQuickStatus={onQuickStatus}
        onReportUnavailable={onReportUnavailable}
      />
    </div>
  );
}

function EmptyState({ text, icon: Icon = Info }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "48px 20px",
        color: "#94a3b8",
      }}
    >
      <Icon
        size={48}
        strokeWidth={1.5}
        style={{
          marginBottom: 16,
          color: "#cbd5e1",
        }}
      />

      <p style={{ margin: 0, fontSize: 15 }}>{text}</p>
    </div>
  );
}

function AssignmentDetailModal({ assignment, onClose }) {
  const booking = assignment.booking || {};
  const tour = assignment.tour || {};
  const destination = tour.destination || {};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Chi tiết điều hành</span>

            <h2>{tour.name || "--"}</h2>

            <p>
              {booking.bookingCode || "--"} • {destination.name || "--"} •{" "}
              {formatDate(assignment.startDate)}
            </p>
          </div>

          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-grid-4">
            <InfoBox
              label="Trạng thái"
              value={statusLabels[assignment.status]}
            />

            <InfoBox
              label="Khởi hành"
              value={formatDate(assignment.startDate)}
            />

            <InfoBox label="Kết thúc" value={formatDate(assignment.endDate)} />

            <InfoBox
              label="Quy mô"
              value={`${booking.totalGuests || 0} khách`}
            />
          </div>

          <DetailBlock title="Thông tin người đặt">
            <div className="modal-grid-2">
              <InfoLine
                icon={User}
                label="Khách hàng"
                value={booking.contactName}
              />

              <InfoLine
                icon={Phone}
                label="Điện thoại"
                value={booking.contactPhone}
              />

              <InfoLine
                icon={Info}
                label="Email"
                value={booking.contactEmail}
              />

              <InfoLine
                icon={MapPin}
                label="Đón tại"
                value={`${booking.pickupName || "Travela liên hệ"} - ${
                  booking.pickupAddress || ""
                }`}
              />
            </div>
          </DetailBlock>

          <DetailBlock title="Danh sách hành khách">
            {!booking.guests?.length ? (
              <p style={{ color: "#64748b" }}>Chưa có danh sách chi tiết.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="guest-table">
                  <thead>
                    <tr>
                      <th>Họ tên</th>
                      <th>Loại vé</th>
                      <th>Ngày sinh</th>
                      <th>Giới tính</th>
                      <th>Giấy tờ</th>
                    </tr>
                  </thead>

                  <tbody>
                    {booking.guests.map((guest) => (
                      <tr key={guest.id}>
                        <td>
                          <strong>{guest.fullName}</strong>
                        </td>

                        <td>
                          {guest.guestType === "child" ? "Trẻ em" : "Người lớn"}
                        </td>

                        <td>
                          {guest.dateOfBirth
                            ? formatDate(guest.dateOfBirth)
                            : "--"}
                        </td>

                        <td>{guest.gender || "--"}</td>

                        <td>{guest.idNumber || "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailBlock>

          <DetailBlock title="Lịch trình chi tiết">
            {!tour.itinerary?.length ? (
              <p style={{ color: "#64748b" }}>Chưa cập nhật lịch trình.</p>
            ) : (
              <div className="itinerary-list">
                {tour.itinerary.map((row) => (
                  <div className="itinerary-item" key={row.id}>
                    <span>Ngày {row.dayNumber}</span>
                    <strong>{row.title}</strong>
                    <p>{row.description || "--"}</p>
                  </div>
                ))}
              </div>
            )}
          </DetailBlock>

          <DetailBlock title="Trạng thái phân công">
            <div className="modal-grid-2">
              <InfoBox
                label="Trạng thái hiện tại"
                value={statusLabels[assignment.status] || assignment.status}
              />
              <InfoBox
                label="Ghi chú"
                value={assignment.note || "Không có ghi chú"}
              />
            </div>
          </DetailBlock>
        </div>
      </div>
    </div>
  );
}

function DetailBlock({ title, children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "20px",
        padding: "24px",
      }}
    >
      <h3
        style={{
          margin: "0 0 20px",
          fontSize: "18px",
          color: "#0f172a",
        }}
      >
        {title}
      </h3>

      {children}
    </div>
  );
}

function InfoLine({ icon: Icon, label, value }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        background: "#f8fafc",
        padding: "16px",
        borderRadius: "16px",
        border: "1px solid #f1f5f9",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "8px",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          height: "fit-content",
        }}
      >
        <Icon size={20} color="#2563eb" />
      </div>

      <div>
        <span
          style={{
            display: "block",
            color: "#64748b",
            fontSize: "13px",
            marginBottom: "4px",
          }}
        >
          {label}
        </span>

        <strong
          style={{
            color: "#0f172a",
            fontSize: "15px",
          }}
        >
          {value || "--"}
        </strong>
      </div>
    </div>
  );
}
