import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import Loading from "@/components/Loading";
import TourCard from "@/components/TourCard";
import TourReviewSection from "@/components/reviews/TourReviewSection";
import PaymentModal from "@/components/PaymentModal";
import BookingWizardModal from "@/components/BookingWizardModal";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { formatCurrency, formatDate, renderStars } from "@/lib/format";
import { mapLabel } from "@/lib/labels";
import { normalizeTour, mapImageUrl, renderDeparturePreview } from "@/lib/tour";
import { getUser, updateStoredUser } from "@/lib/storage";
import { useToast } from "@/components/ToastContext";
import { trackBehavior } from "@/lib/behavior";
import {
  Heart,
  BadgeDollarSign,
  Baby,
  NotebookPen,
  ChevronDown,
  Info,
} from "lucide-react";

function normalizeDateInputValue(value) {
  if (!value) return "";

  const raw = String(value).trim();

  // input[type="date"] chỉ nhận đúng định dạng YYYY-MM-DD.
  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];

  // Hỗ trợ dữ liệu cũ dạng DD/MM/YYYY.
  const viDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (viDate) {
    const [, day, month, year] = viDate;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return "";
}

function buildDefaultGuests(
  adultCount = 1,
  childCount = 0,
  currentUser = null,
  previous = [],
) {
  const rows = [];
  const safeAdult = Math.max(1, Number(adultCount || 1));
  const safeChild = Math.max(0, Number(childCount || 0));

  for (let i = 0; i < safeAdult; i += 1) {
    const old =
      previous.find((item) => item.guestType === "adult" && item.index === i) ||
      previous.filter((item) => item.guestType === "adult")[i];
    rows.push({
      index: i,
      guestType: "adult",
      fullName: old?.fullName || (i === 0 ? currentUser?.fullName || "" : ""),
      dateOfBirth:
        i === 0
          ? normalizeDateInputValue(
              currentUser?.birthDate ||
                currentUser?.dateOfBirth ||
                old?.dateOfBirth ||
                "",
            )
          : normalizeDateInputValue(old?.dateOfBirth || ""),
      gender:
        i === 0 ? currentUser?.gender || old?.gender || "" : old?.gender || "",
      idNumber:
        i === 0
          ? currentUser?.identityNumber ||
            currentUser?.idNumber ||
            currentUser?.identity_number ||
            old?.idNumber ||
            ""
          : old?.idNumber || "",
      savedTravelerId: i === 0 ? "" : old?.savedTravelerId || "",
      isAccountOwner: i === 0,
    });
  }

  for (let i = 0; i < safeChild; i += 1) {
    const old =
      previous.find((item) => item.guestType === "child" && item.index === i) ||
      previous.filter((item) => item.guestType === "child")[i];
    rows.push({
      index: i,
      guestType: "child",
      fullName: old?.fullName || "",
      dateOfBirth: normalizeDateInputValue(old?.dateOfBirth || ""),
      gender: old?.gender || "",
      idNumber: old?.idNumber || "",
      savedTravelerId: old?.savedTravelerId || "",
      isAccountOwner: false,
    });
  }

  return rows;
}

function updateGuestAtIndex(rows, rowIndex, field, value) {
  return rows.map((item, index) =>
    index === rowIndex ? { ...item, [field]: value } : item,
  );
}

function unwrapArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function getFavoriteTourId(item) {
  return (
    item?.tourId ??
    item?.tour_id ??
    item?.tour?.id ??
    item?.tour?.tourId ??
    item?.data?.tourId ??
    item?.data?.tour?.id ??
    item?.id ??
    ""
  );
}

function isTourInFavorites(payload, tourId) {
  return unwrapArray(payload).some(
    (item) => String(getFavoriteTourId(item)) === String(tourId),
  );
}

function normalizeSavedTraveler(traveler = {}) {
  return {
    id: traveler.id,
    fullName: traveler.fullName || traveler.full_name || "",
    dateOfBirth: normalizeDateInputValue(
      traveler.dateOfBirth || traveler.date_of_birth || "",
    ),
    gender: traveler.gender || "",
    guestType: traveler.guestType || traveler.guest_type || "adult",
    idNumber: traveler.idNumber || traveler.id_number || "",
    isDefault: Boolean(traveler.isDefault ?? traveler.is_default),
  };
}

function getDepartureRemainingSlotsValue(departure = {}) {
  const totalSlots = Number(departure.totalSlots ?? departure.total_slots ?? 0);
  const bookedSlots = Number(
    departure.bookedSlots ?? departure.booked_slots ?? 0,
  );
  const heldSlots = Number(departure.heldSlots ?? departure.held_slots ?? 0);

  return Math.max(0, totalSlots - bookedSlots - heldSlots);
}

function getBookableDepartures(departures = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (Array.isArray(departures) ? departures : [])
    .filter((departure) => {
      const departureDate = new Date(departure?.departureDate);
      if (Number.isNaN(departureDate.getTime())) return false;
      departureDate.setHours(0, 0, 0, 0);

      return (
        String(departure?.status || "").toLowerCase() === "open" &&
        departureDate.getTime() >= today.getTime() &&
        getDepartureRemainingSlotsValue(departure) > 0
      );
    })
    .sort(
      (a, b) =>
        new Date(a.departureDate).getTime() -
        new Date(b.departureDate).getTime(),
    );
}

function toLocalDateOnly(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
    0,
    0,
    0,
    0,
  );
}

function findDepartureBookingConflict(departure, activeBookingPeriods = []) {
  const newStart = toLocalDateOnly(departure?.departureDate);
  const newEnd =
    toLocalDateOnly(departure?.endDate || departure?.departureDate) || newStart;

  if (!newStart || !newEnd) return null;

  return (
    (Array.isArray(activeBookingPeriods) ? activeBookingPeriods : []).find(
      (period) => {
        // Cho phép đặt thêm đúng cùng lịch khởi hành đã đặt trước đó.
        // Chỉ các departure KHÁC bị giao thời gian mới được xem là xung đột.
        const currentDepartureId =
          departure?.id ?? departure?.departureId ?? departure?.departure_id;
        const bookedDepartureId = period?.departureId ?? period?.departure_id;

        if (
          currentDepartureId != null &&
          bookedDepartureId != null &&
          String(currentDepartureId) === String(bookedDepartureId)
        ) {
          return false;
        }

        const oldStart = toLocalDateOnly(
          period?.startDate || period?.departureDate,
        );
        const oldEnd =
          toLocalDateOnly(
            period?.endDate || period?.startDate || period?.departureDate,
          ) || oldStart;

        if (!oldStart || !oldEnd) return false;

        // Hai khoảng ngày được tính inclusive:
        // tour 17-20 sẽ khóa mọi lịch có chứa ngày 17, 18, 19 hoặc 20.
        return (
          newStart.getTime() <= oldEnd.getTime() &&
          newEnd.getTime() >= oldStart.getTime()
        );
      },
    ) || null
  );
}

function getFirstAvailableDeparture(
  departures = [],
  activeBookingPeriods = [],
) {
  return (
    (Array.isArray(departures) ? departures : []).find(
      (departure) =>
        getDepartureRemainingSlotsValue(departure) > 0 &&
        !findDepartureBookingConflict(departure, activeBookingPeriods),
    ) || null
  );
}

function getTourMediaUrl(item = {}, fallback = "") {
  return (
    item?.fileUrl ||
    item?.file_url ||
    item?.imageUrl ||
    item?.image_url ||
    item?.url ||
    item?.path ||
    fallback ||
    ""
  );
}

function isTourCoverImage(item = {}) {
  const value = item?.isCover ?? item?.is_cover;

  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value || "").toLowerCase() === "true"
  );
}

function buildTourGallery(media = [], coverUrl = "") {
  const items = Array.isArray(media)
    ? media.filter((item) => getTourMediaUrl(item))
    : [];

  if (!items.length) {
    return coverUrl
      ? [
          {
            id: "fallback-cover",
            fileUrl: coverUrl,
            isCover: true,
            displayOrder: 0,
          },
        ]
      : [];
  }

  return [...items].sort((a, b) => {
    const aCover = isTourCoverImage(a);
    const bCover = isTourCoverImage(b);

    // Ảnh được quản trị viên chọn làm ảnh bìa luôn đứng đầu.
    if (aCover !== bCover) {
      return aCover ? -1 : 1;
    }

    const aOrder = Number(
      a?.displayOrder ?? a?.display_order ?? Number.MAX_SAFE_INTEGER,
    );
    const bOrder = Number(
      b?.displayOrder ?? b?.display_order ?? Number.MAX_SAFE_INTEGER,
    );

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return Number(a?.id || 0) - Number(b?.id || 0);
  });
}

