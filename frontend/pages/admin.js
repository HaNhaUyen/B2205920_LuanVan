import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminInsightPanel from "@/components/admin/AdminInsightPanel";
import AdminReportButton from "@/components/admin/AdminReportButton";
import Loading from "@/components/Loading";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/format";
import { mapLabel } from "@/lib/labels";
import { mapImageUrl } from "@/lib/tour";
import {
  exportAdminBookings,
  exportAdminContacts,
  exportAdminReviews,
  exportAdminTours,
  exportAdminSmartReport,
} from "@/lib/exportExcel";

const adminTabs = [
  { key: "overview", label: "Dashboard", href: "/admin" },
  { key: "bookings", label: "Booking", href: "/admin/bookings" },
  { key: "tours", label: "Tours", href: "/admin/tours" },
  { key: "destinations", label: "Điểm đến", href: "/admin/destinations" },
  { key: "reviews", label: "Đánh giá", href: "/admin/reviews" },
  { key: "contacts", label: "Liên hệ", href: "/admin/contacts" },
  { key: "users", label: "Người dùng", href: "/admin/users" },
  { key: "profile", label: "Hồ sơ", href: "/admin/profile" },
];

const emptyPage = {
  items: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
};

const initialBookingFilter = {
  page: 1,
  pageSize: 10,
  search: "",
  status: "",
  paymentStatus: "",
  destinationId: "",
  departureFrom: "",
  departureTo: "",
  guideStatus: "",
  urgency: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};
const initialReviewFilter = {
  page: 1,
  pageSize: 10,
  search: "",
  tourId: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};
const initialContactFilter = {
  page: 1,
  pageSize: 10,
  search: "",
  status: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};
