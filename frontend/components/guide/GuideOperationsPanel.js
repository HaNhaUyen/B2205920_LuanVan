import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MapPin,
  RefreshCcw,
  Route,
  Search,
  Send,
  UsersRound,
  CalendarDays,
  Clock,
  UserCircle,
  Eye,
  X,
  HeartPulse,
  Utensils,
  Phone,
  ContactRound,
  LockKeyhole,
  PlusCircle,
  Trash2,
  Pencil,
} from "lucide-react";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";

const PASSENGER_PAGE_SIZE = 8;
const LOG_PAGE_SIZE = 3;
const INCIDENT_PAGE_SIZE = 3;
const BROADCAST_PAGE_SIZE = 3;
const AVAILABILITY_PAGE_SIZE = 3;

const operationLabels = {
  preparing: "Đang chuẩn bị",
  ready: "Sẵn sàng",
  boarding: "Đang đón khách",
  departed: "Đã khởi hành",
  in_progress: "Đang diễn ra",
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy",
};

const checkinLabels = {
  pending: "Chưa điểm danh",
  present: "Có mặt",
  late: "Đến trễ",
  absent: "Vắng",
  cancelled: "Hủy tham gia",
};

const tabItems = [
  { key: "availability", label: "Lịch bận", icon: Clock },
  { key: "passengers", label: "Hành khách", icon: UsersRound },
  { key: "logs", label: "Nhật ký", icon: Route },
  { key: "incidents", label: "Sự cố", icon: AlertTriangle },
  { key: "broadcasts", label: "Thông báo đoàn", icon: BellRing },
  { key: "report", label: "Báo cáo", icon: FileText },
];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanGuestName(value) {
  return String(value || "--")
    .replace(/\s*-\s*Khách đi cùng\s*\d+\s*$/i, "")
    .replace(/\s*-\s*Người lớn\s*\d+\s*$/i, "")
    .replace(/\s*-\s*Trẻ em\s*\d+\s*$/i, "")
    .trim();
}

function isPrimaryPassenger(guest, firstGuestIdByBooking) {
  const guestName = normalizeText(
    cleanGuestName(guest?.fullName || guest?.full_name),
  );

  const bookerName = normalizeText(
    guest?.bookerName ||
      guest?.contactName ||
      guest?.contact_name ||
      guest?.booking?.contactName ||
      guest?.booking?.contact_name,
  );

  if (guest?.isPrimaryContact === true || guest?.is_primary_contact === true) {
    return true;
  }

  if (guestName && bookerName && guestName === bookerName) {
    return true;
  }

  const bookingKey = String(
    guest?.bookingId ||
      guest?.booking_id ||
      guest?.booking?.id ||
      guest?.bookingCode ||
      guest?.booking?.bookingCode ||
      "",
  );

  const guestId = String(
    guest?.bookingGuestId ||
      guest?.booking_guest_id ||
      guest?.guestId ||
      guest?.id ||
      "",
  );

  return Boolean(
    bookingKey && guestId && firstGuestIdByBooking?.get(bookingKey) === guestId,
  );
}

function statusTone(status) {
  if (
    ["present", "ready", "completed", "resolved", "verified"].includes(status)
  )
    return "success";
  if (
    ["late", "boarding", "in_progress", "acknowledged", "pending"].includes(
      status,
    )
  )
    return "warning";
  if (["absent", "cancelled", "critical", "rejected", "open"].includes(status))
    return "danger";
  return "info";
}

function Badge({ children, tone = "info" }) {
  return <span className={`ops-badge ${tone}`}>{children}</span>;
}