function getTourCoverImage(media = [], coverUrl = "") {
  const gallery = buildTourGallery(media, coverUrl);
  const coverImage =
    gallery.find((item) => isTourCoverImage(item)) || gallery[0] || null;

  return getTourMediaUrl(coverImage, coverUrl);
}

const DEFAULT_EXCLUDED_ITEMS = [
  "Chi phí cá nhân, đồ uống và các dịch vụ phát sinh ngoài chương trình.",
];

const DEFAULT_CHILD_POLICY_ITEMS = [
  "Trẻ em dưới 5 tuổi được miễn phí theo chính sách của tour và ngủ chung với cha mẹ.",
  "Trẻ em từ 5 đến dưới 10 tuổi áp dụng mức giá trẻ em, có suất ăn và ghế ngồi riêng.",
  "Trẻ em từ 10 tuổi trở lên được tính giá như người lớn.",
];

const DEFAULT_NOTE_ITEMS = [
  "Quý khách vui lòng có mặt tại điểm đón trước giờ khởi hành ít nhất 15 phút.",
  "Vui lòng mang theo giấy tờ tùy thân hợp lệ trong suốt hành trình.",
];

function safeParsePolicyValue(value) {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return (
            item.text || item.label || item.description || item.content || ""
          );
        }
        return "";
      })
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "object") {
    return safeParsePolicyValue(
      value.items ||
        value.list ||
        value.content ||
        value.description ||
        value.text,
    );
  }

  const raw = String(value || "").trim();
  if (!raw) return [];

  if ((raw.startsWith("[") || raw.startsWith("{")) && raw.length > 1) {
    try {
      return safeParsePolicyValue(JSON.parse(raw));
    } catch (_) {
      // Tiếp tục xử lý như chuỗi thường.
    }
  }

  return raw
    .split(/\r?\n|•|\u2022|\s+-\s+/)
    .map((item) => item.replace(/^[-–—*+\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function getFirstPolicyValue(tour, keys = []) {
  for (const key of keys) {
    const direct = tour?.[key];
    if (direct != null && direct !== "") return direct;

    const metadata = tour?.metadata?.[key] ?? tour?.meta?.[key];
    if (metadata != null && metadata !== "") return metadata;

    const policy = tour?.policy?.[key] ?? tour?.policyJson?.[key];
    if (policy != null && policy !== "") return policy;
  }

  return null;
}

function buildTourPolicyData(tour = {}) {
  const excluded = safeParsePolicyValue(
    getFirstPolicyValue(tour, [
      "excludedServices",
      "notIncluded",
      "excluded",
      "excludes",
      "priceExcludes",
      "tourExcludes",
    ]),
  );
  const childPolicy = safeParsePolicyValue(
    getFirstPolicyValue(tour, [
      "childPolicy",
      "childrenPolicy",
      "childPricingPolicy",
      "childRules",
    ]),
  );
  const notes = safeParsePolicyValue(
    getFirstPolicyValue(tour, [
      "notes",
      "tourNotes",
      "importantNotes",
      "itineraryNotes",
      "terms",
    ]),
  );

  return {
    excluded: (excluded.length ? excluded : DEFAULT_EXCLUDED_ITEMS).slice(0, 1),
    childPolicy: (childPolicy.length
      ? childPolicy
      : DEFAULT_CHILD_POLICY_ITEMS
    ).slice(0, 3),
    notes: (notes.length ? notes : DEFAULT_NOTE_ITEMS).slice(0, 2),
  };
}

function BookingPolicyPreview({ tour }) {
  const [expanded, setExpanded] = useState(false);
  const policyData = buildTourPolicyData(tour);

  const groups = [
    {
      icon: BadgeDollarSign,
      title: "Chi phí chưa bao gồm",
      items: policyData.excluded,
      tone: "#fff7ed",
      color: "#c2410c",
    },
    {
      icon: Baby,
      title: "Quy định vé trẻ em",
      items: policyData.childPolicy,
      tone: "#eff6ff",
      color: "#1d4ed8",
    },
    {
      icon: NotebookPen,
      title: "Lưu ý trước chuyến đi",
      items: policyData.notes,
      tone: "#f5f3ff",
      color: "#6d28d9",
    },
  ];

  return (
    <div className="booking-policy-preview">
      <div className="booking-policy-preview__title">
        <div>
          <span>Thông tin cần biết</span>
          <strong>Quy định trước khi đặt tour</strong>
        </div>
        <Info size={20} aria-hidden="true" />
      </div>

      <div className="booking-policy-preview__list">
        {groups.map(({ icon: Icon, title, items, tone, color }) => (
          <div className="booking-policy-preview__item" key={title}>
            <span
              className="booking-policy-preview__icon"
              style={{ background: tone, color }}
              aria-hidden="true"
            >
              <Icon size={18} />
            </span>
            <div>
              <strong>{title}</strong>
              <p>{items[0]}</p>
            </div>
          </div>
        ))}
      </div>

      {expanded ? (
        <div className="booking-policy-preview__details">
          {groups.map(({ icon: Icon, title, items, tone, color }) => (
            <section
              className="booking-policy-preview__detail-group"
              key={`detail-${title}`}
            >
              <div className="booking-policy-preview__detail-title">
                <span style={{ background: tone, color }}>
                  <Icon size={17} />
                </span>
                <strong>{title}</strong>
              </div>
              <ul>
                {items.map((item, index) => (
                  <li key={`${title}-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="booking-policy-preview__link"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {expanded ? "Thu gọn quy định" : "Xem chi tiết quy định"}
        <ChevronDown
          size={17}
          aria-hidden="true"
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>
    </div>
  );
}

export default function TourDetailPage() {
  const router = useRouter();
  const { slug } = router.query;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [tour, setTour] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [allTours, setAllTours] = useState([]);
  const [selectedImage, setSelectedImage] = useState("");
  const [paymentState, setPaymentState] = useState(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [selectedDepartureId, setSelectedDepartureId] = useState("");
  const [bookingPassengers, setBookingPassengers] = useState({
    adultCount: 2,
    childCount: 0,
  });
  const [bookingGuests, setBookingGuests] = useState([]);
  const [myVouchers, setMyVouchers] = useState([]);
  const [savedTravelers, setSavedTravelers] = useState([]);
  const [selectedVoucherCode, setSelectedVoucherCode] = useState("");
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [accountUser, setAccountUser] = useState(() => getUser());
  const [activeBookingPeriods, setActiveBookingPeriods] = useState([]);

  useEffect(() => {
    if (!slug) return;
    let active = true;

    (async () => {
      try {
        const rawTour = await apiFetch(`/tours/${slug}`);
        const reviewData = await apiFetch(`/reviews/tour/${rawTour.id}`).catch(
          () => [],
        );
        const normalizedBase = normalizeTour({
          ...rawTour,
          reviews: reviewData,
        });
        const normalized = {
          ...normalizedBase,
          departures: getBookableDepartures(normalizedBase.departures),
        };
        const publicTours = await apiFetch("/tours").catch(() => []);
        if (!active) return;

        setTour(normalized);
        setReviews(reviewData || []);
        setAllTours((publicTours || []).map(normalizeTour));

        const initialCoverUrl = getTourCoverImage(
          normalized.media,
          normalized.coverUrl,
        );

        setSelectedImage(mapImageUrl(initialCoverUrl, API_URL));
        const firstBookableDeparture = normalized.departures?.[0] || null;
        setSelectedDepartureId(firstBookableDeparture?.id || "");
        const initialPassengers = { adultCount: 2, childCount: 0 };
        setBookingPassengers(initialPassengers);
        // Chờ /auth/me để khởi tạo Người lớn 1 bằng hồ sơ mới nhất.
        setBookingGuests(buildDefaultGuests(2, 0, null, []));
        setPreview(
          firstBookableDeparture
            ? renderDeparturePreview(
                normalized,
                firstBookableDeparture.id,
                2,
                0,
              )
            : null,
        );
        setLoading(false);

        const storedCurrent = getUser();
        if (storedCurrent) {
          const [
            freshUser,
            favoriteItems,
            voucherItems,
            travelerItems,
            activePeriods,
          ] = await Promise.all([
            apiFetch("/auth/me", { cache: "no-store" }).catch(
              () => storedCurrent,
            ),
            apiFetch(`/favorites/me?_=${Date.now()}`, {
              cache: "no-store",
            }).catch(() => []),
            apiFetch("/vouchers/me").catch(() => []),
            apiFetch("/travel-companions").catch(() => []),
            apiFetch(`/bookings/me/active-periods?_=${Date.now()}`, {
              cache: "no-store",
            }).catch(() => []),
          ]);
          if (!active) return;

          // Luôn ưu tiên hồ sơ mới nhất từ backend thay vì localStorage cũ.
          setAccountUser(freshUser);
          updateStoredUser(freshUser);

          setFavorite(isTourInFavorites(favoriteItems, rawTour.id));
          setMyVouchers(voucherItems || []);
          setActiveBookingPeriods(unwrapArray(activePeriods));

          const normalizedTravelers = (travelerItems || []).map(
            normalizeSavedTraveler,
          );
          setSavedTravelers(normalizedTravelers);

          // Người lớn 1 luôn là chủ tài khoản và được tự điền từ hồ sơ.
          setBookingGuests(
            buildDefaultGuests(2, 0, {
              fullName: freshUser.fullName || "",
              birthDate: normalizeDateInputValue(
                freshUser.birthDate || freshUser.dateOfBirth || "",
              ),
              gender: freshUser.gender || "",
              identityNumber:
                freshUser.identityNumber ||
                freshUser.idNumber ||
                freshUser.identity_number ||
                "",
            }),
          );
        } else {
          setAccountUser(null);
          setMyVouchers([]);
          setSavedTravelers([]);
          setSelectedVoucherCode("");
          setActiveBookingPeriods([]);
        }
      } catch (error) {
        if (!active) return;
        showToast("Không tải được chi tiết tour", "error");
        router.push("/tours");
      }
    })();

    return () => {
      active = false;
    };
  }, [slug, router, showToast]);

  const refreshFavoriteStatus = useCallback(async () => {
    if (!tour?.id || !getUser()) {
      setFavorite(false);
      return;
    }

    try {
      const items = await apiFetch(`/favorites/me?_=${Date.now()}`, {
        cache: "no-store",
      });
      setFavorite(isTourInFavorites(items, tour.id));
    } catch (error) {
      console.warn("Không đồng bộ được trạng thái yêu thích:", error);
    }
  }, [tour?.id]);

  useEffect(() => {
    if (!tour?.id) return undefined;

    refreshFavoriteStatus();
    const handleFocus = () => refreshFavoriteStatus();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshFavoriteStatus();
    };

    const handleRouteComplete = () => refreshFavoriteStatus();
    const handleFavoritesChanged = (event) => {
      const changedTourId = event?.detail?.tourId;

      if (!changedTourId || String(changedTourId) === String(tour.id)) {
        if (typeof event?.detail?.favorite === "boolean") {
          setFavorite(event.detail.favorite);
        } else {
          refreshFavoriteStatus();
        }
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handleFocus);
    window.addEventListener(
      "travela:favorites-changed",
      handleFavoritesChanged,
    );
    document.addEventListener("visibilitychange", handleVisibility);
    router.events?.on("routeChangeComplete", handleRouteComplete);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handleFocus);
      window.removeEventListener(
        "travela:favorites-changed",
        handleFavoritesChanged,
      );
      document.removeEventListener("visibilitychange", handleVisibility);
      router.events?.off("routeChangeComplete", handleRouteComplete);
    };
  }, [tour?.id, refreshFavoriteStatus, router.events]);

  useEffect(() => {
    if (!tour?.id) return;

    trackBehavior({
      action: "view",
      tourId: tour.id,
      score: 1,
      keyword: tour.name,
      meta: {
        source: "tour_detail",
        slug: tour.slug,
        destination: tour.destination?.name,
        theme: tour.tourTheme,
      },
    });
  }, [tour?.id]);

  const currentUser = accountUser || getUser();

  const selectedDeparture =
    (tour?.departures || []).find(
      (item) => String(item.id) === String(selectedDepartureId),
    ) || tour?.departures?.[0];
  const pickupOptions = (() => {
    const globalPoints = Array.isArray(tour?.pickupPoints)
      ? tour.pickupPoints.filter((item) => !item.departureId)
      : [];
    const departurePoints = Array.isArray(selectedDeparture?.pickupPoints)
      ? selectedDeparture.pickupPoints
      : [];

    const map = new Map();

    [...globalPoints, ...departurePoints].forEach((item) => {
      if (!item || String(item.status || "active") !== "active") return;

      const key = String(
        item.id ||
          `${item.name || ""}|${item.address || ""}|${item.pickupTime || ""}`,
      );

      if (!map.has(key)) map.set(key, item);
    });

    return Array.from(map.values());
  })();

  const formatPickupTime = (value) => {
    if (!value) return "Liên hệ";

    const raw = String(value).trim();
    const isoMatch = raw.match(/T(\d{2}):(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`;

    const directMatch = raw.match(/^(\d{1,2}):(\d{2})/);
    if (directMatch) {
      return `${String(directMatch[1]).padStart(2, "0")}:${directMatch[2]}`;
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(
        parsed.getUTCMinutes(),
      ).padStart(2, "0")}`;
    }

    return "Liên hệ";
  };

  const getDepartureRemainingSlots = (departure = {}) =>
    getDepartureRemainingSlotsValue(departure);

  const normalizeVoucherRow = (row) => ({
    ...(row?.voucher || row || {}),
    userVoucherId: row?.id,
    userVoucherStatus: row?.status || "available",
  });

  const formatVoucherDiscount = (voucher) => {
    if (!voucher) return "";
    if (voucher.discountType === "fixed") {
      return `Giảm ${formatCurrency(Number(voucher.discountValue || 0))}`;
    }
    const max = Number(voucher.maxDiscount || 0);
    return `Giảm ${Number(voucher.discountValue || 0)}%${
      max ? ` tối đa ${formatCurrency(max)}` : ""
    }`;
  };

  const estimateVoucherDiscount = (voucher, total) => {
    const amount = Number(total || 0);
    if (!voucher || !amount) return 0;
    if (voucher.discountType === "fixed") {
      return Math.min(Number(voucher.discountValue || 0), amount);
    }
    const raw = Math.round((amount * Number(voucher.discountValue || 0)) / 100);
    const max = Number(voucher.maxDiscount || 0);
    return Math.min(max > 0 ? Math.min(raw, max) : raw, amount);
  };

  const isVoucherAvailable = (voucher) => {
    if (!voucher) return false;
    if (
      voucher.userVoucherStatus &&
      voucher.userVoucherStatus !== "available"
    ) {
      return false;
    }
    if (voucher.status && voucher.status !== "active") return false;
    const now = new Date();
    if (voucher.startDate && new Date(voucher.startDate) > now) return false;
    if (voucher.endDate && new Date(voucher.endDate) < now) return false;
    return true;
  };

  const availableVouchers = (myVouchers || [])
    .map(normalizeVoucherRow)
    .filter(isVoucherAvailable);
  const recalculatePreview = (
    nextDepartureId,
    nextPassengers = bookingPassengers,
  ) => {
    if (!tour) return;

    const adultCount = Math.max(1, Number(nextPassengers.adultCount || 1));
    const childCount = Math.max(0, Number(nextPassengers.childCount || 0));
    const departureId =
      nextDepartureId || selectedDepartureId || tour.departures?.[0]?.id;

    setPreview(
      renderDeparturePreview(tour, departureId, adultCount, childCount),
    );
  };

  const openBookingWizardWithFreshProfile = async () => {
    if (!currentUser) {
      showToast("Bạn cần đăng nhập trước khi đặt tour.", "error");
      setTimeout(() => router.push("/login"), 300);
      return;
    }

    try {
      /*
       * Luôn tải lại hồ sơ + khoảng ngày đang bận ngay trước khi mở form.
       * Nhờ vậy nếu user vừa tạo booking ở tab/trang khác, danh sách lịch
       * bị khóa vẫn được cập nhật mới nhất.
       */
      const [freshUser, activePeriodsPayload] = await Promise.all([
        apiFetch("/auth/me", {
          cache: "no-store",
        }).catch(() => currentUser),
        apiFetch(`/bookings/me/active-periods?_=${Date.now()}`, {
          cache: "no-store",
        }).catch(() => []),
      ]);

      const freshActivePeriods = unwrapArray(activePeriodsPayload);

      setAccountUser(freshUser);
      updateStoredUser(freshUser);
      setActiveBookingPeriods(freshActivePeriods);

      setBookingGuests((previous) =>
        buildDefaultGuests(
          bookingPassengers.adultCount,
          bookingPassengers.childCount,
          {
            fullName: freshUser.fullName || "",
            birthDate: normalizeDateInputValue(
              freshUser.birthDate || freshUser.dateOfBirth || "",
            ),
            gender: freshUser.gender || "",
            identityNumber:
              freshUser.identityNumber ||
              freshUser.idNumber ||
              freshUser.identity_number ||
              "",
          },
          previous,
        ),
      );

      /*
       * Không để form mở ra với một option đang bị disabled.
       * Nếu lịch đang chọn bị trùng booking cũ, tự chuyển sang lịch đầu tiên
       * còn chỗ và không giao ngày. Nếu không có lịch hợp lệ thì vẫn mở modal
       * để user thấy lý do các lịch bị khóa.
       */
      const currentDeparture = (tour?.departures || []).find(
        (item) => String(item.id) === String(selectedDepartureId),
      );
      const currentConflict = currentDeparture
        ? findDepartureBookingConflict(currentDeparture, freshActivePeriods)
        : null;

      if (!currentDeparture || currentConflict) {
        const firstAvailable = getFirstAvailableDeparture(
          tour?.departures || [],
          freshActivePeriods,
        );

        if (firstAvailable) {
          setSelectedDepartureId(firstAvailable.id);
          recalculatePreview(firstAvailable.id, bookingPassengers);
        }
      }

      setBookingModalOpen(true);
    } catch (error) {
      showToast(error?.message || "Không tải được hồ sơ để đặt tour.", "error");
    }
  };

  const handleDepartureChange = (event) => {
    const depId = Number(event.target.value);
    setSelectedDepartureId(depId);
    recalculatePreview(depId, bookingPassengers);
  };

  const handlePassengerChange = (field) => (event) => {
    const minValue = field === "adultCount" ? 1 : 0;
    const value = Math.max(minValue, Number(event.target.value || minValue));
    const nextPassengers = {
      ...bookingPassengers,
      [field]: value,
    };

    setBookingPassengers(nextPassengers);
    setBookingGuests((prev) =>
      buildDefaultGuests(
        nextPassengers.adultCount,
        nextPassengers.childCount,
        currentUser,
        prev,
      ),
    );
    recalculatePreview(selectedDepartureId, nextPassengers);
  };

  const handleGuestChange = (index, field) => (event) => {
    setBookingGuests((prev) =>
      updateGuestAtIndex(prev, index, field, event.target.value),
    );
  };

  const handleSavedTravelerSelect = (rowIndex) => (event) => {
    const travelerId = String(event.target.value || "");

    setBookingGuests((prev) => {
      const currentGuest = prev[rowIndex];

      // Người lớn đầu tiên luôn là chủ tài khoản, không được thay bằng người đã lưu.
      if (!currentGuest || currentGuest.isAccountOwner) return prev;

      // Chuyển về tự nhập thủ công.
      if (!travelerId) {
        return prev.map((guest, index) =>
          index === rowIndex
            ? {
                ...guest,
                savedTravelerId: "",
                fullName: "",
                dateOfBirth: "",
                gender: "",
                idNumber: "",
              }
            : guest,
        );
      }

      // Chặn chọn trùng cùng một hành khách đã lưu cho nhiều vé.
      const duplicated = prev.some(
        (guest, index) =>
          index !== rowIndex &&
          String(guest.savedTravelerId || "") === travelerId,
      );

      if (duplicated) {
        showToast("Hành khách này đã được chọn cho một vé khác.", "error");
        return prev;
      }

      const traveler = savedTravelers.find(
        (item) => String(item.id) === travelerId,
      );
      if (!traveler) return prev;

      return prev.map((guest, index) =>
        index === rowIndex
          ? {
              ...guest,
              savedTravelerId: travelerId,
              fullName: traveler.fullName,
              dateOfBirth: normalizeDateInputValue(traveler.dateOfBirth),
              gender: traveler.gender,
              idNumber: traveler.idNumber,
            }
          : guest,
      );
    });
  };

  const getAvailableSavedTravelers = (guest, rowIndex) => {
    if (guest?.isAccountOwner) return [];

    const selectedByOtherRows = new Set(
      bookingGuests
        .filter((_, index) => index !== rowIndex)
        .map((item) => String(item.savedTravelerId || ""))
        .filter(Boolean),
    );

    return savedTravelers.filter((traveler) => {
      const sameGuestType = traveler.guestType === guest.guestType;
      const isCurrentSelection =
        String(traveler.id) === String(guest.savedTravelerId || "");
      const isUsedElsewhere = selectedByOtherRows.has(String(traveler.id));

      return sameGuestType && (isCurrentSelection || !isUsedElsewhere);
    });
  };

  const selectedVoucher = availableVouchers.find(
    (item) => String(item.code) === String(selectedVoucherCode),
  );
  const selectedVoucherDiscount = estimateVoucherDiscount(
    selectedVoucher,
    preview?.total,
  );

  const getBookingId = (response) =>
    response?.id ||
    response?.bookingId ||
    response?.booking_id ||
    response?.booking?.id ||
    response?.booking?.bookingId ||
    response?.data?.id ||
    response?.data?.bookingId ||
    response?.data?.booking?.id;

  const getPaymentSession = (checkout, booking) => ({
    bookingId: String(
      getBookingId(booking) ||
        checkout?.bookingId ||
        checkout?.booking_id ||
        "",
    ),
    bookingCode:
      checkout?.bookingCode ||
      checkout?.booking?.bookingCode ||
      booking?.bookingCode ||
      booking?.booking_code ||
      "",
    amount: Number(
      checkout?.amount ||
        checkout?.finalAmount ||
        checkout?.booking?.finalAmount ||
        booking?.finalAmount ||
        booking?.final_amount ||
        0,
    ),
    paymentMethod: "bank_transfer",
    transactionCode:
      checkout?.transactionCode ||
      checkout?.internalTransactionCode ||
      checkout?.internal_transaction_code ||
      checkout?.txn ||
      "",
    internalTransactionCode:
      checkout?.internalTransactionCode ||
      checkout?.transactionCode ||
      checkout?.internal_transaction_code ||
      checkout?.txn ||
      "",
    expiresAt:
      checkout?.expiresAt ||
      checkout?.expireAt ||
      checkout?.holdExpiresAt ||
      checkout?.booking?.holdExpiresAt ||
      booking?.holdExpiresAt ||
      booking?.hold_expires_at ||
      null,
    paymentStatus:
      checkout?.paymentStatus || checkout?.payment_status || "pending",
    qrImageUrl:
      checkout?.qrImageUrl ||
      checkout?.qrCodeUrl ||
      checkout?.sepay?.qrImageUrl ||
      "",
    qrCodeUrl:
      checkout?.qrCodeUrl ||
      checkout?.qrImageUrl ||
      checkout?.sepay?.qrImageUrl ||
      "",
    sepay: checkout?.sepay || null,
    transferContent:
      checkout?.sepay?.transferContent ||
      checkout?.transferContent ||
      checkout?.transactionCode ||
      checkout?.internalTransactionCode ||
      "",
  });

  const buildBookingPayload = (formData) => {
    const adultCount = Number(formData.get("adultCount"));
    const childCount = Number(formData.get("childCount"));
    const guests = bookingGuests.map((guest) => ({
      fullName: String(guest.fullName || "").trim(),
      dateOfBirth: guest.dateOfBirth || undefined,
      gender: guest.gender || undefined,
      guestType: guest.guestType,
      idNumber: String(guest.idNumber || "").trim() || undefined,
    }));

    return {
      departureId: Number(formData.get("departureId")),
      adultCount,
      childCount,
      guests,
      contactName: formData.get("contactName"),
      contactEmail: formData.get("contactEmail"),
      contactPhone: formData.get("contactPhone"),
      pickupPointId: formData.get("pickupPointId")
        ? Number(formData.get("pickupPointId"))
        : undefined,
      voucherCode:
        String(formData.get("voucherCode") || "").trim() || undefined,
      note: formData.get("note"),
    };
  };

  const handleBooking = async (event) => {
    event.preventDefault();

    if (!currentUser) {
      showToast("Bạn cần đăng nhập trước khi đặt tour.", "error");
      setTimeout(() => router.push("/login"), 300);
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload = buildBookingPayload(formData);
    const expectedGuests = payload.adultCount + payload.childCount;

    const departureForSubmit = (tour?.departures || []).find(
      (item) => String(item.id) === String(payload.departureId),
    );
    const submitConflict = findDepartureBookingConflict(
      departureForSubmit,
      activeBookingPeriods,
    );

    if (submitConflict) {
      showToast(
        `Lịch đã chọn bị trùng với booking ${
          submitConflict.bookingCode || "đang có"
        } (${formatDate(
          submitConflict.startDate || submitConflict.departureDate,
        )} - ${formatDate(
          submitConflict.endDate ||
            submitConflict.startDate ||
            submitConflict.departureDate,
        )}). Vui lòng chọn lịch khác.`,
        "error",
      );
      return;
    }

    if (pickupOptions.length > 0 && !payload.pickupPointId) {
      showToast("Vui lòng chọn điểm đón trước khi đặt tour.", "error");
      return;
    }

    if (payload.guests.length !== expectedGuests) {
      showToast("Số form hành khách chưa khớp với số vé đã chọn.", "error");
      return;
    }

    const missingGuest = payload.guests.find(
      (guest) =>
        !guest.fullName ||
        !guest.idNumber ||
        !guest.dateOfBirth ||
        !guest.gender,
    );

    if (missingGuest) {
      showToast("Vui lòng nhập họ tên cho tất cả hành khách.", "error");
      return;
    }

    const accountOwnerGuest =
      bookingGuests.find((guest) => guest.isAccountOwner) || bookingGuests[0];

    const contactPhone = String(payload.contactPhone || "").trim();
    const ownerIdentityNumber = String(
      accountOwnerGuest?.idNumber || "",
    ).trim();

    if (!contactPhone) {
      showToast("Vui lòng nhập số điện thoại liên hệ.", "error");
      return;
    }

    if (!ownerIdentityNumber) {
      showToast("Vui lòng nhập CCCD hoặc hộ chiếu cho Người lớn 1.", "error");
      return;
    }

    const paymentMethod = "bank_transfer";

    try {
      /*
       * Trước khi tạo booking:
       * - Nếu tài khoản chưa có số điện thoại, lấy số đang nhập trong form.
       * - Nếu tài khoản chưa có CCCD, lấy CCCD của Người lớn 1.
       * - Lưu hai thông tin này vào hồ sơ tài khoản.
       */
      await updateMissingBookingProfile(payload);

      const checkout = await apiFetch("/payments/checkout", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          paymentMethod,
        }),
      });

      setPaymentState(getPaymentSession(checkout, checkout?.booking || null));
      setBookingModalOpen(false);

      showToast(
        `Đã tạo mã QR thanh toán cho booking ${
          checkout.bookingCode || checkout.booking?.bookingCode || ""
        }`,
        "success",
      );
    } catch (error) {
      showToast(
        error?.message || "Không thể tạo booking. Vui lòng thử lại.",
        "error",
      );

      if (
        String(error?.message || "")
          .toLowerCase()
          .includes("unauthorized")
      ) {
        setTimeout(() => router.push("/login"), 500);
      }
    }
  };

  const updateMissingBookingProfile = async (payload) => {
    const fallbackUser = accountUser || getUser();

    if (!fallbackUser) {
      throw new Error("Bạn cần đăng nhập trước khi đặt tour.");
    }

    // Lấy hồ sơ mới nhất để tránh ghi đè hoặc đánh giá thiếu field
    // dựa trên localStorage cũ.
    const storedUser = await apiFetch("/auth/me", {
      cache: "no-store",
    }).catch(() => fallbackUser);

    const accountOwnerGuest =
      bookingGuests.find((guest) => guest.isAccountOwner) || bookingGuests[0];

    const contactPhone = String(payload.contactPhone || "").trim();
    const identityNumber = String(accountOwnerGuest?.idNumber || "").trim();
    const birthDate = normalizeDateInputValue(
      accountOwnerGuest?.dateOfBirth || "",
    );
    const gender = String(accountOwnerGuest?.gender || "")
      .trim()
      .toLowerCase();

    const currentPhone = String(storedUser.phone || "").trim();
    const currentIdentityNumber = String(
      storedUser.identityNumber ||
        storedUser.idNumber ||
        storedUser.identity_number ||
        "",
    ).trim();
    const currentBirthDate = normalizeDateInputValue(
      storedUser.birthDate || storedUser.dateOfBirth || "",
    );
    const currentGender = String(storedUser.gender || "")
      .trim()
      .toLowerCase();

    const updatePayload = {};

    // Chỉ bổ sung field hồ sơ đang thiếu; tuyệt đối không tự ghi đè
    // thông tin người dùng đã lưu trước đó.
    if (!currentPhone && contactPhone) {
      updatePayload.phone = contactPhone;
    }

    if (!currentIdentityNumber && identityNumber) {
      updatePayload.identityNumber = identityNumber;
    }

    if (!currentBirthDate && birthDate) {
      updatePayload.birthDate = birthDate;
    }

    if (!currentGender && ["male", "female", "other"].includes(gender)) {
      updatePayload.gender = gender;
    }

    if (!Object.keys(updatePayload).length) {
      setAccountUser(storedUser);
      updateStoredUser(storedUser);
      return storedUser;
    }

    const updatedUser = await apiFetch("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });

    setAccountUser(updatedUser);
    updateStoredUser(updatedUser);

    return updatedUser;
  };

  const handlePaidFromQr = (result) => {
    setPaymentState(null);
    showToast("Thanh toán thành công! Email xác nhận đã được gửi.", "success");
    setTimeout(() => {
      router.push(
        `/booking-success?code=${encodeURIComponent(result?.bookingCode || "")}`,
      );
    }, 450);
  };

  const submitReview = async (event) => {
    event.preventDefault();
    if (!currentUser) {
      showToast("Bạn cần đăng nhập để gửi đánh giá.", "error");
      setTimeout(() => router.push("/login"), 300);
      return;
    }

    const rating = Number(reviewForm.rating);
    const comment = String(reviewForm.comment || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return showToast("Điểm đánh giá phải là số nguyên từ 1 đến 5.", "error");
    if (comment.length > 2000)
      return showToast("Nội dung đánh giá tối đa 2000 ký tự.", "error");

    setSubmittingReview(true);
    try {
      const created = await apiFetch("/reviews", {
        method: "POST",
        body: JSON.stringify({
          tourId: Number(tour.id),
          rating: Number(reviewForm.rating),
          comment: reviewForm.comment,
        }),
      });
      const freshReview = {
        ...created,
        user: {
          fullName: currentUser?.fullName || "Bạn",
          avatarUrl: currentUser?.avatarUrl || null,
        },
        status: created?.status || "pending",
      };
      setReviews((prev) => [freshReview, ...(prev || [])]);
      setTour((prev) => {
        if (!prev) return prev;
        const nextReviews = [freshReview, ...(reviews || [])];
        const nextRating = nextReviews.length
          ? nextReviews.reduce(
              (sum, item) => sum + Number(item.rating || 0),
              0,
            ) / nextReviews.length
          : prev.rating;
        return { ...prev, reviewCount: nextReviews.length, rating: nextRating };
      });
      setReviewForm({ rating: 5, comment: "" });
      showToast("Đã gửi đánh giá và hiển thị ngay tại tour.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmittingReview(false);
    }
  };

  const toggleFavorite = async () => {
    const user = getUser();

    if (!user) {
      showToast("Bạn cần đăng nhập để lưu tour yêu thích.", "error");
      setTimeout(() => router.push("/login"), 300);
      return;
    }

    if (!tour?.id || favoriteLoading) return;

    const previousFavorite = favorite;
    const nextFavorite = !previousFavorite;

    setFavorite(nextFavorite);
    setFavoriteLoading(true);

    try {
      if (previousFavorite) {
        await apiFetch(`/favorites/${tour.id}`, { method: "DELETE" });
      } else {
        await apiFetch(`/favorites/${tour.id}`, { method: "POST" });
      }

      window.dispatchEvent(
        new CustomEvent("travela:favorites-changed", {
          detail: {
            tourId: tour.id,
            favorite: nextFavorite,
          },
        }),
      );

      if (nextFavorite) {
        trackBehavior({
          action: "favorite",
          tourId: tour.id,
          score: 3,
          keyword: tour.destination?.name || tour.tourTheme || "",
          meta: {
            source: "tour_detail",
            destination: tour.destination?.name,
            theme: tour.tourTheme,
          },
        }).catch(() => {});

        showToast("Đã thêm vào tour yêu thích.", "success");
      } else {
        showToast("Đã bỏ khỏi tour yêu thích.", "success");
      }
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();

      if (
        !previousFavorite &&
        (message.includes("already") ||
          message.includes("đã có") ||
          message.includes("đã tồn tại"))
      ) {
        setFavorite(true);

        window.dispatchEvent(
          new CustomEvent("travela:favorites-changed", {
            detail: { tourId: tour.id, favorite: true },
          }),
        );

        showToast(
          "Tour này đã nằm trong danh sách yêu thích của bạn.",
          "success",
        );
      } else if (
        previousFavorite &&
        (message.includes("not found") ||
          message.includes("không tồn tại") ||
          message.includes("không tìm thấy"))
      ) {
        setFavorite(false);

        window.dispatchEvent(
          new CustomEvent("travela:favorites-changed", {
            detail: { tourId: tour.id, favorite: false },
          }),
        );
      } else {
        setFavorite(previousFavorite);
        showToast(error?.message || "Không cập nhật được yêu thích.", "error");
      }
    } finally {
      setFavoriteLoading(false);
    }
  };

  if (loading || !tour) return <Loading text="Đang tải chi tiết tour..." />;

  const gallery = buildTourGallery(tour.media, tour.coverUrl);
  const relatedTours = allTours
    .filter(
      (item) =>
        item.slug !== tour.slug &&
        item.destination?.name === tour.destination?.name,
    )
    .slice(0, 3);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .tour-detail-layout {
            display: grid;
            grid-template-columns: 1fr 400px;
            gap: 40px;
            align-items: start;
          }
          @media (max-width: 1024px) {
            .tour-detail-layout {
              grid-template-columns: 1fr;
            }
          }
          .sticky-booking {
            position: sticky;
            top: 100px;
          }
          .input-modern {
            width: 100%;
            padding: 12px 16px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            color: #1f2937;
            font-size: 0.95rem;
            transition: all 0.2s;
            outline: none;
          }
          .input-modern:focus {
            background: #fff;
            border-color: #72b44b;
            box-shadow: 0 0 0 3px rgba(114, 180, 75, 0.15);
          }
          .gallery-main {
            width: 100%;
            height: 500px;
            object-fit: cover;
            border-radius: 24px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
            transition: opacity 0.3s ease;
          }
          .gallery-thumb-btn {
            border: 2px solid transparent;
            border-radius: 16px;
            overflow: hidden;
            padding: 0;
            background: transparent;
            cursor: pointer;
            transition: all 0.2s;
            height: 90px;
          }
          .gallery-thumb-btn.active {
            border-color: #72b44b;
            box-shadow: 0 4px 12px rgba(114, 180, 75, 0.2);
          }
          .gallery-thumb-btn img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.7;
            transition: opacity 0.2s;
          }
          .gallery-thumb-btn.active img, .gallery-thumb-btn:hover img {
            opacity: 1;
          }
          .timeline-modern {
            position: relative;
            padding-left: 32px;
            margin-left: 16px;
            border-left: 2px dashed #cbd5e1;
          }
          .timeline-item-modern {
            position: relative;
            margin-bottom: 40px;
          }
          .timeline-item-modern:last-child {
            margin-bottom: 0;
          }
          .timeline-dot {
            position: absolute;
            left: -43px;
            top: 0;
            width: 20px;
            height: 20px;
            background: #72b44b;
            border: 4px solid #fff;
            border-radius: 50%;
            box-shadow: 0 0 0 2px #72b44b;
          }

          .booking-policy-preview {
            margin-top: 18px;
            padding: 20px;
            border: 1px solid #e5ebf1;
            border-radius: 20px;
            background: #ffffff;
            box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
          }
          .booking-policy-preview__title {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding-bottom: 14px;
            border-bottom: 1px solid #eef2f6;
            color: #5a9d34;
          }
          .booking-policy-preview__title span {
            display: block;
            margin-bottom: 3px;
            color: #8a97a8;
            font-size: 0.76rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
          }
          .booking-policy-preview__title strong {
            color: #172033;
            font-size: 1rem;
          }
          .booking-policy-preview__list {
            display: grid;
            gap: 14px;
            padding: 16px 0;
          }
          .booking-policy-preview__item {
            display: flex;
            align-items: flex-start;
            gap: 11px;
          }
          .booking-policy-preview__icon {
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            flex-shrink: 0;
            border-radius: 11px;
          }
          .booking-policy-preview__item strong {
            display: block;
            margin-bottom: 3px;
            color: #283548;
            font-size: 0.88rem;
          }
          .booking-policy-preview__item p {
            display: -webkit-box;
            margin: 0;
            overflow: hidden;
            color: #6b778c;
            font-size: 0.81rem;
            line-height: 1.5;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }
          .booking-policy-preview__details {
            display: grid;
            gap: 14px;
            padding: 4px 0 16px;
            border-top: 1px solid #eef2f6;
          }
          .booking-policy-preview__detail-group {
            padding: 14px;
            border: 1px solid #eef2f6;
            border-radius: 14px;
            background: #fbfdff;
          }
          .booking-policy-preview__detail-title {
            display: flex;
            align-items: center;
            gap: 9px;
            margin-bottom: 10px;
            color: #283548;
            font-size: 0.9rem;
          }
          .booking-policy-preview__detail-title span {
            display: grid;
            place-items: center;
            width: 31px;
            height: 31px;
            flex-shrink: 0;
            border-radius: 10px;
          }
          .booking-policy-preview__detail-group ul {
            display: grid;
            gap: 8px;
            margin: 0;
            padding-left: 18px;
          }
          .booking-policy-preview__detail-group li {
            color: #64748b;
            font-size: 0.82rem;
            line-height: 1.55;
          }
          .booking-policy-preview__link {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            width: 100%;
            padding: 13px 0 0;
            border: 0;
            border-top: 1px solid #eef2f6;
            background: transparent;
            color: #4f8f32;
            font-family: inherit;
            font-size: 0.88rem;
            font-weight: 800;
            cursor: pointer;
          }
          .booking-policy-preview__link:hover {
            color: #386c20;
          }


          /* DARK MODE - chỉ đổi nền các khối đang trắng trong chi tiết tour */
          html.dark-mode body .tour-detail-main-section .tour-itinerary-day-card {
            background: #111b2d !important;
            border-color: rgba(148, 163, 184, 0.18) !important;
          }

          html.dark-mode body .tour-detail-main-section .tour-itinerary-location {
            background: #172338 !important;
            border-color: rgba(148, 163, 184, 0.20) !important;
          }

          html.dark-mode body .tour-detail-main-section .tour-service-item {
            background: #111b2d !important;
            border-color: rgba(148, 163, 184, 0.18) !important;
          }

          html.dark-mode body .tour-detail-main-section .tour-booking-price-card {
            background: #111b2d !important;
            border-color: rgba(148, 163, 184, 0.18) !important;
          }

          html.dark-mode body .tour-detail-main-section .tour-review-dark-shell,
          html.dark-mode body .tour-detail-main-section .tour-review-dark-shell > *,
          html.dark-mode body .tour-detail-main-section .tour-review-dark-shell [style*="background: #fff"],
          html.dark-mode body .tour-detail-main-section .tour-review-dark-shell [style*="background: rgb(255, 255, 255)"],
          html.dark-mode body .tour-detail-main-section .tour-review-dark-shell [style*="background-color: #fff"],
          html.dark-mode body .tour-detail-main-section .tour-review-dark-shell [style*="background-color: rgb(255, 255, 255)"] {
            background: #111b2d !important;
            border-color: rgba(148, 163, 184, 0.18) !important;
          }

          html.dark-mode body .tour-detail-main-section .tour-review-dark-shell [style*="background: #f8fafc"],
          html.dark-mode body .tour-detail-main-section .tour-review-dark-shell [style*="background: rgb(248, 250, 252)"],
          html.dark-mode body .tour-detail-main-section .tour-review-dark-shell [style*="background: #f1f5f9"],
          html.dark-mode body .tour-detail-main-section .tour-review-dark-shell [style*="background: rgb(241, 245, 249)"] {
            background: #172338 !important;
          }



          /* FINAL FIX: chỉ ô điểm tổng đánh giá còn sáng trong dark mode */
          html.dark-mode body .tour-review-dark-shell [style*="background: #fff7ed"],
          html.dark-mode body .tour-review-dark-shell [style*="background: rgb(255, 247, 237)"],
          html.dark-mode body .tour-review-dark-shell [style*="background: #fffbeb"],
          html.dark-mode body .tour-review-dark-shell [style*="background: rgb(255, 251, 235)"] {
            background: #172338 !important;
            border-color: rgba(245, 158, 11, 0.32) !important;
          }

        `,
        }}
      />

      {/* Header gọn gàng chứa tiêu đề và nút Yêu thích */}
      <section
        className="tour-detail-header-section"
        style={{
          background: "#fff",
          paddingTop: "40px",
          paddingBottom: "24px",
        }}
      >
        <div className="container">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "20px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  marginBottom: "12px",
                }}
              >
                <span
                  style={{
                    padding: "6px 12px",
                    background: "#f1f5f9",
                    color: "#475569",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {tour.code}
                </span>
                <span
                  style={{
                    padding: "6px 12px",
                    background: "rgba(114, 180, 75, 0.1)",
                    color: "#72b44b",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {tour.destination?.name || "Điểm đến"}
                </span>
                <span
                  style={{
                    padding: "6px 12px",
                    background: "#fffbeb",
                    color: "#d97706",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {tour.hotelStars || 4}★ Khách sạn
                </span>
              </div>
              <h1
                style={{
                  fontSize: "2.4rem",
                  color: "#0f172a",
                  margin: "0 0 12px",
                  lineHeight: 1.2,
                }}
              >
                {tour.name}
              </h1>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  color: "#64748b",
                  fontSize: "0.95rem",
                }}
              >
                <span
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <svg
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  {tour.durationDays} ngày {tour.durationNights} đêm
                </span>
                <span
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <svg
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  {mapLabel("theme", tour.tourTheme)}
                </span>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <button
                type="button"
                onClick={toggleFavorite}
                aria-label={favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
                aria-pressed={favorite}
                disabled={favoriteLoading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  minHeight: "44px",
                  padding: "11px 18px",
                  borderRadius: "999px",
                  background: favorite ? "#fff1f2" : "#ffffff",
                  border: favorite ? "1px solid #fecdd3" : "1px solid #e2e8f0",
                  color: favorite ? "#e11d48" : "#475569",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  lineHeight: 1,
                  cursor: favoriteLoading ? "wait" : "pointer",
                  opacity: favoriteLoading ? 0.65 : 1,
                  transition: "all 0.2s ease",
                  boxShadow: favorite
                    ? "0 4px 12px rgba(225, 29, 72, 0.1)"
                    : "0 4px 12px rgba(15, 23, 42, 0.05)",
                }}
              >
                <Heart
                  size={19}
                  fill={favorite ? "currentColor" : "none"}
                  strokeWidth={favorite ? 0 : 2}
                  style={{ flexShrink: 0 }}
                />
                <span>{favorite ? "Đã lưu" : "Lưu yêu thích"}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        className="tour-detail-main-section"
        style={{ background: "#f8fafc", padding: "40px 0 80px" }}
      >
        <div className="container tour-detail-layout">
          {/* CỘT TRÁI: Nội dung chi tiết */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "40px" }}
          >
            {/* Gallery */}
            <div>
              <img
                className="gallery-main"
                src={selectedImage}
                alt={tour.name}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: "12px",
                  marginTop: "12px",
                }}
              >
                {gallery.map((item, index) => {
                  const rawUrl = getTourMediaUrl(item, tour.coverUrl);
                  const url = mapImageUrl(rawUrl, API_URL);

                  if (!url) return null;

                  return (
                    <button
                      key={item?.id || `${rawUrl}-${index}`}
                      type="button"
                      className={`gallery-thumb-btn ${
                        selectedImage === url ? "active" : ""
                      }`}
                      onClick={() => setSelectedImage(url)}
                      aria-label={
                        isTourCoverImage(item)
                          ? "Xem ảnh bìa tour"
                          : `Xem ảnh tour ${index + 1}`
                      }
                    >
                      <img
                        src={url}
                        alt={
                          isTourCoverImage(item)
                            ? `${tour.name} - ảnh bìa`
                            : `${tour.name} - ảnh ${index + 1}`
                        }
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mô tả */}
            <article
              className="section-card"
              style={{
                background: "#fff",
                padding: "40px",
                borderRadius: "24px",
                border: "1px solid #f1f5f9",
                boxShadow: "0 10px 30px rgba(0,0,0,0.03)",
              }}
            >
              <h2
                style={{
                  fontSize: "1.8rem",
                  color: "#0f172a",
                  margin: "0 0 20px",
                }}
              >
                Tổng quan chuyến đi
              </h2>
              <p
                style={{
                  fontSize: "1.05rem",
                  color: "#475569",
                  lineHeight: 1.7,
                  whiteSpace: "pre-line",
                }}
              >
                {tour.fullDescription ||
                  tour.shortDescription ||
                  "Chưa có mô tả cho tour này."}
              </p>
            </article>

            {/* Lịch trình (Timeline Modern) */}
            <article
              className="section-card"
              style={{
                background: "#fff",
                padding: "40px",
                borderRadius: "24px",
                border: "1px solid #f1f5f9",
                boxShadow: "0 10px 30px rgba(0,0,0,0.03)",
              }}
            >
              <h2
                style={{
                  fontSize: "1.8rem",
                  color: "#0f172a",
                  margin: "0 0 32px",
                }}
              >
                Lịch trình chi tiết
              </h2>
              {(tour.itinerary || []).length ? (
                <div className="timeline-modern">
                  {tour.itinerary.map((item) => (
                    <div
                      key={`${item.dayNumber}-${item.itemOrder}`}
                      className="timeline-item-modern"
                    >
                      <div className="timeline-dot"></div>
                      <div
                        className="tour-itinerary-day-card"
                        style={{
                          background: "#f8fafc",
                          padding: "24px",
                          borderRadius: "20px",
                          border: "1px solid #f1f5f9",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 12px",
                            background: "#1e293b",
                            color: "#fff",
                            borderRadius: "8px",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            marginBottom: "12px",
                          }}
                        >
                          Ngày {item.dayNumber}
                        </span>
                        <h3
                          style={{
                            margin: "0 0 12px",
                            fontSize: "1.3rem",
                            color: "#0f172a",
                          }}
                        >
                          {item.title}
                        </h3>
                        <p
                          style={{
                            margin: "0 0 16px",
                            color: "#475569",
                            lineHeight: 1.6,
                          }}
                        >
                          {item.description}
                        </p>
                        <span
                          className="tour-itinerary-location"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            color: "#64748b",
                            fontSize: "0.9rem",
                            background: "#fff",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                          </svg>
                          {item.locationName || "Theo chương trình"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#64748b" }}>Chưa có lịch trình chi tiết.</p>
              )}
            </article>

            {/* Dịch vụ đi kèm (Chỗ ở, Phương tiện) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: "24px",
              }}
            >
              <article
                className="section-card"
                style={{
                  background: "#fff",
                  padding: "32px",
                  borderRadius: "24px",
                  border: "1px solid #f1f5f9",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "24px",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      background: "#fef3c7",
                      color: "#d97706",
                      borderRadius: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                  </div>
                  <h2
                    style={{ fontSize: "1.4rem", color: "#0f172a", margin: 0 }}
                  >
                    Chỗ ở
                  </h2>
                </div>
                {(tour.accommodations || []).length ? (
                  <div style={{ display: "grid", gap: "16px" }}>
                    {tour.accommodations.map((item) => (
                      <div
                        key={item.id || item.name}
                        className="tour-service-item tour-accommodation-item"
                        style={{
                          background: "#f8fafc",
                          padding: "16px",
                          borderRadius: "16px",
                          border: "1px solid #f1f5f9",
                        }}
                      >
                        <strong
                          style={{
                            display: "block",
                            fontSize: "1.1rem",
                            color: "#1f2937",
                            marginBottom: "8px",
                          }}
                        >
                          {item.name}
                        </strong>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            marginBottom: "8px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.85rem",
                              color: "#64748b",
                              background: "#e2e8f0",
                              padding: "4px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            {item.accommodationType || "Lưu trú"}
                          </span>
                          {item.starRating || tour.hotelStars ? (
                            <span
                              style={{
                                fontSize: "0.85rem",
                                color: "#d97706",
                                background: "#fffbeb",
                                padding: "4px 8px",
                                borderRadius: "6px",
                              }}
                            >
                              {renderStars(item.starRating || tour.hotelStars)}
                            </span>
                          ) : null}
                        </div>
                        {item.description ? (
                          <p
                            style={{
                              fontSize: "0.9rem",
                              color: "#475569",
                              margin: 0,
                            }}
                          >
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "#64748b" }}>Chưa cập nhật chỗ ở.</p>
                )}
              </article>

              <article
                className="section-card"
                style={{
                  background: "#fff",
                  padding: "32px",
                  borderRadius: "24px",
                  border: "1px solid #f1f5f9",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "24px",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      background: "#eff6ff",
                      color: "#2563eb",
                      borderRadius: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                      ></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                  </div>
                  <h2
                    style={{ fontSize: "1.4rem", color: "#0f172a", margin: 0 }}
                  >
                    Di chuyển
                  </h2>
                </div>
                {(tour.transports || []).length ? (
                  <div style={{ display: "grid", gap: "16px" }}>
                    {tour.transports.map((item) => (
                      <div
                        key={item.id || item.name}
                        className="tour-service-item tour-transport-item"
                        style={{
                          background: "#f8fafc",
                          padding: "16px",
                          borderRadius: "16px",
                          border: "1px solid #f1f5f9",
                        }}
                      >
                        <strong
                          style={{
                            display: "block",
                            fontSize: "1.1rem",
                            color: "#1f2937",
                            marginBottom: "8px",
                          }}
                        >
                          {item.name}
                        </strong>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            marginBottom: "8px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.85rem",
                              color: "#64748b",
                              background: "#e2e8f0",
                              padding: "4px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            {item.transportType || "Phương tiện"}
                          </span>
                          {item.provider ? (
                            <span
                              style={{
                                fontSize: "0.85rem",
                                color: "#3b82f6",
                                background: "#eff6ff",
                                padding: "4px 8px",
                                borderRadius: "6px",
                              }}
                            >
                              {item.provider}
                            </span>
                          ) : null}
                        </div>
                        {item.origin || item.destinationLabel ? (
                          <p
                            style={{
                              fontSize: "0.9rem",
                              color: "#475569",
                              margin: "0 0 4px",
                            }}
                          >
                            Lộ trình: {item.origin || "Điểm đi"} →{" "}
                            {item.destinationLabel || tour.destination?.name}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "#64748b" }}>Chưa cập nhật phương tiện.</p>
                )}
              </article>
            </div>

            {/* Đánh giá kiểu Shopee: lọc sao, xem thêm trong modal, upload hình ảnh */}
            <div className="tour-review-dark-shell">
              <TourReviewSection
                tour={tour}
                currentUser={currentUser}
                onRequireLogin={() => {
                  showToast("Bạn cần đăng nhập để gửi đánh giá.", "error");
                  setTimeout(() => router.push("/login"), 300);
                }}
              />
            </div>
          </div>

          {/* CỘT PHẢI: Sticky Booking Widget */}
          <aside className="sticky-booking">
            <div
              className="tour-booking-price-card"
              style={{
                background: "linear-gradient(180deg, #ffffff 0%, #f8fff4 100%)",
                borderRadius: "24px",
                padding: "26px",
                boxShadow: "0 22px 50px rgba(15,23,42,0.10)",
                border: "1px solid #e5f3df",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  marginBottom: "18px",
                  paddingBottom: "18px",
                  borderBottom: "1px solid #dcebd6",
                }}
              >
                <span
                  style={{
                    color: "#64748b",
                    fontSize: "0.9rem",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Giá từ
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "8px",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "2rem",
                      color: "#ff9f1a",
                      lineHeight: 1,
                    }}
                  >
                    {formatCurrency(tour.minPrice)}
                  </strong>
                  <span style={{ color: "#64748b" }}>/người</span>
                </div>
              </div>

              {(tour.departures || []).length ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={openBookingWizardWithFreshProfile}
                    style={{
                      padding: "16px",
                      borderRadius: "14px",
                      background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                      color: "#fff",
                      border: "none",
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      width: "100%",
                      cursor: "pointer",
                      boxShadow: "0 8px 20px rgba(114, 180, 75, 0.3)",
                    }}
                  >
                    Đặt tour ngay
                  </button>
                  <BookingWizardModal
                    open={bookingModalOpen}
                    onClose={() => setBookingModalOpen(false)}
                    onSubmit={handleBooking}
                    tour={tour}
                    currentUser={currentUser}
                    activeBookingPeriods={activeBookingPeriods}
                    selectedDepartureId={selectedDepartureId}
                    bookingPassengers={bookingPassengers}
                    bookingGuests={bookingGuests}
                    pickupOptions={pickupOptions}
                    preview={preview}
                    availableVouchers={availableVouchers}
                    selectedVoucherCode={selectedVoucherCode}
                    selectedVoucher={selectedVoucher}
                    selectedVoucherDiscount={selectedVoucherDiscount}
                    savedTravelers={savedTravelers}
                    setSelectedVoucherCode={setSelectedVoucherCode}
                    handleDepartureChange={handleDepartureChange}
                    handlePassengerChange={handlePassengerChange}
                    handleGuestChange={handleGuestChange}
                    handleSavedTravelerSelect={handleSavedTravelerSelect}
                    getAvailableSavedTravelers={getAvailableSavedTravelers}
                    getDepartureRemainingSlots={getDepartureRemainingSlots}
                    formatPickupTime={formatPickupTime}
                    formatVoucherDiscount={formatVoucherDiscount}
                    estimateVoucherDiscount={estimateVoucherDiscount}
                  />
                </>
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 20px",
                    background: "#f8fafc",
                    borderRadius: "16px",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      color: "#64748b",
                      fontSize: "1.05rem",
                    }}
                  >
                    Tour này hiện chưa có lịch khởi hành mở bán.
                  </p>
                </div>
              )}
            </div>

            <BookingPolicyPreview tour={tour} />
          </aside>
        </div>
      </section>

      {/* Tour liên quan Full Width ở dưới cùng */}
      {relatedTours.length > 0 && (
        <section
          className="tour-detail-related-section"
          style={{
            background: "#fff",
            padding: "80px 0",
            borderTop: "1px solid #f1f5f9",
          }}
        >
          <div className="container">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: "40px",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "2rem",
                    color: "#0f172a",
                    margin: "0 0 8px",
                  }}
                >
                  Có thể bạn sẽ thích
                </h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: "1.05rem" }}>
                  Khám phá thêm các hành trình tương tự tại{" "}
                  {tour.destination?.name}.
                </p>
              </div>
              <Link
                href={`/tours?destination=${encodeURIComponent(tour.destination?.name)}`}
                style={{
                  padding: "10px 24px",
                  background: "#f8fafc",
                  color: "#1f2937",
                  borderRadius: "999px",
                  textDecoration: "none",
                  fontWeight: 600,
                  border: "1px solid #e2e8f0",
                }}
              >
                Xem tất cả
              </Link>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "24px",
              }}
            >
              {relatedTours.map((item) => (
                <TourCard key={item.id} tour={item} />
              ))}
            </div>
          </div>
        </section>
      )}

      <PaymentModal
        open={Boolean(paymentState)}
        paymentSession={paymentState}
        onClose={() => setPaymentState(null)}
        onPaid={(res) => {
          setPaymentState(null);
          showToast(
            "Thanh toán thành công! Email xác nhận đã được gửi.",
            "success",
          );
          router.push(`/mytour`);
        }}
      />
    </>
  );
}