const initialTourFilter = {
  page: 1,
  pageSize: 8,
  search: "",
  destinationId: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

const initialDestinationFilter = {
  page: 1,
  pageSize: 10,
  search: "",
  status: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

const initialDestinationForm = {
  id: "",
  name: "",
  province: "",
  country: "Vietnam",
  description: "",
  coverImage: "",
  coverImageFile: null,
  coverImagePreview: "",
  status: "active",
};

const initialReplyForm = {
  contactId: "",
  subject: "",
  replyMessage: "",
  status: "resolved",
  sendEmail: true,
};
const initialReviewReply = {
  id: "",
  status: "approved",
  adminReply: "",
  comment: "",
};
const initialTourForm = {
  id: "",
  code: "",
  name: "",
  slug: "",
  destinationId: "",
  tourType: "group",
  tourTheme: "beach",
  durationDays: 3,
  durationNights: 2,
  hotelStars: 4,
  basePriceAdult: 3200000,
  basePriceChild: 2400000,
  maxCapacityDefault: 25,
  shortDescription: "",
  fullDescription: "",
  isTrending: true,
  isBestDeal: false,
  media: [],
};

// Đã nâng cấp giao diện tinh tế hơn
function StatusBadge({ children, tone = "default" }) {
  const palette = {
    success: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
    warning: { bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
    danger: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
    default: { bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
  };
  const style = palette[tone] || palette.default;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: "6px",
        fontWeight: 600,
        fontSize: "12px",
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function MiniBarChart({
  title,
  items = [],
  labelKey = "status",
  valueKey = "total",
  formatter = (value) => value,
  valueFormatter = (value) => formatNumber(value),
}) {
  const max = Math.max(
    1,
    ...items.map((item) => Number(item?.[valueKey] || 0)),
  );
  return (
    <article
      className="admin-card"
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
    >
      <div>
        <h3 style={{ margin: "0 0 4px", color: "#0f172a", fontSize: "16px" }}>
          {title}
        </h3>
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        {items.map((item, index) => {
          const value = Number(item?.[valueKey] || 0);
          const width = `${Math.max(5, (value / max) * 100)}%`;
          return (
            <div
              key={`${item?.[labelKey]}-${index}`}
              style={{ display: "grid", gap: 6 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                }}
              >
                <strong style={{ color: "#475569", fontWeight: 600 }}>
                  {formatter(item?.[labelKey] || "-")}
                </strong>
                <span style={{ color: "#0f172a", fontWeight: 700 }}>
                  {valueFormatter(value)}
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: "#f1f5f9",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width,
                    height: "100%",
                    borderRadius: 999,
                    background: index % 2 === 0 ? "#3b82f6" : "#6366f1",
                    transition: "width 0.5s ease-out",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function MiniDonutChart({
  title,
  description = "",
  items = [],
  labelKey = "label",
  valueKey = "value",
  formatter = (value) => value,
}) {
  const total = items.reduce(
    (sum, item) => sum + Number(item?.[valueKey] || 0),
    0,
  );

  const colors = [
    "#3b82f6",
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#14b8a6",
  ];

  let current = 0;
  const circles = items.map((item, index) => {
    const value = Number(item?.[valueKey] || 0);
    const percent = total ? (value / total) * 100 : 0;
    const dash = `${percent} ${100 - percent}`;
    const rotate = current * 3.6;
    current += percent;

    return (
      <circle
        key={`${item?.[labelKey]}-${index}`}
        r="15.915"
        cx="18"
        cy="18"
        fill="transparent"
        stroke={colors[index % colors.length]}
        strokeWidth="5"
        strokeDasharray={dash}
        strokeDashoffset="25"
        transform={`rotate(${rotate} 18 18)`}
      />
    );
  });

  return (
    <article
      className="admin-card"
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <div>
        <h3 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: 17 }}>
          {title}
        </h3>
        {description ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
            {description}
          </p>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "150px 1fr",
          gap: 20,
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", width: 150, height: 150 }}>
          <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%" }}>
            <circle
              r="15.915"
              cx="18"
              cy="18"
              fill="transparent"
              stroke="#f1f5f9"
              strokeWidth="5"
            />
            {circles}
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
            }}
          >
            <strong style={{ fontSize: 24, color: "#0f172a" }}>
              {formatNumber(total)}
            </strong>
            <span style={{ fontSize: 12, color: "#64748b" }}>Tổng</span>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item, index) => {
            const value = Number(item?.[valueKey] || 0);
            const percent = total ? Math.round((value / total) * 100) : 0;

            return (
              <div
                key={`${item?.[labelKey]}-legend-${index}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#475569",
                    fontWeight: 600,
                  }}
                >
                  <i
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: colors[index % colors.length],
                    }}
                  />
                  {formatter(item?.[labelKey] || "-")}
                </span>
                <strong style={{ color: "#0f172a" }}>
                  {formatNumber(value)} · {percent}%
                </strong>
              </div>
            );
          })}

          {!items.length && (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
              Chưa có dữ liệu.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function MiniLineChart({
  title,
  items = [],
  valueKey = "revenue",
  suffix = "",
}) {
  const values = items.map((item) => Number(item?.[valueKey] || 0));
  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);

  // Tính toán tọa độ (thêm lề để điểm không bị cắt lẹm ở các viền)
  const coords = items.map((item, index) => {
    // x chạy từ 2 đến 98 (chừa 2% lề trái/phải)
    const x =
      items.length === 1
        ? 50
        : 2 + (index / Math.max(items.length - 1, 1)) * 96;
    // y chạy từ 10 đến 90 (chừa trên/dưới để không dính trần)
    const y =
      90 -
      ((Number(item?.[valueKey] || 0) - min) / Math.max(max - min, 1)) * 80;
    return { x, y, value: Number(item?.[valueKey] || 0), label: item.month };
  });

  // Tạo chuỗi points cho SVG
  const linePoints = coords.map((p) => `${p.x},${p.y}`).join(" ");
  // Tạo polygon point cho vùng gradient (kéo xuống đáy y=100)
  const areaPoints =
    coords.length > 0
      ? `${coords[0].x},100 ${linePoints} ${coords[coords.length - 1].x},100`
      : "";

  return (
    <article
      className="admin-card"
      style={{ display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div>
        <h3 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "17px" }}>
          {title}
        </h3>
        <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
          Theo dõi tổng doanh thu được ghi nhận trong 6 tháng gần nhất.
        </p>
      </div>

      {/* Container của Chart */}
      <div style={{ position: "relative", paddingTop: "10px" }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            width: "100%",
            height: 240,
            overflow: "visible", // Quan trọng để các điểm chấm không bị cắt
          }}
        >
          <defs>
            {/* Tạo Gradient màu xanh đổ xuống trong suốt */}
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
            {/* Tạo hiệu ứng phát sáng nhẹ cho đường line */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Vẽ các đường lưới ngang (Grid lines) */}
          {[10, 30, 50, 70, 90].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="#e2e8f0"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
          ))}

          {/* Vẽ vùng màu Gradient (Area) */}
          {coords.length > 0 && (
            <polygon points={areaPoints} fill="url(#revenueGradient)" />
          )}

          {/* Vẽ đường line chính */}
          {coords.length > 0 && (
            <polyline
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={linePoints}
              filter="url(#glow)"
            />
          )}

          {/* Vẽ các điểm chấm tròn (Data points) */}
          {coords.map((p, i) => (
            <g key={i} style={{ cursor: "crosshair" }}>
              {/* Lớp viền ngoài vô hình để dễ hover hơn */}
              <circle cx={p.x} cy={p.y} r="6" fill="transparent" />
              {/* Chấm tròn thật */}
              <circle
                cx={p.x}
                cy={p.y}
                r="3.5"
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth="2"
                style={{ transition: "all 0.2s ease" }}
                onMouseEnter={(e) => {
                  e.target.setAttribute("r", "5");
                  e.target.setAttribute("fill", "#eff6ff");
                  e.target.setAttribute("stroke-width", "3");
                }}
                onMouseLeave={(e) => {
                  e.target.setAttribute("r", "3.5");
                  e.target.setAttribute("fill", "#ffffff");
                  e.target.setAttribute("stroke-width", "2");
                }}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Box hiển thị dữ liệu text phía dưới */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(100px, 1fr))`,
          gap: 12,
          marginTop: 8,
        }}
      >
        {items.map((item) => (
          <div
            key={item.month}
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "12px",
              textAlign: "center",
              transition: "border-color 0.2s",
            }}
          >
            <strong
              style={{
                display: "block",
                color: "#64748b",
                marginBottom: 6,
                fontSize: "13px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {item.month}
            </strong>
            <span
              style={{ color: "#0f172a", fontSize: "15px", fontWeight: 700 }}
            >
              {formatCurrency(item?.[valueKey] || 0)}
              {suffix}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function toneForBooking(status) {
  if (["confirmed", "completed"].includes(status)) return "success";
  if (["pending_payment", "waiting_confirmation"].includes(status))
    return "warning";
  if (["cancelled", "expired"].includes(status)) return "danger";
  return "default";
}
function toneForPayment(status) {
  if (status === "paid") return "success";
  if (["pending", "waiting_confirmation"].includes(status)) return "warning";
  if (["failed", "expired", "refunded"].includes(status)) return "danger";
  return "default";
}
function toneForPriority(level) {
  if (level === "high") return "danger";
  if (level === "medium") return "warning";
  return "success";
}
function formatDaysUntilDeparture(days) {
  if (days === null || days === undefined) return "Chưa rõ";
  if (days < 0) return `Đã qua ${Math.abs(days)} ngày`;
  if (days === 0) return "Hôm nay";
  return `Còn ${days} ngày`;
}
function toneForContact(item) {
  if (item?.replyEmailSentAt) return "success";
  if (item?.replyEmailError) return "danger";
  if (item?.status === "new") return "warning";
  return "default";
}

function destinationImage(item) {
  return (
    item?.coverImage ||
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80"
  );
}

function destinationStatusLabel(status) {
  return status === "active" ? "Đang dùng" : "Tạm ẩn";
}

function createDepartureItem(overrides = {}) {
  return {
    id: overrides.id || "",
    departureDate: overrides.departureDate || "",
    endDate: overrides.endDate || "",
    adultPrice: overrides.adultPrice ?? 3990000,
    childPrice: overrides.childPrice ?? 2790000,
    totalSlots: overrides.totalSlots ?? 20,
    status: overrides.status || "open",
  };
}

function createPickupPointItem(overrides = {}) {
  return {
    id: overrides.id || "",
    departureId: overrides.departureId ? String(overrides.departureId) : "",
    province:
      overrides.province && overrides.province !== "Chưa cập nhật"
        ? overrides.province
        : "",
    name: overrides.name || "",
    address: overrides.address || "",
    pickupTime: overrides.pickupTime || "07:00",
    note: overrides.note || "",
    status: overrides.status || "active",
  };
}

function addDaysToDateInput(value, days) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildNextDepartureItem(prevItems = [], durationDays = 2) {
  const last = prevItems[prevItems.length - 1] || {};
  const nextStart = last.departureDate
    ? addDaysToDateInput(last.departureDate, 7)
    : "";
  const safeDuration = Math.max(Number(durationDays || 1), 1);
  return createDepartureItem({
    departureDate: nextStart,
    endDate: nextStart ? addDaysToDateInput(nextStart, safeDuration - 1) : "",
    adultPrice: last.adultPrice || 3990000,
    childPrice: last.childPrice || 2790000,
    totalSlots: last.totalSlots || 20,
    status: last.status || "open",
  });
}
function createAccommodationItem() {
  return {
    name: "",
    accommodationType: "hotel",
    starRating: 4,
    address: "",
    description: "",
    pricePerNight: 1200000,
    imageUrl: "",
    amenities: "",
    status: "active",
  };
}
function createTransportItem() {
  return {
    name: "",
    transportType: "flight",
    provider: "",
    origin: "",
    destinationLabel: "",
    durationHours: 1.5,
    price: 1500000,
    description: "",
    imageUrl: "",
    status: "active",
  };
}
function buildDefaultItineraryByDuration(days = 1, current = []) {
  const totalDays = Math.max(Number(days || 1), 1);
  const next = [];
  for (let day = 1; day <= totalDays; day += 1) {
    const existing = current.filter((item) => Number(item.dayNumber) === day);
    if (existing.length) {
      next.push(
        ...existing.map((item, index) => ({
          ...item,
          dayNumber: day,
          itemOrder: index + 1,
        })),
      );
    } else {
      next.push({
        dayNumber: day,
        itemOrder: 1,
        title:
          day === 1
            ? `Ngày ${day}: Khởi hành và tham quan`
            : day === totalDays
              ? `Ngày ${day}: Kết thúc hành trình`
              : `Ngày ${day}: Lịch trình ngày ${day}`,
        description: "",
        locationName: "",
      });
    }
  }
  return next;
}

function buildQuery(filters) {
  const qs = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      qs.set(key, String(value));
  });
  return qs.toString();
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

function AdminSortControls({ value, onChange, options }) {
  return (
    <>
      <select
        value={value.sortBy}
        onChange={(e) =>
          onChange({ ...value, sortBy: e.target.value, page: 1 })
        }
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        value={value.sortOrder}
        onChange={(e) =>
          onChange({ ...value, sortOrder: e.target.value, page: 1 })
        }
      >
        <option value="desc">Giảm dần</option>
        <option value="asc">Tăng dần</option>
      </select>
    </>
  );
}

export default function AdminPage({ initialTab = "overview" }) {
  const { showToast } = useToast();
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [overview, setOverview] = useState(null);
  const [bookingsData, setBookingsData] = useState(emptyPage);
  const [reviewsData, setReviewsData] = useState(emptyPage);
  const [contactsData, setContactsData] = useState(emptyPage);
  const [destinations, setDestinations] = useState([]);
  const [destinationsData, setDestinationsData] = useState(emptyPage);
  const [allTours, setAllTours] = useState([]);
  const [bookingFilters, setBookingFilters] = useState(initialBookingFilter);
  const [reviewFilters, setReviewFilters] = useState(initialReviewFilter);
  const [contactFilters, setContactFilters] = useState(initialContactFilter);
  const [tourFilters, setTourFilters] = useState(initialTourFilter);
  const [destinationFilters, setDestinationFilters] = useState(
    initialDestinationFilter,
  );
  const [destinationModalOpen, setDestinationModalOpen] = useState(false);
  const [destinationForm, setDestinationForm] = useState(
    initialDestinationForm,
  );
  const [bookingDetailOpen, setBookingDetailOpen] = useState(false);
  const [bookingDetail, setBookingDetail] = useState(null);
  const [bookingPickupForm, setBookingPickupForm] = useState({
    pickupPointId: "",
  });
  const [contactDetailOpen, setContactDetailOpen] = useState(false);
  const [contactDetail, setContactDetail] = useState(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyForm, setReplyForm] = useState(initialReplyForm);
  const [reviewReplyOpen, setReviewReplyOpen] = useState(false);
  const [reviewReplyForm, setReviewReplyForm] = useState(initialReviewReply);
  const [tourModalOpen, setTourModalOpen] = useState(false);
  const [tourStep, setTourStep] = useState(1);
  const [tourForm, setTourForm] = useState(initialTourForm);
  const [tourItinerary, setTourItinerary] = useState(
    buildDefaultItineraryByDuration(3),
  );
  const [tourDepartures, setTourDepartures] = useState([createDepartureItem()]);
  const [tourPickupPoints, setTourPickupPoints] = useState([
    createPickupPointItem(),
  ]);
  const [tourAccommodations, setTourAccommodations] = useState([
    createAccommodationItem(),
  ]);
  const [tourTransports, setTourTransports] = useState([createTransportItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [isTourMediaDragging, setIsTourMediaDragging] = useState(false);
  const [exportingKey, setExportingKey] = useState("");
  const [dashboardTab, setDashboardTab] = useState("overview");
  const [tourDraftCreated, setTourDraftCreated] = useState(false);

  useEffect(() => setActiveTab(initialTab), [initialTab]);
  useEffect(() => {
    Promise.all([
      loadOverview(),
      loadBookings(initialBookingFilter),
      loadReviews(initialReviewFilter),
      loadContacts(initialContactFilter),
      loadDestinationsPage(initialDestinationFilter),
      loadTours(),
    ])
      .catch((error) => showToast(error.message, "error"))
      .finally(() => setBooting(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tourModalOpen) return;
    setTourItinerary((prev) =>
      buildDefaultItineraryByDuration(tourForm.durationDays, prev),
    );
  }, [tourForm.durationDays, tourModalOpen]);

  async function loadOverview() {
    const data = await apiFetch("/admin/dashboard/overview");
    setOverview(data);
  }
  async function loadBookings(filters = bookingFilters) {
    setBookingsData(await apiFetch(`/admin/bookings?${buildQuery(filters)}`));
  }
  async function loadReviews(filters = reviewFilters) {
    const query = { ...filters };
    const selectedTourId = String(query.tourId || "");

    // Nếu lọc theo tour mà backend cũ chưa hỗ trợ tourId,
    // frontend sẽ lấy nhiều đánh giá hơn rồi tự lọc + phân trang lại.
    if (selectedTourId) {
      query.page = 1;
      query.pageSize = 1000;
      delete query.tourId;
    }

    const result = await apiFetch(`/admin/reviews?${buildQuery(query)}`);

    if (!selectedTourId) {
      setReviewsData(result || emptyPage);
      return;
    }

    const filtered = (result?.items || []).filter(
      (item) => String(item?.tour?.id || item?.tourId || "") === selectedTourId,
    );
    const page = Math.max(Number(filters.page || 1), 1);
    const pageSize = Math.max(Number(filters.pageSize || 10), 1);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    setReviewsData({
      items: filtered.slice(start, start + pageSize),
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
    });
  }
  async function loadContacts(filters = contactFilters) {
    setContactsData(await apiFetch(`/admin/contacts?${buildQuery(filters)}`));
  }
  async function loadDestinationsPage(filters = destinationFilters) {
    setDestinationsData(
      await apiFetch(`/admin/destinations?${buildQuery(filters)}`),
    );
  }
  async function loadTours() {
    const [destinationData, toursData] = await Promise.all([
      apiFetch("/destinations"),
      apiFetch(
        `/admin/tours?${buildQuery({ page: 1, pageSize: 1000, sortBy: tourFilters.sortBy, sortOrder: tourFilters.sortOrder })}`,
      ),
    ]);
    setDestinations(destinationData || []);
    setAllTours(toursData?.items || toursData || []);
  }

  useEffect(() => {
    if (!booting)
      loadBookings(bookingFilters).catch((e) => showToast(e.message, "error"));
  }, [
    bookingFilters.page,
    bookingFilters.search,
    bookingFilters.status,
    bookingFilters.paymentStatus,
    bookingFilters.destinationId,
    bookingFilters.departureFrom,
    bookingFilters.departureTo,
    bookingFilters.guideStatus,
    bookingFilters.urgency,
    bookingFilters.sortBy,
    bookingFilters.sortOrder,
  ]);
  useEffect(() => {
    if (!booting)
      loadReviews(reviewFilters).catch((e) => showToast(e.message, "error"));
  }, [
    reviewFilters.page,
    reviewFilters.search,
    reviewFilters.tourId,
    reviewFilters.sortBy,
    reviewFilters.sortOrder,
  ]);
  useEffect(() => {
    if (!booting)
      loadContacts(contactFilters).catch((e) => showToast(e.message, "error"));
  }, [
    contactFilters.page,
    contactFilters.search,
    contactFilters.status,
    contactFilters.sortBy,
    contactFilters.sortOrder,
  ]);
  useEffect(() => {
    if (!booting) {
      loadDestinationsPage(destinationFilters).catch((e) =>
        showToast(e.message, "error"),
      );
    }
  }, [
    destinationFilters.page,
    destinationFilters.search,
    destinationFilters.status,
    destinationFilters.sortBy,
    destinationFilters.sortOrder,
  ]);

  useEffect(() => {
    if (!booting) loadTours().catch((e) => showToast(e.message, "error"));
  }, [tourFilters.sortBy, tourFilters.sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleTours = useMemo(() => {
    const keyword = normalizeSearchText(tourFilters.search);

    const filtered = (allTours || []).filter((item) => {
      const target = normalizeSearchText(
        [
          item.code,
          item.name,
          item.slug,
          item.destination?.name,
          item.destination?.province,
          item.shortDescription,
        ]
          .filter(Boolean)
          .join(" "),
      );

      const matchKeyword = !keyword || target.includes(keyword);

      const matchDestination =
        !tourFilters.destinationId ||
        String(item.destinationId) === String(tourFilters.destinationId);

      return matchKeyword && matchDestination;
    });

    const dir = tourFilters.sortOrder === "asc" ? 1 : -1;
    const getValue = (item) => {
      if (tourFilters.sortBy === "name") return item.name || "";
      if (tourFilters.sortBy === "basePriceAdult")
        return Number(item.basePriceAdult || 0);
      if (tourFilters.sortBy === "hotelStars")
        return Number(item.hotelStars || 0);
      if (tourFilters.sortBy === "durationDays")
        return Number(item.durationDays || 0);
      if (tourFilters.sortBy === "status") return item.status || "";
      return new Date(item.createdAt || 0).getTime();
    };

    return [...filtered].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "vi") * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
  }, [allTours, tourFilters]);

  const toursPage = useMemo(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(visibleTours.length / Number(tourFilters.pageSize || 8)),
    );
    const safePage = Math.min(
      Math.max(Number(tourFilters.page || 1), 1),
      totalPages,
    );
    return {
      items: visibleTours.slice(
        (safePage - 1) * tourFilters.pageSize,
        safePage * tourFilters.pageSize,
      ),
      pagination: {
        page: safePage,
        pageSize: tourFilters.pageSize,
        total: visibleTours.length,
        totalPages,
      },
    };
  }, [visibleTours, tourFilters.page, tourFilters.pageSize]);

  const summaryCards = overview
    ? [
        {
          label: "Tổng Tour",
          value: formatNumber(overview.summary?.totalTours || 0),
          sub: `${formatNumber(overview.summary?.publishedTours || 0)} tour đang bán`,
        },
        {
          label: "Tổng Booking",
          value: formatNumber(overview.summary?.totalBookings || 0),
          sub: `${formatNumber(overview.summary?.pendingBookings || 0)} chờ xử lý`,
        },
        {
          label: "Doanh thu",
          value: formatCurrency(overview.summary?.totalRevenue || 0),
          sub: `${overview.summary?.paymentSuccessRate || 0}% thanh toán thành công`,
        },
        {
          label: "Liên hệ mới",
          value: formatNumber(overview.summary?.newContacts || 0),
          sub: `Trong tổng số ${formatNumber(overview.summary?.totalContacts || 0)}`,
        },
      ]
    : [];

  const tourStatusChart = useMemo(() => {
    const map = {};
    (allTours || []).forEach((tour) => {
      const key = tour.status || "unknown";
      map[key] = (map[key] || 0) + 1;
    });

    return Object.entries(map).map(([status, total]) => ({ status, total }));
  }, [allTours]);

  const tourThemeChart = useMemo(() => {
    const map = {};
    (allTours || []).forEach((tour) => {
      const key = tour.tourTheme || "other";
      map[key] = (map[key] || 0) + 1;
    });

    return Object.entries(map)
      .map(([theme, total]) => ({ theme, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [allTours]);

  const tourDestinationChart = useMemo(() => {
    const map = {};
    (allTours || []).forEach((tour) => {
      const key = tour.destination?.name || "Khác";
      map[key] = (map[key] || 0) + 1;
    });

    return Object.entries(map)
      .map(([destination, total]) => ({ destination, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [allTours]);

  const tourPriceRangeChart = useMemo(() => {
    const ranges = {
      "Dưới 3 triệu": 0,
      "3 - 5 triệu": 0,
      "5 - 8 triệu": 0,
      "Trên 8 triệu": 0,
    };

    (allTours || []).forEach((tour) => {
      const price = Number(tour.basePriceAdult || 0);

      if (price < 3000000) ranges["Dưới 3 triệu"] += 1;
      else if (price < 5000000) ranges["3 - 5 triệu"] += 1;
      else if (price < 8000000) ranges["5 - 8 triệu"] += 1;
      else ranges["Trên 8 triệu"] += 1;
    });

    return Object.entries(ranges).map(([range, total]) => ({ range, total }));
  }, [allTours]);

  const reviewRatingChart = useMemo(() => {
    const map = {
      "5 sao": 0,
      "4 sao": 0,
      "3 sao": 0,
      "2 sao": 0,
      "1 sao": 0,
    };

    (reviewsData.items || []).forEach((review) => {
      const rating = Number(review.rating || 0);
      const key = `${rating} sao`;
      if (map[key] !== undefined) map[key] += 1;
    });

    return Object.entries(map)
      .map(([rating, total]) => ({ rating, total }))
      .filter((item) => item.total > 0);
  }, [reviewsData.items]);

  const contactStatusChart = useMemo(() => {
    const map = {};
    (contactsData.items || []).forEach((contact) => {
      const key = contact.status || "unknown";
      map[key] = (map[key] || 0) + 1;
    });

    return Object.entries(map).map(([status, total]) => ({ status, total }));
  }, [contactsData.items]);

  const topBookingRevenueChart = useMemo(() => {
    return (overview?.recent?.bookings || [])
      .map((item) => ({
        tourName:
          item.tourName?.length > 24
            ? `${item.tourName.slice(0, 24)}...`
            : item.tourName || "Tour",
        revenue: Number(item.finalAmount || 0),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [overview]);

  const openBookingDetail = async (id) => {
    try {
      const detail = await apiFetch(`/admin/bookings/${id}`);
      setBookingDetail(detail);
      setBookingPickupForm({
        pickupPointId: detail.pickupPointId ? String(detail.pickupPointId) : "",
      });
      setBookingDetailOpen(true);
    } catch (error) {
      showToast(error.message, "error");
    }
  };
  const confirmPayment = async (paymentId) => {
    try {
      await apiFetch(`/payments/manual-confirm/${paymentId}`, {
        method: "POST",
      });
      showToast("Đã duyệt chuyển khoản và cập nhật email xác nhận.", "success");
      if (bookingDetail?.id) {
        const detail = await apiFetch(`/admin/bookings/${bookingDetail.id}`);
        setBookingDetail(detail);
      }
      await Promise.all([loadBookings(bookingFilters), loadOverview()]);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const updateBookingPickup = async () => {
    if (!bookingDetail?.id) return;
    if (!bookingPickupForm.pickupPointId) {
      showToast("Vui lòng chọn điểm đón mới.", "error");
      return;
    }

    try {
      const detail = await apiFetch(`/admin/bookings/${bookingDetail.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          pickupPointId: Number(bookingPickupForm.pickupPointId),
        }),
      });
      setBookingDetail(detail);
      setBookingPickupForm({
        pickupPointId: detail.pickupPointId ? String(detail.pickupPointId) : "",
      });
      showToast("Đã cập nhật điểm đón cho booking.", "success");
      await loadBookings(bookingFilters);
    } catch (error) {
      showToast(error.message, "error");
    }
  };
  const openContactDetail = async (id) => {
    try {
      setContactDetail(await apiFetch(`/admin/contacts/${id}`));
      setContactDetailOpen(true);
    } catch (error) {
      showToast(error.message, "error");
    }
  };
  const openReplyModal = (item) => {
    setReplyForm({
      contactId: String(item.id),
      subject: item.subject
        ? `Phản hồi: ${item.subject}`
        : "Phản hồi từ Travela",
      replyMessage: item.adminReply || "",
      status: item.status === "resolved" ? "resolved" : "replied",
      sendEmail: true,
    });
    setReplyOpen(true);
  };
  const submitReply = async () => {
    setSubmitting(true);
    try {
      const { contactId, ...replyPayload } = replyForm;
      const result = await apiFetch(`/admin/contacts/${contactId}/reply`, {
        method: "POST",
        body: JSON.stringify(replyPayload),
      });
      showToast(
        result.message || "Đã phản hồi liên hệ.",
        result.email?.sent ? "success" : "error",
      );
      setReplyOpen(false);
      setReplyForm(initialReplyForm);
      await Promise.all([loadContacts(), loadOverview()]);
      if (contactDetailOpen && replyForm.contactId)
        setContactDetail(
          await apiFetch(`/admin/contacts/${replyForm.contactId}`),
        );
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };
  const openReviewReply = (item) => {
    setReviewReplyForm({
      id: String(item.id),
      status: item.status || "approved",
      adminReply: item.adminReply || "",
      comment: item.comment || "",
    });
    setReviewReplyOpen(true);
  };
  const submitReviewReply = async () => {
    setSubmitting(true);
    try {
      await apiFetch(`/admin/reviews/${reviewReplyForm.id}/reply`, {
        method: "PATCH",
        body: JSON.stringify({ adminReply: reviewReplyForm.adminReply }),
      });
      showToast("Đã lưu phản hồi đánh giá và hiển thị ở tour.", "success");
      setReviewReplyOpen(false);
      setReviewReplyForm(initialReviewReply);
      await Promise.all([loadReviews(), loadOverview()]);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };
  const deleteReview = async (id) => {
    if (!window.confirm("Xóa đánh giá này?")) return;
    try {
      await apiFetch(`/admin/reviews/${id}`, { method: "DELETE" });
      showToast("Đã xóa đánh giá.", "success");
      await Promise.all([loadReviews(), loadOverview()]);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const openDestinationModal = (item = null) => {
    if (!item) {
      setDestinationForm(initialDestinationForm);
      setDestinationModalOpen(true);
      return;
    }

    setDestinationForm({
      id: String(item.id || ""),
      name: item.name || "",
      province: item.province || "",
      country: item.country || "Vietnam",
      description: item.description || "",
      coverImage: item.coverImage || "",
      coverImageFile: null,
      coverImagePreview: item.coverImage || "",
      status: item.status || "active",
    });
    setDestinationModalOpen(true);
  };

  const saveDestination = async () => {
    if (!destinationForm.name.trim() || !destinationForm.province.trim()) {
      showToast("Cần nhập tên điểm đến và tỉnh/thành.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", destinationForm.name.trim());
      formData.append("province", destinationForm.province.trim());
      formData.append("country", destinationForm.country.trim() || "Vietnam");
      formData.append("description", destinationForm.description.trim() || "");
      formData.append("status", destinationForm.status || "active");
      formData.append("coverImage", destinationForm.coverImage?.trim() || "");
      if (destinationForm.coverImageFile) {
        formData.append("coverImageFile", destinationForm.coverImageFile);
      }

      if (destinationForm.id) {
        await apiFetch(`/admin/destinations/${destinationForm.id}`, {
          method: "PATCH",
          body: formData,
        });
        showToast("Đã cập nhật điểm đến.", "success");
      } else {
        await apiFetch("/admin/destinations", {
          method: "POST",
          body: formData,
        });
        showToast("Đã thêm điểm đến.", "success");
      }

      setDestinationModalOpen(false);
      setDestinationForm(initialDestinationForm);
      await Promise.all([loadDestinationsPage(), loadTours(), loadOverview()]);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const removeDestination = async (item) => {
    if (Number(item.bookingCount || 0) > 0) {
      showToast(
        `Không thể xóa vì đã có ${item.bookingCount} booking thuộc điểm đến này. Hãy chuyển sang Tạm ẩn.`,
        "error",
      );
      return;
    }

    if (Number(item.tourCount || 0) > 0) {
      showToast(
        `Không thể xóa vì đang có ${item.tourCount} tour sử dụng điểm đến này. Hãy đổi tour sang điểm đến khác hoặc Tạm ẩn.`,
        "error",
      );
      return;
    }

    if (!window.confirm(`Xóa điểm đến "${item.name}"?`)) return;

    try {
      await apiFetch(`/admin/destinations/${item.id}`, { method: "DELETE" });
      showToast("Đã xóa điểm đến.", "success");
      await Promise.all([loadDestinationsPage(), loadTours(), loadOverview()]);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const toggleDestinationStatus = async (item) => {
    const nextStatus = item.status === "active" ? "inactive" : "active";

    try {
      await apiFetch(`/admin/destinations/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: item.name,
          province: item.province,
          country: item.country || "Vietnam",
          description: item.description || undefined,
          coverImage: item.coverImage || undefined,
          status: nextStatus,
        }),
      });
      showToast(
        nextStatus === "active"
          ? "Đã bật lại điểm đến."
          : "Đã tạm ẩn điểm đến.",
        "success",
      );
      await Promise.all([loadDestinationsPage(), loadTours()]);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const openTourWizard = async (id) => {
    if (!id) {
      setTourDraftCreated(false);
      setTourForm(initialTourForm);
      setTourItinerary(buildDefaultItineraryByDuration(3));
      setTourDepartures([createDepartureItem()]);
      setTourPickupPoints([createPickupPointItem()]);
      setTourAccommodations([createAccommodationItem()]);
      setTourTransports([createTransportItem()]);
      setTourStep(1);
      setTourModalOpen(true);
      return;
    }
    try {
      setTourDraftCreated(false);
      const detail = await apiFetch(`/admin/tours/${id}`);
      setTourForm({
        id: String(detail.id),
        code: detail.code || "",
        name: detail.name || "",
        slug: detail.slug || "",
        destinationId: String(
          detail.destinationId || detail.destination?.id || "",
        ),
        tourType: detail.tourType || "group",
        tourTheme: detail.tourTheme || "beach",
        durationDays: Number(detail.durationDays || 3),
        durationNights: Number(detail.durationNights || 2),
        hotelStars: Number(detail.hotelStars || 4),
        basePriceAdult: Number(detail.basePriceAdult || 0),
        basePriceChild: Number(detail.basePriceChild || 0),
        maxCapacityDefault: Number(detail.maxCapacityDefault || 25),
        shortDescription: detail.shortDescription || "",
        fullDescription: detail.fullDescription || "",
        isTrending: Boolean(detail.isTrending),
        isBestDeal: Boolean(detail.isBestDeal),
        media: detail.media || [],
      });
      setTourItinerary(
        buildDefaultItineraryByDuration(
          detail.durationDays || 3,
          detail.itinerary || [],
        ),
      );
      setTourDepartures(
        detail.departures?.length
          ? detail.departures.map((item) => ({
              ...item,
              id: String(item.id || ""),
              departureDate: String(item.departureDate || "").slice(0, 10),
              endDate: String(item.endDate || "").slice(0, 10),
            }))
          : [createDepartureItem()],
      );
      const rootPickupPoints = Array.isArray(detail.pickupPoints)
        ? detail.pickupPoints
        : [];
      const departurePickupPoints = (detail.departures || []).flatMap((dep) =>
        (dep.pickupPoints || []).map((point) => ({
          ...point,
          departureId: point.departureId || dep.id,
        })),
      );
      const pickupMap = new Map();
      [...rootPickupPoints, ...departurePickupPoints].forEach((point) => {
        const key = String(
          point.id || `${point.name}-${point.address}-${point.pickupTime}`,
        );
        if (!pickupMap.has(key)) pickupMap.set(key, point);
      });
      const pickupItems = Array.from(pickupMap.values()).map((point) =>
        createPickupPointItem({
          ...point,
          id: String(point.id || ""),
          departureId: point.departureId ? String(point.departureId) : "",
          pickupTime: point.pickupTime
            ? String(point.pickupTime).slice(11, 16) ||
              String(point.pickupTime).slice(0, 5)
            : "07:00",
        }),
      );
      setTourPickupPoints(
        pickupItems.length ? pickupItems : [createPickupPointItem()],
      );
      setTourAccommodations(
        detail.accommodations?.length
          ? detail.accommodations
          : [createAccommodationItem()],
      );
      setTourTransports(
        detail.transports?.length ? detail.transports : [createTransportItem()],
      );
      setTourStep(1);
      setTourModalOpen(true);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const saveTourStep1 = async () => {
    if (!tourForm.name || !tourForm.destinationId) {
      return showToast("Cần nhập tên tour và điểm đến.", "error");
    }

    const firstDeparture = tourDepartures?.[0] || createDepartureItem();
    const firstAccommodation =
      tourAccommodations?.[0] || createAccommodationItem();

    const payload = {
      code: tourForm.code || undefined,
      slug: tourForm.slug || undefined,
      name: tourForm.name,
      destinationId: Number(tourForm.destinationId),
      tourType: tourForm.tourType,
      tourTheme: tourForm.tourTheme,
      durationDays: Number(tourForm.durationDays),
      durationNights: Number(tourForm.durationNights),

      // Lấy mặc định từ bước 3, không hỏi ở bước 1 nữa
      hotelStars: Number(
        firstAccommodation.starRating || tourForm.hotelStars || 4,
      ),
      basePriceAdult: Number(
        tourForm.basePriceAdult || firstDeparture.adultPrice || 0,
      ),
      basePriceChild: Number(
        tourForm.basePriceChild || firstDeparture.childPrice || 0,
      ),
      maxCapacityDefault: Number(
        firstDeparture.totalSlots || tourForm.maxCapacityDefault || 20,
      ),

      shortDescription: tourForm.shortDescription,
      fullDescription: tourForm.fullDescription,
      isTrending: Boolean(tourForm.isTrending),
      isBestDeal: Boolean(tourForm.isBestDeal),
    };

    setSubmitting(true);

    try {
      const isCreating = !tourForm.id;

      const saved = tourForm.id
        ? await apiFetch(`/admin/tours/${tourForm.id}/step1`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch(`/admin/tours/step1`, {
            method: "POST",
            body: JSON.stringify(payload),
          });

      if (isCreating) setTourDraftCreated(true);

      setTourForm((prev) => ({
        ...prev,
        id: String(saved.id),
        code: saved.code || prev.code,
        slug: saved.slug || prev.slug,
        hotelStars: payload.hotelStars,
        basePriceAdult: payload.basePriceAdult,
        basePriceChild: payload.basePriceChild,
        maxCapacityDefault: payload.maxCapacityDefault,
      }));

      showToast(
        "Đã lưu thông tin cơ bản. Vui lòng tiếp tục bước hình ảnh.",
        "success",
      );
      setTourStep(2);
      await loadTours();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDestinationImageFile = (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      showToast("Vui lòng chọn đúng file ảnh.", "error");
      return;
    }

    setDestinationForm((prev) => ({
      ...prev,
      coverImageFile: file,
      coverImage: "",
      coverImagePreview: URL.createObjectURL(file),
    }));
  };

  const clearDestinationImage = () => {
    setDestinationForm((prev) => ({
      ...prev,
      coverImage: "",
      coverImageFile: null,
      coverImagePreview: "",
    }));
  };

  const handleTourMediaDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsTourMediaDragging(false);
    uploadTourMedia(event.dataTransfer.files);
  };

  const uploadTourMedia = async (files) => {
    if (!tourForm.id || !files?.length) return;
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      await apiFetch(`/admin/tours/${tourForm.id}/media`, {
        method: "POST",
        body: formData,
      });
      showToast("Đã tải lên tệp thành công.", "success");

      const updatedTour = await apiFetch(`/admin/tours/${tourForm.id}`);
      setTourForm((prev) => ({ ...prev, media: updatedTour.media || [] }));
      await loadTours();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setUploadingMedia(false);
    }
  };

  const removeTourMedia = async (mediaId) => {
    if (!window.confirm("Xóa ảnh này khỏi hệ thống?")) return;
    try {
      await apiFetch(`/admin/tours/${tourForm.id}/media/${mediaId}`, {
        method: "DELETE",
      });
      showToast("Đã xóa ảnh.", "success");
      setTourForm((prev) => ({
        ...prev,
        media: (prev.media || []).filter((m) => m.id !== mediaId),
      }));
      await loadTours();
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const resetTourWizard = () => {
    setTourModalOpen(false);
    setTourStep(1);
    setTourForm(initialTourForm);
    setTourItinerary(buildDefaultItineraryByDuration(3));
    setTourDepartures([createDepartureItem()]);
    setTourPickupPoints([createPickupPointItem()]);
    setTourAccommodations([createAccommodationItem()]);
    setTourTransports([createTransportItem()]);
    setTourDraftCreated(false);
  };

  const closeTourWizard = async () => {
    if (submitting || uploadingMedia) return;

    if (tourDraftCreated && tourForm.id) {
      const ok = window.confirm(
        "Tour này mới lưu bước 1 nhưng chưa hoàn tất. Bạn muốn hủy bản nháp này không?",
      );
      if (!ok) return;

      try {
        await apiFetch(`/admin/tours/${tourForm.id}`, { method: "DELETE" });
        showToast("Đã hủy bản nháp tour.", "success");
        await loadTours();
      } catch (error) {
        showToast(error.message, "error");
        return;
      }
    }

    resetTourWizard();
  };

  const saveTourFinal = async () => {
    if (!tourForm.id) return showToast("Bạn cần lưu bước 1 trước.", "error");
    setSubmitting(true);
    try {
      const firstDeparture = tourDepartures?.[0] || createDepartureItem();
      const firstAccommodation =
        tourAccommodations?.[0] || createAccommodationItem();

      await apiFetch(`/admin/tours/${tourForm.id}/step1`, {
        method: "PATCH",
        body: JSON.stringify({
          code: tourForm.code || undefined,
          slug: tourForm.slug || undefined,
          name: tourForm.name,
          destinationId: Number(tourForm.destinationId),
          tourType: tourForm.tourType,
          tourTheme: tourForm.tourTheme,
          durationDays: Number(tourForm.durationDays),
          durationNights: Number(tourForm.durationNights),
          hotelStars: Number(firstAccommodation.starRating || 4),
          basePriceAdult: Number(
            tourForm.basePriceAdult || firstDeparture.adultPrice || 0,
          ),
          basePriceChild: Number(
            tourForm.basePriceChild || firstDeparture.childPrice || 0,
          ),
          maxCapacityDefault: Number(firstDeparture.totalSlots || 20),
          shortDescription: tourForm.shortDescription,
          fullDescription: tourForm.fullDescription,
          isTrending: Boolean(tourForm.isTrending),
          isBestDeal: Boolean(tourForm.isBestDeal),
        }),
      });
      await Promise.all([
        apiFetch(`/admin/tours/${tourForm.id}/itinerary`, {
          method: "POST",
          body: JSON.stringify({
            items: tourItinerary.map((item, index) => ({
              dayNumber: Number(item.dayNumber),
              itemOrder: index + 1,
              title: item.title,
              description: item.description || undefined,
              locationName: item.locationName || undefined,
            })),
          }),
        }),

        apiFetch(`/admin/tours/${tourForm.id}/departures`, {
          method: "POST",
          body: JSON.stringify({
            items: tourDepartures.map((item) => ({
              id: item.id || undefined,
              departureDate: item.departureDate,
              endDate: item.endDate,
              adultPrice: Number(item.adultPrice),
              childPrice: Number(item.childPrice),
              totalSlots: Number(item.totalSlots),
              status: item.status || "open",
            })),
          }),
        }),

        apiFetch(`/admin/tours/${tourForm.id}/pickup-points`, {
          method: "POST",
          body: JSON.stringify({
            items: tourPickupPoints
              .filter((item) => item.name?.trim() && item.address?.trim())
              .map((item) => ({
                id: item.id || undefined,
                departureId: item.departureId
                  ? Number(item.departureId)
                  : undefined,
                province: item.province?.trim() || undefined,
                name: item.name.trim(),
                address: item.address.trim(),
                pickupTime: item.pickupTime || "07:00",
                note: item.note || undefined,
                status: item.status || "active",
              })),
          }),
        }),

        apiFetch(`/admin/tours/${tourForm.id}/accommodations`, {
          method: "POST",
          body: JSON.stringify({
            items: tourAccommodations.map((item) => ({
              name: item.name,
              accommodationType: item.accommodationType,
              starRating: item.starRating ? Number(item.starRating) : undefined,
              address: item.address || undefined,
              description: item.description || undefined,
              pricePerNight: item.pricePerNight
                ? Number(item.pricePerNight)
                : undefined,
              imageUrl: item.imageUrl || undefined,
              amenities: item.amenities || undefined,
              status: item.status || "active",
            })),
          }),
        }),

        apiFetch(`/admin/tours/${tourForm.id}/transports`, {
          method: "POST",
          body: JSON.stringify({
            items: tourTransports.map((item) => ({
              name: item.name,
              transportType: item.transportType,
              provider: item.provider || undefined,
              origin: item.origin || undefined,
              destinationLabel: item.destinationLabel || undefined,
              durationHours: item.durationHours
                ? Number(item.durationHours)
                : undefined,
              price: item.price ? Number(item.price) : undefined,
              description: item.description || undefined,
              imageUrl: item.imageUrl || undefined,
              status: item.status || "active",
            })),
          }),
        }),
      ]);
      showToast(
        "Đã lưu thành công lịch trình, lịch khởi hành, điểm đón, chỗ ở & xe.",
        "success",
      );
      resetTourWizard();
      await loadTours();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const publishTour = async (id) => {
    try {
      await apiFetch(`/admin/tours/${id}/publish`, { method: "PATCH" });
      showToast("Đã xuất bản tour.", "success");
      await loadTours();
    } catch (error) {
      showToast(error.message, "error");
    }
  };
  const removeTour = async (id) => {
    if (!window.confirm("Xóa tour này vĩnh viễn?")) return;
    try {
      await apiFetch(`/admin/tours/${id}`, { method: "DELETE" });
      showToast("Đã xóa tour.", "success");
      await loadTours();
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const runExport = async (key, exporter) => {
    setExportingKey(key);
    try {
      await exporter();
      showToast("Đã xuất file Excel thành công.", "success");
    } catch (error) {
      showToast(error.message || "Không thể xuất Excel.", "error");
    } finally {
      setExportingKey("");
    }
  };

  if (booting) return <Loading text="Đang tải hệ thống quản trị..." />;

  const currentTabName =
    adminTabs.find((item) => item.key === activeTab)?.label || "Dashboard";

  return (
    <AdminLayout
      current={`/admin${activeTab === "overview" ? "" : `/${activeTab}`}`}
      title={currentTabName}
    >
      {/* INJECTED CSS ĐỂ NÂNG CẤP UI KHÔNG CẦN SỬA FILE CSS GỐC */}
      <style>{`
        .admin-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
          padding: 24px;
        }
        .console-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
        }
        .metric-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 24px;
        }
        .metric-card span { color: #64748b; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .metric-card strong { color: #0f172a; font-size: 32px; font-weight: 800; line-height: 1; }
        .metric-card small { color: #10b981; font-size: 13px; font-weight: 500; }
        
        .segment-control {
          display: inline-flex;
          background: #f1f5f9;
          padding: 6px;
          border-radius: 12px;
          gap: 4px;
        }
        .segment-btn {
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .segment-btn.active {
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .table-wrap {
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          overflow-x: auto;
        }
        .console-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .console-table th {
          background: #f8fafc;
          padding: 14px 20px;
          text-align: left;
          color: #475569;
          font-weight: 600;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }
        .console-table td {
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
          color: #0f172a;
          vertical-align: middle;
        }
        .console-table tbody tr:hover { background: #f8fafc; }
        .table-muted { color: #64748b; font-size: 13px; margin-top: 4px; }
        
        .table-search-row input, .table-search-row select, .field input, .field select, .field textarea {
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          font-size: 14px;
          color: #0f172a;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          width: 100%;
          background: #ffffff;
        }
        .table-search-row input:focus, .table-search-row select:focus, .field input:focus, .field select:focus, .field textarea:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .table-search-row { display: flex; gap: 12px; }
        
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 18px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          gap: 8px;
        }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-primary { background: #3b82f6; color: white; box-shadow: 0 2px 4px rgba(59,130,246,0.3); }
        .btn-primary:hover:not(:disabled) { background: #2563eb; }
        .btn-light { background: #f1f5f9; color: #334155; }
        .btn-light:hover:not(:disabled) { background: #e2e8f0; }
        .btn-danger { background: #fee2e2; color: #b91c1c; }
        .btn-danger:hover:not(:disabled) { background: #fecaca; }
        .btn-sm { padding: 6px 12px; font-size: 13px; }
        
        .tour-admin-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }
        .tour-admin-card {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
          display: flex;
          flex-direction: column;
        }
        .tour-admin-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px -8px rgba(0,0,0,0.1);
        }
        .tour-admin-cover {
          height: 180px;
          background-size: cover;
          background-position: center;
          border-bottom: 1px solid #e2e8f0;
        }
        .tour-admin-body { padding: 20px; display: flex; flex-direction: column; flex: 1; }
        .tour-admin-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
        .tour-admin-head strong { display: block; font-size: 16px; color: #0f172a; margin-bottom: 4px; line-height: 1.4; }
        .tour-admin-head span { color: #64748b; font-size: 13px; }
        .tour-admin-body p { color: #475569; font-size: 14px; margin: 0 0 16px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .tour-admin-meta { display: flex; gap: 12px; color: #0f172a; font-size: 13px; font-weight: 600; margin-top: auto; padding-top: 16px; border-top: 1px solid #f1f5f9; }
        
        .modal-form-grid { display: grid; gap: 20px; }
        .modal-form-grid.two-col { grid-template-columns: 1fr 1fr; }
        .field { display: flex; flex-direction: column; gap: 8px; }
        .field.span-2 { grid-column: span 2; }
        .field label { font-weight: 600; font-size: 13px; color: #334155; }
        
        .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
        .detail-card { background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; }
        .detail-card h4 { margin: 0 0 16px 0; color: #0f172a; font-size: 15px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
        .detail-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
        .detail-list li { display: flex; justify-content: space-between; font-size: 14px; }
        .detail-list li span { color: #64748b; }
        .detail-list li strong { color: #0f172a; text-align: right; max-width: 60%; }
      `}</style>

      {activeTab === "overview" && (
        <>
          <section className="console-metrics" style={{ marginBottom: 24 }}>
            {summaryCards.map((item) => (
              <article key={item.label} className="admin-card metric-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.sub}</small>
              </article>
            ))}
          </section>

          <div
            style={{
              marginBottom: 18,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <AdminReportButton type="overview" label="Xuất báo cáo Dashboard" />
            <AdminReportButton type="bookings" label="Xuất báo cáo Booking" />
            <AdminReportButton type="tours" label="Xuất báo cáo Tour" />
            <AdminReportButton type="users" label="Xuất báo cáo Người dùng" />
          </div>

          {overview?.smartInsights && (
            <div style={{ marginBottom: 24 }}>
              <AdminInsightPanel insights={overview.smartInsights} />
            </div>
          )}

          <div
            style={{
              marginBottom: 24,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div className="segment-control">
              {[
                ["overview", "Tổng quan"],
                ["revenue", "Doanh thu"],
                ["bookings", "Đơn hàng"],
                ["users", "Khách hàng"],
                ["refunds", "Hoàn tiền"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`segment-btn ${dashboardTab === key ? "active" : ""}`}
                  onClick={() => setDashboardTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {dashboardTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: 24,
                }}
              >
                <MiniBarChart
                  title="Đơn Booking"
                  items={overview?.charts?.bookingsByStatus || []}
                  formatter={(value) => mapLabel("bookingStatus", value)}
                />

                <MiniBarChart
                  title="Giao dịch thanh toán"
                  items={overview?.charts?.paymentsByStatus || []}
                  formatter={(value) => mapLabel("paymentStatus", value)}
                />

                <MiniDonutChart
                  title="Hạng khách hàng"
                  description="Tỷ lệ khách theo từng cấp thành viên."
                  items={overview?.charts?.usersByTier || []}
                  labelKey="tier"
                  valueKey="total"
                  formatter={(value) => mapLabel("memberTier", value)}
                />
              </section>

              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: 24,
                }}
              >
                <MiniBarChart
                  title="Tour theo điểm đến"
                  items={tourDestinationChart}
                  labelKey="destination"
                  valueKey="total"
                />

                <MiniDonutChart
                  title="Chủ đề tour"
                  description="Phân bổ tour theo loại hình du lịch."
                  items={tourThemeChart}
                  labelKey="theme"
                  valueKey="total"
                  formatter={(value) => String(value).toUpperCase()}
                />

                <MiniBarChart
                  title="Trạng thái tour"
                  items={tourStatusChart}
                  labelKey="status"
                  valueKey="total"
                  formatter={(value) => mapLabel("tourStatus", value)}
                />
              </section>

              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: 24,
                }}
              >
                <MiniBarChart
                  title="Khoảng giá tour"
                  items={tourPriceRangeChart}
                  labelKey="range"
                  valueKey="total"
                />

                <MiniBarChart
                  title="Điểm đánh giá"
                  items={reviewRatingChart}
                  labelKey="rating"
                  valueKey="total"
                />

                <MiniBarChart
                  title="Trạng thái liên hệ"
                  items={contactStatusChart}
                  labelKey="status"
                  valueKey="total"
                  formatter={(value) => mapLabel("contactStatus", value)}
                />
              </section>

              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
                  gap: 24,
                }}
              >
                <MiniBarChart
                  title="Top booking gần đây theo doanh thu"
                  items={topBookingRevenueChart}
                  labelKey="tourName"
                  valueKey="revenue"
                  formatter={(value) => value}
                  valueFormatter={(value) => formatCurrency(value)}
                />

                <MiniLineChart
                  title="Doanh thu 6 tháng qua"
                  items={overview?.charts?.monthlyRevenue || []}
                />
              </section>
            </div>
          )}
          {dashboardTab === "revenue" && (
            <section style={{ marginBottom: 24 }}>
              <MiniLineChart
                title="Doanh thu 6 tháng qua"
                items={overview?.charts?.monthlyRevenue || []}
              />
            </section>
          )}
          {dashboardTab === "bookings" && (
            <section className="admin-card">
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>
                  Giao dịch mới nhất
                </h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
                  Theo dõi đơn đặt tour gần đây.
                </p>
              </div>
              <div className="table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>Mã đơn</th>
                      <th>Khách hàng</th>
                      <th>Tour</th>
                      <th>Trạng thái</th>
                      <th>Tổng tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.recent?.bookings || []).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.bookingCode}</strong>
                          <div className="table-muted">
                            {formatDateTime(item.createdAt)}
                          </div>
                        </td>
                        <td>{item.contactName}</td>
                        <td>{item.tourName}</td>
                        <td>
                          <div style={{ display: "flex", gap: 8 }}>
                            <StatusBadge
                              tone={toneForBooking(item.bookingStatus)}
                            >
                              {mapLabel("bookingStatus", item.bookingStatus)}
                            </StatusBadge>
                            {item.paymentStatus ? (
                              <StatusBadge
                                tone={toneForPayment(item.paymentStatus)}
                              >
                                {mapLabel("paymentStatus", item.paymentStatus)}
                              </StatusBadge>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <strong>{formatCurrency(item.finalAmount)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {dashboardTab === "users" && (
            <section className="admin-card">
              <h2 style={{ margin: "0 0 20px", fontSize: 18 }}>
                Khách hàng mới
              </h2>
              <div className="table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>Khách hàng</th>
                      <th>Email</th>
                      <th>Điện thoại</th>
                      <th>Hạng</th>
                      <th>Ngày tham gia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.recent?.users || []).map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.fullName}</strong>
                        </td>
                        <td>{u.email}</td>
                        <td>{u.phone || "—"}</td>
                        <td>
                          <StatusBadge>
                            {mapLabel("memberTier", u.memberTier)}
                          </StatusBadge>
                        </td>
                        <td>{formatDate(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {dashboardTab === "refunds" && (
            <section className="admin-card">
              <h2 style={{ margin: "0 0 20px", fontSize: 18 }}>
                Yêu cầu hoàn tiền
              </h2>
              <div className="table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>Mã Đơn</th>
                      <th>Tour</th>
                      <th>Khách yêu cầu</th>
                      <th>Số tiền</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.recent?.refunds || []).map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.bookingCode}</strong>
                        </td>
                        <td>{r.tourName}</td>
                        <td>{r.userName}</td>
                        <td>
                          <strong>{formatCurrency(r.refundAmount)}</strong>
                        </td>
                        <td>
                          <StatusBadge
                            tone={
                              r.status === "approved"
                                ? "success"
                                : r.status === "pending"
                                  ? "warning"
                                  : "danger"
                            }
                          >
                            {mapLabel("refundStatus", r.status)}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {activeTab === "bookings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {[
              {
                label: "Cần xử lý ngay",
                value: bookingsData.intelligence?.highPriority || 0,
                note: "Booking ưu tiên cao",
                tone: "danger",
              },
              {
                label: "Sắp khởi hành",
                value: bookingsData.intelligence?.upcoming || 0,
                note: "Trong 7 ngày tới",
                tone: "warning",
              },
              {
                label: "Chưa có HDV",
                value: bookingsData.intelligence?.noGuide || 0,
                note: "Cần phân công hướng dẫn viên",
                tone: "danger",
              },
              {
                label: "Chờ thanh toán",
                value: bookingsData.intelligence?.waitingPayment || 0,
                note: "Theo trang hiện tại",
                tone: "warning",
              },
            ].map((card) => (
              <article
                key={card.label}
                className="admin-card"
                style={{ padding: 18, display: "grid", gap: 8 }}
              >
                <span
                  style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}
                >
                  {card.label}
                </span>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <strong style={{ fontSize: 30, color: "#0f172a" }}>
                    {formatNumber(card.value)}
                  </strong>
                  <StatusBadge tone={card.tone}>Smart</StatusBadge>
                </div>
                <span style={{ color: "#64748b", fontSize: 13 }}>
                  {card.note}
                </span>
              </article>
            ))}
          </div>

          <div className="admin-card" style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "#0f172a" }}>
                  Bộ lọc điều hành thông minh
                </h3>
                <p
                  style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}
                >
                  Lọc theo ngày khởi hành, điểm đến, thanh toán và tình trạng
                  HDV.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-light btn-sm"
                  onClick={() => setBookingFilters(initialBookingFilter)}
                >
                  Xóa lọc
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    setBookingFilters((prev) => ({
                      ...prev,
                      urgency: "high",
                      page: 1,
                    }))
                  }
                >
                  Xem đơn cần xử lý
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <input
                value={bookingFilters.search}
                onChange={(e) =>
                  setBookingFilters((prev) => ({
                    ...prev,
                    search: e.target.value,
                    page: 1,
                  }))
                }
                placeholder="Mã đơn, khách, email, SĐT..."
              />
              <select
                value={bookingFilters.status}
                onChange={(e) =>
                  setBookingFilters((prev) => ({
                    ...prev,
                    status: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả trạng thái booking</option>
                {[
                  "pending_payment",
                  "waiting_confirmation",
                  "confirmed",
                  "completed",
                  "cancelled",
                  "expired",
                ].map((item) => (
                  <option key={item} value={item}>
                    {mapLabel("bookingStatus", item)}
                  </option>
                ))}
              </select>
              <select
                value={bookingFilters.paymentStatus}
                onChange={(e) =>
                  setBookingFilters((prev) => ({
                    ...prev,
                    paymentStatus: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả thanh toán</option>
                {[
                  "pending",
                  "waiting_confirmation",
                  "paid",
                  "failed",
                  "expired",
                  "refunded",
                ].map((item) => (
                  <option key={item} value={item}>
                    {mapLabel("paymentStatus", item)}
                  </option>
                ))}
              </select>
              <select
                value={bookingFilters.destinationId}
                onChange={(e) =>
                  setBookingFilters((prev) => ({
                    ...prev,
                    destinationId: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả điểm đến</option>
                {destinations.map((dest) => (
                  <option key={dest.id} value={dest.id}>
                    {dest.name} · {dest.province}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={bookingFilters.departureFrom}
                onChange={(e) =>
                  setBookingFilters((prev) => ({
                    ...prev,
                    departureFrom: e.target.value,
                    page: 1,
                  }))
                }
              />
              <input
                type="date"
                value={bookingFilters.departureTo}
                onChange={(e) =>
                  setBookingFilters((prev) => ({
                    ...prev,
                    departureTo: e.target.value,
                    page: 1,
                  }))
                }
              />
              <select
                value={bookingFilters.guideStatus}
                onChange={(e) =>
                  setBookingFilters((prev) => ({
                    ...prev,
                    guideStatus: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả HDV</option>
                <option value="assigned">Đã có HDV</option>
                <option value="unassigned">Chưa có HDV</option>
              </select>
              <select
                value={bookingFilters.urgency}
                onChange={(e) =>
                  setBookingFilters((prev) => ({
                    ...prev,
                    urgency: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả mức ưu tiên</option>
                <option value="high">Cần xử lý ngay</option>
                <option value="upcoming">Sắp khởi hành 7 ngày</option>
                <option value="payment_review">Cần đối soát thanh toán</option>
              </select>
              <AdminSortControls
                value={bookingFilters}
                onChange={setBookingFilters}
                options={[
                  { value: "createdAt", label: "Ngày đặt" },
                  { value: "bookingCode", label: "Mã booking" },
                  { value: "contactName", label: "Tên khách" },
                  { value: "finalAmount", label: "Tổng tiền" },
                  { value: "bookingStatus", label: "Trạng thái" },
                ]}
              />
            </div>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 14,
                display: "grid",
                gap: 8,
              }}
            >
              <strong style={{ color: "#0f172a" }}>
                Gợi ý xử lý của hệ thống
              </strong>
              {(bookingsData.intelligence?.suggestions || []).map(
                (item, index) => (
                  <div key={index} style={{ color: "#475569", fontSize: 13 }}>
                    • {item}
                  </div>
                ),
              )}
            </div>
          </div>

          <div
            className="admin-card"
            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "16px",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "#0f172a" }}>
                  Danh sách booking điều hành
                </h3>
                <p
                  style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}
                >
                  Hiển thị tour, điểm đến, ngày đi/về, HDV, điểm đón và cảnh báo
                  ưu tiên.
                </p>
              </div>
              <div
                style={{ display: "flex", gap: "12px", alignItems: "center" }}
              >
                <StatusBadge>
                  {formatNumber(bookingsData.pagination.total)} đơn
                </StatusBadge>
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() =>
                    runExport("bookings", () =>
                      exportAdminSmartReport("bookings", bookingFilters),
                    )
                  }
                >
                  Xuất Excel
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>Mã đơn / Ưu tiên</th>
                    <th>Khách hàng</th>
                    <th>Tour & điểm đến</th>
                    <th>Lịch đi</th>
                    <th>HDV</th>
                    <th>Điểm đón</th>
                    <th>Thanh toán</th>
                    <th>Tổng tiền</th>
                    <th style={{ textAlign: "right" }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {bookingsData.items.map((item) => {
                    const payment = item.latestPayment || item.payments?.[0];
                    const insight = item.operationInsight || {};
                    return (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.bookingCode}</strong>
                          <div
                            style={{
                              marginTop: 6,
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <StatusBadge
                              tone={toneForPriority(insight.priorityLevel)}
                            >
                              {insight.actionLabel || "Ổn định"}
                            </StatusBadge>
                            {(insight.flags || []).slice(0, 2).map((flag) => (
                              <StatusBadge key={flag.code} tone={flag.tone}>
                                {flag.label}
                              </StatusBadge>
                            ))}
                          </div>
                        </td>
                        <td>
                          <strong>{item.contactName}</strong>
                          <div className="table-muted">{item.contactPhone}</div>
                          <div className="table-muted">{item.contactEmail}</div>
                        </td>
                        <td style={{ minWidth: 220 }}>
                          <strong>{item.tour?.name}</strong>
                          <div className="table-muted">
                            {item.tour?.destination?.name} ·{" "}
                            {item.tour?.destination?.province}
                          </div>
                        </td>
                        <td>
                          <strong>
                            {formatDate(item.departure?.departureDate)}
                          </strong>
                          <div className="table-muted">
                            Về: {formatDate(item.departure?.endDate)}
                          </div>
                          <div className="table-muted">
                            {formatDaysUntilDeparture(
                              insight.daysUntilDeparture,
                            )}
                          </div>
                          <div className="table-muted">
                            {insight.guestCount ||
                              item.adultCount + item.childCount}{" "}
                            khách
                          </div>
                        </td>
                        <td>
                          {insight.guideName ? (
                            <>
                              <strong>{insight.guideName}</strong>
                              <div className="table-muted">Đã phân công</div>
                            </>
                          ) : (
                            <StatusBadge tone="danger">Chưa có HDV</StatusBadge>
                          )}
                        </td>
                        <td style={{ maxWidth: 220 }}>
                          <strong>{item.pickupName || "Chưa chọn"}</strong>
                          <div className="table-muted">
                            {item.pickupAddress || "-"}
                          </div>
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <StatusBadge
                              tone={toneForBooking(item.bookingStatus)}
                            >
                              {mapLabel("bookingStatus", item.bookingStatus)}
                            </StatusBadge>
                            {payment && (
                              <StatusBadge
                                tone={toneForPayment(payment.paymentStatus)}
                              >
                                {mapLabel(
                                  "paymentStatus",
                                  payment.paymentStatus,
                                )}
                              </StatusBadge>
                            )}
                          </div>
                        </td>
                        <td>
                          <strong>{formatCurrency(item.finalAmount)}</strong>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={() => openBookingDetail(item.id)}
                          >
                            Chi tiết
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!bookingsData.items.length && (
                    <tr>
                      <td
                        colSpan={9}
                        style={{
                          textAlign: "center",
                          color: "#64748b",
                          padding: 24,
                        }}
                      >
                        Không có booking phù hợp bộ lọc.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={bookingsData.pagination.page}
              totalPages={bookingsData.pagination.totalPages}
              onPageChange={(page) =>
                setBookingFilters((prev) => ({ ...prev, page }))
              }
            />
          </div>
        </div>
      )}

      {activeTab === "tours" && (
        <div
          className="admin-card"
          style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div
              className="table-search-row"
              style={{ flex: 1, maxWidth: 600 }}
            >
              <input
                value={tourFilters.search}
                onChange={(e) =>
                  setTourFilters((prev) => ({
                    ...prev,
                    search: e.target.value,
                    page: 1,
                  }))
                }
                placeholder="Tìm mã tour, tên, slug..."
              />
              <select
                style={{ width: "200px" }}
                value={tourFilters.destinationId}
                onChange={(e) =>
                  setTourFilters((prev) => ({
                    ...prev,
                    destinationId: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả điểm đến</option>
                {destinations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <AdminSortControls
                value={tourFilters}
                onChange={setTourFilters}
                options={[
                  { value: "createdAt", label: "Ngày thêm" },
                  { value: "name", label: "Tên tour" },
                  { value: "basePriceAdult", label: "Giá người lớn" },
                  { value: "hotelStars", label: "Số sao KS" },
                  { value: "durationDays", label: "Số ngày" },
                  { value: "status", label: "Trạng thái" },
                ]}
              />
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                type="button"
                className="btn btn-light"
                onClick={() =>
                  runExport("tours", () => exportAdminSmartReport("tours"))
                }
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Xuất Excel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openTourWizard()}
              >
                + Thêm Tour Mới
              </button>
            </div>
          </div>

          <div className="tour-admin-grid">
            {toursPage.items.map((tour) => {
              const cover = tour.media?.[0]?.fileUrl
                ? mapImageUrl(tour.media[0].fileUrl, API_URL)
                : tour.destination?.coverImage;
              return (
                <article key={tour.id} className="tour-admin-card">
                  <div
                    className="tour-admin-cover"
                    style={{
                      backgroundImage: `url(${cover || "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80"})`,
                    }}
                  />
                  <div className="tour-admin-body">
                    <div className="tour-admin-head">
                      <div>
                        <strong>{tour.name}</strong>
                        <span>
                          {tour.code} · {tour.destination?.name}
                        </span>
                      </div>
                      <StatusBadge
                        tone={
                          tour.status === "published"
                            ? "success"
                            : tour.status === "draft"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {mapLabel("tourStatus", tour.status)}
                      </StatusBadge>
                    </div>
                    <p>{tour.shortDescription || "Chưa có mô tả ngắn..."}</p>
                    <div className="tour-admin-meta">
                      <span>
                        {tour.durationDays}N{tour.durationNights}Đ
                      </span>
                      <span style={{ color: "#3b82f6" }}>
                        {formatCurrency(tour.basePriceAdult)}
                      </span>
                      <span>{tour.hotelStars || 4}★ KS</span>
                    </div>
                    <div
                      style={{ display: "flex", gap: "8px", marginTop: "16px" }}
                    >
                      <button
                        type="button"
                        className="btn btn-light btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => openTourWizard(tour.id)}
                      >
                        Chỉnh sửa
                      </button>
                      {tour.status !== "published" && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ flex: 1 }}
                          onClick={() => publishTour(tour.id)}
                        >
                          Đăng
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => removeTour(tour.id)}
                      >
                        <svg
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <Pagination
            page={toursPage.pagination.page}
            totalPages={toursPage.pagination.totalPages}
            onPageChange={(page) =>
              setTourFilters((prev) => ({ ...prev, page }))
            }
          />
        </div>
      )}

      {activeTab === "destinations" && (
        <div
          className="admin-card"
          style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div
              className="table-search-row"
              style={{ flex: 1, maxWidth: 720 }}
            >
              <input
                value={destinationFilters.search}
                onChange={(e) =>
                  setDestinationFilters((prev) => ({
                    ...prev,
                    search: e.target.value,
                    page: 1,
                  }))
                }
                placeholder="Tìm tên điểm đến, tỉnh/thành, quốc gia..."
              />
              <select
                style={{ width: "180px" }}
                value={destinationFilters.status}
                onChange={(e) =>
                  setDestinationFilters((prev) => ({
                    ...prev,
                    status: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả trạng thái</option>
                <option value="active">Đang dùng</option>
                <option value="inactive">Tạm ẩn</option>
              </select>
              <AdminSortControls
                value={destinationFilters}
                onChange={setDestinationFilters}
                options={[
                  { value: "createdAt", label: "Ngày thêm" },
                  { value: "name", label: "Tên điểm đến" },
                  { value: "province", label: "Tỉnh/Thành" },
                  { value: "country", label: "Quốc gia" },
                  { value: "status", label: "Trạng thái" },
                ]}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <StatusBadge>
                {formatNumber(destinationsData.pagination.total)} điểm đến
              </StatusBadge>
              <AdminReportButton
                type="destinations"
                filters={destinationFilters}
                label="Xuất Excel"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openDestinationModal()}
              >
                + Thêm điểm đến
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Điểm đến</th>
                  <th>Tỉnh/Thành</th>
                  <th>Quốc gia</th>
                  <th>Tour</th>
                  <th>Booking</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {(destinationsData.items || []).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          minWidth: 260,
                        }}
                      >
                        <div
                          style={{
                            width: 64,
                            height: 46,
                            borderRadius: 10,
                            flexShrink: 0,
                            backgroundImage: `url(${destinationImage(item)})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            border: "1px solid #e2e8f0",
                          }}
                        />
                        <div>
                          <strong>{item.name}</strong>
                          <div
                            className="table-muted"
                            style={{ maxWidth: 360 }}
                          >
                            {item.description
                              ? item.description.length > 90
                                ? `${item.description.slice(0, 90)}...`
                                : item.description
                              : "Chưa có mô tả"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{item.province || "--"}</td>
                    <td>{item.country || "Vietnam"}</td>
                    <td>
                      <strong>{formatNumber(item.tourCount || 0)}</strong>
                    </td>
                    <td>
                      <strong>{formatNumber(item.bookingCount || 0)}</strong>
                    </td>
                    <td>
                      <StatusBadge
                        tone={item.status === "active" ? "success" : "warning"}
                      >
                        {destinationStatusLabel(item.status)}
                      </StatusBadge>
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
                          className="btn btn-light btn-sm"
                          onClick={() => openDestinationModal(item)}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="btn btn-light btn-sm"
                          onClick={() => toggleDestinationStatus(item)}
                        >
                          {item.status === "active" ? "Tạm ẩn" : "Bật lại"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removeDestination(item)}
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!(destinationsData.items || []).length && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      Chưa có điểm đến nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={destinationsData.pagination.page}
            totalPages={destinationsData.pagination.totalPages}
            onPageChange={(page) =>
              setDestinationFilters((prev) => ({ ...prev, page }))
            }
          />
        </div>
      )}

      {activeTab === "reviews" && (
        <div
          className="admin-card"
          style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div
              className="table-search-row"
              style={{ flex: 1, maxWidth: 600 }}
            >
              <input
                value={reviewFilters.search}
                onChange={(e) =>
                  setReviewFilters((prev) => ({
                    ...prev,
                    search: e.target.value,
                    page: 1,
                  }))
                }
                placeholder="Tìm nội dung đánh giá..."
              />
              <select
                style={{ width: "260px" }}
                value={reviewFilters.tourId}
                onChange={(e) =>
                  setReviewFilters((prev) => ({
                    ...prev,
                    tourId: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả tour</option>
                {(allTours || []).map((tour) => (
                  <option key={tour.id} value={tour.id}>
                    {tour.name}
                  </option>
                ))}
              </select>
            </div>
            <StatusBadge>
              {formatNumber(reviewsData.pagination.total)} đánh giá
            </StatusBadge>
          </div>
          <div className="table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Tour</th>
                  <th>Điểm</th>
                  <th>Nội dung</th>
                  <th>Phản hồi</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {reviewsData.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.user?.fullName || "Khách vãng lai"}</strong>
                      <div className="table-muted">
                        {item.user?.email || ""}
                      </div>
                    </td>
                    <td
                      style={{
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.tour?.name}
                    </td>
                    <td>
                      <span style={{ color: "#f59e0b", fontWeight: "bold" }}>
                        ★ {item.rating}/5
                      </span>
                    </td>
                    <td style={{ maxWidth: 300, color: "#475569" }}>
                      {item.comment || "—"}
                    </td>
                    <td>
                      <span
                        className={
                          item.adminReply
                            ? "status-pill success"
                            : "status-pill warning"
                        }
                      >
                        {item.adminReply ? "Đã phản hồi" : "Chưa phản hồi"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-light btn-sm"
                          onClick={() => openReviewReply(item)}
                        >
                          Xem
                        </button>
                        <button
                          type="button"
                          className="btn btn-light btn-sm"
                          onClick={() => openReviewReply(item)}
                        >
                          Trả lời
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteReview(item.id)}
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={reviewsData.pagination.page}
            totalPages={reviewsData.pagination.totalPages}
            onPageChange={(page) =>
              setReviewFilters((prev) => ({ ...prev, page }))
            }
          />
        </div>
      )}

      {activeTab === "contacts" && (
        <div
          className="admin-card"
          style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div
              className="table-search-row"
              style={{ flex: 1, maxWidth: 760 }}
            >
              <input
                value={contactFilters.search}
                onChange={(e) =>
                  setContactFilters((prev) => ({
                    ...prev,
                    search: e.target.value,
                    page: 1,
                  }))
                }
                placeholder="Tìm tên, email khách hàng..."
              />
              <select
                value={contactFilters.status}
                onChange={(e) =>
                  setContactFilters((prev) => ({
                    ...prev,
                    status: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả trạng thái</option>
                {["new", "processing", "replied", "resolved"].map((item) => (
                  <option key={item} value={item}>
                    {mapLabel("contactStatus", item)}
                  </option>
                ))}
              </select>
            </div>
            <StatusBadge>
              {formatNumber(contactsData.pagination.total)} liên hệ
            </StatusBadge>
          </div>
          <div className="table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Chủ đề</th>
                  <th>Trạng thái</th>
                  <th>Email</th>
                  <th>Ngày tạo</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {contactsData.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.fullName}</strong>
                      <div className="table-muted">{item.email}</div>
                    </td>
                    <td style={{ maxWidth: 280, color: "#0f172a" }}>
                      {item.subject}
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          item.status === "resolved"
                            ? "success"
                            : item.status === "new"
                              ? "warning"
                              : "default"
                        }
                      >
                        {mapLabel("contactStatus", item.status)}
                      </StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={toneForContact(item)}>
                        {item.replyEmailSentAt
                          ? "Đã gửi"
                          : item.replyEmailError
                            ? "Lỗi"
                            : "Chưa"}
                      </StatusBadge>
                    </td>
                    <td className="table-muted">
                      {formatDate(item.createdAt)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-light btn-sm"
                          onClick={() => openContactDetail(item.id)}
                        >
                          Xem
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => openReplyModal(item)}
                        >
                          Phản hồi
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={contactsData.pagination.page}
            totalPages={contactsData.pagination.totalPages}
            onPageChange={(page) =>
              setContactFilters((prev) => ({ ...prev, page }))
            }
          />
        </div>
      )}

      {/* MODALS */}
      <Modal
        open={destinationModalOpen}
        onClose={() => !submitting && setDestinationModalOpen(false)}
        title={destinationForm.id ? "Cập nhật điểm đến" : "Thêm điểm đến"}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-light"
              onClick={() => setDestinationModalOpen(false)}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveDestination}
              disabled={submitting}
            >
              {submitting ? "Đang lưu..." : "Lưu điểm đến"}
            </button>
          </>
        }
      >
        <div className="modal-form-grid two-col">
          <div className="field">
            <label>Tên điểm đến</label>
            <input
              value={destinationForm.name}
              onChange={(e) =>
                setDestinationForm((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              placeholder="VD: Phú Quốc"
            />
          </div>

          <div className="field">
            <label>Tỉnh/Thành</label>
            <input
              value={destinationForm.province}
              onChange={(e) =>
                setDestinationForm((prev) => ({
                  ...prev,
                  province: e.target.value,
                }))
              }
              placeholder="VD: Kiên Giang"
            />
          </div>

          <div className="field">
            <label>Quốc gia</label>
            <input
              value={destinationForm.country}
              onChange={(e) =>
                setDestinationForm((prev) => ({
                  ...prev,
                  country: e.target.value,
                }))
              }
              placeholder="Vietnam"
            />
          </div>

          <div className="field">
            <label>Trạng thái</label>
            <select
              value={destinationForm.status}
              onChange={(e) =>
                setDestinationForm((prev) => ({
                  ...prev,
                  status: e.target.value,
                }))
              }
            >
              <option value="active">Đang dùng</option>
              <option value="inactive">Tạm ẩn</option>
            </select>
          </div>

          <div className="field span-2">
            <label>Ảnh đại diện</label>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleDestinationImageFile(e.dataTransfer.files?.[0]);
              }}
              style={{
                display: "grid",
                placeItems: "center",
                minHeight: 150,
                borderRadius: 16,
                border: "2px dashed #cbd5e1",
                background: "#f8fafc",
                color: "#64748b",
                cursor: "pointer",
                textAlign: "center",
                padding: 18,
              }}
            >
              <div>
                <strong style={{ color: "#0f172a" }}>
                  Chọn ảnh hoặc kéo thả vào đây
                </strong>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  Hỗ trợ JPG, PNG, WEBP. Không cần dán link ảnh nữa.
                </div>
              </div>
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={(e) =>
                  handleDestinationImageFile(e.target.files?.[0])
                }
              />
            </label>
          </div>

          {destinationForm.coverImagePreview || destinationForm.coverImage ? (
            <div className="field span-2">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <label style={{ margin: 0 }}>Xem trước ảnh</label>
                <button
                  type="button"
                  className="btn btn-light btn-sm"
                  onClick={clearDestinationImage}
                >
                  Bỏ ảnh
                </button>
              </div>
              <div
                style={{
                  height: 200,
                  borderRadius: 16,
                  backgroundImage: `url(${destinationForm.coverImagePreview || destinationForm.coverImage})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  border: "1px solid #e2e8f0",
                }}
              />
            </div>
          ) : null}

          <div className="field span-2">
            <label>Mô tả</label>
            <textarea
              rows={5}
              value={destinationForm.description}
              onChange={(e) =>
                setDestinationForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Mô tả điểm đến, nét nổi bật, gợi ý trải nghiệm..."
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={bookingDetailOpen}
        onClose={() => setBookingDetailOpen(false)}
        title="Trung tâm điều hành booking"
        size="xl"
      >
        {bookingDetail ? (
          <div style={{ display: "grid", gap: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div className="detail-card">
                <h4>Mức ưu tiên</h4>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <StatusBadge
                    tone={toneForPriority(
                      bookingDetail.operationInsight?.priorityLevel,
                    )}
                  >
                    {bookingDetail.operationInsight?.actionLabel || "Ổn định"}
                  </StatusBadge>
                  {(bookingDetail.operationInsight?.flags || []).map((flag) => (
                    <StatusBadge key={flag.code} tone={flag.tone}>
                      {flag.label}
                    </StatusBadge>
                  ))}
                </div>
                <p
                  style={{ margin: "12px 0 0", color: "#64748b", fontSize: 13 }}
                >
                  Hệ thống tự đánh dấu dựa trên ngày khởi hành, trạng thái thanh
                  toán, HDV, điểm đón và yêu cầu hoàn tiền.
                </p>
              </div>
              <div className="detail-card">
                <h4>Thông tin khách</h4>
                <ul className="detail-list">
                  <li>
                    <span>Họ tên</span>
                    <strong>{bookingDetail.contactName}</strong>
                  </li>
                  <li>
                    <span>Email</span>
                    <strong>{bookingDetail.contactEmail}</strong>
                  </li>
                  <li>
                    <span>Điện thoại</span>
                    <strong>{bookingDetail.contactPhone}</strong>
                  </li>
                  <li>
                    <span>Tài khoản</span>
                    <strong>
                      {bookingDetail.user?.fullName || "Khách vãng lai"}
                    </strong>
                  </li>
                </ul>
              </div>
              <div className="detail-card">
                <h4>Tài chính</h4>
                <ul className="detail-list">
                  <li>
                    <span>Tạm tính</span>
                    <strong>
                      {formatCurrency(bookingDetail.originalAmount)}
                    </strong>
                  </li>
                  <li>
                    <span>Voucher</span>
                    <strong>{bookingDetail.voucherCode || "Không dùng"}</strong>
                  </li>
                  <li>
                    <span>Giảm giá</span>
                    <strong>
                      {formatCurrency(bookingDetail.discountAmount)}
                    </strong>
                  </li>
                  <li>
                    <span>Thành tiền</span>
                    <strong style={{ color: "#2563eb" }}>
                      {formatCurrency(bookingDetail.finalAmount)}
                    </strong>
                  </li>
                </ul>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-card">
                <h4>Thông tin tour & lịch khởi hành</h4>
                <ul className="detail-list">
                  <li>
                    <span>Mã booking</span>
                    <strong>{bookingDetail.bookingCode}</strong>
                  </li>
                  <li>
                    <span>Tour</span>
                    <strong>{bookingDetail.tour?.name}</strong>
                  </li>
                  <li>
                    <span>Điểm đến</span>
                    <strong>
                      {bookingDetail.tour?.destination?.name} ·{" "}
                      {bookingDetail.tour?.destination?.province}
                    </strong>
                  </li>
                  <li>
                    <span>Ngày khởi hành</span>
                    <strong>
                      {formatDate(bookingDetail.departure?.departureDate)}
                    </strong>
                  </li>
                  <li>
                    <span>Ngày về</span>
                    <strong>
                      {formatDate(bookingDetail.departure?.endDate)}
                    </strong>
                  </li>
                  <li>
                    <span>Thời gian còn lại</span>
                    <strong>
                      {formatDaysUntilDeparture(
                        bookingDetail.operationInsight?.daysUntilDeparture,
                      )}
                    </strong>
                  </li>
                  <li>
                    <span>Số khách</span>
                    <strong>
                      {bookingDetail.adultCount} người lớn ·{" "}
                      {bookingDetail.childCount} trẻ em
                    </strong>
                  </li>
                  <li>
                    <span>Còn trống</span>
                    <strong>
                      {bookingDetail.operationInsight?.remainingSlots ?? "-"}{" "}
                      chỗ
                    </strong>
                  </li>
                </ul>
              </div>

              <div className="detail-card">
                <h4>Hướng dẫn viên</h4>
                {bookingDetail.activeGuideAssignment ? (
                  <ul className="detail-list">
                    <li>
                      <span>Họ tên</span>
                      <strong>
                        {bookingDetail.activeGuideAssignment.guide?.fullName}
                      </strong>
                    </li>
                    <li>
                      <span>Điện thoại</span>
                      <strong>
                        {bookingDetail.activeGuideAssignment.guide?.phone ||
                          "-"}
                      </strong>
                    </li>
                    <li>
                      <span>Email</span>
                      <strong>
                        {bookingDetail.activeGuideAssignment.guide?.email ||
                          "-"}
                      </strong>
                    </li>
                    <li>
                      <span>Ngôn ngữ</span>
                      <strong>
                        {bookingDetail.activeGuideAssignment.guide?.languages ||
                          "-"}
                      </strong>
                    </li>
                    <li>
                      <span>Trạng thái</span>
                      <strong>
                        {bookingDetail.activeGuideAssignment.status}
                      </strong>
                    </li>
                  </ul>
                ) : (
                  <div
                    style={{
                      background: "#fff7ed",
                      border: "1px solid #fed7aa",
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    <StatusBadge tone="danger">Chưa phân công HDV</StatusBadge>
                    <p
                      style={{
                        margin: "10px 0 0",
                        color: "#9a3412",
                        fontSize: 13,
                      }}
                    >
                      Booking này cần admin kiểm tra và phân công hướng dẫn viên
                      nếu sắp khởi hành.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-card">
                <h4>Điểm đón hiện tại</h4>
                <ul className="detail-list">
                  <li>
                    <span>Điểm đón</span>
                    <strong>{bookingDetail.pickupName || "Chưa chọn"}</strong>
                  </li>
                  <li>
                    <span>Địa chỉ</span>
                    <strong>{bookingDetail.pickupAddress || "-"}</strong>
                  </li>
                  <li>
                    <span>Giờ đón</span>
                    <strong>
                      {bookingDetail.pickupTime
                        ? formatDateTime(bookingDetail.pickupTime).slice(-5)
                        : "Travela sẽ liên hệ"}
                    </strong>
                  </li>
                  <li>
                    <span>Ghi chú</span>
                    <strong>{bookingDetail.pickupNote || "-"}</strong>
                  </li>
                </ul>
              </div>

              <div className="detail-card">
                <h4>Sửa điểm đón</h4>
                {["completed", "cancelled", "expired"].includes(
                  bookingDetail.bookingStatus,
                ) ? (
                  <p className="table-muted">
                    Booking đã ở trạng thái cuối nên không thể sửa điểm đón.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    <select
                      value={bookingPickupForm.pickupPointId}
                      onChange={(e) =>
                        setBookingPickupForm({ pickupPointId: e.target.value })
                      }
                    >
                      <option value="">Chọn điểm đón mới</option>
                      {(bookingDetail.pickupOptions || []).map((point) => (
                        <option key={point.id} value={point.id}>
                          {point.name} · {point.address}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={updateBookingPickup}
                    >
                      Cập nhật điểm đón
                    </button>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
                      Để đảm bảo dữ liệu chỗ và tiền không bị lệch, admin chỉ
                      được sửa điểm đón; không sửa số lượng khách, tour, ngày
                      khởi hành hoặc tổng tiền.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-card">
                <h4>Lịch sử thanh toán</h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {(bookingDetail.payments || []).map((payment) => (
                    <div
                      key={payment.id}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        padding: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <strong>
                          {mapLabel("paymentMethod", payment.paymentMethod)}
                        </strong>
                        <StatusBadge
                          tone={toneForPayment(payment.paymentStatus)}
                        >
                          {mapLabel("paymentStatus", payment.paymentStatus)}
                        </StatusBadge>
                      </div>
                      <div className="table-muted">
                        Mã GD: {payment.internalTransactionCode}
                      </div>
                      <div className="table-muted">
                        Số tiền:{" "}
                        <strong style={{ color: "#0f172a" }}>
                          {formatCurrency(payment.amount)}
                        </strong>
                      </div>
                      {payment.gatewayTransactionId ? (
                        <div className="table-muted">
                          Mã cổng: {payment.gatewayTransactionId}
                        </div>
                      ) : null}
                      {payment.paymentStatus === "waiting_confirmation" && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ width: "100%", marginTop: 12 }}
                          onClick={() => confirmPayment(payment.id)}
                        >
                          Duyệt khoản thu này
                        </button>
                      )}
                    </div>
                  ))}
                  {!(bookingDetail.payments || []).length && (
                    <p className="table-muted">Chưa có giao dịch.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="detail-card">
              <h4>Danh sách hành khách</h4>
              <div className="table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>Mã booking</th>
                      <th>Họ tên</th>
                      <th>Loại khách</th>
                      <th>Ngày sinh</th>
                      <th>Giấy tờ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      bookingDetail.departureGuests ||
                      bookingDetail.guests ||
                      []
                    ).map((guest) => (
                      <tr key={guest.id}>
                        <td>{guest.bookingCode || "-"}</td>
                        <td>{guest.fullName}</td>
                        <td>{guest.guestType}</td>
                        <td>{formatDate(guest.dateOfBirth)}</td>
                        <td>{guest.idNumber || "-"}</td>
                      </tr>
                    ))}
                    {!(bookingDetail.guests || []).length && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{ textAlign: "center", color: "#64748b" }}
                        >
                          Chưa có hành khách.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={contactDetailOpen}
        onClose={() => setContactDetailOpen(false)}
        title="Nội dung liên hệ"
        size="xl"
      >
        {contactDetail ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div className="detail-grid">
              <div className="detail-card">
                <h4>Người gửi</h4>
                <ul className="detail-list">
                  <li>
                    <span>Tên</span>
                    <strong>{contactDetail.fullName}</strong>
                  </li>
                  <li>
                    <span>Email</span>
                    <strong>{contactDetail.email}</strong>
                  </li>
                  <li>
                    <span>SĐT</span>
                    <strong>{contactDetail.phone || "—"}</strong>
                  </li>
                  <li>
                    <span>Trạng thái</span>
                    <strong>
                      <StatusBadge>
                        {mapLabel("contactStatus", contactDetail.status)}
                      </StatusBadge>
                    </strong>
                  </li>
                </ul>
              </div>
              <div className="detail-card">
                <h4>Nội dung tin nhắn</h4>
                <div
                  style={{
                    background: "#ffffff",
                    padding: 16,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    color: "#334155",
                    lineHeight: 1.6,
                  }}
                >
                  <strong>CĐ: {contactDetail.subject}</strong>
                  <p style={{ marginTop: 8 }}>{contactDetail.message}</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={replyOpen}
        onClose={() => !submitting && setReplyOpen(false)}
        title="Gửi email phản hồi"
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-light"
              onClick={() => setReplyOpen(false)}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitReply}
              disabled={submitting}
            >
              {submitting ? "Đang gửi..." : "Gửi phản hồi"}
            </button>
          </>
        }
      >
        <div className="modal-form-grid">
          <div className="field">
            <label>Chủ đề email</label>
            <input
              value={replyForm.subject}
              onChange={(e) =>
                setReplyForm((prev) => ({ ...prev, subject: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Nội dung</label>
            <textarea
              rows={6}
              value={replyForm.replyMessage}
              onChange={(e) =>
                setReplyForm((prev) => ({
                  ...prev,
                  replyMessage: e.target.value,
                }))
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={reviewReplyOpen}
        onClose={() => !submitting && setReviewReplyOpen(false)}
        title="Trả lời đánh giá"
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-light"
              onClick={() => setReviewReplyOpen(false)}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitReviewReply}
              disabled={submitting}
            >
              {submitting ? "Đang lưu..." : "Lưu phản hồi"}
            </button>
          </>
        }
      >
        <div className="modal-form-grid">
          <div className="field">
            <label>Khách viết</label>
            <textarea
              value={reviewReplyForm.comment}
              readOnly
              rows={3}
              style={{ background: "#f8fafc" }}
            />
          </div>
          <div className="field">
            <label>Phản hồi từ Admin (Hiển thị public)</label>
            <textarea
              rows={5}
              value={reviewReplyForm.adminReply}
              onChange={(e) =>
                setReviewReplyForm((prev) => ({
                  ...prev,
                  adminReply: e.target.value,
                }))
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={tourModalOpen}
        onClose={() => closeTourWizard()}
        title={tourForm.id ? "Cập nhật Tour" : "Khởi tạo Tour Mới"}
        size="xl"
        footer={
          <>
            <button
              type="button"
              className="btn btn-light"
              onClick={closeTourWizard}
            >
              Đóng
            </button>
            {tourStep === 1 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveTourStep1}
                disabled={submitting}
              >
                {submitting ? "Đang xử lý..." : "Lưu & Tiếp tục"}
              </button>
            ) : tourStep === 2 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setTourStep(3)}
              >
                Tiếp theo
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveTourFinal}
                disabled={submitting}
              >
                {submitting ? "Đang lưu..." : "Hoàn tất Xuất bản"}
              </button>
            )}
          </>
        }
      >
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "32px",
            background: "#f8fafc",
            padding: "6px",
            borderRadius: "12px",
          }}
        >
          {[
            { step: 1, label: "1. Thông tin cơ bản" },
            { step: 2, label: "2. Hình ảnh" },
            { step: 3, label: "3. Lịch trình & Giá" },
          ].map((item) => {
            const isActive = tourStep === item.step;
            const isUnlocked = !!tourForm.id || item.step === 1;
            return (
              <div
                key={item.step}
                onClick={() => isUnlocked && setTourStep(item.step)}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "10px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "13px",
                  background: isActive ? "#ffffff" : "transparent",
                  color: isActive ? "#3b82f6" : "#64748b",
                  boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  cursor: isUnlocked ? "pointer" : "not-allowed",
                  opacity: isUnlocked ? 1 : 0.4,
                  transition: "all 0.2s",
                }}
              >
                {item.label}
              </div>
            );
          })}
        </div>

        {tourStep === 1 && (
          <div className="modal-form-grid two-col">
            <div className="field span-2">
              <label>Tên tour</label>
              <input
                value={tourForm.name}
                onChange={(e) =>
                  setTourForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="VD: Khám phá Vịnh Hạ Long 3 Ngày 2 Đêm"
              />
            </div>
            {tourForm.id && (
              <>
                <div className="field">
                  <label>Mã hệ thống (Tự động)</label>
                  <input
                    value={tourForm.code}
                    readOnly
                    style={{ background: "#f8fafc" }}
                  />
                </div>
                <div className="field">
                  <label>Đường dẫn tĩnh (Slug)</label>
                  <input
                    value={tourForm.slug}
                    onChange={(e) =>
                      setTourForm((prev) => ({ ...prev, slug: e.target.value }))
                    }
                  />
                </div>
              </>
            )}
            <div className="field">
              <label>Điểm đến chính</label>
              <select
                value={tourForm.destinationId}
                onChange={(e) =>
                  setTourForm((prev) => ({
                    ...prev,
                    destinationId: e.target.value,
                  }))
                }
              >
                <option value="">-- Chọn điểm đến --</option>
                {destinations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Phân loại</label>
              <select
                value={tourForm.tourType}
                onChange={(e) =>
                  setTourForm((prev) => ({ ...prev, tourType: e.target.value }))
                }
              >
                <option value="group">Ghép đoàn (Group)</option>
                <option value="private">Riêng tư (Private)</option>
              </select>
            </div>
            <div className="field">
              <label>Chủ đề</label>
              <select
                value={tourForm.tourTheme}
                onChange={(e) =>
                  setTourForm((prev) => ({
                    ...prev,
                    tourTheme: e.target.value,
                  }))
                }
              >
                {[
                  "beach",
                  "mountain",
                  "city",
                  "culture",
                  "adventure",
                  "eco",
                  "family",
                  "luxury",
                  "other",
                ].map((item) => (
                  <option key={item} value={item}>
                    {item.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="field"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label>Số Ngày</label>
                <input
                  type="number"
                  min="1"
                  value={tourForm.durationDays}
                  onChange={(e) =>
                    setTourForm((prev) => ({
                      ...prev,
                      durationDays: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label>Số Đêm</label>
                <input
                  type="number"
                  min="0"
                  value={tourForm.durationNights}
                  onChange={(e) =>
                    setTourForm((prev) => ({
                      ...prev,
                      durationNights: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="field span-2">
              <label>Mô tả nổi bật (Ngắn)</label>
              <textarea
                value={tourForm.shortDescription}
                onChange={(e) =>
                  setTourForm((prev) => ({
                    ...prev,
                    shortDescription: e.target.value,
                  }))
                }
                rows={2}
              />
            </div>
            <div className="field span-2">
              <label>Giới thiệu chi tiết</label>
              <textarea
                value={tourForm.fullDescription}
                onChange={(e) =>
                  setTourForm((prev) => ({
                    ...prev,
                    fullDescription: e.target.value,
                  }))
                }
                rows={5}
              />
            </div>
          </div>
        )}

        {tourStep === 2 && (
          <div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsTourMediaDragging(true);
              }}
              onDragLeave={() => setIsTourMediaDragging(false)}
              onDrop={handleTourMediaDrop}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                background: isTourMediaDragging ? "#eff6ff" : "#f8fafc",
                padding: 20,
                borderRadius: 16,
                marginBottom: 20,
                border: isTourMediaDragging
                  ? "2px dashed #3b82f6"
                  : "2px dashed #cbd5e1",
              }}
            >
              <div>
                <p style={{ margin: 0, color: "#475569" }}>
                  Tải lên các hình ảnh đẹp nhất của tour để thu hút khách hàng.
                </p>
                <p
                  style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: 13 }}
                >
                  Có thể bấm chọn file hoặc kéo thả nhiều ảnh vào khu vực này.
                </p>
              </div>
              <label
                className="btn btn-primary"
                style={{
                  cursor: uploadingMedia ? "wait" : "pointer",
                  margin: 0,
                  minWidth: 138,
                  justifyContent: "center",
                }}
              >
                {uploadingMedia ? "Đang tải..." : "Tải ảnh lên"}
                <input
                  hidden
                  type="file"
                  multiple
                  onChange={(e) => uploadTourMedia(e.target.files)}
                  disabled={uploadingMedia}
                  accept="image/*"
                />
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 16,
              }}
            >
              {tourForm.media && tourForm.media.length > 0 ? (
                tourForm.media.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      position: "relative",
                      height: "180px",
                      borderRadius: "12px",
                      overflow: "hidden",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                    }}
                  >
                    <img
                      src={mapImageUrl(m.fileUrl, API_URL)}
                      alt="media"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                    <button
                      onClick={() => removeTourMedia(m.id)}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "rgba(255,255,255,0.9)",
                        color: "#ef4444",
                        border: "none",
                        borderRadius: "50%",
                        width: 28,
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                ))
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsTourMediaDragging(true);
                  }}
                  onDragLeave={() => setIsTourMediaDragging(false)}
                  onDrop={handleTourMediaDrop}
                  style={{
                    gridColumn: "1 / -1",
                    padding: "64px 20px",
                    textAlign: "center",
                    background: isTourMediaDragging ? "#eff6ff" : "#f8fafc",
                    borderRadius: "16px",
                    border: isTourMediaDragging
                      ? "2px dashed #3b82f6"
                      : "2px dashed #cbd5e1",
                    color: "#64748b",
                    cursor: uploadingMedia ? "wait" : "pointer",
                  }}
                >
                  <strong style={{ color: "#0f172a" }}>
                    Chưa có hình ảnh nào
                  </strong>
                  <div style={{ marginTop: 8 }}>
                    Bấm để chọn ảnh hoặc kéo thả ảnh vào đây.
                  </div>
                  <input
                    hidden
                    type="file"
                    multiple
                    accept="image/*"
                    disabled={uploadingMedia}
                    onChange={(e) => uploadTourMedia(e.target.files)}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {tourStep === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <div className="admin-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 18 }}>
                  Lịch trình chi tiết ({tourForm.durationDays} Ngày)
                </h3>
              </div>
              {tourItinerary.map((item, index) => (
                <div
                  key={`${item.dayNumber}-${index}`}
                  className="modal-form-grid two-col"
                  style={{
                    background: "#f8fafc",
                    padding: 20,
                    borderRadius: 12,
                    marginBottom: 16,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div className="field">
                    <label>Ngày</label>
                    <input
                      value={`Ngày thứ ${item.dayNumber}`}
                      readOnly
                      style={{ fontWeight: "bold" }}
                    />
                  </div>
                  <div className="field">
                    <label>Địa danh</label>
                    <input
                      value={item.locationName}
                      onChange={(e) =>
                        setTourItinerary((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, locationName: e.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="VD: Vịnh Hạ Long, Sapa..."
                    />
                  </div>
                  <div className="field span-2">
                    <label>Tiêu đề hoạt động</label>
                    <input
                      value={item.title}
                      onChange={(e) =>
                        setTourItinerary((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, title: e.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field span-2">
                    <label>Nội dung chi tiết</label>
                    <textarea
                      value={item.description}
                      onChange={(e) =>
                        setTourItinerary((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, description: e.target.value }
                              : row,
                          ),
                        )
                      }
                      rows={3}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="admin-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 18 }}>
                  Mở bán (Ngày khởi hành)
                </h3>
                <button
                  type="button"
                  className="btn btn-light btn-sm"
                  onClick={() =>
                    setTourDepartures((prev) => [
                      ...prev,
                      buildNextDepartureItem(prev, tourForm.durationDays),
                    ])
                  }
                  title="Thêm một ngày khởi hành mới. Hệ thống tự gợi ý ngày kết thúc theo số ngày của tour."
                >
                  + Thêm lịch khởi hành
                </button>
              </div>
              {tourDepartures.map((item, index) => (
                <div
                  key={index}
                  className="modal-form-grid two-col"
                  style={{
                    background: "#f8fafc",
                    padding: 20,
                    borderRadius: 12,
                    marginBottom: 16,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div className="field">
                    <label>Ngày xuất phát</label>
                    <input
                      type="date"
                      value={item.departureDate}
                      onChange={(e) => {
                        const departureDate = e.target.value;
                        const autoEndDate = addDaysToDateInput(
                          departureDate,
                          Math.max(Number(tourForm.durationDays || 1), 1) - 1,
                        );
                        setTourDepartures((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, departureDate, endDate: autoEndDate }
                              : row,
                          ),
                        );
                      }}
                    />
                  </div>
                  <div className="field">
                    <label>Ngày kết thúc</label>
                    <input
                      type="date"
                      value={item.endDate}
                      onChange={(e) =>
                        setTourDepartures((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, endDate: e.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Giá áp dụng (Lớn)</label>
                    <input
                      type="number"
                      value={item.adultPrice}
                      onChange={(e) =>
                        setTourDepartures((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, adultPrice: e.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Giá áp dụng (Trẻ)</label>
                    <input
                      type="number"
                      value={item.childPrice}
                      onChange={(e) =>
                        setTourDepartures((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, childPrice: e.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Chỗ trống</label>
                    <input
                      type="number"
                      value={item.totalSlots}
                      onChange={(e) =>
                        setTourDepartures((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, totalSlots: e.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Trạng thái vé</label>
                    <select
                      value={item.status}
                      onChange={(e) =>
                        setTourDepartures((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, status: e.target.value }
                              : row,
                          ),
                        )
                      }
                    >
                      <option value="open">Đang mở (Open)</option>
                      <option value="full">Đã đầy (Full)</option>
                      <option value="closed">Đã đóng (Closed)</option>
                    </select>
                  </div>
                  <div
                    className="field span-2"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <small style={{ color: "#64748b" }}>
                      Lịch #{index + 1}: ví dụ 16-17/5, 1-2/6, 6-7/6... Bạn có
                      thể thêm nhiều lịch cho cùng một tour.
                    </small>
                    {tourDepartures.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          setTourDepartures((prev) =>
                            prev.filter((_, idx) => idx !== index),
                          )
                        }
                      >
                        Xóa lịch này
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="admin-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: "1px solid #e2e8f0",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Điểm đón khách</h3>
                  <p
                    style={{
                      margin: "6px 0 0",
                      color: "#64748b",
                      fontSize: 13,
                    }}
                  >
                    Thêm nhiều điểm đón để khách chọn khi đặt tour. Để trống
                    lịch khởi hành nếu điểm đón áp dụng cho toàn bộ lịch.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-light btn-sm"
                  onClick={() =>
                    setTourPickupPoints((prev) => [
                      ...prev,
                      createPickupPointItem(),
                    ])
                  }
                >
                  + Thêm điểm đón
                </button>
              </div>

              {tourPickupPoints.map((item, index) => (
                <div
                  key={index}
                  className="modal-form-grid two-col"
                  style={{
                    background: "#f8fafc",
                    padding: 20,
                    borderRadius: 12,
                    marginBottom: 16,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div className="field">
                    <label>Tỉnh/Thành</label>
                    <input
                      value={item.province || ""}
                      onChange={(e) =>
                        setTourPickupPoints((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, province: e.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="VD: TP HCM"
                    />
                  </div>

                  <div className="field">
                    <label>Tên điểm đón</label>
                    <input
                      value={item.name}
                      onChange={(e) =>
                        setTourPickupPoints((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, name: e.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="VD: Bến Xe Miền Đông"
                    />
                  </div>

                  <div className="field">
                    <label>Trạng thái</label>
                    <select
                      value={item.status}
                      onChange={(e) =>
                        setTourPickupPoints((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, status: e.target.value }
                              : row,
                          ),
                        )
                      }
                    >
                      <option value="active">Đang dùng</option>
                      <option value="inactive">Tạm ẩn</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Ghi chú</label>
                    <input
                      value={item.note}
                      onChange={(e) =>
                        setTourPickupPoints((prev) =>
                          prev.map((row, idx) =>
                            idx === index
                              ? { ...row, note: e.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="VD: Có mặt trước 15 phút"
                    />
                  </div>

                  <div
                    className="field span-2"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <small style={{ color: "#64748b" }}>
                      Điểm đón #{index + 1}. Khách sẽ chọn điểm này ở màn hình
                      đặt tour trước khi thanh toán.
                    </small>
                    {tourPickupPoints.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          setTourPickupPoints((prev) =>
                            prev.filter((_, idx) => idx !== index),
                          )
                        }
                      >
                        Xóa điểm đón
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="admin-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 18 }}>
                  Thông tin lưu trú & Xe di chuyển
                </h3>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 24,
                }}
              >
                {/* Accommodations */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <strong style={{ color: "#334155" }}>
                      Khách sạn / Chỗ ở
                    </strong>
                    <button
                      type="button"
                      className="btn btn-light btn-sm"
                      onClick={() =>
                        setTourAccommodations((prev) => [
                          ...prev,
                          createAccommodationItem(),
                        ])
                      }
                    >
                      + Thêm
                    </button>
                  </div>
                  {tourAccommodations.map((item, index) => (
                    <div
                      key={index}
                      className="modal-form-grid"
                      style={{
                        background: "#f8fafc",
                        padding: 16,
                        borderRadius: 12,
                        marginBottom: 16,
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div className="field">
                        <label>Tên chỗ ở</label>
                        <input
                          value={item.name}
                          onChange={(e) =>
                            setTourAccommodations((prev) =>
                              prev.map((row, idx) =>
                                idx === index
                                  ? { ...row, name: e.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 12,
                        }}
                      >
                        <div className="field">
                          <label>Loại</label>
                          <select
                            value={item.accommodationType}
                            onChange={(e) =>
                              setTourAccommodations((prev) =>
                                prev.map((row, idx) =>
                                  idx === index
                                    ? {
                                        ...row,
                                        accommodationType: e.target.value,
                                      }
                                    : row,
                                ),
                              )
                            }
                          >
                            <option value="hotel">Khách sạn</option>
                            <option value="homestay">Homestay</option>
                            <option value="resort">Resort</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Hạng (Sao)</label>
                          <input
                            type="number"
                            min="1"
                            max="5"
                            value={item.starRating || ""}
                            onChange={(e) =>
                              setTourAccommodations((prev) =>
                                prev.map((row, idx) =>
                                  idx === index
                                    ? { ...row, starRating: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Transports */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <strong style={{ color: "#334155" }}>
                      Phương tiện di chuyển
                    </strong>
                    <button
                      type="button"
                      className="btn btn-light btn-sm"
                      onClick={() =>
                        setTourTransports((prev) => [
                          ...prev,
                          createTransportItem(),
                        ])
                      }
                    >
                      + Thêm
                    </button>
                  </div>
                  {tourTransports.map((item, index) => (
                    <div
                      key={index}
                      className="modal-form-grid"
                      style={{
                        background: "#f8fafc",
                        padding: 16,
                        borderRadius: 12,
                        marginBottom: 16,
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div className="field">
                        <label>Tên hãng / Phương tiện</label>
                        <input
                          value={item.name}
                          onChange={(e) =>
                            setTourTransports((prev) =>
                              prev.map((row, idx) =>
                                idx === index
                                  ? { ...row, name: e.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 12,
                        }}
                      >
                        <div className="field">
                          <label>Loại xe</label>
                          <select
                            value={item.transportType}
                            onChange={(e) =>
                              setTourTransports((prev) =>
                                prev.map((row, idx) =>
                                  idx === index
                                    ? { ...row, transportType: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          >
                            <option value="flight">Máy bay</option>
                            <option value="train">Tàu hỏa</option>
                            <option value="bus">Xe khách</option>
                            <option value="car">Ô tô ghép</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Nhà cung cấp</label>
                          <input
                            value={item.provider || ""}
                            onChange={(e) =>
                              setTourTransports((prev) =>
                                prev.map((row, idx) =>
                                  idx === index
                                    ? { ...row, provider: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
