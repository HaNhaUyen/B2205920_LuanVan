import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileBarChart2,
  Filter,
  MapPin,
  RefreshCcw,
  Search,
  ShieldAlert,
  UsersRound,
  XCircle,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";

const PAGE_SIZE = 8;
const TRIP_PAGE_SIZE = 10;
const REPORT_PAGE_SIZE = 8;

const TABS = [
  { key: "alerts", label: "Cảnh báo", icon: AlertTriangle },
  { key: "incidents", label: "Sự cố", icon: ShieldAlert },
  { key: "suppliers", label: "Nhà cung cấp", icon: Building2 },
  { key: "changes", label: "Đổi lịch", icon: CalendarClock },
];

const emptySupplier = {
  name: "",
  supplierType: "hotel",
  phone: "",
  email: "",
  representative: "",
  address: "",
  province: "",
  note: "",
};

const operationLabels = {
  preparing: "Đang chuẩn bị",
  ready: "Sẵn sàng",
  boarding: "Đang đón khách",
  departed: "Đã khởi hành",
  in_progress: "Đang diễn ra",
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy",
};

const alertStatusLabels = {
  open: "Đang mở",
  acknowledged: "Đã tiếp nhận",
  in_progress: "Đang xử lý",
  resolved: "Đã xử lý",
  ignored: "Bỏ qua",
};

const incidentStatusLabels = {
  open: "Đang mở",
  acknowledged: "Đã tiếp nhận",
  in_progress: "Đang xử lý",
  resolved: "Đã xử lý",
  closed: "Đã đóng",
};