function Empty({ icon: Icon = ClipboardCheck, title, description }) {
  return (
    <div className="ops-empty">
      <div className="ops-empty-icon">
        <Icon size={32} strokeWidth={1.5} />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function Metric({ label, value, hint, tone = "blue", icon: Icon }) {
  return (
    <article className={`ops-metric ${tone}`}>
      <div className="ops-metric-header">
        <span>{label}</span>
        {Icon && <Icon size={18} className="ops-metric-icon" />}
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function Field({ label, children, full = false }) {
  return (
    <div className={full ? "ops-field full" : "ops-field"}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function Paginator({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="ops-pagination">
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}

function DetailItem({ icon: Icon, label, value }) {
  return (
    <div className="ops-detail-item">
      {Icon ? (
        <div className="ops-detail-icon">
          <Icon size={17} />
        </div>
      ) : null}
      <div>
        <span>{label}</span>
        <strong>{value || "--"}</strong>
      </div>
    </div>
  );
}

function getTripTour(trip) {
  return (
    trip?.tour ||
    trip?.dashboard?.tour || {
      id: trip?.tourId,
      code: trip?.tourCode,
      name: trip?.tourName,
      destination: {
        name: trip?.destinationName,
        province: trip?.province,
      },
    }
  );
}

function getTripDeparture(trip) {
  return (
    trip?.departure ||
    trip?.dashboard?.departure || {
      id: trip?.departureId,
      departureDate: trip?.departureDate,
      endDate: trip?.endDate,
      totalSlots: trip?.totalSlots,
      bookedSlots: trip?.bookedSlots,
    }
  );
}

function getActionTimestamp(item) {
  const rawValue =
    item?.createdAt ||
    item?.created_at ||
    item?.sentAt ||
    item?.sent_at ||
    item?.occurredAt ||
    item?.occurred_at ||
    item?.reportedAt ||
    item?.reported_at ||
    item?.updatedAt ||
    item?.updated_at ||
    item?.startAt ||
    item?.start_at ||
    null;

  if (!rawValue) return 0;

  const timestamp = new Date(rawValue).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortNewestActionFirst(items) {
  return [...safeArray(items)].sort((first, second) => {
    const timeDifference =
      getActionTimestamp(second) - getActionTimestamp(first);

    if (timeDifference !== 0) return timeDifference;

    const firstId = Number(first?.id || 0);
    const secondId = Number(second?.id || 0);

    return secondId - firstId;
  });
}

export default function GuideOperationsPanel({ guide }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [trips, setTrips] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("passengers");
  const [tripKeyword, setTripKeyword] = useState("");
  const [passengerPage, setPassengerPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [incidentPage, setIncidentPage] = useState(1);
  const [broadcastPage, setBroadcastPage] = useState(1);
  const [availabilityPage, setAvailabilityPage] = useState(1);
  const [availabilityItems, setAvailabilityItems] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [deletingAvailabilityId, setDeletingAvailabilityId] = useState("");
  const [availabilityForm, setAvailabilityForm] = useState({
    availabilityType: "personal",
    startAt: "",
    endAt: "",
    allDay: false,
    reason: "",
  });
  const [selectedPassenger, setSelectedPassenger] = useState(null);

  const [logForm, setLogForm] = useState({
    logType: "general",
    title: "",
    content: "",
    locationName: "",
  });
  const [editingLogId, setEditingLogId] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState("");
  const [incidentForm, setIncidentForm] = useState({
    category: "other",
    severity: "medium",
    title: "",
    description: "",
    locationName: "",
  });
  const [broadcastForm, setBroadcastForm] = useState({
    title: "",
    content: "",
    channel: "in_app",
    pickupPointId: "",
  });
  const [reportForm, setReportForm] = useState({
    actualGuestCount: 0,
    absentGuestCount: 0,
    vehicleRating: 5,
    hotelRating: 5,
    restaurantRating: 5,
    itineraryRating: 5,
    summary: "",
    incidentsSummary: "",
    extraCost: 0,
    extraCostNote: "",
    recommendations: "",
  });

  const filteredTrips = useMemo(() => {
    const keyword = normalizeText(tripKeyword);
    if (!keyword) return trips;
    return trips.filter((trip) => {
      const tour = getTripTour(trip);
      const destination = tour.destination || {};
      return [
        tour.name,
        tour.code,
        destination.name,
        destination.province,
        trip.operationCode,
      ].some((value) => normalizeText(value).includes(keyword));
    });
  }, [trips, tripKeyword]);

  const passengerGroups = useMemo(() => {
    const raw = data?.passengers;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.groups)) return raw.groups;
    if (Array.isArray(raw?.pickupGroups)) return raw.pickupGroups;
    return [];
  }, [data]);

  const flatPassengers = useMemo(() => {
    const rows = [];
    passengerGroups.forEach((group) => {
      const guests = group.passengers || group.guests || group.items || [];
      guests.forEach((guest) => rows.push({ ...guest, pickupGroup: group }));
    });
    if (!rows.length && Array.isArray(data?.passengers)) {
      return data.passengers;
    }
    return rows;
  }, [passengerGroups, data]);

  const firstGuestIdByBooking = useMemo(() => {
    const map = new Map();

    flatPassengers.forEach((guest) => {
      const bookingKey = String(
        guest?.bookingId ||
          guest?.booking_id ||
          guest?.booking?.id ||
          guest?.bookingCode ||
          guest?.booking?.bookingCode ||
          "",
      );

      const guestId = String(
        guest?.bookingGuestId ||
          guest?.booking_guest_id ||
          guest?.guestId ||
          guest?.id ||
          "",
      );

      if (bookingKey && guestId && !map.has(bookingKey)) {
        map.set(bookingKey, guestId);
      }
    });

    return map;
  }, [flatPassengers]);

  const logs = useMemo(() => sortNewestActionFirst(data?.logs), [data?.logs]);

  const incidents = useMemo(
    () => sortNewestActionFirst(data?.incidents),
    [data?.incidents],
  );

  const broadcasts = useMemo(
    () => sortNewestActionFirst(data?.broadcasts),
    [data?.broadcasts],
  );

  const sortedAvailabilityItems = useMemo(
    () => sortNewestActionFirst(availabilityItems),
    [availabilityItems],
  );

  const availabilityTotalPages = Math.max(
    1,
    Math.ceil(sortedAvailabilityItems.length / AVAILABILITY_PAGE_SIZE),
  );

  const pagedAvailabilityItems = sortedAvailabilityItems.slice(
    (availabilityPage - 1) * AVAILABILITY_PAGE_SIZE,
    availabilityPage * AVAILABILITY_PAGE_SIZE,
  );

  const passengerTotalPages = Math.max(
    1,
    Math.ceil(flatPassengers.length / PASSENGER_PAGE_SIZE),
  );
  const logTotalPages = Math.max(1, Math.ceil(logs.length / LOG_PAGE_SIZE));
  const incidentTotalPages = Math.max(
    1,
    Math.ceil(incidents.length / INCIDENT_PAGE_SIZE),
  );
  const broadcastTotalPages = Math.max(
    1,
    Math.ceil(broadcasts.length / BROADCAST_PAGE_SIZE),
  );

  const pagedPassengers = flatPassengers.slice(
    (passengerPage - 1) * PASSENGER_PAGE_SIZE,
    passengerPage * PASSENGER_PAGE_SIZE,
  );
  const pagedLogs = logs.slice(
    (logPage - 1) * LOG_PAGE_SIZE,
    logPage * LOG_PAGE_SIZE,
  );
  const pagedIncidents = incidents.slice(
    (incidentPage - 1) * INCIDENT_PAGE_SIZE,
    incidentPage * INCIDENT_PAGE_SIZE,
  );
  const pagedBroadcasts = broadcasts.slice(
    (broadcastPage - 1) * BROADCAST_PAGE_SIZE,
    broadcastPage * BROADCAST_PAGE_SIZE,
  );

  useEffect(() => {
    setPassengerPage(1);
    setLogPage(1);
    setIncidentPage(1);
    setBroadcastPage(1);
    setAvailabilityPage(1);
  }, [selectedTrip?.id]);

  const loadTrips = async () => {
    const result = await apiFetch("/trip-operations/my-trips");
    const next = safeArray(result);
    setTrips(next);
    return next;
  };

  const loadAvailabilities = async () => {
    setAvailabilityLoading(true);
    try {
      const result = await apiFetch("/operations-v2/guides/availability");
      const rows = Array.isArray(result)
        ? result
        : Array.isArray(result?.items)
          ? result.items
          : [];

      const sorted = sortNewestActionFirst(rows);

      setAvailabilityItems(sorted);
      setAvailabilityPage(1);
      return sorted;
    } catch (error) {
      showToast(error.message || "Không tải được lịch bận.", "error");
      return [];
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const submitAvailability = async (event) => {
    event.preventDefault();

    if (!availabilityForm.startAt || !availabilityForm.endAt) {
      showToast("Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc.", "error");
      return;
    }

    const startAt = new Date(availabilityForm.startAt);
    const endAt = new Date(availabilityForm.endAt);

    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      endAt <= startAt
    ) {
      showToast("Thời gian kết thúc phải sau thời gian bắt đầu.", "error");
      return;
    }

    setAvailabilitySaving(true);
    try {
      await apiFetch("/operations-v2/guides/availability", {
        method: "POST",
        body: JSON.stringify({
          availabilityType: availabilityForm.availabilityType,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          allDay: Boolean(availabilityForm.allDay),
          reason: availabilityForm.reason.trim(),
        }),
      });

      showToast(
        "Đã gửi lịch bận. Ban điều hành đã nhận được thông báo.",
        "success",
      );
      setAvailabilityForm((current) => ({
        ...current,
        reason: "",
      }));
      await loadAvailabilities();
      setAvailabilityPage(1);
    } catch (error) {
      showToast(error.message || "Không thể gửi lịch bận.", "error");
    } finally {
      setAvailabilitySaving(false);
    }
  };

  const removeAvailability = async (item) => {
    if (String(item?.status) !== "pending") {
      showToast("Chỉ có thể xóa lịch bận đang chờ duyệt.", "warning");
      return;
    }

    if (!window.confirm("Xóa yêu cầu lịch bận đang chờ duyệt này?")) return;

    setDeletingAvailabilityId(String(item.id));
    try {
      await apiFetch(`/operations-v2/guides/availability/${item.id}`, {
        method: "DELETE",
      });
      showToast("Đã xóa lịch bận.", "success");
      await loadAvailabilities();
    } catch (error) {
      showToast(error.message || "Không thể xóa lịch bận.", "error");
    } finally {
      setDeletingAvailabilityId("");
    }
  };

  const openTrip = async (trip, silent = false) => {
    if (!trip?.id) return;
    if (!silent) setRefreshing(true);
    try {
      const [
        dashboard,
        passengers,
        logsResult,
        incidentsResult,
        broadcastsResult,
        report,
      ] = await Promise.all([
        apiFetch(`/trip-operations/${trip.id}/dashboard`),
        apiFetch(`/trip-operations/${trip.id}/passengers`),
        apiFetch(`/trip-operations/${trip.id}/journey-logs`),
        apiFetch(`/trip-operations/${trip.id}/incidents`),
        apiFetch(`/trip-operations/${trip.id}/broadcasts`),
        apiFetch(`/trip-operations/${trip.id}/report`).catch(() => null),
      ]);

      setSelectedTrip(trip);
      setData({
        dashboard,
        passengers,
        logs: logsResult,
        incidents: incidentsResult,
        broadcasts: broadcastsResult,
        report,
      });

      if (report) {
        setReportForm({
          actualGuestCount: Number(
            report.actualGuestCount ?? report.actual_guest_count ?? 0,
          ),
          absentGuestCount: Number(
            report.absentGuestCount ?? report.absent_guest_count ?? 0,
          ),
          vehicleRating: Number(
            report.vehicleRating ?? report.vehicle_rating ?? 5,
          ),
          hotelRating: Number(report.hotelRating ?? report.hotel_rating ?? 5),
          restaurantRating: Number(
            report.restaurantRating ?? report.restaurant_rating ?? 5,
          ),
          itineraryRating: Number(
            report.itineraryRating ?? report.itinerary_rating ?? 5,
          ),
          summary: report.summary || "",
          incidentsSummary:
            report.incidentsSummary ?? report.incidents_summary ?? "",
          extraCost: Number(report.extraCost ?? report.extra_cost ?? 0),
          extraCostNote: report.extraCostNote ?? report.extra_cost_note ?? "",
          recommendations: report.recommendations || "",
        });
      }
    } catch (error) {
      showToast(error.message || "Không tải được dữ liệu chuyến đi.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const reloadCurrent = async () => {
    const next = await loadTrips();
    const current = next.find(
      (trip) => String(trip.id) === String(selectedTrip?.id),
    );
    if (current) await openTrip(current, true);
  };

  useEffect(() => {
    Promise.all([loadTrips(), loadAvailabilities()])
      .then(async ([nextTrips]) => {
        if (nextTrips.length) await openTrip(nextTrips[0], true);
      })
      .catch((error) =>
        showToast(
          error.message || "Không tải được trung tâm vận hành.",
          "error",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const postAndReload = async (path, body, message, reset) => {
    try {
      await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      showToast(message, "success");
      reset?.();

      setLogPage(1);
      setIncidentPage(1);
      setBroadcastPage(1);

      await reloadCurrent();
    } catch (error) {
      showToast(error.message || "Không thể lưu dữ liệu.", "error");
    }
  };

  const resetLogForm = () => {
    setEditingLogId("");
    setLogForm({
      logType: "general",
      title: "",
      content: "",
      locationName: "",
    });
  };

  const startEditLog = (log) => {
    setEditingLogId(String(log.id));
    setLogForm({
      logType: log.logType || log.log_type || "general",
      title: log.title || "",
      content: log.content || "",
      locationName: log.locationName || log.location_name || "",
    });
  };

  const saveJourneyLog = async (event) => {
    event.preventDefault();
    if (isReadOnlyTrip || !selectedTrip?.id) return;

    const title = logForm.title.trim();
    if (!title) {
      showToast("Vui lòng nhập tiêu đề nhật ký.", "warning");
      return;
    }

    setSavingLog(true);
    try {
      const path = editingLogId
        ? `/trip-operations/${selectedTrip.id}/journey-logs/${editingLogId}`
        : `/trip-operations/${selectedTrip.id}/journey-logs`;

      await apiFetch(path, {
        method: editingLogId ? "PATCH" : "POST",
        body: JSON.stringify({
          logType: logForm.logType,
          title,
          content: logForm.content.trim(),
          locationName: logForm.locationName.trim(),
        }),
      });

      showToast(
        editingLogId
          ? "Đã cập nhật nhật ký hành trình."
          : "Đã thêm nhật ký hành trình.",
        "success",
      );
      resetLogForm();
      setLogPage(1);
      await reloadCurrent();
    } catch (error) {
      showToast(error.message || "Không thể lưu nhật ký.", "error");
    } finally {
      setSavingLog(false);
    }
  };

  const deleteJourneyLog = async (log) => {
    if (isReadOnlyTrip || !selectedTrip?.id) return;
    if (!window.confirm(`Xóa nhật ký "${log.title || "này"}"?`)) return;

    setDeletingLogId(String(log.id));
    try {
      await apiFetch(
        `/trip-operations/${selectedTrip.id}/journey-logs/${log.id}`,
        { method: "DELETE" },
      );
      showToast("Đã xóa nhật ký hành trình.", "success");
      if (String(editingLogId) === String(log.id)) resetLogForm();
      await reloadCurrent();
    } catch (error) {
      showToast(error.message || "Không thể xóa nhật ký.", "error");
    } finally {
      setDeletingLogId("");
    }
  };

  const updateCheckin = async (guestId, status) => {
    const currentStatus = String(
      data?.dashboard?.operationStatus ||
        data?.dashboard?.trip?.operationStatus ||
        selectedTrip?.operationStatus ||
        "preparing",
    );

    if (["completed", "cancelled"].includes(currentStatus)) {
      showToast(
        currentStatus === "completed"
          ? "Chuyến đi đã hoàn thành. Kết quả điểm danh chỉ được xem."
          : "Chuyến đi đã bị hủy. Không thể cập nhật điểm danh.",
        "warning",
      );
      return;
    }

    try {
      await apiFetch(
        `/trip-operations/${selectedTrip.id}/checkins/${guestId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      showToast(`Đã cập nhật: ${checkinLabels[status]}.`, "success");
      await reloadCurrent();
    } catch (error) {
      showToast(error.message || "Không thể cập nhật check-in.", "error");
    }
  };

  if (loading) return <Loading text="Đang tải trung tâm điều hành..." />;

  const dashboard = data?.dashboard || {};
  const dashboardTrip = dashboard.trip || {};
  const tour = dashboard.tour || getTripTour(selectedTrip) || {};
  const departure = dashboard.departure || getTripDeparture(selectedTrip) || {};
  const stats = dashboard.stats || dashboard.summary || {};
  const operationStatus = String(
    dashboard.operationStatus ||
      dashboardTrip.operationStatus ||
      selectedTrip?.operationStatus ||
      "preparing",
  );
  const isCompletedTrip = operationStatus === "completed";
  const isCancelledTrip = operationStatus === "cancelled";
  const isReadOnlyTrip = isCompletedTrip || isCancelledTrip;
  const hasSavedReport = Boolean(data?.report);
  const present = Number(
    stats.present ?? stats.presentCount ?? stats.checkedIn ?? 0,
  );
  const pending = Number(
    stats.pending ?? stats.pendingCount ?? stats.waiting ?? 0,
  );
  const absent = Number(stats.absent ?? stats.absentCount ?? 0);
  const total = Number(
    stats.totalPassengers ??
      stats.totalGuests ??
      stats.passengers ??
      flatPassengers.length ??
      0,
  );
  const checkinRate = total ? Math.round((present / total) * 100) : 0;

  return (
    <div className="ops-root">
      <div className="ops-heading-row">
        <div>
          <span className="ops-eyebrow">Điều hành trực tiếp</span>
          <h2>Bảng điều hành chuyến đi</h2>
        </div>
        <button
          className="ops-btn-outline"
          type="button"
          onClick={reloadCurrent}
          disabled={refreshing}
        >
          <RefreshCcw size={16} className={refreshing ? "spin" : ""} />
          {refreshing ? "Đang tải..." : "Làm mới dữ liệu"}
        </button>
      </div>

      <section className="ops-card ops-assign-card">
        <div className="ops-card-head">
          <div>
            <h3>Chuyến được phân công</h3>
            <p>{filteredTrips.length} chuyến · chọn một chuyến để thao tác.</p>
          </div>
          <div className="ops-search">
            <Search size={18} className="ops-text-muted" />
            <input
              value={tripKeyword}
              onChange={(e) => setTripKeyword(e.target.value)}
              placeholder="Tìm tên tour, điểm đến, mã tour..."
            />
          </div>
        </div>

        {!filteredTrips.length ? (
          <Empty
            icon={Route}
            title="Chưa có chuyến phù hợp"
            description="Kiểm tra lại từ khóa hoặc liên hệ admin để được phân công."
          />
        ) : (
          <div className="ops-trip-grid">
            {filteredTrips.map((trip) => {
              const tripTour = getTripTour(trip);
              const tripDeparture = getTripDeparture(trip);
              const active = String(trip.id) === String(selectedTrip?.id);
              return (
                <button
                  key={trip.id}
                  type="button"
                  className={`ops-trip-card ${active ? "active" : ""}`}
                  onClick={() => openTrip(trip)}
                >
                  <div className="ops-trip-top">
                    <Badge tone={statusTone(trip.operationStatus)}>
                      {operationLabels[trip.operationStatus] ||
                        trip.operationStatus ||
                        "Đang chuẩn bị"}
                    </Badge>
                    {active && (
                      <span className="ops-selected-mark">Đang chọn</span>
                    )}
                  </div>
                  <strong className="ops-trip-title">
                    {tripTour.name || trip.tourName || "Chưa có tên tour"}
                  </strong>
                  <div className="ops-trip-meta">
                    <span className="ops-muted">
                      <MapPin size={14} />{" "}
                      {tripTour.destination?.name ||
                        tripTour.destination?.province ||
                        trip.destinationName ||
                        trip.province ||
                        "Chưa cập nhật"}
                    </span>
                  </div>
                  <div className="ops-trip-foot">
                    <span className="ops-trip-date">
                      <CalendarDays size={14} />
                      {formatDate(
                        tripDeparture.departureDate || trip.departureDate,
                      )}
                    </span>
                    <span className="ops-trip-guests">
                      <UsersRound size={14} />
                      {trip.totalGuests ||
                        trip.passengerCount ||
                        trip.bookedSlots ||
                        0}{" "}
                      khách
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {!selectedTrip ? null : (
        <div className="ops-trip-content">
          <section className="ops-hero">
            <div className="ops-hero-bg-pattern"></div>
            <div className="ops-hero-content">
              <div className="ops-hero-meta">
                <Badge tone={statusTone(operationStatus)}>
                  {operationLabels[operationStatus] ||
                    operationStatus ||
                    "Đang chuẩn bị"}
                </Badge>
                <span className="ops-hero-code">
                  {selectedTrip.operationCode ||
                    `Mã chuyến: #${selectedTrip.id}`}
                </span>
              </div>
              <h3 className="ops-hero-title">
                {tour.name || selectedTrip?.tourName || "Chuyến đi"}
              </h3>
              <p className="ops-hero-dest">
                <MapPin size={16} />{" "}
                {tour.destination?.name ||
                  tour.destination?.province ||
                  selectedTrip?.destinationName ||
                  selectedTrip?.province ||
                  "Chưa cập nhật điểm đến"}
              </p>
              <div className="ops-hero-dates">
                <span>
                  <CalendarDays size={16} />
                  {formatDate(
                    departure.departureDate ||
                      selectedTrip.departure?.departureDate,
                  )}{" "}
                  –{" "}
                  {formatDate(
                    departure.endDate || selectedTrip.departure?.endDate,
                  )}
                </span>
                <span>
                  <UserCircle size={16} />
                  HDV:{" "}
                  {guide?.fullName ||
                    selectedTrip.primaryGuide?.fullName ||
                    "Bạn"}
                </span>
              </div>
            </div>

            <div className="ops-rate-card">
              <span>Tiến độ điểm danh</span>
              <div className="ops-rate-number">
                <strong>{checkinRate}</strong>
                <small>%</small>
              </div>
              <div className="ops-progress-bar">
                <i style={{ width: `${checkinRate}%` }} />
              </div>
              <div className="ops-rate-footer">
                Đã có mặt: {present}/{total}
              </div>
            </div>
          </section>

          <div className="ops-metrics">
            <Metric
              icon={UsersRound}
              label="Hành khách"
              value={total}
              hint="Tổng số trong danh sách"
            />
            <Metric
              icon={CheckCircle2}
              label="Đã có mặt"
              value={present}
              hint="Khách đã điểm danh"
              tone="green"
            />
            <Metric
              icon={Clock}
              label="Chờ xác nhận"
              value={pending}
              hint="Chưa làm thủ tục"
              tone="amber"
            />
            <Metric
              icon={AlertTriangle}
              label="Sự cố / Vắng"
              value={
                absent +
                incidents.filter(
                  (x) => !["resolved", "closed"].includes(x.status),
                ).length
              }
              hint="Cần lưu ý theo dõi"
              tone="red"
            />
          </div>

          <section className="ops-card ops-main-card">
            <div className="ops-tabs">
              {tabItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`ops-tab-item ${activeTab === item.key ? "active" : ""}`}
                    onClick={() => setActiveTab(item.key)}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="ops-tab-content">
              {isReadOnlyTrip ? (
                <div className="ops-readonly-alert">
                  <LockKeyhole size={18} />
                  <div>
                    <strong>
                      {isCompletedTrip
                        ? "Chuyến đi đã hoàn thành"
                        : "Chuyến đi đã bị hủy"}
                    </strong>
                    <span>
                      Dữ liệu vận hành đã khóa: không thể điểm danh, thêm nhật
                      ký, báo sự cố hoặc gửi thông báo mới. Bạn vẫn có thể xem
                      và gửi báo cáo kết thúc tour nếu báo cáo chưa được lưu.
                    </span>
                  </div>
                </div>
              ) : null}

              {activeTab === "availability" && (
                <div className="ops-two-col ops-availability-layout">
                  <div className="ops-form-panel">
                    <form
                      className="ops-form-card ops-availability-form"
                      onSubmit={submitAvailability}
                    >
                      <div className="ops-availability-form-head">
                        <div>
                          <span className="ops-availability-form-eyebrow">
                            Khai báo thủ công
                          </span>
                          <h3>Thêm lịch bận</h3>
                          <p className="ops-form-desc">
                            Dùng cho nghỉ phép, việc cá nhân, đào tạo hoặc thời
                            gian không sẵn sàng không gắn với một tour cụ thể.
                          </p>
                        </div>
                        <div className="ops-availability-form-icon">
                          <PlusCircle size={21} />
                        </div>
                      </div>

                      <Field label="Loại lịch bận">
                        <select
                          value={availabilityForm.availabilityType}
                          onChange={(event) =>
                            setAvailabilityForm((current) => ({
                              ...current,
                              availabilityType: event.target.value,
                            }))
                          }
                        >
                          <option value="personal">Việc cá nhân</option>
                          <option value="leave">Nghỉ phép</option>
                          <option value="training">Đào tạo</option>
                          <option value="unavailable">Không sẵn sàng</option>
                        </select>
                      </Field>

                      <div className="ops-form-grid">
                        <Field label="Bắt đầu">
                          <input
                            type="datetime-local"
                            required
                            value={availabilityForm.startAt}
                            onChange={(event) =>
                              setAvailabilityForm((current) => ({
                                ...current,
                                startAt: event.target.value,
                              }))
                            }
                          />
                        </Field>

                        <Field label="Kết thúc">
                          <input
                            type="datetime-local"
                            required
                            value={availabilityForm.endAt}
                            onChange={(event) =>
                              setAvailabilityForm((current) => ({
                                ...current,
                                endAt: event.target.value,
                              }))
                            }
                          />
                        </Field>
                      </div>

                      <label className="ops-availability-all-day">
                        <input
                          type="checkbox"
                          checked={availabilityForm.allDay}
                          onChange={(event) =>
                            setAvailabilityForm((current) => ({
                              ...current,
                              allDay: event.target.checked,
                            }))
                          }
                        />
                        <span>Cả ngày</span>
                      </label>

                      <Field label="Lý do">
                        <textarea
                          required
                          placeholder="Ví dụ: Có việc gia đình, tham gia khóa đào tạo nghiệp vụ..."
                          value={availabilityForm.reason}
                          onChange={(event) =>
                            setAvailabilityForm((current) => ({
                              ...current,
                              reason: event.target.value,
                            }))
                          }
                        />
                      </Field>

                      <button
                        className="ops-btn-primary ops-availability-submit"
                        type="submit"
                        disabled={availabilitySaving}
                      >
                        <PlusCircle size={17} />
                        {availabilitySaving ? "Đang gửi..." : "Gửi lịch bận"}
                      </button>

                      <div className="ops-availability-form-note">
                        Admin sẽ nhận thông báo ngay sau khi yêu cầu được gửi.
                      </div>
                    </form>
                  </div>

                  <div className="ops-list-panel">
                    <div className="ops-list-card ops-availability-list-card">
                      <div className="ops-section-head">
                        <div>
                          <span className="ops-availability-form-eyebrow">
                            Lịch sử yêu cầu
                          </span>
                        </div>
                        <button
                          type="button"
                          className="ops-btn-outline"
                          onClick={loadAvailabilities}
                          disabled={availabilityLoading}
                        >
                          <RefreshCcw
                            size={16}
                            className={availabilityLoading ? "spin" : ""}
                          />
                          {availabilityLoading ? "Đang tải..." : "Làm mới"}
                        </button>
                      </div>

                      {!pagedAvailabilityItems.length ? (
                        <Empty
                          icon={Clock}
                          title="Chưa có lịch bận"
                          description="Các yêu cầu báo bận hoặc không thể nhận tour sẽ hiển thị tại đây."
                        />
                      ) : (
                        <div className="ops-availability-list">
                          {pagedAvailabilityItems.map((item) => {
                            const assignment =
                              item.guideAssignment ||
                              item.assignment ||
                              item.guide_assignment ||
                              null;
                            const booking =
                              assignment?.booking || item.booking || null;
                            const tour =
                              assignment?.tour ||
                              booking?.tour ||
                              item.tour ||
                              null;
                            const status = String(item.status || "pending");
                            const isTourBusy = Boolean(
                              item.guideAssignmentId ||
                              item.guide_assignment_id ||
                              assignment?.id,
                            );
                            const canDelete = status === "pending";

                            return (
                              <article
                                className="ops-availability-card"
                                key={String(item.id)}
                              >
                                <div className="ops-availability-main">
                                  <div className="ops-availability-heading">
                                    <div>
                                      <span className="ops-availability-type">
                                        {isTourBusy
                                          ? "Không thể nhận tour"
                                          : item.availabilityType === "leave"
                                            ? "Nghỉ phép"
                                            : item.availabilityType ===
                                                "training"
                                              ? "Đào tạo"
                                              : item.availabilityType ===
                                                  "personal"
                                                ? "Việc cá nhân"
                                                : "Lịch bận chung"}
                                      </span>
                                      <strong>
                                        {isTourBusy
                                          ? tour?.name ||
                                            booking?.tourName ||
                                            "Tour chưa tải được thông tin"
                                          : "Lịch bận chung, không gắn với tour cụ thể"}
                                      </strong>
                                    </div>

                                    <div className="ops-availability-actions">
                                      <Badge tone={statusTone(status)}>
                                        {status === "active"
                                          ? "Đã duyệt"
                                          : status === "rejected"
                                            ? "Bị từ chối"
                                            : status === "cancelled"
                                              ? "Đã hủy"
                                              : "Chờ duyệt"}
                                      </Badge>

                                      {canDelete ? (
                                        <button
                                          type="button"
                                          className="ops-availability-delete"
                                          title="Xóa yêu cầu đang chờ duyệt"
                                          disabled={
                                            deletingAvailabilityId ===
                                            String(item.id)
                                          }
                                          onClick={() =>
                                            removeAvailability(item)
                                          }
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>

                                  {isTourBusy && (
                                    <div className="ops-availability-tour-grid">
                                      <DetailItem
                                        icon={Route}
                                        label="Tên tour"
                                        value={
                                          tour?.name ||
                                          booking?.tourName ||
                                          "Chưa cập nhật"
                                        }
                                      />
                                      <DetailItem
                                        icon={FileText}
                                        label="Mã booking"
                                        value={
                                          booking?.bookingCode ||
                                          item.bookingCode ||
                                          "--"
                                        }
                                      />
                                      <DetailItem
                                        icon={CalendarDays}
                                        label="Ngày khởi hành"
                                        value={formatDate(
                                          assignment?.startDate ||
                                            booking?.departure?.departureDate ||
                                            item.startAt,
                                        )}
                                      />
                                      <DetailItem
                                        icon={CalendarDays}
                                        label="Ngày kết thúc"
                                        value={formatDate(
                                          assignment?.endDate ||
                                            booking?.departure?.endDate ||
                                            item.endAt,
                                        )}
                                      />
                                    </div>
                                  )}

                                  <div className="ops-availability-meta">
                                    <span>
                                      <CalendarDays size={15} />
                                      {formatDateTime(
                                        item.startAt || item.start_at,
                                      )}
                                      {" → "}
                                      {formatDateTime(
                                        item.endAt || item.end_at,
                                      )}
                                    </span>
                                    <span>
                                      <Clock size={15} />
                                      Báo lúc{" "}
                                      {formatDateTime(
                                        item.createdAt || item.created_at,
                                      )}
                                    </span>
                                  </div>

                                  <div className="ops-availability-reason">
                                    <strong>Lý do:</strong>{" "}
                                    {item.reason || "Không có lý do"}
                                  </div>

                                  {item.reviewNote || item.review_note ? (
                                    <div className="ops-availability-review">
                                      <strong>Phản hồi admin:</strong>{" "}
                                      {item.reviewNote || item.review_note}
                                    </div>
                                  ) : null}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}

                      <Paginator
                        page={availabilityPage}
                        totalPages={availabilityTotalPages}
                        onPageChange={setAvailabilityPage}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "passengers" && (
                <div className="ops-section">
                  <div className="ops-section-head">
                    <div>
                      <h3>Danh sách hành khách</h3>
                      <p>Quản lý điểm danh theo từng điểm đón khách.</p>
                    </div>
                  </div>
                  {!pagedPassengers.length ? (
                    <Empty
                      icon={UsersRound}
                      title="Chưa có hành khách"
                      description="Danh sách sẽ xuất hiện sau khi booking được xác nhận."
                    />
                  ) : (
                    <div className="ops-table-wrap">
                      <table className="ops-table">
                        <thead>
                          <tr>
                            <th>Hành khách</th>
                            <th>Mã Booking</th>
                            <th>Điểm đón</th>
                            <th>Liên hệ / Lưu ý</th>
                            <th>Trạng thái</th>
                            <th>Chi tiết</th>
                            <th className="ops-text-right">
                              {isReadOnlyTrip
                                ? "Kết quả điểm danh"
                                : "Điểm danh"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedPassengers.map((guest, index) => {
                            const guestId =
                              guest.bookingGuestId ||
                              guest.booking_guest_id ||
                              guest.guestId ||
                              guest.id;
                            const status =
                              guest.status || guest.checkinStatus || "pending";
                            const group = guest.pickupGroup || {};
                            const isPrimary = isPrimaryPassenger(
                              guest,
                              firstGuestIdByBooking,
                            );
                            return (
                              <tr
                                key={`${guestId}-${index}`}
                                className={
                                  isPrimary ? "ops-primary-passenger-row" : ""
                                }
                              >
                                <td>
                                  <div className="ops-guest-info">
                                    <strong
                                      className={
                                        isPrimary
                                          ? "ops-primary-passenger-name"
                                          : ""
                                      }
                                    >
                                      {cleanGuestName(
                                        guest.fullName || guest.full_name,
                                      )}
                                    </strong>
                                    <div className="ops-guest-labels">
                                      <span className="ops-guest-type">
                                        {guest.guestType === "child"
                                          ? "Trẻ em"
                                          : guest.guestType === "infant"
                                            ? "Em bé"
                                            : "Người lớn"}
                                      </span>
                                      {isPrimary ? (
                                        <span className="ops-primary-passenger-badge">
                                          Khách chính
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span className="ops-code-text">
                                    {guest.bookingCode ||
                                      guest.booking?.bookingCode ||
                                      "--"}
                                  </span>
                                </td>
                                <td>
                                  <strong>
                                    {group.pickupName ||
                                      group.name ||
                                      guest.pickupName ||
                                      "Điểm hẹn Travela"}
                                  </strong>
                                  <span className="ops-text-muted">
                                    {group.pickupTime || guest.pickupTime || ""}
                                  </span>
                                </td>
                                <td>
                                  <span className="ops-phone-text">
                                    {guest.phone ||
                                      guest.contactPhone ||
                                      guest.booking?.contactPhone ||
                                      "--"}
                                  </span>
                                  {(guest.dietaryNotes ||
                                    guest.healthNotes) && (
                                    <span className="ops-note-badge">
                                      {guest.dietaryNotes || guest.healthNotes}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <Badge tone={statusTone(status)}>
                                    {checkinLabels[status] || status}
                                  </Badge>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="ops-view-passenger-btn"
                                    onClick={() => setSelectedPassenger(guest)}
                                  >
                                    <Eye size={15} /> Xem
                                  </button>
                                </td>
                                <td>
                                  {isReadOnlyTrip ? (
                                    <div className="ops-final-checkin">
                                      <Badge tone={statusTone(status)}>
                                        {checkinLabels[status] || status}
                                      </Badge>
                                      <small>Đã khóa</small>
                                    </div>
                                  ) : (
                                    <div className="ops-checkin-chips">
                                      {[
                                        ["present", "Có mặt"],
                                        ["late", "Trễ"],
                                        ["absent", "Vắng"],
                                        ["pending", "Reset"],
                                      ].map(([value, label]) => (
                                        <button
                                          key={value}
                                          type="button"
                                          className={`ops-chip ${value} ${status === value ? "active" : ""}`}
                                          onClick={() =>
                                            updateCheckin(guestId, value)
                                          }
                                          title={label}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <Paginator
                    page={passengerPage}
                    totalPages={passengerTotalPages}
                    onPageChange={setPassengerPage}
                  />
                </div>
              )}

              {activeTab === "logs" && (
                <div className="ops-two-col">
                  <div className="ops-form-panel">
                    <form
                      className={`ops-form-card ${isReadOnlyTrip ? "readonly" : ""}`}
                      onSubmit={saveJourneyLog}
                    >
                      <h3>
                        {editingLogId
                          ? "Chỉnh sửa nhật ký hành trình"
                          : "Thêm nhật ký hành trình"}
                      </h3>
                      <p className="ops-form-desc">
                        Cập nhật tiến độ để công ty và khách hàng theo dõi.
                      </p>
                      <Field label="Loại hoạt động">
                        <select
                          value={logForm.logType}
                          onChange={(e) =>
                            setLogForm((p) => ({
                              ...p,
                              logType: e.target.value,
                            }))
                          }
                        >
                          <option value="departure">Khởi hành</option>
                          <option value="arrival">Đến nơi</option>
                          <option value="activity">Tham quan</option>
                          <option value="hotel">Nhận/Trả phòng</option>
                          <option value="meal">Dùng bữa</option>
                          <option value="schedule_change">
                            Thay đổi lịch trình
                          </option>
                          <option value="general">Thông tin khác</option>
                        </select>
                      </Field>
                      <Field label="Tiêu đề (VD: Đến Vịnh Hạ Long)">
                        <input
                          required
                          value={logForm.title}
                          onChange={(e) =>
                            setLogForm((p) => ({ ...p, title: e.target.value }))
                          }
                        />
                      </Field>
                      <Field label="Tên địa điểm (Tùy chọn)">
                        <input
                          value={logForm.locationName}
                          onChange={(e) =>
                            setLogForm((p) => ({
                              ...p,
                              locationName: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Mô tả chi tiết">
                        <textarea
                          placeholder="Mô tả các hoạt động đang diễn ra..."
                          value={logForm.content}
                          onChange={(e) =>
                            setLogForm((p) => ({
                              ...p,
                              content: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <div className="ops-log-form-actions">
                        {editingLogId ? (
                          <button
                            type="button"
                            className="ops-btn-outline"
                            onClick={resetLogForm}
                            disabled={savingLog}
                          >
                            <X size={16} /> Hủy sửa
                          </button>
                        ) : null}

                        <button
                          className="ops-btn-primary"
                          type="submit"
                          disabled={isReadOnlyTrip || savingLog}
                        >
                          <Route size={16} />
                          {isReadOnlyTrip
                            ? "Chỉ xem"
                            : savingLog
                              ? "Đang lưu..."
                              : editingLogId
                                ? "Lưu thay đổi"
                                : "Lưu nhật ký"}
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="ops-list-panel">
                    <div className="ops-list-card">
                      <div className="ops-history-heading">
                        <h3>Lịch sử hành trình</h3>
                        <span>Mới nhất trước</span>
                      </div>
                      {!pagedLogs.length ? (
                        <Empty
                          icon={Route}
                          title="Chưa có nhật ký"
                          description="Thêm mốc đầu tiên để khách và admin theo dõi."
                        />
                      ) : (
                        <div className="ops-timeline">
                          {pagedLogs.map((log) => (
                            <article className="ops-timeline-item" key={log.id}>
                              <div className="ops-timeline-dot"></div>
                              <div className="ops-timeline-content">
                                <div className="ops-timeline-head">
                                  <div className="ops-log-title">
                                    <strong>{log.title}</strong>
                                  </div>
                                  {!isReadOnlyTrip ? (
                                    <div className="ops-log-actions">
                                      <button
                                        type="button"
                                        className="ops-log-action edit"
                                        onClick={() => startEditLog(log)}
                                      >
                                        <Pencil size={14} /> Sửa
                                      </button>
                                      <button
                                        type="button"
                                        className="ops-log-action delete"
                                        disabled={
                                          deletingLogId === String(log.id)
                                        }
                                        onClick={() => deleteJourneyLog(log)}
                                      >
                                        <Trash2 size={14} />
                                        {deletingLogId === String(log.id)
                                          ? "Đang xóa..."
                                          : "Xóa"}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                                <p>{log.content || "Không có mô tả."}</p>
                                <small>
                                  {log.locationName ||
                                    log.location_name ||
                                    "Chưa rõ điểm"}{" "}
                                  ·{" "}
                                  {formatDateTime(
                                    log.occurredAt ||
                                      log.occurred_at ||
                                      log.createdAt,
                                  )}
                                </small>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                      <Paginator
                        page={logPage}
                        totalPages={logTotalPages}
                        onPageChange={setLogPage}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "incidents" && (
                <div className="ops-two-col">
                  <div className="ops-form-panel">
                    <form
                      className={`ops-form-card ${isReadOnlyTrip ? "readonly" : ""}`}
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (isReadOnlyTrip) return;
                        postAndReload(
                          `/trip-operations/${selectedTrip.id}/incidents`,
                          incidentForm,
                          "Đã tạo ticket sự cố.",
                          () =>
                            setIncidentForm({
                              category: "other",
                              severity: "medium",
                              title: "",
                              description: "",
                              locationName: "",
                            }),
                        );
                      }}
                    >
                      <h3>Báo cáo sự cố</h3>
                      <p className="ops-form-desc">
                        Gửi báo cáo sự cố để trung tâm điều hành hỗ trợ xử lý
                        kịp thời.
                      </p>

                      <div className="ops-form-grid">
                        <Field label="Nhóm sự cố">
                          <select
                            value={incidentForm.category}
                            onChange={(e) =>
                              setIncidentForm((p) => ({
                                ...p,
                                category: e.target.value,
                              }))
                            }
                          >
                            <option value="customer">Khách hàng</option>
                            <option value="vehicle">Phương tiện</option>
                            <option value="hotel">Khách sạn</option>
                            <option value="restaurant">Nhà hàng</option>
                            <option value="health">Sức khỏe</option>
                            <option value="weather">Thời tiết</option>
                            <option value="schedule">Lịch trình</option>
                            <option value="security">An ninh</option>
                            <option value="other">Khác</option>
                          </select>
                        </Field>
                        <Field label="Mức độ nghiêm trọng">
                          <select
                            value={incidentForm.severity}
                            onChange={(e) =>
                              setIncidentForm((p) => ({
                                ...p,
                                severity: e.target.value,
                              }))
                            }
                          >
                            <option value="low">Thấp</option>
                            <option value="medium">Trung bình</option>
                            <option value="high">Cao</option>
                            <option value="critical">Khẩn cấp</option>
                          </select>
                        </Field>
                      </div>
                      <Field label="Tiêu đề tóm tắt">
                        <input
                          required
                          placeholder="VD: Xe nổ lốp tại đèo Prenn"
                          value={incidentForm.title}
                          onChange={(e) =>
                            setIncidentForm((p) => ({
                              ...p,
                              title: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Vị trí xảy ra">
                        <input
                          value={incidentForm.locationName}
                          onChange={(e) =>
                            setIncidentForm((p) => ({
                              ...p,
                              locationName: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Mô tả chi tiết">
                        <textarea
                          required
                          placeholder="Mô tả hiện trạng và các hỗ trợ đang cần..."
                          value={incidentForm.description}
                          onChange={(e) =>
                            setIncidentForm((p) => ({
                              ...p,
                              description: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <button
                        className="ops-btn-danger"
                        type="submit"
                        disabled={isReadOnlyTrip}
                      >
                        <AlertTriangle size={16} />{" "}
                        {isReadOnlyTrip ? "Chỉ xem" : "Gửi ticket hỗ trợ"}
                      </button>
                    </form>
                  </div>

                  <div className="ops-list-panel">
                    <div className="ops-list-card">
                      <div className="ops-history-heading">
                        <h3>Lịch sử sự cố</h3>
                        <span>Mới nhất trước</span>
                      </div>
                      {!pagedIncidents.length ? (
                        <Empty
                          icon={AlertTriangle}
                          title="An toàn tuyệt đối"
                          description="Chuyến đi hiện không có sự cố nào cần xử lý."
                        />
                      ) : (
                        <div className="ops-item-list">
                          {pagedIncidents.map((incident) => (
                            <article
                              className="ops-list-item"
                              key={incident.id}
                            >
                              <div className="ops-list-top">
                                <span className="ops-code-text">
                                  {incident.ticketCode || incident.ticket_code}
                                </span>
                                <div className="ops-badges-wrap">
                                  <Badge tone={statusTone(incident.severity)}>
                                    Mức độ: {incident.severity}
                                  </Badge>
                                  <Badge tone={statusTone(incident.status)}>
                                    {incident.status}
                                  </Badge>
                                </div>
                              </div>
                              <strong className="ops-list-title">
                                {incident.title}
                              </strong>
                              <p className="ops-list-desc">
                                {incident.description}
                              </p>
                              <div className="ops-list-foot">
                                <span>
                                  <MapPin size={12} />{" "}
                                  {incident.locationName ||
                                    incident.location_name ||
                                    "Không rõ điểm"}
                                </span>
                                <span>
                                  {formatDateTime(
                                    incident.createdAt || incident.created_at,
                                  )}
                                </span>
                              </div>
                              {incident.resolution && (
                                <div className="ops-resolution-box">
                                  <strong>Phương án xử lý:</strong>{" "}
                                  {incident.resolution}
                                </div>
                              )}
                            </article>
                          ))}
                        </div>
                      )}
                      <Paginator
                        page={incidentPage}
                        totalPages={incidentTotalPages}
                        onPageChange={setIncidentPage}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "broadcasts" && (
                <div className="ops-two-col">
                  <div className="ops-form-panel">
                    <form
                      className={`ops-form-card ${isReadOnlyTrip ? "readonly" : ""}`}
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (isReadOnlyTrip) return;
                        postAndReload(
                          `/trip-operations/${selectedTrip.id}/broadcasts`,
                          {
                            ...broadcastForm,
                            pickupPointId: broadcastForm.pickupPointId || null,
                          },
                          "Đã gửi thông báo cho đoàn.",
                          () =>
                            setBroadcastForm({
                              title: "",
                              content: "",
                              channel: "in_app",
                              pickupPointId: "",
                            }),
                        );
                      }}
                    >
                      <h3>Thông báo hàng loạt</h3>
                      <p className="ops-form-desc">
                        Gửi tin nhắn đồng loạt tới ứng dụng của khách hàng.
                      </p>
                      <Field label="Nhóm nhận thông báo">
                        <select
                          value={broadcastForm.pickupPointId}
                          onChange={(e) =>
                            setBroadcastForm((p) => ({
                              ...p,
                              pickupPointId: e.target.value,
                            }))
                          }
                        >
                          <option value="">Toàn bộ hành khách</option>
                          {passengerGroups.map((group) => (
                            <option
                              key={
                                group.pickupPointId || group.id || group.name
                              }
                              value={group.pickupPointId || group.id || ""}
                            >
                              {group.pickupName || group.name || "Điểm đón"}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Tiêu đề thông báo">
                        <input
                          required
                          placeholder="VD: Nhắc nhở tập trung ăn tối"
                          value={broadcastForm.title}
                          onChange={(e) =>
                            setBroadcastForm((p) => ({
                              ...p,
                              title: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Nội dung">
                        <textarea
                          required
                          placeholder="Viết nội dung thông báo..."
                          value={broadcastForm.content}
                          onChange={(e) =>
                            setBroadcastForm((p) => ({
                              ...p,
                              content: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <button
                        className="ops-btn-primary"
                        type="submit"
                        disabled={isReadOnlyTrip}
                      >
                        <Send size={16} />{" "}
                        {isReadOnlyTrip ? "Chỉ xem" : "Phát thông báo"}
                      </button>
                    </form>
                  </div>

                  <div className="ops-list-panel">
                    <div className="ops-list-card">
                      <div className="ops-history-heading">
                        <h3>Lịch sử thông báo</h3>
                        <span>Mới nhất trước</span>
                      </div>
                      {!pagedBroadcasts.length ? (
                        <Empty
                          icon={BellRing}
                          title="Chưa có thông báo"
                          description="Các thông báo gửi cho đoàn sẽ được lưu tại đây."
                        />
                      ) : (
                        <div className="ops-item-list">
                          {pagedBroadcasts.map((item) => (
                            <article className="ops-list-item" key={item.id}>
                              <strong className="ops-list-title">
                                {item.title}
                              </strong>
                              <p className="ops-list-desc">{item.content}</p>
                              <div className="ops-list-foot">
                                <span>
                                  Đã gửi lúc:{" "}
                                  {formatDateTime(
                                    item.sentAt ||
                                      item.sent_at ||
                                      item.createdAt,
                                  )}
                                </span>
                                <Badge tone="info">
                                  {item.recipientCount ||
                                    item.recipients?.length ||
                                    0}{" "}
                                  người nhận
                                </Badge>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                      <Paginator
                        page={broadcastPage}
                        totalPages={broadcastTotalPages}
                        onPageChange={setBroadcastPage}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "report" && (
                <form
                  className={`ops-form-card ops-report ${isCancelledTrip || hasSavedReport ? "readonly" : ""}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (isCancelledTrip || hasSavedReport) return;
                    postAndReload(
                      `/trip-operations/${selectedTrip.id}/report`,
                      reportForm,
                      "Đã lưu báo cáo sau tour.",
                    );
                  }}
                >
                  <div className="ops-section-head">
                    <div>
                      <h3>Báo cáo quyết toán & Đánh giá</h3>
                      <p>
                        Tổng kết số lượng khách, đánh giá chất lượng dịch vụ và
                        chi phí phát sinh sau tour.
                      </p>
                    </div>
                    <button
                      className="ops-btn-primary"
                      type="submit"
                      disabled={isCancelledTrip || hasSavedReport}
                    >
                      <CheckCircle2 size={16} />
                      {hasSavedReport
                        ? "Báo cáo đã hoàn tất"
                        : isCompletedTrip
                          ? "Gửi báo cáo kết thúc tour"
                          : "Hoàn tất báo cáo"}
                    </button>
                  </div>

                  <h4 className="ops-form-subtitle">
                    1. Thống kê hành khách & Chi phí
                  </h4>
                  <div className="ops-form-grid four">
                    <Field label="Số khách thực tế">
                      <div className="ops-input-icon-wrap">
                        <UsersRound size={16} />
                        <input
                          type="number"
                          min="0"
                          value={reportForm.actualGuestCount}
                          onChange={(e) =>
                            setReportForm((p) => ({
                              ...p,
                              actualGuestCount: Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </Field>
                    <Field label="Số khách vắng">
                      <div className="ops-input-icon-wrap">
                        <AlertTriangle size={16} />
                        <input
                          type="number"
                          min="0"
                          value={reportForm.absentGuestCount}
                          onChange={(e) =>
                            setReportForm((p) => ({
                              ...p,
                              absentGuestCount: Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </Field>
                    <Field label="Chi phí phát sinh (VND)">
                      <div className="ops-input-icon-wrap">
                        <span className="ops-currency-icon">₫</span>
                        <input
                          type="number"
                          min="0"
                          value={reportForm.extraCost}
                          onChange={(e) =>
                            setReportForm((p) => ({
                              ...p,
                              extraCost: Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </Field>
                    <Field label="Ghi chú chi phí">
                      <input
                        placeholder="Lý do phát sinh..."
                        value={reportForm.extraCostNote}
                        onChange={(e) =>
                          setReportForm((p) => ({
                            ...p,
                            extraCostNote: e.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>

                  <h4 className="ops-form-subtitle">
                    2. Đánh giá chất lượng (Thang 1-5 sao)
                  </h4>
                  <div className="ops-form-grid four">
                    <Field label="Lịch trình tuyến">
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={reportForm.itineraryRating}
                        onChange={(e) =>
                          setReportForm((p) => ({
                            ...p,
                            itineraryRating: Number(e.target.value),
                          }))
                        }
                      />
                    </Field>
                    <Field label="Xe vận chuyển">
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={reportForm.vehicleRating}
                        onChange={(e) =>
                          setReportForm((p) => ({
                            ...p,
                            vehicleRating: Number(e.target.value),
                          }))
                        }
                      />
                    </Field>
                    <Field label="Khách sạn / Lưu trú">
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={reportForm.hotelRating}
                        onChange={(e) =>
                          setReportForm((p) => ({
                            ...p,
                            hotelRating: Number(e.target.value),
                          }))
                        }
                      />
                    </Field>
                    <Field label="Nhà hàng / Bữa ăn">
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={reportForm.restaurantRating}
                        onChange={(e) =>
                          setReportForm((p) => ({
                            ...p,
                            restaurantRating: Number(e.target.value),
                          }))
                        }
                      />
                    </Field>
                  </div>

                  <h4 className="ops-form-subtitle">
                    3. Tóm tắt & Ý kiến đóng góp
                  </h4>
                  <div className="ops-form-grid">
                    <Field label="Tổng kết chuyến đi">
                      <textarea
                        placeholder="Đánh giá tổng quan về thái độ khách, các điểm tham quan..."
                        value={reportForm.summary}
                        onChange={(e) =>
                          setReportForm((p) => ({
                            ...p,
                            summary: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Các sự cố đáng chú ý">
                      <textarea
                        placeholder="Liệt kê vắn tắt các sự cố lớn (nếu có)..."
                        value={reportForm.incidentsSummary}
                        onChange={(e) =>
                          setReportForm((p) => ({
                            ...p,
                            incidentsSummary: e.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Đề xuất cải thiện (Dành cho Điều hành Tour)">
                    <textarea
                      placeholder="Ý kiến cá nhân để tổ chức tốt hơn ở lần sau..."
                      value={reportForm.recommendations}
                      onChange={(e) =>
                        setReportForm((p) => ({
                          ...p,
                          recommendations: e.target.value,
                        }))
                      }
                    />
                  </Field>
                </form>
              )}
            </div>
          </section>
        </div>
      )}

      {selectedPassenger ? (
        <div
          className="ops-passenger-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setSelectedPassenger(null);
          }}
        >
          <div className="ops-passenger-modal">
            <div className="ops-passenger-modal-head">
              <div>
                <span>Thông tin hành khách</span>
                <h3>
                  {cleanGuestName(
                    selectedPassenger.fullName || selectedPassenger.full_name,
                  )}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPassenger(null)}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <div className="ops-passenger-summary">
              <div className="ops-passenger-avatar">
                {String(
                  selectedPassenger.fullName ||
                    selectedPassenger.full_name ||
                    "K",
                )
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div>
                <strong>
                  {(selectedPassenger.guestType ||
                    selectedPassenger.guest_type) === "child"
                    ? "Trẻ em"
                    : (selectedPassenger.guestType ||
                          selectedPassenger.guest_type) === "infant"
                      ? "Em bé"
                      : "Người lớn"}
                </strong>
                <span>
                  Booking:{" "}
                  {selectedPassenger.bookingCode ||
                    selectedPassenger.booking?.bookingCode ||
                    "--"}
                </span>
              </div>
            </div>

            <div className="ops-passenger-detail-grid">
              <DetailItem
                label="Ngày sinh"
                value={formatDate(
                  selectedPassenger.dateOfBirth ||
                    selectedPassenger.date_of_birth,
                )}
              />
              <DetailItem
                label="Giới tính"
                value={
                  selectedPassenger.gender === "male"
                    ? "Nam"
                    : selectedPassenger.gender === "female"
                      ? "Nữ"
                      : selectedPassenger.gender || "--"
                }
              />
              <DetailItem
                label="Quốc tịch"
                value={selectedPassenger.nationality || "Việt Nam"}
              />
              <DetailItem
                label="CCCD / Hộ chiếu"
                value={
                  selectedPassenger.idNumber ||
                  selectedPassenger.id_number ||
                  "--"
                }
              />
              <DetailItem
                icon={Phone}
                label="Số điện thoại"
                value={
                  selectedPassenger.phone ||
                  selectedPassenger.contactPhone ||
                  selectedPassenger.booking?.contactPhone ||
                  "--"
                }
              />
              <DetailItem
                icon={MapPin}
                label="Điểm đón"
                value={
                  selectedPassenger.pickupName ||
                  selectedPassenger.pickupGroup?.pickupName ||
                  "--"
                }
              />
            </div>

            <div className="ops-special-notes">
              <div className="ops-special-card health">
                <HeartPulse size={20} />
                <div>
                  <strong>Lưu ý sức khỏe</strong>
                  <p>
                    {selectedPassenger.healthNotes ||
                      selectedPassenger.health_notes ||
                      "Không có ghi chú sức khỏe."}
                  </p>
                </div>
              </div>
              <div className="ops-special-card food">
                <Utensils size={20} />
                <div>
                  <strong>Ăn uống / Kiêng kỵ</strong>
                  <p>
                    {selectedPassenger.dietaryNotes ||
                      selectedPassenger.dietary_notes ||
                      "Không có yêu cầu ăn uống đặc biệt."}
                  </p>
                </div>
              </div>
              <div className="ops-special-card allergy">
                <AlertTriangle size={20} />
                <div>
                  <strong>Dị ứng</strong>
                  <p>
                    {selectedPassenger.allergyNotes ||
                      selectedPassenger.allergy_notes ||
                      "Không ghi nhận dị ứng."}
                  </p>
                </div>
              </div>
              <div className="ops-special-card emergency">
                <ContactRound size={20} />
                <div>
                  <strong>Liên hệ khẩn cấp</strong>
                  <p>
                    {selectedPassenger.emergencyContactName ||
                      selectedPassenger.emergency_contact_name ||
                      "--"}
                  </p>
                  <span>
                    {selectedPassenger.emergencyContactPhone ||
                      selectedPassenger.emergency_contact_phone ||
                      "--"}
                  </span>
                </div>
              </div>
            </div>

            <div className="ops-passenger-modal-foot">
              <button
                type="button"
                className="ops-btn-outline"
                onClick={() => setSelectedPassenger(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Styled JSX (Travel Platform Theme) */}
      <style jsx global>{`
        /* CSS Variables cho Theme Du lịch */
        .ops-root {
          --primary-color: #0ea5e9; /* Sky 500 */
          --primary-hover: #0284c7; /* Sky 600 */
          --danger-color: #ef4444;
          --danger-hover: #dc2626;
          --bg-body: #f8fafc;
          --bg-card: #ffffff;
          --text-main: #0f172a;
          --text-muted: #64748b;
          --border-color: #e2e8f0;
          --border-radius-lg: 16px;
          --border-radius-md: 10px;
          --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.05);
          --shadow-md: 0 4px 6px -1px rgba(15, 23, 42, 0.08);
          --shadow-hover: 0 10px 25px -5px rgba(15, 23, 42, 0.1);

          font-family: "Inter", system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 18px;
          width: 100%;
          min-width: 0;
          color: var(--text-main);
        }

        /* Typography & Layout Header */
        .ops-heading-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 2px 2px 0;
        }
        .ops-eyebrow {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          color: var(--primary-color);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        .ops-heading-row h2 {
          margin: 0 0 5px;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .ops-heading-row p {
          margin: 0;
          color: var(--text-muted);
          font-size: 15px;
        }

        /* Buttons Standard */
        .ops-btn-primary,
        .ops-btn-danger,
        .ops-btn-outline {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
          border-radius: var(--border-radius-md);
          padding: 10px 18px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .ops-btn-primary {
          background-color: var(--primary-color);
          color: #fff;
          box-shadow: 0 4px 12px rgba(14, 165, 233, 0.25);
        }
        .ops-btn-primary:hover {
          background-color: var(--primary-hover);
          transform: translateY(-1px);
        }
        .ops-btn-danger {
          background-color: var(--danger-color);
          color: #fff;
        }
        .ops-btn-danger:hover {
          background-color: var(--danger-hover);
        }
        .ops-btn-outline {
          background-color: #fff;
          border: 1px solid var(--border-color);
          color: var(--text-main);
          box-shadow: var(--shadow-sm);
        }
        .ops-btn-outline:hover {
          border-color: #cbd5e1;
          background-color: #f8fafc;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% {
            transform: rotate(360deg);
          }
        }

        /* General Cards */
        .ops-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-lg);
          padding: 16px;
          box-shadow: var(--shadow-sm);
        }
        .ops-card-head,
        .ops-section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          gap: 16px;
        }
        .ops-card-head h3,
        .ops-section-head h3 {
          margin: 0 0 4px;
          font-size: 18px;
          font-weight: 700;
        }
        .ops-card-head p,
        .ops-section-head p {
          margin: 0;
          color: var(--text-muted);
          font-size: 14px;
        }

        /* Search Bar */
        .ops-search {
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid var(--border-color);
          background: var(--bg-body);
          border-radius: var(--border-radius-md);
          padding: 0 12px;
          height: 42px;
          min-width: 280px;
          transition: border-color 0.2s;
        }
        .ops-search:focus-within {
          border-color: var(--primary-color);
          background: #fff;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
        }
        .ops-search input {
          border: 0;
          outline: 0;
          background: transparent;
          width: 100%;
          font-size: 14px;
          color: var(--text-main);
        }

        /* Trip Grid & Card */
        .ops-trip-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 12px;
          max-height: 286px;
          overflow-y: auto;
          padding: 2px 6px 2px 2px;
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .ops-trip-grid::-webkit-scrollbar {
          width: 7px;
        }
        .ops-trip-grid::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
        }
        .ops-trip-card {
          text-align: left;
          background: #fff;
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-md);
          padding: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ops-trip-card:hover {
          border-color: #cbd5e1;
          box-shadow: var(--shadow-md);
          transform: translateY(-2px);
        }
        .ops-trip-card.active {
          border-color: var(--primary-color);
          box-shadow: 0 4px 12px rgba(14, 165, 233, 0.15);
          background-color: #f0f9ff;
        }
        .ops-trip-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
        }
        .ops-selected-mark {
          font-size: 10px;
          font-weight: 800;
          color: #2563eb;
          background: #dbeafe;
          border-radius: 999px;
          padding: 4px 7px;
          white-space: nowrap;
        }
        .ops-trip-title {
          font-size: 15px;
          font-weight: 700;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ops-trip-meta {
          color: var(--text-muted);
          font-size: 13px;
        }
        .ops-trip-foot {
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px dashed var(--border-color);
          display: flex;
          justify-content: space-between;
          color: var(--text-muted);
          font-size: 13px;
        }
        .ops-trip-foot span {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 500;
        }

        /* Badges */
        .ops-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }
        .ops-badge.info {
          background: #e0f2fe;
          color: #0369a1;
        }
        .ops-badge.success {
          background: #dcfce7;
          color: #166534;
        }
        .ops-badge.warning {
          background: #fef9c3;
          color: #854d0e;
        }
        .ops-badge.danger {
          background: #fee2e2;
          color: #991b1b;
        }

        /* Hero Banner (E-Ticket Vibe) */
        .ops-trip-content {
          display: grid;
          gap: 16px;
        }
        .ops-hero {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%);
          border-radius: var(--border-radius-lg);
          padding: 24px;
          color: #fff;
          display: flex;
          justify-content: space-between;
          align-items: stretch;
          box-shadow: 0 10px 25px rgba(2, 132, 199, 0.2);
        }
        .ops-hero-bg-pattern {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          left: 0;
          background-image: radial-gradient(
            rgba(255, 255, 255, 0.1) 2px,
            transparent 2px
          );
          background-size: 24px 24px;
          opacity: 0.6;
        }
        .ops-hero-content {
          position: relative;
          z-index: 1;
          max-width: 68%;
        }
        .ops-hero-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .ops-hero-code {
          background: rgba(255, 255, 255, 0.2);
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 13px;
          font-family: monospace;
          letter-spacing: 1px;
        }
        .ops-hero-title {
          font-size: 22px;
          font-weight: 800;
          margin: 0 0 8px;
          line-height: 1.3;
        }
        .ops-hero-dest {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 15px;
          opacity: 0.9;
          margin: 0;
        }
        .ops-hero-dates {
          display: flex;
          gap: 24px;
          margin-top: 14px;
          font-size: 14px;
          font-weight: 500;
        }
        .ops-hero-dates span {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.15);
          padding: 6px 12px;
          border-radius: 20px;
        }

        .ops-rate-card {
          position: relative;
          z-index: 1;
          background: rgba(255, 255, 255, 0.95);
          color: var(--text-main);
          padding: 16px 18px;
          border-radius: var(--border-radius-md);
          min-width: 190px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .ops-rate-card > span {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .ops-rate-number {
          display: flex;
          align-items: baseline;
          margin: 8px 0;
        }
        .ops-rate-number strong {
          font-size: 31px;
          font-weight: 800;
          color: var(--primary-color);
          line-height: 1;
        }
        .ops-rate-number small {
          font-size: 18px;
          font-weight: 700;
          color: var(--primary-color);
          margin-left: 2px;
        }
        .ops-progress-bar {
          width: 100%;
          height: 6px;
          background: #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .ops-progress-bar i {
          display: block;
          height: 100%;
          background: var(--primary-color);
          border-radius: 4px;
          transition: width 0.5s ease;
        }
        .ops-rate-footer {
          font-size: 13px;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* Metrics */
        .ops-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin: 0;
        }
        .ops-metric {
          background: #fff;
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-md);
          padding: 20px;
          box-shadow: var(--shadow-sm);
          transition: transform 0.2s;
        }
        .ops-metric:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
        .ops-metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          color: var(--text-muted);
          font-size: 14px;
          font-weight: 500;
        }
        .ops-metric-icon {
          opacity: 0.8;
        }
        .ops-metric strong {
          display: block;
          font-size: 24px;
          font-weight: 800;
          color: var(--text-main);
          margin-bottom: 4px;
          line-height: 1;
        }
        .ops-metric small {
          color: var(--text-muted);
          font-size: 12px;
        }
        .ops-metric.blue .ops-metric-icon {
          color: #0ea5e9;
        }
        .ops-metric.green .ops-metric-icon {
          color: #10b981;
        }
        .ops-metric.amber .ops-metric-icon {
          color: #f59e0b;
        }
        .ops-metric.red .ops-metric-icon {
          color: #ef4444;
        }

        /* Tabs */
        .ops-main-card {
          padding-top: 16px;
        }
        .ops-tabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid var(--border-color);
          position: sticky;
          top: 72px;
          z-index: 8;
          background: #fff;
          padding-top: 2px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .ops-tabs::-webkit-scrollbar {
          display: none;
        }
        .ops-tab-item {
          background: none;
          border: none;
          padding: 10px 13px;
          margin-bottom: 8px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .ops-tab-item:hover {
          color: var(--text-main);
        }
        .ops-tab-item.active {
          color: #1d4ed8;
          border-bottom-color: transparent;
          background: #eff6ff;
        }
        .ops-tab-content {
          padding-top: 18px;
        }

        /* Table Design */
        .ops-table-wrap {
          overflow-x: auto;
          border-radius: var(--border-radius-md);
          border: 1px solid var(--border-color);
        }
        .ops-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 900px;
        }
        .ops-table th {
          position: sticky;
          top: 0;
          z-index: 2;
          background: #f8fafc;
          padding: 14px 16px;
          text-align: left;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border-color);
        }
        .ops-table td {
          padding: 13px 14px;
          border-bottom: 1px solid var(--border-color);
          vertical-align: middle;
        }
        .ops-table tbody tr:last-child td {
          border-bottom: none;
        }
        .ops-table tbody tr:hover {
          background-color: #f8fafc;
        }
        .ops-text-right {
          text-align: right !important;
        }
        .ops-code-text {
          font-family: monospace;
          background: #f1f5f9;
          padding: 4px 6px;
          border-radius: 4px;
          font-size: 13px;
          color: #475569;
        }
        .ops-phone-text {
          font-weight: 500;
        }
        .ops-guest-info strong {
          display: block;
          font-size: 15px;
          margin-bottom: 4px;
        }

        .ops-primary-passenger-row {
          background: #f0fdf4;
        }
        .ops-primary-passenger-row:hover {
          background: #ecfdf5 !important;
        }
        .ops-primary-passenger-name {
          font-weight: 900 !important;
          color: #14532d;
        }
        .ops-guest-labels {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }
        .ops-primary-passenger-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 7px;
          border-radius: 999px;
          background: #dcfce7;
          color: #166534;
          font-size: 10px;
          font-weight: 800;
          line-height: 1.4;
        }
        .ops-guest-type {
          font-size: 12px;
          color: var(--text-muted);
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .ops-note-badge {
          display: inline-block;
          margin-top: 6px;
          font-size: 11px;
          background: #fef3c7;
          color: #b45309;
          padding: 2px 6px;
          border-radius: 4px;
        }

        /* Checkin Chips (Segmented Controls alike) */
        .ops-checkin-chips {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: flex-end;
        }
        .ops-chip {
          border: 1px solid var(--border-color);
          background: #fff;
          padding: 6px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s;
        }
        .ops-chip:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .ops-chip.active {
          border-color: transparent;
        }
        .ops-chip.present.active {
          background: #dcfce7;
          color: #166534;
          box-shadow: 0 0 0 1px #22c55e inset;
        }
        .ops-chip.late.active {
          background: #fef9c3;
          color: #854d0e;
          box-shadow: 0 0 0 1px #eab308 inset;
        }
        .ops-chip.absent.active {
          background: #fee2e2;
          color: #991b1b;
          box-shadow: 0 0 0 1px #ef4444 inset;
        }
        .ops-chip.pending.active {
          background: #f1f5f9;
          color: #475569;
          box-shadow: 0 0 0 1px #94a3b8 inset;
        }

        /* Forms & Layouts */
        .ops-two-col {
          display: grid;
          grid-template-columns: minmax(320px, 0.9fr) minmax(360px, 1.1fr);
          gap: 18px;
          align-items: start;
        }
        .ops-form-card {
          background: #fff;
          border: 1px solid var(--border-color);
          border-radius: 14px;
          padding: 20px;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.03);
        }
        .ops-form-card h3,
        .ops-list-card h3 {
          margin-top: 0;
        }
        .ops-form-desc {
          font-size: 14px;
          color: var(--text-muted);
          margin: -10px 0 20px 0;
        }
        .ops-form-subtitle {
          margin: 24px 0 16px;
          font-size: 16px;
          font-weight: 700;
          color: var(--primary-color);
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 8px;
        }
        .ops-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .ops-form-grid.four {
          grid-template-columns: repeat(4, 1fr);
        }
        .ops-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        .ops-field label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-main);
        }
        .ops-field input,
        .ops-field select,
        .ops-field textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 11px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 14px;
          color: var(--text-main);
          background: #fff;
          transition: all 0.2s;
        }
        .ops-field input:focus,
        .ops-field select:focus,
        .ops-field textarea:focus {
          outline: none;
          border-color: var(--primary-color);
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
        }
        .ops-field textarea {
          min-height: 120px;
          resize: vertical;
          line-height: 1.5;
        }
        .ops-input-icon-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .ops-input-icon-wrap svg,
        .ops-currency-icon {
          position: absolute;
          left: 12px;
          color: var(--text-muted);
          font-size: 16px;
          font-weight: 600;
        }
        .ops-input-icon-wrap input {
          padding-left: 36px;
          width: 100%;
          box-sizing: border-box;
        }

        /* List Items (Logs, Incidents, Broadcasts) */
        .ops-history-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .ops-history-heading h3 {
          margin: 0;
        }

        .ops-history-heading span {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 10px;
          border: 1px solid #bfdbfe;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .ops-list-card {
          background: #f8fafc;
          border: 1px solid var(--border-color);
          border-radius: 14px;
          padding: 20px;
          min-height: 100%;
          box-sizing: border-box;
        }
        .ops-item-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ops-list-item {
          background: #fff;
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-md);
          padding: 16px;
          transition: transform 0.2s;
          box-shadow: var(--shadow-sm);
        }
        .ops-list-item:hover {
          transform: translateX(2px);
          border-color: #cbd5e1;
        }
        .ops-list-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .ops-badges-wrap {
          display: flex;
          gap: 8px;
        }
        .ops-list-title {
          display: block;
          font-size: 15px;
          margin-bottom: 6px;
        }
        .ops-list-desc {
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0 0 12px 0;
        }
        .ops-list-foot {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-muted);
        }
        .ops-list-foot span {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .ops-resolution-box {
          margin-top: 12px;
          padding: 10px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          font-size: 13px;
          color: #166534;
        }

        /* Timeline specifically for Logs */
        .ops-timeline {
          position: relative;
          padding-left: 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .ops-timeline::before {
          content: "";
          position: absolute;
          left: 0;
          top: 8px;
          bottom: 0;
          width: 2px;
          background: #e2e8f0;
        }
        .ops-timeline-item {
          position: relative;
        }
        .ops-timeline-dot {
          position: absolute;
          left: -21px;
          top: 4px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--primary-color);
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px var(--primary-color);
        }
        .ops-timeline-content {
          background: #fff;
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-md);
          padding: 16px;
          box-shadow: var(--shadow-sm);
        }
        .ops-timeline-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .ops-log-form-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ops-log-title {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          min-width: 0;
        }
        .ops-log-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .ops-log-action {
          min-height: 32px;
          padding: 0 10px;
          border-radius: 9px;
          border: 1px solid;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .ops-log-action.edit {
          color: #1d4ed8;
          border-color: #bfdbfe;
          background: #eff6ff;
        }
        .ops-log-action.delete {
          color: #b91c1c;
          border-color: #fecaca;
          background: #fef2f2;
        }
        .ops-log-action:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ops-timeline-content p {
          font-size: 14px;
          color: var(--text-muted);
          margin: 0 0 8px 0;
        }
        .ops-timeline-content small {
          font-size: 12px;
          color: #94a3b8;
        }

        /* Availability */
        .ops-availability-list {
          display: grid;
          gap: 14px;
        }
        .ops-availability-card {
          padding: 18px;
          border: 1px solid var(--border-color);
          border-radius: 14px;
          background: #fff;
          box-shadow: var(--shadow-sm);
        }
        .ops-availability-main {
          display: grid;
          gap: 14px;
        }
        .ops-availability-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
        }
        .ops-availability-heading > div {
          display: grid;
          gap: 5px;
        }
        .ops-availability-type {
          color: #2563eb;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .ops-availability-heading strong {
          color: var(--text-main);
          font-size: 16px;
          line-height: 1.45;
        }
        .ops-availability-tour-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .ops-availability-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 18px;
          color: var(--text-muted);
          font-size: 13px;
        }
        .ops-availability-meta span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .ops-availability-reason,
        .ops-availability-review {
          padding: 11px 13px;
          border-radius: 10px;
          background: #f8fafc;
          color: #475569;
          font-size: 13px;
          line-height: 1.55;
        }
        .ops-availability-review {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          color: #9a3412;
        }
        @media (max-width: 1024px) {
          .ops-availability-tour-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .ops-availability-heading {
            flex-direction: column;
          }
          .ops-availability-tour-grid {
            grid-template-columns: 1fr;
          }
        }

        .ops-availability-layout {
          grid-template-columns: minmax(330px, 0.82fr) minmax(0, 1.45fr);
        }
        .ops-availability-form {
          position: sticky;
          top: 132px;
        }
        .ops-availability-form-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 20px;
        }
        .ops-availability-form-head h3 {
          margin: 5px 0 12px;
        }
        .ops-availability-form-eyebrow {
          color: #2563eb;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }
        .ops-availability-form-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: #eff6ff;
          color: #2563eb;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
        }
        .ops-availability-all-day {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin: 0 0 16px;
          color: #334155;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .ops-availability-all-day input {
          width: 17px;
          height: 17px;
          accent-color: #2563eb;
        }
        .ops-availability-submit {
          width: 100%;
        }
        .ops-availability-form-note {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #f8fafc;
          color: #64748b;
          font-size: 12px;
          line-height: 1.5;
          text-align: center;
        }
        .ops-availability-list-card {
          min-height: 100%;
        }
        .ops-availability-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
        }
        .ops-availability-delete {
          width: 34px;
          height: 34px;
          border: 1px solid #fecdd3;
          border-radius: 10px;
          background: #fff1f2;
          color: #e11d48;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .ops-availability-delete:hover {
          background: #ffe4e6;
        }
        .ops-availability-delete:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        @media (max-width: 1024px) {
          .ops-availability-layout {
            grid-template-columns: 1fr;
          }
          .ops-availability-form {
            position: static;
          }
        }

        /* Empty State */
        .ops-empty {
          text-align: center;
          padding: 48px 20px;
        }
        .ops-empty-icon {
          width: 64px;
          height: 64px;
          background: #f1f5f9;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          color: var(--text-muted);
        }
        .ops-empty strong {
          display: block;
          font-size: 16px;
          color: var(--text-main);
          margin-bottom: 4px;
        }
        .ops-empty p {
          color: var(--text-muted);
          font-size: 14px;
          margin: 0;
        }

        /* Pagination Space */
        .ops-pagination {
          margin-top: 20px;
          display: flex;
          justify-content: center;
        }

        .ops-readonly-alert {
          margin-bottom: 18px;
          padding: 14px 16px;
          border: 1px solid #bfdbfe;
          border-radius: 13px;
          background: #eff6ff;
          color: #1d4ed8;
          display: flex;
          align-items: flex-start;
          gap: 11px;
        }
        .ops-readonly-alert div {
          display: grid;
          gap: 3px;
        }
        .ops-readonly-alert strong {
          font-size: 14px;
        }
        .ops-readonly-alert span {
          color: #475569;
          font-size: 12px;
          line-height: 1.5;
        }
        .ops-view-passenger-btn {
          min-height: 34px;
          padding: 0 11px;
          border: 1px solid #bfdbfe;
          border-radius: 9px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .ops-view-passenger-btn:hover {
          background: #dbeafe;
        }
        .ops-final-checkin {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 7px;
        }
        .ops-final-checkin small {
          color: #94a3b8;
          font-size: 11px;
        }
        .ops-form-card.readonly {
          opacity: 0.72;
        }
        .ops-form-card.readonly input,
        .ops-form-card.readonly select,
        .ops-form-card.readonly textarea {
          pointer-events: none;
          background: #f8fafc;
        }
        .ops-btn-primary:disabled,
        .ops-btn-danger:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }
        .ops-passenger-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          padding: 24px;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(4px);
          display: grid;
          place-items: center;
        }
        .ops-passenger-modal {
          width: min(760px, 100%);
          max-height: calc(100vh - 48px);
          overflow-y: auto;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
        }
        .ops-passenger-modal-head {
          padding: 20px 22px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }
        .ops-passenger-modal-head span {
          color: #2563eb;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .ops-passenger-modal-head h3 {
          margin: 5px 0 0;
          font-size: 21px;
        }
        .ops-passenger-modal-head button {
          width: 38px;
          height: 38px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #fff;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .ops-passenger-summary {
          margin: 20px 22px 0;
          padding: 15px;
          border-radius: 14px;
          background: linear-gradient(135deg, #eff6ff, #f8fafc);
          display: flex;
          align-items: center;
          gap: 13px;
        }
        .ops-passenger-avatar {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: #2563eb;
          color: #fff;
          font-size: 20px;
          font-weight: 800;
          display: grid;
          place-items: center;
        }
        .ops-passenger-summary > div:last-child {
          display: grid;
          gap: 3px;
        }
        .ops-passenger-summary span {
          color: #64748b;
          font-size: 12px;
        }
        .ops-passenger-detail-grid {
          padding: 20px 22px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .ops-detail-item {
          min-height: 66px;
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ops-detail-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: #eff6ff;
          color: #2563eb;
          display: grid;
          place-items: center;
        }
        .ops-detail-item > div:last-child {
          display: grid;
          gap: 3px;
        }
        .ops-detail-item span {
          color: #64748b;
          font-size: 11px;
        }
        .ops-detail-item strong {
          font-size: 13px;
        }
        .ops-special-notes {
          padding: 0 22px 20px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .ops-special-card {
          min-height: 110px;
          padding: 14px;
          border-radius: 13px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .ops-special-card div {
          display: grid;
          gap: 5px;
        }
        .ops-special-card p {
          margin: 0;
          color: #475569;
          font-size: 12px;
          line-height: 1.5;
        }
        .ops-special-card span {
          color: #64748b;
          font-size: 11px;
        }
        .ops-special-card.health {
          background: #fef2f2;
          color: #dc2626;
        }
        .ops-special-card.food {
          background: #fff7ed;
          color: #ea580c;
        }
        .ops-special-card.allergy {
          background: #fffbeb;
          color: #d97706;
        }
        .ops-special-card.emergency {
          background: #eff6ff;
          color: #2563eb;
        }
        .ops-passenger-modal-foot {
          padding: 16px 22px 20px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: flex-end;
        }

        /* Responsive */
        @media (max-width: 1180px) {
          .ops-trip-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 1024px) {
          .ops-metrics {
            grid-template-columns: repeat(2, 1fr);
          }
          .ops-two-col {
            grid-template-columns: 1fr;
          }
          .ops-hero {
            flex-direction: column;
            gap: 24px;
            padding: 24px;
          }
          .ops-hero-content {
            max-width: 100%;
          }
          .ops-rate-card {
            width: 100%;
          }
        }
        @media (max-width: 768px) {
          .ops-heading-row,
          .ops-card-head {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          .ops-search {
            width: 100%;
          }
          .ops-form-grid,
          .ops-form-grid.four {
            grid-template-columns: 1fr;
          }
          .ops-hero-dates {
            flex-direction: column;
            gap: 12px;
          }
          .ops-checkin-chips {
            justify-content: flex-start;
          }
          .ops-passenger-detail-grid,
          .ops-special-notes {
            grid-template-columns: 1fr;
          }
          .ops-passenger-modal-backdrop {
            padding: 10px;
          }
        }
      `}</style>
    </div>
  );
}