const supplierTypeLabels = {
  hotel: "Khách sạn",
  transport: "Vận chuyển",
  restaurant: "Nhà hàng",
  attraction: "Điểm tham quan",
  insurance: "Bảo hiểm",
  other: "Khác",
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getTripName(trip) {
  return (
    trip?.tour?.name ||
    trip?.tourName ||
    trip?.tour_name ||
    trip?.dashboard?.tour?.name ||
    `Chuyến đi #${trip?.id || "--"}`
  );
}

function getTripDestination(trip) {
  return (
    trip?.tour?.destination?.name ||
    trip?.destinationName ||
    trip?.destination_name ||
    trip?.dashboard?.destination?.name ||
    "Chưa cập nhật điểm đến"
  );
}

function getTripStartDate(trip) {
  return (
    trip?.departure?.departureDate ||
    trip?.departureDate ||
    trip?.departure_date ||
    trip?.dashboard?.departure?.departureDate
  );
}

function getStatusTone(status) {
  if (["completed", "resolved", "approved", "active"].includes(status))
    return "success";
  if (["open", "high", "critical", "rejected", "cancelled"].includes(status))
    return "danger";
  if (["acknowledged", "in_progress", "pending", "medium"].includes(status))
    return "warning";
  return "info";
}

function StatusBadge({ status, label }) {
  return (
    <span className={`status-badge ${getStatusTone(status)}`}>
      {label || status || "--"}
    </span>
  );
}

function EmptyState({ icon: Icon = ClipboardCheck, title, description }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={30} />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function MetricCard({ label, value, hint, icon: Icon, tone = "blue" }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        {Icon && <Icon size={20} />}
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function Toolbar({ value, onChange, placeholder, right }) {
  return (
    <div className="toolbar">
      <div className="search-box">
        <Search size={18} />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </div>
      {right}
    </div>
  );
}

function SectionTitle({ title, description, action }) {
  return (
    <div className="section-title">
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function Paginator({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination-wrap">
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}

export default function AdminOperationsPage() {
  const { showToast } = useToast();

  const [tab, setTab] = useState("alerts");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [trips, setTrips] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  const [alerts, setAlerts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [changes, setChanges] = useState([]);
  const [reports, setReports] = useState(null);

  const [supplierForm, setSupplierForm] = useState(emptySupplier);
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState("2026-12-31");

  const [tripKeyword, setTripKeyword] = useState("");
  const [alertKeyword, setAlertKeyword] = useState("");
  const [incidentKeyword, setIncidentKeyword] = useState("");
  const [supplierKeyword, setSupplierKeyword] = useState("");
  const [changeKeyword, setChangeKeyword] = useState("");
  const [alertStatus, setAlertStatus] = useState("all");
  const [incidentStatus, setIncidentStatus] = useState("all");

  const [tripPage, setTripPage] = useState(1);
  const [alertPage, setAlertPage] = useState(1);
  const [incidentPage, setIncidentPage] = useState(1);
  const [supplierPage, setSupplierPage] = useState(1);
  const [changePage, setChangePage] = useState(1);
  const [reportFinancePage, setReportFinancePage] = useState(1);
  const [reportOccupancyPage, setReportOccupancyPage] = useState(1);

  const openTrip = async (trip) => {
    setRefreshing(true);
    try {
      setSelected(trip);
      const dashboardData = await apiFetch(
        `/trip-operations/${trip.id}/dashboard`,
      );
      setDashboard(dashboardData);
    } catch (error) {
      showToast(error.message || "Không tải được chi tiết chuyến đi.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const loadTrips = async () => {
    const data = safeArray(await apiFetch("/trip-operations/my-trips"));
    setTrips(data);

    const current =
      data.find((item) => String(item.id) === String(selected?.id)) || data[0];

    if (current) {
      await openTrip(current);
    } else {
      setSelected(null);
      setDashboard(null);
    }
  };

  const loadTab = async (key = tab) => {
    setLoading(true);
    try {
      if (key === "center") {
        await Promise.all([
          loadTrips(),
          apiFetch("/operations-v2/alerts")
            .then((rows) => setAlerts(safeArray(rows)))
            .catch(() => setAlerts([])),
          apiFetch("/trip-operations/admin/incidents/all")
            .then((rows) => setIncidents(safeArray(rows)))
            .catch(() => setIncidents([])),
        ]);
      }
      if (key === "alerts")
        setAlerts(safeArray(await apiFetch("/operations-v2/alerts")));
      if (key === "incidents")
        setIncidents(
          safeArray(await apiFetch("/trip-operations/admin/incidents/all")),
        );
      if (key === "suppliers")
        setSuppliers(safeArray(await apiFetch("/operations-v2/suppliers")));
      if (key === "changes")
        setChanges(
          safeArray(await apiFetch("/operations-v2/departure-changes")),
        );
      if (key === "reports")
        setReports(
          await apiFetch(
            `/operations-v2/reports/advanced?from=${from}&to=${to}`,
          ),
        );
    } catch (error) {
      showToast(error.message || "Không tải được dữ liệu điều hành.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  useEffect(() => {
    setTripPage(1);
  }, [tripKeyword]);

  useEffect(() => {
    setAlertPage(1);
  }, [alertKeyword, alertStatus]);

  useEffect(() => {
    setIncidentPage(1);
  }, [incidentKeyword, incidentStatus]);

  useEffect(() => {
    setSupplierPage(1);
  }, [supplierKeyword]);

  useEffect(() => {
    setChangePage(1);
  }, [changeKeyword]);

  const refreshCurrentTab = async () => {
    setRefreshing(true);
    try {
      await loadTab(tab);
    } finally {
      setRefreshing(false);
    }
  };

  const createSupplier = async (event) => {
    event.preventDefault();
    if (!supplierForm.name.trim()) {
      showToast("Vui lòng nhập tên nhà cung cấp.", "error");
      return;
    }
    try {
      await apiFetch("/operations-v2/suppliers", {
        method: "POST",
        body: JSON.stringify(supplierForm),
      });
      setSupplierForm(emptySupplier);
      setSuppliers(safeArray(await apiFetch("/operations-v2/suppliers")));
      showToast("Đã thêm nhà cung cấp.", "success");
    } catch (error) {
      showToast(error.message || "Không thể thêm nhà cung cấp.", "error");
    }
  };

  const reviewChange = async (id, action) => {
    try {
      await apiFetch(`/operations-v2/departure-changes/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setChanges(safeArray(await apiFetch("/operations-v2/departure-changes")));
      showToast(
        action === "approve"
          ? "Đã duyệt yêu cầu đổi lịch."
          : "Đã từ chối yêu cầu.",
        "success",
      );
    } catch (error) {
      showToast(error.message || "Không thể xử lý yêu cầu.", "error");
    }
  };

  const updateAlert = async (id, status) => {
    try {
      await apiFetch(`/operations-v2/alerts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setAlerts((items) =>
        items.map((item) => (item.id === id ? { ...item, status } : item)),
      );
      showToast("Đã cập nhật cảnh báo.", "success");
    } catch (error) {
      showToast(error.message || "Không thể cập nhật cảnh báo.", "error");
    }
  };

  const updateIncident = async (id, status) => {
    try {
      await apiFetch(`/trip-operations/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setIncidents((items) =>
        items.map((item) => (item.id === id ? { ...item, status } : item)),
      );
      showToast("Đã cập nhật sự cố.", "success");
    } catch (error) {
      showToast(error.message || "Không thể cập nhật sự cố.", "error");
    }
  };

  const scanAlerts = async () => {
    try {
      setRefreshing(true);
      await apiFetch("/operations-v2/alerts/scan", { method: "POST" });
      setAlerts(safeArray(await apiFetch("/operations-v2/alerts")));
      showToast("Đã quét lại cảnh báo vận hành.", "success");
    } catch (error) {
      showToast(error.message || "Không thể quét cảnh báo.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const filteredTrips = useMemo(() => {
    const keyword = normalize(tripKeyword);
    if (!keyword) return trips;
    return trips.filter((trip) =>
      [
        getTripName(trip),
        getTripDestination(trip),
        trip?.tour?.code,
        trip?.operationCode,
      ].some((value) => normalize(value).includes(keyword)),
    );
  }, [trips, tripKeyword]);

  const filteredAlerts = useMemo(() => {
    const keyword = normalize(alertKeyword);
    return alerts.filter((item) => {
      const statusMatch = alertStatus === "all" || item.status === alertStatus;
      const keywordMatch =
        !keyword ||
        [item.title, item.message, item.alertType, item.alert_type].some(
          (value) => normalize(value).includes(keyword),
        );
      return statusMatch && keywordMatch;
    });
  }, [alerts, alertKeyword, alertStatus]);

  const filteredIncidents = useMemo(() => {
    const keyword = normalize(incidentKeyword);
    return incidents.filter((item) => {
      const statusMatch =
        incidentStatus === "all" || item.status === incidentStatus;
      const keywordMatch =
        !keyword ||
        [
          item.ticketCode,
          item.ticket_code,
          item.title,
          item.description,
          item.category,
          item.severity,
        ].some((value) => normalize(value).includes(keyword));
      return statusMatch && keywordMatch;
    });
  }, [incidents, incidentKeyword, incidentStatus]);

  const filteredSuppliers = useMemo(() => {
    const keyword = normalize(supplierKeyword);
    if (!keyword) return suppliers;
    return suppliers.filter((item) =>
      [
        item.name,
        item.phone,
        item.email,
        item.address,
        item.province,
        item.supplier_type,
        item.supplierType,
      ].some((value) => normalize(value).includes(keyword)),
    );
  }, [suppliers, supplierKeyword]);

  const filteredChanges = useMemo(() => {
    const keyword = normalize(changeKeyword);
    if (!keyword) return changes;
    return changes.filter((item) =>
      [
        item.request_code,
        item.requestCode,
        item.booking_id,
        item.bookingId,
        item.reason,
        item.status,
      ].some((value) => normalize(value).includes(keyword)),
    );
  }, [changes, changeKeyword]);

  const tripTotalPages = Math.max(
    1,
    Math.ceil(filteredTrips.length / TRIP_PAGE_SIZE),
  );
  const alertTotalPages = Math.max(
    1,
    Math.ceil(filteredAlerts.length / PAGE_SIZE),
  );
  const incidentTotalPages = Math.max(
    1,
    Math.ceil(filteredIncidents.length / PAGE_SIZE),
  );
  const supplierTotalPages = Math.max(
    1,
    Math.ceil(filteredSuppliers.length / PAGE_SIZE),
  );
  const changeTotalPages = Math.max(
    1,
    Math.ceil(filteredChanges.length / PAGE_SIZE),
  );

  const pagedTrips = filteredTrips.slice(
    (tripPage - 1) * TRIP_PAGE_SIZE,
    tripPage * TRIP_PAGE_SIZE,
  );
  const pagedAlerts = filteredAlerts.slice(
    (alertPage - 1) * PAGE_SIZE,
    alertPage * PAGE_SIZE,
  );
  const pagedIncidents = filteredIncidents.slice(
    (incidentPage - 1) * PAGE_SIZE,
    incidentPage * PAGE_SIZE,
  );
  const pagedSuppliers = filteredSuppliers.slice(
    (supplierPage - 1) * PAGE_SIZE,
    supplierPage * PAGE_SIZE,
  );
  const pagedChanges = filteredChanges.slice(
    (changePage - 1) * PAGE_SIZE,
    changePage * PAGE_SIZE,
  );

  const financeRows = safeArray(reports?.finance);
  const occupancyRows = safeArray(reports?.occupancy);
  const financeTotalPages = Math.max(
    1,
    Math.ceil(financeRows.length / REPORT_PAGE_SIZE),
  );
  const occupancyTotalPages = Math.max(
    1,
    Math.ceil(occupancyRows.length / REPORT_PAGE_SIZE),
  );
  const pagedFinance = financeRows.slice(
    (reportFinancePage - 1) * REPORT_PAGE_SIZE,
    reportFinancePage * REPORT_PAGE_SIZE,
  );
  const pagedOccupancy = occupancyRows.slice(
    (reportOccupancyPage - 1) * REPORT_PAGE_SIZE,
    reportOccupancyPage * REPORT_PAGE_SIZE,
  );

  const financeTotal = useMemo(
    () =>
      financeRows.reduce((sum, item) => sum + Number(item.netRevenue || 0), 0),
    [reports],
  );

  const selectedOperationId = Number(
    selected?.id || dashboard?.operation?.id || 0,
  );
  const selectedDepartureId = Number(
    selected?.departureId ||
      selected?.departure?.id ||
      dashboard?.departure?.id ||
      0,
  );

  const customerCategories = new Set([
    "customer",
    "passenger",
    "health",
    "booking",
    "attendance",
    "pickup",
    "luggage",
  ]);

  const selectedCustomerIncidents = incidents
    .filter((item) => {
      const sameTrip =
        Number(item.tripOperationId || item.trip_operation_id || 0) ===
          selectedOperationId ||
        Number(item.departureId || item.departure_id || 0) ===
          selectedDepartureId;
      const category = String(item.category || "").toLowerCase();
      return sameTrip && customerCategories.has(category);
    })
    .slice(0, 5);

  const selectedCustomerAlerts = alerts
    .filter((item) => {
      const sameTrip =
        Number(item.tripOperationId || item.trip_operation_id || 0) ===
          selectedOperationId ||
        Number(item.departureId || item.departure_id || 0) ===
          selectedDepartureId;
      const type = String(
        item.alertType || item.alert_type || "",
      ).toLowerCase();
      return (
        sameTrip &&
        [
          "customer_health",
          "passenger_missing",
          "passenger_late",
          "pickup_issue",
          "booking_issue",
          "customer_request",
          "incident_high_severity",
        ].includes(type)
      );
    })
    .slice(0, 5);

  return (
    <AdminLayout
      current="/admin/operations"
      title="Điều hành tour"
      subtitle="Quản lý toàn bộ hoạt động trước, trong và sau chuyến đi"
    >
      <div className="ops-page">
        <section className="page-header-card">
          <div>
            <span className="eyebrow">Vận hành tập trung</span>
            <h2>Điều hành và hỗ trợ tour</h2>
            <p>
              Theo dõi lịch khởi hành, cảnh báo, sự cố và hiệu quả vận hành trên
              cùng một màn hình.
            </p>
          </div>
          <button
            type="button"
            className="btn-outline"
            onClick={refreshCurrentTab}
            disabled={refreshing}
          >
            <RefreshCcw size={17} className={refreshing ? "spin" : ""} />
            {refreshing ? "Đang tải..." : "Làm mới dữ liệu"}
          </button>
        </section>

        <nav className="tabs-card">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.key}
                className={tab === item.key ? "active" : ""}
                onClick={() => setTab(item.key)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {item.key === "alerts" && alerts.length > 0 && (
                  <small>{alerts.length}</small>
                )}
                {item.key === "incidents" && incidents.length > 0 && (
                  <small>{incidents.length}</small>
                )}
              </button>
            );
          })}
        </nav>

        {loading ? (
          <div className="loading-card">
            <Loading text="Đang tải dữ liệu điều hành..." />
          </div>
        ) : (
          <>
            {tab === "center" && (
              <div className="center-layout">
                <aside className="trip-sidebar">
                  <SectionTitle
                    title="Chuyến đi"
                    description={`${filteredTrips.length} lịch khởi hành`}
                  />
                  <div className="trip-search">
                    <Search size={17} />
                    <input
                      value={tripKeyword}
                      onChange={(event) => setTripKeyword(event.target.value)}
                      placeholder="Tìm tên tour, điểm đến..."
                    />
                  </div>

                  {!pagedTrips.length ? (
                    <EmptyState
                      icon={CalendarClock}
                      title="Không có chuyến phù hợp"
                      description="Hãy kiểm tra lại từ khóa tìm kiếm."
                    />
                  ) : (
                    <div className="trip-list">
                      {pagedTrips.map((trip) => {
                        const active = String(selected?.id) === String(trip.id);
                        return (
                          <button
                            type="button"
                            key={trip.id}
                            className={active ? "selected" : ""}
                            onClick={() => openTrip(trip)}
                          >
                            <div className="trip-list-top">
                              <StatusBadge
                                status={trip.operationStatus}
                                label={
                                  operationLabels[trip.operationStatus] ||
                                  "Đang chuẩn bị"
                                }
                              />
                              <ChevronRight size={17} />
                            </div>
                            <strong>{getTripName(trip)}</strong>
                            <span>
                              <MapPin size={13} />
                              {getTripDestination(trip)}
                            </span>
                            <small>{formatDate(getTripStartDate(trip))}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <Paginator
                    page={tripPage}
                    totalPages={tripTotalPages}
                    onPageChange={setTripPage}
                  />
                </aside>

                <section className="center-content">
                  {!selected ? (
                    <div className="panel">
                      <EmptyState
                        icon={ClipboardCheck}
                        title="Chưa chọn chuyến đi"
                        description="Chọn một lịch khởi hành bên trái để xem thông tin vận hành."
                      />
                    </div>
                  ) : (
                    <>
                      <section className="trip-hero">
                        <div>
                          <span className="hero-eyebrow">
                            Trung tâm điều hành chuyến đi
                          </span>
                          <h3>
                            {dashboard?.tour?.name || getTripName(selected)}
                          </h3>
                          <p>
                            <MapPin size={15} />
                            {dashboard?.destination?.name ||
                              dashboard?.tour?.destinationName ||
                              getTripDestination(selected)}
                          </p>
                          <div className="hero-meta">
                            <span>
                              Khởi hành:{" "}
                              {formatDate(
                                dashboard?.departure?.departureDate ||
                                  getTripStartDate(selected),
                              )}
                            </span>
                            <span>
                              Kết thúc:{" "}
                              {formatDate(
                                dashboard?.departure?.endDate ||
                                  selected?.departure?.endDate ||
                                  selected?.endDate,
                              )}
                            </span>
                          </div>
                        </div>
                        <StatusBadge
                          status={
                            dashboard?.operation?.operationStatus ||
                            selected.operationStatus
                          }
                          label={
                            operationLabels[
                              dashboard?.operation?.operationStatus ||
                                selected.operationStatus
                            ] || "Đang chuẩn bị"
                          }
                        />
                      </section>

                      <div className="metric-grid">
                        <MetricCard
                          icon={UsersRound}
                          label="Hành khách"
                          value={
                            dashboard?.metrics?.totalPassengers ||
                            dashboard?.passengerCount ||
                            selected?.passengerCount ||
                            0
                          }
                          hint="Tổng khách trong đoàn"
                        />
                        <MetricCard
                          icon={CheckCircle2}
                          label="Đã điểm danh"
                          value={dashboard?.metrics?.checkedInPassengers || 0}
                          hint="Khách đã xác nhận có mặt"
                          tone="green"
                        />
                        <MetricCard
                          icon={ShieldAlert}
                          label="Sự cố đang mở"
                          value={dashboard?.metrics?.openIncidents || 0}
                          hint="Cần theo dõi và xử lý"
                          tone="red"
                        />
                        <MetricCard
                          icon={CalendarClock}
                          label="Trạng thái chuyến"
                          value={
                            operationLabels[
                              dashboard?.operation?.operationStatus ||
                                selected.operationStatus
                            ] || "Đang chuẩn bị"
                          }
                          hint="Theo trạng thái vận hành hiện tại"
                          tone="amber"
                        />
                      </div>

                      <div className="customer-monitor-grid">
                        <section className="panel customer-monitor-card">
                          <SectionTitle
                            title="Cảnh báo liên quan khách hàng"
                            description="Chỉ hiển thị cảnh báo sức khỏe, điểm đón, booking và hành khách."
                          />
                          {!selectedCustomerAlerts.length ? (
                            <EmptyState
                              icon={AlertTriangle}
                              title="Không có cảnh báo khách hàng"
                              description="Chuyến này chưa phát sinh cảnh báo liên quan đến khách."
                            />
                          ) : (
                            <div className="compact-monitor-list">
                              {selectedCustomerAlerts.map((item) => (
                                <article key={item.id}>
                                  <AlertTriangle size={18} />
                                  <div>
                                    <strong>{item.title}</strong>
                                    <span>{item.message}</span>
                                  </div>
                                  <StatusBadge
                                    status={item.status}
                                    label={alertStatusLabels[item.status]}
                                  />
                                </article>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="panel customer-monitor-card">
                          <SectionTitle
                            title="Sự cố liên quan khách hàng"
                            description="Theo dõi sức khỏe, vắng/trễ, hành lý và yêu cầu hỗ trợ."
                          />
                          {!selectedCustomerIncidents.length ? (
                            <EmptyState
                              icon={ShieldAlert}
                              title="Không có sự cố khách hàng"
                              description="Chuyến này chưa ghi nhận sự cố liên quan đến khách."
                            />
                          ) : (
                            <div className="compact-monitor-list">
                              {selectedCustomerIncidents.map((item) => (
                                <article key={item.id}>
                                  <ShieldAlert size={18} />
                                  <div>
                                    <strong>{item.title}</strong>
                                    <span>{item.description}</span>
                                  </div>
                                  <StatusBadge
                                    status={item.status}
                                    label={incidentStatusLabels[item.status]}
                                  />
                                </article>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}

            {tab === "alerts" && (
              <section className="panel">
                <SectionTitle
                  title="Cảnh báo vận hành"
                  description="Theo dõi và xử lý các tình huống cần chú ý trước ngày khởi hành."
                  action={
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={scanAlerts}
                    >
                      <RefreshCcw size={16} />
                      Quét cảnh báo
                    </button>
                  }
                />

                <Toolbar
                  value={alertKeyword}
                  onChange={setAlertKeyword}
                  placeholder="Tìm tiêu đề hoặc nội dung cảnh báo..."
                  right={
                    <select
                      value={alertStatus}
                      onChange={(event) => setAlertStatus(event.target.value)}
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="open">Đang mở</option>
                      <option value="acknowledged">Đã tiếp nhận</option>
                      <option value="in_progress">Đang xử lý</option>
                      <option value="resolved">Đã xử lý</option>
                      <option value="ignored">Bỏ qua</option>
                    </select>
                  }
                />

                {!pagedAlerts.length ? (
                  <EmptyState
                    icon={AlertTriangle}
                    title="Không có cảnh báo"
                    description="Hệ thống chưa ghi nhận cảnh báo phù hợp với bộ lọc."
                  />
                ) : (
                  <div className="card-list">
                    {pagedAlerts.map((item) => (
                      <article className="record-card" key={item.id}>
                        <div
                          className={`record-icon ${getStatusTone(item.status)}`}
                        >
                          <AlertTriangle size={20} />
                        </div>
                        <div className="record-body">
                          <div className="record-top">
                            <div>
                              <strong>{item.title}</strong>
                              <span>{item.message}</span>
                            </div>
                            <StatusBadge
                              status={item.status}
                              label={alertStatusLabels[item.status]}
                            />
                          </div>
                          <div className="record-meta">
                            <span>
                              Loại:{" "}
                              {item.alert_type || item.alertType || "Khác"}
                            </span>
                            <span>Mức độ: {item.severity || "warning"}</span>
                          </div>
                        </div>
                        <select
                          value={item.status}
                          onChange={(event) =>
                            updateAlert(item.id, event.target.value)
                          }
                        >
                          <option value="open">Đang mở</option>
                          <option value="acknowledged">Đã tiếp nhận</option>
                          <option value="in_progress">Đang xử lý</option>
                          <option value="resolved">Đã xử lý</option>
                          <option value="ignored">Bỏ qua</option>
                        </select>
                      </article>
                    ))}
                  </div>
                )}

                <Paginator
                  page={alertPage}
                  totalPages={alertTotalPages}
                  onPageChange={setAlertPage}
                />
              </section>
            )}

            {tab === "incidents" && (
              <section className="panel">
                <SectionTitle
                  title="Quản lý sự cố"
                  description="Tiếp nhận, phân loại và theo dõi tình trạng xử lý sự cố từ hướng dẫn viên."
                />

                <Toolbar
                  value={incidentKeyword}
                  onChange={setIncidentKeyword}
                  placeholder="Tìm mã ticket, tiêu đề, nội dung..."
                  right={
                    <select
                      value={incidentStatus}
                      onChange={(event) =>
                        setIncidentStatus(event.target.value)
                      }
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="open">Đang mở</option>
                      <option value="acknowledged">Đã tiếp nhận</option>
                      <option value="in_progress">Đang xử lý</option>
                      <option value="resolved">Đã xử lý</option>
                      <option value="closed">Đã đóng</option>
                    </select>
                  }
                />

                {!pagedIncidents.length ? (
                  <EmptyState
                    icon={ShieldAlert}
                    title="Không có sự cố"
                    description="Không tìm thấy sự cố phù hợp với bộ lọc."
                  />
                ) : (
                  <div className="card-list">
                    {pagedIncidents.map((item) => (
                      <article
                        className="record-card incident-card"
                        key={item.id}
                      >
                        <div
                          className={`record-icon ${getStatusTone(item.severity)}`}
                        >
                          <ShieldAlert size={20} />
                        </div>
                        <div className="record-body">
                          <div className="record-top">
                            <div>
                              <small className="ticket-code">
                                {item.ticketCode ||
                                  item.ticket_code ||
                                  `#${item.id}`}
                              </small>
                              <strong>{item.title}</strong>
                              <span>{item.description}</span>
                            </div>
                            <div className="badge-group">
                              <StatusBadge
                                status={item.severity}
                                label={item.severity || "medium"}
                              />
                              <StatusBadge
                                status={item.status}
                                label={incidentStatusLabels[item.status]}
                              />
                            </div>
                          </div>
                          <div className="record-meta">
                            <span>Nhóm: {item.category || "Khác"}</span>
                            <span>
                              Vị trí:{" "}
                              {item.location_name ||
                                item.locationName ||
                                "Chưa cập nhật"}
                            </span>
                          </div>
                        </div>
                        <select
                          value={item.status}
                          onChange={(event) =>
                            updateIncident(item.id, event.target.value)
                          }
                        >
                          <option value="open">Đang mở</option>
                          <option value="acknowledged">Đã tiếp nhận</option>
                          <option value="in_progress">Đang xử lý</option>
                          <option value="resolved">Đã xử lý</option>
                          <option value="closed">Đã đóng</option>
                        </select>
                      </article>
                    ))}
                  </div>
                )}

                <Paginator
                  page={incidentPage}
                  totalPages={incidentTotalPages}
                  onPageChange={setIncidentPage}
                />
              </section>
            )}

            {tab === "suppliers" && (
              <div className="supplier-layout">
                <section className="panel supplier-form-panel">
                  <SectionTitle
                    title="Thêm nhà cung cấp"
                    description="Khai báo đối tác mới phục vụ cho hoạt động tour."
                  />
                  <form className="supplier-form" onSubmit={createSupplier}>
                    <label className="full">
                      Tên nhà cung cấp
                      <input
                        required
                        value={supplierForm.name}
                        onChange={(event) =>
                          setSupplierForm({
                            ...supplierForm,
                            name: event.target.value,
                          })
                        }
                        placeholder="Ví dụ: Khách sạn Travela Đà Lạt"
                      />
                    </label>
                    <label>
                      Loại dịch vụ
                      <select
                        value={supplierForm.supplierType}
                        onChange={(event) =>
                          setSupplierForm({
                            ...supplierForm,
                            supplierType: event.target.value,
                          })
                        }
                      >
                        {Object.entries(supplierTypeLabels).map(
                          ([value, label]) => (
                            <option value={value} key={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      Người đại diện
                      <input
                        value={supplierForm.representative}
                        onChange={(event) =>
                          setSupplierForm({
                            ...supplierForm,
                            representative: event.target.value,
                          })
                        }
                        placeholder="Họ tên người liên hệ"
                      />
                    </label>
                    <label>
                      Điện thoại
                      <input
                        value={supplierForm.phone}
                        onChange={(event) =>
                          setSupplierForm({
                            ...supplierForm,
                            phone: event.target.value,
                          })
                        }
                        placeholder="090..."
                      />
                    </label>
                    <label>
                      Email
                      <input
                        type="email"
                        value={supplierForm.email}
                        onChange={(event) =>
                          setSupplierForm({
                            ...supplierForm,
                            email: event.target.value,
                          })
                        }
                        placeholder="contact@example.com"
                      />
                    </label>
                    <label className="full">
                      Địa chỉ
                      <input
                        value={supplierForm.address}
                        onChange={(event) =>
                          setSupplierForm({
                            ...supplierForm,
                            address: event.target.value,
                          })
                        }
                        placeholder="Địa chỉ nhà cung cấp"
                      />
                    </label>
                    <label>
                      Tỉnh / Thành phố
                      <input
                        value={supplierForm.province}
                        onChange={(event) =>
                          setSupplierForm({
                            ...supplierForm,
                            province: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Ghi chú
                      <input
                        value={supplierForm.note}
                        onChange={(event) =>
                          setSupplierForm({
                            ...supplierForm,
                            note: event.target.value,
                          })
                        }
                      />
                    </label>
                    <button className="btn-primary full" type="submit">
                      <Building2 size={16} />
                      Thêm nhà cung cấp
                    </button>
                  </form>
                </section>

                <section className="panel">
                  <SectionTitle
                    title="Danh sách nhà cung cấp"
                    description={`${filteredSuppliers.length} đối tác`}
                  />
                  <Toolbar
                    value={supplierKeyword}
                    onChange={setSupplierKeyword}
                    placeholder="Tìm tên, số điện thoại, địa chỉ..."
                  />

                  {!pagedSuppliers.length ? (
                    <EmptyState
                      icon={Building2}
                      title="Chưa có nhà cung cấp"
                      description="Thêm nhà cung cấp mới bằng biểu mẫu bên trái."
                    />
                  ) : (
                    <div className="supplier-list">
                      {pagedSuppliers.map((item) => (
                        <article className="supplier-card" key={item.id}>
                          <div className="supplier-icon">
                            <Building2 size={20} />
                          </div>
                          <div>
                            <strong>{item.name}</strong>
                            <span>
                              {supplierTypeLabels[
                                item.supplier_type || item.supplierType
                              ] || "Khác"}
                            </span>
                            <small>
                              {item.phone || "Chưa có SĐT"} ·{" "}
                              {item.province || "Chưa cập nhật khu vực"}
                            </small>
                          </div>
                          <StatusBadge
                            status={item.status || "active"}
                            label={
                              item.status === "inactive"
                                ? "Ngừng hoạt động"
                                : "Đang hợp tác"
                            }
                          />
                        </article>
                      ))}
                    </div>
                  )}

                  <Paginator
                    page={supplierPage}
                    totalPages={supplierTotalPages}
                    onPageChange={setSupplierPage}
                  />
                </section>
              </div>
            )}

            {tab === "changes" && (
              <section className="panel">
                <SectionTitle
                  title="Yêu cầu đổi lịch khởi hành"
                  description="Kiểm tra lịch mới, chênh lệch giá và phê duyệt yêu cầu của khách."
                />
                <Toolbar
                  value={changeKeyword}
                  onChange={setChangeKeyword}
                  placeholder="Tìm mã yêu cầu, booking hoặc lý do..."
                />

                {!pagedChanges.length ? (
                  <EmptyState
                    icon={CalendarClock}
                    title="Không có yêu cầu đổi lịch"
                    description="Chưa có yêu cầu nào phù hợp với từ khóa tìm kiếm."
                  />
                ) : (
                  <div className="change-list">
                    {pagedChanges.map((item) => (
                      <article className="change-card" key={item.id}>
                        <div className="change-code">
                          {item.request_code || item.requestCode}
                        </div>
                        <div className="change-main">
                          <strong>
                            Booking #{item.booking_id || item.bookingId}
                          </strong>
                          <span>
                            Lịch cũ #
                            {item.old_departure_id || item.oldDepartureId} →
                            Lịch mới #
                            {item.new_departure_id || item.newDepartureId}
                          </span>
                          <small>
                            {item.reason || "Khách không ghi lý do đổi lịch"}
                          </small>
                        </div>
                        <div className="change-price">
                          <span>Chênh lệch</span>
                          <strong>
                            {formatCurrency(
                              item.price_difference ||
                                item.priceDifference ||
                                0,
                            )}
                          </strong>
                        </div>
                        <div className="action-group">
                          <button
                            type="button"
                            className="btn-success"
                            onClick={() => reviewChange(item.id, "approve")}
                          >
                            <CheckCircle2 size={16} />
                            Duyệt
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => reviewChange(item.id, "reject")}
                          >
                            <XCircle size={16} />
                            Từ chối
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                <Paginator
                  page={changePage}
                  totalPages={changeTotalPages}
                  onPageChange={setChangePage}
                />
              </section>
            )}

            {tab === "reports" && (
              <section className="panel report-panel">
                <SectionTitle
                  title="Báo cáo vận hành nâng cao"
                  description="Tổng hợp doanh thu thực nhận và tỷ lệ lấp đầy theo lịch khởi hành."
                  action={
                    <div className="report-filter">
                      <input
                        type="date"
                        value={from}
                        onChange={(event) => setFrom(event.target.value)}
                      />
                      <span>đến</span>
                      <input
                        type="date"
                        value={to}
                        onChange={(event) => setTo(event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => loadTab("reports")}
                      >
                        <Filter size={16} />
                        Xem báo cáo
                      </button>
                    </div>
                  }
                />

                <div className="metric-grid">
                  <MetricCard
                    icon={CircleDollarSign}
                    label="Doanh thu thực nhận"
                    value={formatCurrency(financeTotal)}
                    hint="Sau hoàn tiền và điều chỉnh"
                    tone="green"
                  />
                  <MetricCard
                    icon={FileBarChart2}
                    label="Kỳ báo cáo"
                    value={financeRows.length}
                    hint="Số kỳ có dữ liệu"
                  />
                  <MetricCard
                    icon={CalendarClock}
                    label="Lịch khởi hành"
                    value={occupancyRows.length}
                    hint="Có dữ liệu lấp đầy"
                    tone="amber"
                  />
                  <MetricCard
                    icon={ShieldAlert}
                    label="Nhóm sự cố"
                    value={safeArray(reports?.incidents).length}
                    hint="Theo loại và mức độ"
                    tone="red"
                  />
                </div>

                <div className="report-grid">
                  <article className="report-card">
                    <div className="report-card-head">
                      <div>
                        <h4>Doanh thu theo kỳ</h4>
                        <p>Dữ liệu doanh thu thực nhận</p>
                      </div>
                      <CircleDollarSign size={22} />
                    </div>

                    {!pagedFinance.length ? (
                      <EmptyState
                        icon={CircleDollarSign}
                        title="Chưa có dữ liệu doanh thu"
                        description="Thử chọn khoảng thời gian khác."
                      />
                    ) : (
                      <div className="report-table">
                        {pagedFinance.map((item, index) => (
                          <div
                            className="report-row"
                            key={`${item.period}-${index}`}
                          >
                            <div>
                              <strong>{item.period || "--"}</strong>
                              <span>Kỳ ghi nhận</span>
                            </div>
                            <strong className="money">
                              {formatCurrency(item.netRevenue)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}

                    <Paginator
                      page={reportFinancePage}
                      totalPages={financeTotalPages}
                      onPageChange={setReportFinancePage}
                    />
                  </article>

                  <article className="report-card">
                    <div className="report-card-head">
                      <div>
                        <h4>Tỷ lệ lấp đầy</h4>
                        <p>Theo từng lịch khởi hành</p>
                      </div>
                      <UsersRound size={22} />
                    </div>

                    {!pagedOccupancy.length ? (
                      <EmptyState
                        icon={UsersRound}
                        title="Chưa có dữ liệu lấp đầy"
                        description="Thử chọn khoảng thời gian khác."
                      />
                    ) : (
                      <div className="occupancy-list">
                        {pagedOccupancy.map((item, index) => {
                          const rate = Math.max(
                            0,
                            Math.min(100, Number(item.occupancyRate || 0)),
                          );
                          return (
                            <div
                              className="occupancy-item"
                              key={`${item.tourName}-${index}`}
                            >
                              <div className="occupancy-head">
                                <div>
                                  <strong>{item.tourName}</strong>
                                  <span>{formatDate(item.departureDate)}</span>
                                </div>
                                <b>{rate}%</b>
                              </div>
                              <div className="progress">
                                <i style={{ width: `${rate}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <Paginator
                      page={reportOccupancyPage}
                      totalPages={occupancyTotalPages}
                      onPageChange={setReportOccupancyPage}
                    />
                  </article>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .ops-page {
          --primary: #2563eb;
          --primary-dark: #1d4ed8;
          --surface: #ffffff;
          --surface-soft: #f8fafc;
          --page: #f4f7fb;
          --text: #0f172a;
          --muted: #64748b;
          --border: #e2e8f0;
          --success: #16a34a;
          --danger: #dc2626;
          --warning: #d97706;

          display: grid;
          gap: 18px;
          color: var(--text);
          min-width: 0;
        }

        .page-header-card,
        .tabs-card,
        .panel,
        .trip-sidebar,
        .loading-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          box-shadow: 0 6px 24px rgba(15, 23, 42, 0.04);
        }

        .page-header-card {
          padding: 22px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .eyebrow,
        .hero-eyebrow {
          color: var(--primary);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .page-header-card h2 {
          margin: 5px 0 6px;
          font-size: 25px;
          letter-spacing: -0.02em;
        }

        .page-header-card p {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.5;
        }

        .tabs-card {
          display: flex;
          gap: 7px;
          padding: 8px;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .tabs-card::-webkit-scrollbar {
          display: none;
        }

        .tabs-card button {
          border: 0;
          background: transparent;
          color: #475569;
          padding: 10px 14px;
          border-radius: 11px;
          font-size: 14px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          white-space: nowrap;
          transition: 0.18s ease;
        }

        .tabs-card button:hover {
          background: #f1f5f9;
          color: var(--text);
        }

        .tabs-card button.active {
          background: var(--primary);
          color: #fff;
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.2);
        }

        .tabs-card button small {
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.22);
          display: grid;
          place-items: center;
          font-size: 11px;
        }

        .loading-card {
          min-height: 240px;
          display: grid;
          place-items: center;
        }

        .center-layout {
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }

        .trip-sidebar {
          padding: 18px;
          position: sticky;
          top: 92px;
          max-height: calc(100vh - 120px);
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .center-content {
          display: grid;
          gap: 16px;
          min-width: 0;
        }

        .section-title {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 18px;
        }

        .section-title h3 {
          margin: 0 0 4px;
          font-size: 18px;
        }

        .section-title p {
          margin: 0;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .trip-search,
        .search-box {
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid var(--border);
          background: var(--surface-soft);
          border-radius: 11px;
          padding: 0 12px;
          color: #94a3b8;
        }

        .trip-search {
          min-height: 42px;
          margin-bottom: 12px;
        }

        .trip-search input,
        .search-box input {
          border: 0;
          outline: 0;
          background: transparent;
          width: 100%;
          color: var(--text);
          font-size: 14px;
        }

        .trip-list {
          display: grid;
          gap: 9px;
          overflow-y: auto;
          padding-right: 3px;
        }

        .trip-list button {
          text-align: left;
          border: 1px solid var(--border);
          background: #fff;
          border-radius: 13px;
          padding: 13px;
          display: grid;
          gap: 7px;
          cursor: pointer;
          transition: 0.18s ease;
        }

        .trip-list button:hover {
          border-color: #93c5fd;
          transform: translateY(-1px);
          box-shadow: 0 7px 18px rgba(15, 23, 42, 0.06);
        }

        .trip-list button.selected {
          border-color: var(--primary);
          background: #eff6ff;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.08);
        }

        .trip-list-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .trip-list strong {
          font-size: 14px;
          line-height: 1.4;
        }

        .trip-list span {
          display: flex;
          align-items: center;
          gap: 5px;
          color: var(--muted);
          font-size: 12px;
        }

        .trip-list small {
          color: #475569;
          font-weight: 700;
          font-size: 12px;
        }

        .panel {
          padding: 20px;
          min-width: 0;
        }

        .trip-hero {
          background:
            radial-gradient(
              circle at 88% 20%,
              rgba(255, 255, 255, 0.15),
              transparent 26%
            ),
            linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%);
          color: #fff;
          border-radius: 18px;
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          box-shadow: 0 12px 28px rgba(37, 99, 235, 0.18);
        }

        .trip-hero h3 {
          margin: 8px 0 7px;
          font-size: 24px;
          letter-spacing: -0.02em;
        }

        .trip-hero p {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          color: rgba(255, 255, 255, 0.9);
        }

        .hero-eyebrow {
          color: #dbeafe;
        }

        .hero-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 17px;
        }

        .hero-meta span {
          background: rgba(15, 23, 42, 0.18);
          padding: 7px 11px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }

        .metric-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 13px;
        }

        .metric-card {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 15px;
          padding: 17px;
          box-shadow: 0 4px 18px rgba(15, 23, 42, 0.04);
        }

        .metric-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: var(--muted);
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .metric-card strong {
          display: block;
          font-size: 23px;
          margin-bottom: 5px;
        }

        .metric-card small {
          color: var(--muted);
          font-size: 11px;
        }

        .metric-card.blue .metric-top {
          color: var(--primary);
        }

        .metric-card.green .metric-top {
          color: var(--success);
        }

        .metric-card.red .metric-top {
          color: var(--danger);
        }

        .metric-card.amber .metric-top {
          color: var(--warning);
        }

        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .search-box {
          flex: 1;
          min-height: 42px;
        }

        .toolbar > :global(select) {
          min-width: 190px;
        }

        .btn-primary,
        .btn-outline,
        .btn-success,
        .btn-danger {
          border: 0;
          border-radius: 10px;
          min-height: 40px;
          padding: 0 14px;
          font-size: 13px;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          cursor: pointer;
          transition: 0.18s ease;
          white-space: nowrap;
        }

        .btn-primary {
          background: var(--primary);
          color: #fff;
        }

        .btn-primary:hover {
          background: var(--primary-dark);
          transform: translateY(-1px);
        }

        .btn-outline {
          background: #fff;
          color: #334155;
          border: 1px solid var(--border);
        }

        .btn-outline:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .btn-success {
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
        }

        .btn-danger {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }

        .spin {
          animation: spin 0.9s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          border-radius: 999px;
          padding: 5px 9px;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .status-badge.info {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .status-badge.success {
          background: #ecfdf5;
          color: #047857;
        }

        .status-badge.warning {
          background: #fffbeb;
          color: #b45309;
        }

        .status-badge.danger {
          background: #fef2f2;
          color: #b91c1c;
        }

        .checklist-table-wrap {
          border: 1px solid var(--border);
          border-radius: 13px;
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          min-width: 760px;
          border-collapse: collapse;
        }

        .data-table th {
          background: #f8fafc;
          color: var(--muted);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          text-align: left;
          padding: 12px 14px;
          border-bottom: 1px solid var(--border);
        }

        .data-table td {
          padding: 13px 14px;
          border-bottom: 1px solid #edf2f7;
          font-size: 13px;
          vertical-align: middle;
        }

        .data-table tbody tr:last-child td {
          border-bottom: 0;
        }

        .cell-main {
          display: grid;
          gap: 3px;
        }

        .cell-main span {
          color: var(--muted);
          font-size: 11px;
        }

        .category-chip {
          background: #f1f5f9;
          color: #475569;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
        }

        :global(select),
        :global(input) {
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          min-height: 40px;
          padding: 0 11px;
          background: #fff;
          color: var(--text);
          outline: 0;
          box-sizing: border-box;
        }

        :global(select:focus),
        :global(input:focus) {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .status-select {
          min-width: 145px;
        }

        .status-select.completed {
          color: #047857;
          border-color: #a7f3d0;
          background: #ecfdf5;
        }

        .status-select.in_progress {
          color: #b45309;
          border-color: #fde68a;
          background: #fffbeb;
        }

        .status-select.blocked {
          color: #b91c1c;
          border-color: #fecaca;
          background: #fef2f2;
        }

        .card-list,
        .supplier-list,
        .change-list {
          display: grid;
          gap: 10px;
        }

        .record-card {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) 170px;
          align-items: center;
          gap: 13px;
          border: 1px solid var(--border);
          border-radius: 13px;
          padding: 13px;
          background: #fff;
        }

        .record-icon,
        .supplier-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: grid;
          place-items: center;
        }

        .record-icon.info {
          background: #eff6ff;
          color: #2563eb;
        }

        .record-icon.success {
          background: #ecfdf5;
          color: #16a34a;
        }

        .record-icon.warning {
          background: #fffbeb;
          color: #d97706;
        }

        .record-icon.danger {
          background: #fef2f2;
          color: #dc2626;
        }

        .record-body {
          min-width: 0;
        }

        .record-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
        }

        .record-top > div:first-child {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .record-top strong {
          font-size: 14px;
        }

        .record-top span {
          color: var(--muted);
          font-size: 12px;
          line-height: 1.5;
        }

        .record-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          margin-top: 8px;
          color: #475569;
          font-size: 11px;
        }

        .badge-group {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .ticket-code {
          color: var(--primary);
          font-weight: 800;
        }

        .supplier-layout {
          display: grid;
          grid-template-columns: minmax(340px, 0.8fr) minmax(0, 1.2fr);
          gap: 18px;
          align-items: start;
        }

        .supplier-form-panel {
          position: sticky;
          top: 92px;
        }

        .supplier-form {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 13px;
        }

        .supplier-form label {
          display: grid;
          gap: 6px;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
        }

        .supplier-form .full {
          grid-column: 1/-1;
        }

        .supplier-card {
          border: 1px solid var(--border);
          border-radius: 13px;
          padding: 13px;
          display: grid;
          grid-template-columns: 44px 1fr auto;
          align-items: center;
          gap: 12px;
        }

        .supplier-icon {
          background: #eff6ff;
          color: var(--primary);
        }

        .supplier-card > div:nth-child(2) {
          display: grid;
          gap: 3px;
        }

        .supplier-card span,
        .supplier-card small {
          color: var(--muted);
          font-size: 11px;
        }

        .change-card {
          border: 1px solid var(--border);
          border-radius: 13px;
          padding: 14px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) 150px auto;
          align-items: center;
          gap: 14px;
        }

        .change-code {
          background: #eff6ff;
          color: var(--primary);
          border-radius: 9px;
          padding: 8px 10px;
          font-size: 11px;
          font-weight: 800;
        }

        .change-main {
          display: grid;
          gap: 4px;
        }

        .change-main span,
        .change-main small {
          color: var(--muted);
          font-size: 11px;
        }

        .change-price {
          display: grid;
          gap: 3px;
          text-align: right;
        }

        .change-price span {
          color: var(--muted);
          font-size: 11px;
        }

        .change-price strong {
          color: #dc2626;
        }

        .action-group {
          display: flex;
          gap: 7px;
        }

        .report-filter {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .report-filter span {
          color: var(--muted);
          font-size: 12px;
        }

        .report-grid {
          display: grid;
          grid-template-columns: 0.9fr 1.1fr;
          gap: 16px;
          margin-top: 17px;
        }

        .report-card {
          border: 1px solid var(--border);
          border-radius: 15px;
          padding: 17px;
          background: #fff;
          min-width: 0;
        }

        .report-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 13px;
          color: var(--primary);
        }

        .report-card-head h4 {
          margin: 0 0 3px;
          color: var(--text);
          font-size: 15px;
        }

        .report-card-head p {
          margin: 0;
          color: var(--muted);
          font-size: 11px;
        }

        .report-table,
        .occupancy-list {
          display: grid;
        }

        .report-row {
          display: flex;
          justify-content: space-between;
          gap: 13px;
          padding: 11px 0;
          border-bottom: 1px solid #edf2f7;
        }

        .report-row > div {
          display: grid;
          gap: 3px;
        }

        .report-row span {
          color: var(--muted);
          font-size: 11px;
        }

        .money {
          color: #047857;
          white-space: nowrap;
        }

        .occupancy-item {
          padding: 10px 0;
          border-bottom: 1px solid #edf2f7;
        }

        .occupancy-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }

        .occupancy-head > div {
          display: grid;
          gap: 3px;
        }

        .occupancy-head strong {
          font-size: 13px;
        }

        .occupancy-head span {
          color: var(--muted);
          font-size: 11px;
        }

        .occupancy-head b {
          color: var(--primary);
          font-size: 12px;
        }

        .progress {
          height: 6px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
        }

        .progress i {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #2563eb, #0ea5e9);
        }

        .pagination-wrap {
          margin-top: 15px;
          display: flex;
          justify-content: center;
        }

        .empty-state {
          padding: 38px 18px;
          text-align: center;
          color: var(--muted);
        }

        .empty-icon {
          width: 58px;
          height: 58px;
          margin: 0 auto 13px;
          border-radius: 16px;
          background: #f1f5f9;
          color: #94a3b8;
          display: grid;
          place-items: center;
        }

        .empty-state strong {
          display: block;
          color: var(--text);
          margin-bottom: 5px;
        }

        .empty-state p {
          margin: 0;
          font-size: 12px;
          line-height: 1.5;
        }

        .customer-monitor-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .customer-monitor-card {
          min-height: 300px;
        }

        .compact-monitor-list {
          display: grid;
          gap: 10px;
        }

        .compact-monitor-list article {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr) auto;
          align-items: center;
          gap: 11px;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: #fff;
        }

        .compact-monitor-list article > svg {
          width: 38px;
          height: 38px;
          padding: 9px;
          border-radius: 10px;
          background: #fef2f2;
          color: #dc2626;
        }

        .compact-monitor-list article > div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        .compact-monitor-list strong {
          font-size: 13px;
        }

        .compact-monitor-list span {
          color: var(--muted);
          font-size: 11px;
          line-height: 1.45;
        }

        @media (max-width: 1180px) {
          .center-layout,
          .supplier-layout {
            grid-template-columns: 1fr;
          }

          .trip-sidebar,
          .supplier-form-panel {
            position: static;
            max-height: none;
          }

          .trip-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            overflow: visible;
          }

          .metric-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .report-grid,
          .customer-monitor-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .page-header-card,
          .section-title,
          .toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .metric-grid,
          .trip-list,
          .supplier-form {
            grid-template-columns: 1fr;
          }

          .record-card {
            grid-template-columns: 44px minmax(0, 1fr);
          }

          .record-card > :global(select) {
            grid-column: 2;
          }

          .change-card {
            grid-template-columns: 1fr;
          }

          .change-price {
            text-align: left;
          }

          .action-group {
            flex-wrap: wrap;
          }

          .trip-hero {
            flex-direction: column;
          }

          .report-filter {
            align-items: stretch;
          }

          .report-filter :global(input),
          .report-filter .btn-primary {
            width: 100%;
          }
        }
      `}</style>
    </AdminLayout>
  );
}
