import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Loading from "@/components/Loading";
import PaymentModal from "@/components/PaymentModal";
import Pagination from "@/components/Pagination";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { formatCurrency, formatDate } from "@/lib/format";
import { mapLabel } from "@/lib/labels";
import { mapImageUrl } from "@/lib/tour";
import { getUser } from "@/lib/storage";
import { useToast } from "@/components/ToastContext";

function getStatusColor(status) {
  const safe = String(status || "").toLowerCase();

  if (["confirmed", "completed", "paid"].includes(safe)) {
    return { bg: "#dcfce7", color: "#166534" };
  }

  if (["pending_payment", "waiting_confirmation", "pending"].includes(safe)) {
    return { bg: "#fef3c7", color: "#92400e" };
  }

  if (["cancelled", "expired", "failed", "refunded"].includes(safe)) {
    return { bg: "#fee2e2", color: "#991b1b" };
  }

  return { bg: "#f1f5f9", color: "#475569" };
}

const FALLBACK_TOUR_IMAGE = "/images/default-tour.jpg";
const BOOKING_PAGE_SIZE = 3;
const FAVORITE_PAGE_SIZE = 3;

const TIER_META = {
  bronze: { label: "Bronze", min: 0, next: "silver" },
  silver: { label: "Silver", min: 500, next: "gold" },
  gold: { label: "Gold", min: 1500, next: "diamond" },
  diamond: { label: "Diamond", min: 3000, next: null },
};

function getTierProgress(user = {}) {
  const tier = String(user?.memberTier || "bronze").toLowerCase();
  const points = Number(user?.memberPoints || 0);
  const currentMeta = TIER_META[tier] || TIER_META.bronze;
  const nextTier = currentMeta.next;

  if (!nextTier) {
    return {
      tier,
      points,
      currentLabel: currentMeta.label,
      nextTier: null,
      nextLabel: "",
      remaining: 0,
      percent: 100,
      message: "Bạn đang ở hạng cao nhất của Travela.",
    };
  }

  const nextMeta = TIER_META[nextTier];
  const range = Math.max(nextMeta.min - currentMeta.min, 1);
  const gained = Math.max(points - currentMeta.min, 0);
  const remaining = Math.max(nextMeta.min - points, 0);

  return {
    tier,
    points,
    currentLabel: currentMeta.label,
    nextTier,
    nextLabel: nextMeta.label,
    remaining,
    percent: Math.min(Math.round((gained / range) * 100), 100),
    message: `Bạn còn ${remaining.toLocaleString("vi-VN")} điểm để lên hạng ${nextMeta.label}.`,
  };
}

function normalizeVoucherRow(row) {
  return {
    ...(row?.voucher || row || {}),
    userVoucherStatus: row?.status || "available",
  };
}

function formatVoucherDiscount(voucher) {
  if (!voucher) return "";
  if (voucher.discountType === "fixed") {
    return `Giảm ${formatCurrency(voucher.discountValue || 0)}`;
  }
  return `Giảm ${Number(voucher.discountValue || 0)}%`;
}

function resolveImageUrl(value) {
  if (!value) return FALLBACK_TOUR_IMAGE;

  const raw = String(value).trim();
  if (!raw) return FALLBACK_TOUR_IMAGE;

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/img/") || raw.startsWith("/images/")) {
    return raw;
  }

  /*
   * NEXT_PUBLIC_API_URL của dự án là:
   * http://localhost:3001/api
   *
   * Trong khi ảnh tĩnh được backend phục vụ ở:
   * http://localhost:3001/uploads/...
   *
   * Vì vậy phải bỏ "/api" trước khi ghép đường dẫn ảnh.
   */
  const assetBase = String(API_URL || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api$/i, "");

  const cleanPath = raw.startsWith("/") ? raw : `/${raw}`;

  return `${assetBase}${cleanPath}`;
}

function getTourImage(tour) {
  const mediaRows = Array.isArray(tour?.media)
    ? [...tour.media].sort((a, b) => {
        const aCover = Boolean(a?.isCover ?? a?.is_cover);
        const bCover = Boolean(b?.isCover ?? b?.is_cover);

        if (aCover !== bCover) {
          return aCover ? -1 : 1;
        }

        const aOrder = Number(a?.displayOrder ?? a?.display_order ?? 999999);
        const bOrder = Number(b?.displayOrder ?? b?.display_order ?? 999999);

        return aOrder - bOrder;
      })
    : [];

  const coverMedia = mediaRows[0] || null;

  /*
   * Ưu tiên ảnh thuộc chính tour.
   * Không fallback sang destination.coverImage,
   * vì nhiều tour khác nhau sẽ bị hiện cùng một ảnh.
   */
  const image =
    coverMedia?.fileUrl ||
    coverMedia?.file_url ||
    coverMedia?.imageUrl ||
    coverMedia?.image_url ||
    coverMedia?.url ||
    tour?.coverUrl ||
    tour?.cover_url ||
    tour?.coverImage ||
    tour?.cover_image ||
    tour?.thumbnailUrl ||
    tour?.thumbnail_url ||
    tour?.imageUrl ||
    tour?.image_url ||
    "";

  return resolveImageUrl(image);
}

function getFavoriteTour(item) {
  return item?.tour || item || {};
}

function getPaymentStatus(booking) {
  const latestPayment = Array.isArray(booking?.payments)
    ? booking.payments[0]
    : null;

  return (
    latestPayment?.paymentStatus ||
    booking?.paymentStatus ||
    booking?.payment_status ||
    null
  );
}

function isBookingPaid(booking) {
  const paymentStatus = String(getPaymentStatus(booking) || "").toLowerCase();
  const bookingStatus = String(booking?.bookingStatus || "").toLowerCase();

  return (
    paymentStatus === "paid" ||
    paymentStatus === "success" ||
    paymentStatus === "completed" ||
    bookingStatus === "confirmed" ||
    bookingStatus === "completed"
  );
}

function isHoldExpired(booking) {
  if (!booking?.holdExpiresAt) return false;

  const expireTime = new Date(booking.holdExpiresAt).getTime();

  if (Number.isNaN(expireTime)) return false;

  return expireTime <= Date.now();
}

function canPayBooking(booking) {
  const bookingStatus = String(booking?.bookingStatus || "").toLowerCase();

  return (
    bookingStatus === "pending_payment" &&
    !isBookingPaid(booking) &&
    !isHoldExpired(booking)
  );
}

function canShowExpiredPayment(booking) {
  const bookingStatus = String(booking?.bookingStatus || "").toLowerCase();

  return (
    bookingStatus === "pending_payment" &&
    !isBookingPaid(booking) &&
    isHoldExpired(booking)
  );
}

function canCancelBooking(booking) {
  const bookingStatus = String(booking?.bookingStatus || "").toLowerCase();
  const paymentStatus = String(getPaymentStatus(booking) || "").toLowerCase();

  const hasProtectedPayment = [
    "paid",
    "waiting_confirmation",
    "refunded",
  ].includes(paymentStatus);

  return bookingStatus === "pending_payment" && !hasProtectedPayment;
}

function BookingStatusBadge({ status }) {
  const color = getStatusColor(status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        background: color.bg,
        color: color.color,
        padding: "7px 12px",
        fontSize: 13,
        fontWeight: 800,
      }}
    >
      {mapLabel(status)}
    </span>
  );
}

function BookingCard({ booking, onPay, onCancel, cancellingId }) {
  const tour = booking?.tour || {};
  const destination = tour?.destination || {};
  const departure = booking?.departure || {};
  const latestPayment = Array.isArray(booking?.payments)
    ? booking.payments[0]
    : null;

  const paymentStatus = getPaymentStatus(booking);
  const paid = isBookingPaid(booking);
  const canCancel = canCancelBooking(booking);

  const cover = getTourImage({
    ...tour,
    destination,
  });

  const guideAssignment = booking?.guideAssignments?.[0] || null;
  const guide = guideAssignment?.guide || null;
  const canPay = canPayBooking(booking);
  const expiredPayment = canShowExpiredPayment(booking);

  return (
    <article className="booking-card-modern">
      <div className="booking-cover">
        {cover ? (
          <img
            src={cover}
            alt={tour?.name || "Tour"}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = FALLBACK_TOUR_IMAGE;
            }}
          />
        ) : null}
      </div>

      <div className="booking-content">
        <div className="booking-top">
          <div>
            <div className="booking-code">#{booking.bookingCode}</div>
            <h3>{tour?.name || "Tour Travela"}</h3>
          </div>

          <div className="booking-badges">
            <BookingStatusBadge status={booking.bookingStatus} />
            {departure?.departureDate ? (
              <span className="date-pill">
                🗓 {formatDate(departure.departureDate)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="booking-info-grid">
          <div>
            <span className="label">Hành khách</span>
            <strong>
              {booking.adultCount || 0} Người lớn, {booking.childCount || 0} Trẻ
              em
            </strong>
          </div>

          <div>
            <span className="label">Tổng tiền</span>
            <strong className="price">
              {formatCurrency(booking.finalAmount || 0)}
            </strong>
          </div>

          <div>
            <span className="label">Trạng thái thanh toán</span>
            <strong className={paid ? "paid" : "pending"}>
              {paid
                ? `Đã thanh toán${latestPayment?.paymentMethod ? ` (${mapLabel(latestPayment.paymentMethod)})` : ""}`
                : mapLabel(paymentStatus || "pending")}
            </strong>
          </div>

          <div>
            <span className="label">Điểm đón</span>
            <strong>
              {booking.pickupName ||
                booking.pickupPoint?.name ||
                "Travela sẽ liên hệ xác nhận"}
            </strong>
          </div>
        </div>

        {booking.pickupAddress || booking.pickupPoint?.address ? (
          <p className="pickup-address">
            📍 {booking.pickupAddress || booking.pickupPoint?.address}
          </p>
        ) : null}

        {guide ? (
          <div className="guide-box">
            <strong>Hướng dẫn viên:</strong>{" "}
            {guide.fullName || guide.name || "Đang cập nhật"}
            {guide.phone ? ` • ${guide.phone}` : ""}
          </div>
        ) : null}

        <div className="booking-actions">
          <Link href={`/tour/${tour?.slug || ""}`} className="link-action">
            Xem chi tiết tour →
          </Link>

          {canPay ? (
            <button
              type="button"
              className="pay-btn"
              onClick={() =>
                onPay(
                  booking.id,
                  "bank_transfer",
                  booking.bookingCode,
                  booking.finalAmount,
                  booking.holdExpiresAt,
                )
              }
            >
              Thanh toán
            </button>
          ) : expiredPayment ? (
            <span className="expired-payment-note">Đã quá hạn thanh toán</span>
          ) : null}

          {canCancel ? (
            <button
              type="button"
              className="cancel-btn"
              disabled={String(cancellingId) === String(booking.id)}
              onClick={() => onCancel(booking)}
            >
              {String(cancellingId) === String(booking.id)
                ? "Đang xóa..."
                : "Xóa đơn"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LoyaltyCard({ user, vouchers = [] }) {
  const progress = getTierProgress(user);
  const tierVouchers = vouchers
    .map(normalizeVoucherRow)
    .filter(
      (voucher) =>
        String(voucher.memberTier || "").toLowerCase() === progress.tier,
    )
    .slice(0, 3);

  return (
    <div className="section-card loyalty-card">
      <div className="section-title">
        <div>
          <h2>Thành viên Travela</h2>
          <p>Theo dõi điểm tích lũy và ưu đãi theo hạng.</p>
        </div>
      </div>

      <div className="loyalty-rank-row">
        <div>
          <span>Hạng hiện tại</span>
          <strong>{progress.currentLabel}</strong>
        </div>
        <div>
          <span>Điểm</span>
          <strong>{progress.points.toLocaleString("vi-VN")}</strong>
        </div>
      </div>

      <div className="loyalty-progress">
        <div style={{ width: `${progress.percent}%` }} />
      </div>

      <p className="loyalty-message">{progress.message}</p>

      {progress.nextLabel ? (
        <div className="next-tier-hint">
          Voucher dành riêng cho hạng {progress.nextLabel} sẽ mở khi bạn lên
          hạng.
        </div>
      ) : null}

      <div className="tier-voucher-box">
        <h3>Voucher dành riêng cho hạng {progress.currentLabel}</h3>
        {tierVouchers.length ? (
          <div className="tier-voucher-list">
            {tierVouchers.map((voucher) => (
              <div
                key={String(voucher.id || voucher.code)}
                className="tier-voucher-item"
              >
                <div>
                  <strong>{voucher.code}</strong>
                  <span>{voucher.name || formatVoucherDiscount(voucher)}</span>
                </div>
                <small>{formatVoucherDiscount(voucher)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-mini">
            Hiện chưa có voucher khả dụng cho hạng {progress.currentLabel}.
          </p>
        )}
      </div>
    </div>
  );
}

function FavoriteCard({ item }) {
  const tour = getFavoriteTour(item);
  const destination = tour?.destination || {};
  const image = getTourImage(tour);

  const name = tour?.name || "Tour Travela";
  const slug = tour?.slug || "";
  const destinationName =
    destination?.name ||
    tour?.destinationName ||
    tour?.destination ||
    "Điểm đến";

  const durationDays = tour?.durationDays || tour?.duration_days || "";
  const durationNights = tour?.durationNights || tour?.duration_nights || "";

  const price =
    tour?.basePriceAdult ||
    tour?.priceAdult ||
    tour?.adultPrice ||
    tour?.price ||
    0;

  return (
    <article className="fav-card">
      <div className="fav-img">
        <img
          src={image}
          alt={name}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = FALLBACK_TOUR_IMAGE;
          }}
        />
      </div>

      <div className="fav-content">
        <h4>{name}</h4>
        <p>
          {destinationName}
          {durationDays ? ` · ${durationDays} ngày` : ""}
          {durationNights ? ` ${durationNights} đêm` : ""}
        </p>

        <strong>{formatCurrency(price)}</strong>

        {slug ? (
          <Link href={`/tour/${slug}`} className="fav-link">
            Xem tour →
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export default function MyTourPage() {
  const { showToast } = useToast();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [bookingPage, setBookingPage] = useState(1);
  const [favoritePage, setFavoritePage] = useState(1);
  const [paymentState, setPaymentState] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const loadData = async () => {
    try {
      const [
        bookingData,
        favoriteData,
        notificationData,
        voucherData,
        freshUser,
      ] = await Promise.all([
        apiFetch("/bookings/me").catch(() => []),
        apiFetch("/favorites/me").catch(() => []),
        apiFetch("/notifications/me?limit=4").catch(() => []),
        apiFetch("/vouchers/me").catch(() => []),
        apiFetch("/auth/me").catch(() => null),
      ]);

      setBookings(Array.isArray(bookingData) ? bookingData : []);
      setFavorites(Array.isArray(favoriteData) ? favoriteData : []);
      setNotifications(Array.isArray(notificationData) ? notificationData : []);
      setVouchers(Array.isArray(voucherData) ? voucherData : []);

      const nextUser = freshUser?.user || freshUser;
      if (nextUser?.id) {
        setUser(nextUser);
        if (typeof window !== "undefined") {
          localStorage.setItem("tourai_user", JSON.stringify(nextUser));
        }
      }
    } catch (error) {
      showToast(error.message || "Không thể tải dữ liệu.", "error");
    }
  };

  useEffect(() => {
    const currentUser = getUser();

    if (!currentUser) {
      window.location.href = "/login";
      return;
    }

    setUser(currentUser);

    loadData().finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const pending = bookings.filter((item) =>
      ["pending_payment", "waiting_confirmation"].includes(
        String(item.bookingStatus || "").toLowerCase(),
      ),
    ).length;

    const paid = bookings.filter((item) => isBookingPaid(item)).length;

    return {
      total: bookings.length,
      pending,
      paid,
      favorites: favorites.length,
    };
  }, [bookings, favorites]);

  const bookingTotalPages = Math.max(
    1,
    Math.ceil(bookings.length / BOOKING_PAGE_SIZE),
  );
  const favoriteTotalPages = Math.max(
    1,
    Math.ceil(favorites.length / FAVORITE_PAGE_SIZE),
  );
  const safeBookingPage = Math.min(
    Math.max(Number(bookingPage || 1), 1),
    bookingTotalPages,
  );
  const safeFavoritePage = Math.min(
    Math.max(Number(favoritePage || 1), 1),
    favoriteTotalPages,
  );

  const pagedBookings = useMemo(
    () =>
      bookings.slice(
        (safeBookingPage - 1) * BOOKING_PAGE_SIZE,
        safeBookingPage * BOOKING_PAGE_SIZE,
      ),
    [bookings, safeBookingPage],
  );

  const pagedFavorites = useMemo(
    () =>
      favorites.slice(
        (safeFavoritePage - 1) * FAVORITE_PAGE_SIZE,
        safeFavoritePage * FAVORITE_PAGE_SIZE,
      ),
    [favorites, safeFavoritePage],
  );

  useEffect(() => {
    if (bookingPage > bookingTotalPages) setBookingPage(bookingTotalPages);
  }, [bookingPage, bookingTotalPages]);

  useEffect(() => {
    if (favoritePage > favoriteTotalPages) setFavoritePage(favoriteTotalPages);
  }, [favoritePage, favoriteTotalPages]);

  const handlePay = async (
    bookingId,
    paymentMethod,
    bookingCode,
    amount,
    holdExpiresAt,
  ) => {
    try {
      const initiated = await apiFetch(`/payments/initiate/${bookingId}`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "bank_transfer" }),
      });

      setPaymentState({
        ...initiated,
        bookingCode: initiated.bookingCode || bookingCode,
        amount: initiated.amount || amount,
        paymentMethod: "bank_transfer",
        txn: initiated.internalTransactionCode || initiated.transactionCode,
        expireAt:
          initiated.holdExpiresAt ||
          holdExpiresAt ||
          new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });

      if (initiated.paymentEmail?.sent) {
        showToast("Đã gửi email chứa thông tin đơn hàng và QR.", "success");
      }
    } catch (error) {
      showToast(error.message || "Không thể tạo thanh toán.", "error");
    }
  };

  const resolvePayment = async (status) => {
    if (!paymentState?.txn) return;

    try {
      const callbackResult = await apiFetch("/payments/callback", {
        method: "POST",
        body: JSON.stringify({
          internalTransactionCode: paymentState.txn,
          gatewayTransactionId:
            status === "paid"
              ? `${String(paymentState.paymentMethod || "PAY").toUpperCase()}-${
                  paymentState.bookingCode
                }`
              : null,
          paymentStatus: status,
        }),
      });

      showToast(
        callbackResult?.email?.sent
          ? "Đã cập nhật trạng thái thanh toán và gửi mail xác nhận."
          : "Đã cập nhật trạng thái thanh toán.",
        "success",
      );

      setPaymentState(null);
      await loadData();
    } catch (error) {
      showToast(error.message || "Không thể cập nhật thanh toán.", "error");
    }
  };

  const handleCancelBooking = async (booking) => {
    if (!booking?.id) return;

    const ok = window.confirm(
      `Bạn có chắc muốn xóa/hủy booking ${
        booking.bookingCode || "này"
      }? Chỉ đơn chưa thanh toán mới được xóa.`,
    );

    if (!ok) return;

    try {
      setCancellingId(String(booking.id));

      await apiFetch(`/bookings/${booking.id}/cancel`, {
        method: "PATCH",
      });

      showToast("Đã xóa/hủy booking chưa thanh toán.", "success");

      await loadData();
    } catch (error) {
      showToast(error.message || "Không thể xóa/hủy booking.", "error");
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return <Loading text="Đang tải trang cá nhân..." />;
  }

  if (!user) return null;

  return (
    <>
      <style jsx global>{`
        .mytour-page {
          background: #f8fafc;
          min-height: 100vh;
          padding-bottom: 60px;
        }

        html.dark-mode .mytour-page {
          background: #0b1220;
          color: #e5edf8;
        }

        html.dark-mode .dashboard-header {
          background: linear-gradient(
            135deg,
            #08111f 0%,
            #111827 48%,
            #0f2537 100%
          );
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        }

        html.dark-mode .dashboard-header::after {
          opacity: 0.22;
          filter: saturate(0.8) contrast(1.05);
        }

        html.dark-mode .dashboard-header p {
          color: #dbeafe;
        }

        html.dark-mode .stat-box,
        html.dark-mode .section-card,
        html.dark-mode .booking-card-modern,
        html.dark-mode .fav-card {
          background: rgba(15, 23, 42, 0.96);
          border-color: rgba(148, 163, 184, 0.18);
          box-shadow: 0 22px 55px rgba(0, 0, 0, 0.32);
          color: #e5edf8;
        }

        html.dark-mode .stat-box span,
        html.dark-mode .section-title p,
        html.dark-mode .fav-content p,
        html.dark-mode .notification-item p,
        html.dark-mode .booking-info-grid .label {
          color: #a9b9ce;
        }

        html.dark-mode .stat-box strong,
        html.dark-mode .section-title h2,
        html.dark-mode .booking-top h3,
        html.dark-mode .booking-info-grid strong,
        html.dark-mode .fav-content h4,
        html.dark-mode .notification-item strong,
        html.dark-mode .loyalty-rank-row strong,
        html.dark-mode .tier-voucher-box h3 {
          color: #f8fafc;
        }

        html.dark-mode .stat-icon {
          background: rgba(34, 197, 94, 0.14);
          color: #86efac;
        }

        html.dark-mode .booking-info-grid,
        html.dark-mode .notification-item,
        html.dark-mode .empty-box,
        html.dark-mode .tier-voucher-item {
          background: rgba(2, 6, 23, 0.48);
          border-color: rgba(148, 163, 184, 0.18);
          color: #dbeafe;
        }

        html.dark-mode .booking-cover,
        html.dark-mode .fav-img {
          background: #1e293b;
        }

        html.dark-mode .pickup-address {
          background: rgba(251, 146, 60, 0.12);
          border-color: rgba(251, 146, 60, 0.28);
          color: #fed7aa;
        }

        html.dark-mode .guide-box {
          background: rgba(59, 130, 246, 0.12);
          border-color: rgba(59, 130, 246, 0.28);
          color: #bfdbfe;
        }

        .dashboard-header {
          position: relative;
          padding: 76px 0 110px;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #fff;
          overflow: hidden;
        }

        .dashboard-header::after {
          content: "";
          position: absolute;
          inset: 0;
          background: url("https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1920&q=80")
            center/cover;
          opacity: 0.16;
          z-index: 0;
        }

        .dashboard-header .container {
          position: relative;
          z-index: 1;
        }

        .dashboard-header h1 {
          margin: 0 0 10px;
          font-size: clamp(2rem, 4vw, 3.4rem);
          letter-spacing: -0.04em;
        }

        .dashboard-header p {
          max-width: 660px;
          color: #cbd5e1;
          line-height: 1.7;
          margin: 0;
        }

        .stats-container {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 18px;
          margin-top: -54px;
          position: relative;
          z-index: 2;
        }

        .stat-box {
          background: #fff;
          padding: 22px;
          border-radius: 22px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .stat-icon {
          width: 46px;
          height: 46px;
          border-radius: 16px;
          background: #ecfdf5;
          color: #16a34a;
          display: grid;
          place-items: center;
          font-size: 22px;
        }

        .stat-box span {
          color: #64748b;
          font-size: 13px;
        }

        .stat-box strong {
          display: block;
          color: #0f172a;
          font-size: 24px;
          margin-top: 4px;
        }

        .mytour-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 24px;
          margin-top: 30px;
        }

        .section-card {
          background: #fff;
          border-radius: 28px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 14px 40px rgba(15, 23, 42, 0.04);
          padding: 24px;
        }

        .section-title {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 18px;
        }

        .section-title h2 {
          margin: 0;
          color: #0f172a;
          font-size: 1.35rem;
        }

        .section-title p {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 14px;
        }

        .booking-list {
          display: grid;
          gap: 18px;
        }

        .booking-card-modern {
          display: grid;
          grid-template-columns: 230px 1fr;
          background: #fff;
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
        }

        .booking-cover {
          min-height: 235px;
          background: #e2e8f0;
        }

        .booking-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .booking-content {
          padding: 22px;
          display: grid;
          gap: 16px;
        }

        .booking-top {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }

        .booking-code {
          display: inline-flex;
          background: #f1f5f9;
          color: #0f172a;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 800;
          margin-bottom: 10px;
        }

        .booking-content h3 {
          margin: 0;
          color: #0f172a;
          font-size: 1.25rem;
        }

        .booking-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .date-pill {
          display: inline-flex;
          border: 1px solid #e2e8f0;
          color: #334155;
          background: #f8fafc;
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 13px;
          font-weight: 700;
        }

        .booking-info-grid {
          background: #f8fafc;
          border-radius: 18px;
          padding: 18px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .booking-info-grid .label {
          display: block;
          color: #64748b;
          font-size: 13px;
          margin-bottom: 6px;
        }

        .booking-info-grid strong {
          color: #0f172a;
        }

        .booking-info-grid .price {
          color: #f97316;
        }

        .booking-info-grid .paid {
          color: #166534;
        }

        .booking-info-grid .pending {
          color: #92400e;
        }

        .pickup-address,
        .guide-box {
          margin: 0;
          color: #475569;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 14px;
        }

        .guide-box {
          background: #eff6ff;
          border-color: #bfdbfe;
        }

        .booking-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .link-action {
          color: #2563eb;
          font-weight: 800;
          text-decoration: none;
          margin-right: auto;
        }

        .pay-btn,
        .cancel-btn {
          border: none;
          border-radius: 999px;
          padding: 10px 16px;
          font-weight: 800;
          cursor: pointer;
        }

        .pay-btn {
          background: linear-gradient(135deg, #16a34a, #22c55e);
          color: #fff;
        }

        .cancel-btn {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }

        .cancel-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .expired-payment-note {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 10px 16px;
          font-weight: 800;
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }

        .loyalty-card {
          overflow: hidden;
        }

        .loyalty-rank-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 14px;
        }

        .loyalty-rank-row > div {
          border-radius: 18px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 14px;
        }

        .loyalty-rank-row span {
          display: block;
          color: #64748b;
          font-size: 13px;
          margin-bottom: 4px;
        }

        .loyalty-rank-row strong {
          color: #0f172a;
          font-size: 20px;
        }

        .loyalty-progress {
          height: 12px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
          margin: 12px 0;
        }

        .loyalty-progress > div {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(135deg, #22c55e, #84cc16);
          box-shadow: 0 8px 20px rgba(34, 197, 94, 0.28);
        }

        .loyalty-message,
        .next-tier-hint {
          margin: 0 0 12px;
          color: #475569;
          line-height: 1.55;
          font-size: 14px;
        }

        .next-tier-hint {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          color: #9a3412;
          border-radius: 14px;
          padding: 12px 14px;
        }

        .tier-voucher-box {
          margin-top: 16px;
        }

        .tier-voucher-box h3 {
          margin: 0 0 12px;
          color: #0f172a;
          font-size: 1rem;
        }

        .tier-voucher-list {
          display: grid;
          gap: 10px;
        }

        .tier-voucher-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 12px;
        }

        .tier-voucher-item strong,
        .tier-voucher-item span {
          display: block;
        }

        .tier-voucher-item strong {
          color: #0f172a;
          font-size: 14px;
        }

        .tier-voucher-item span,
        .empty-mini {
          color: #64748b;
          font-size: 13px;
        }

        .tier-voucher-item small {
          color: #16a34a;
          font-weight: 800;
          white-space: nowrap;
        }

        html.dark-mode .loyalty-rank-row > div {
          background: rgba(2, 6, 23, 0.48);
          border-color: rgba(148, 163, 184, 0.18);
        }

        html.dark-mode .loyalty-message {
          color: #cbd5e1;
        }

        html.dark-mode .next-tier-hint {
          background: rgba(251, 146, 60, 0.12);
          border-color: rgba(251, 146, 60, 0.28);
          color: #fed7aa;
        }

        html.dark-mode .empty-mini,
        html.dark-mode .tier-voucher-item span {
          color: #a9b9ce;
        }

        .side-stack {
          display: grid;
          gap: 22px;
          align-content: start;
        }

        .favorites-grid {
          display: grid;
          gap: 14px;
        }

        .fav-card {
          display: flex;
          gap: 14px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 14px;
          transition: 0.2s;
        }

        .fav-card:hover {
          border-color: #bbf7d0;
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.05);
        }

        .fav-img {
          width: 92px;
          height: 92px;
          border-radius: 16px;
          overflow: hidden;
          background: #e2e8f0;
          flex: 0 0 auto;
        }

        .fav-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .fav-content {
          min-width: 0;
          display: grid;
          gap: 5px;
          align-content: start;
        }

        .fav-content h4 {
          margin: 0;
          color: #0f172a;
          font-size: 15px;
          line-height: 1.35;
        }

        .fav-content p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }

        .fav-content strong {
          color: #f97316;
        }

        .fav-link {
          color: #2563eb;
          text-decoration: none;
          font-size: 13px;
          font-weight: 800;
        }

        .notification-list {
          display: grid;
          gap: 12px;
        }

        .notification-item {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 12px;
          background: #f8fafc;
        }

        .notification-item strong {
          color: #0f172a;
          display: block;
          margin-bottom: 4px;
        }

        .notification-item p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.45;
        }

        .empty-box {
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 20px;
          padding: 28px;
          text-align: center;
          color: #64748b;
        }

        @media (max-width: 980px) {
          .mytour-grid {
            grid-template-columns: 1fr;
          }

          .booking-card-modern {
            grid-template-columns: 1fr;
          }

          .booking-cover {
            height: 220px;
          }
        }

        @media (max-width: 640px) {
          .dashboard-header {
            padding: 54px 0 90px;
          }

          .section-card {
            padding: 18px;
            border-radius: 22px;
          }

          .booking-info-grid {
            grid-template-columns: 1fr;
          }

          .booking-top {
            flex-direction: column;
          }

          .booking-badges {
            justify-content: flex-start;
          }
        }
      `}</style>

      <main className="mytour-page">
        <section className="dashboard-header">
          <div className="container">
            <h1>Tour của tôi</h1>
            <p>
              Theo dõi các tour đã đặt, thanh toán các đơn chờ xử lý, xem tour
              yêu thích và các thông báo mới nhất từ Travela.
            </p>
          </div>
        </section>

        <div className="container">
          <section className="stats-container">
            <div className="stat-box">
              <div className="stat-icon">🧾</div>
              <div>
                <span>Tổng booking</span>
                <strong>{stats.total}</strong>
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-icon">⏳</div>
              <div>
                <span>Đang chờ</span>
                <strong>{stats.pending}</strong>
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-icon">✅</div>
              <div>
                <span>Đã thanh toán</span>
                <strong>{stats.paid}</strong>
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-icon">❤️</div>
              <div>
                <span>Yêu thích</span>
                <strong>{stats.favorites}</strong>
              </div>
            </div>
          </section>

          <section className="mytour-grid">
            <div className="section-card">
              <div className="section-title">
                <div>
                  <h2>Booking của tôi</h2>
                  <p>Các tour bạn đã đặt trên hệ thống.</p>
                </div>
              </div>

              {bookings.length ? (
                <div className="booking-list">
                  {pagedBookings.map((booking) => (
                    <BookingCard
                      key={String(booking.id)}
                      booking={booking}
                      onPay={handlePay}
                      onCancel={handleCancelBooking}
                      cancellingId={cancellingId}
                    />
                  ))}
                  <Pagination
                    compact
                    page={safeBookingPage}
                    totalPages={bookingTotalPages}
                    onPageChange={setBookingPage}
                  />
                </div>
              ) : (
                <div className="empty-box">
                  Bạn chưa có booking nào. Hãy chọn một tour và đặt lịch ngay.
                </div>
              )}
            </div>

            <aside className="side-stack">
              <LoyaltyCard user={user} vouchers={vouchers} />

              <div className="section-card">
                <div className="section-title">
                  <div>
                    <h2>Tour yêu thích</h2>
                    <p>Những hành trình bạn đã lưu lại để cân nhắc.</p>
                  </div>
                </div>

                {favorites.length ? (
                  <div className="favorites-grid">
                    {pagedFavorites.map((item, index) => (
                      <FavoriteCard
                        key={String(item.favoriteId || item.id || index)}
                        item={item}
                      />
                    ))}
                    <Pagination
                      compact
                      page={safeFavoritePage}
                      totalPages={favoriteTotalPages}
                      onPageChange={setFavoritePage}
                    />
                  </div>
                ) : (
                  <div className="empty-box">
                    Bạn chưa có tour yêu thích nào.
                  </div>
                )}
              </div>

              <div className="section-card">
                <div className="section-title">
                  <div>
                    <h2>Thông báo</h2>
                    <p>Cập nhật mới nhất từ Travela.</p>
                  </div>
                </div>

                {notifications.length ? (
                  <div className="notification-list">
                    {notifications.map((item, index) => (
                      <div
                        className="notification-item"
                        key={String(item.id || index)}
                      >
                        <strong>{item.title || "Thông báo"}</strong>
                        <p>
                          {item.message ||
                            item.content ||
                            "Bạn có thông báo mới từ Travela."}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-box">Chưa có thông báo mới.</div>
                )}
              </div>
            </aside>
          </section>
        </div>
      </main>

      {paymentState ? (
        <PaymentModal
          open={Boolean(paymentState)}
          paymentSession={paymentState}
          onClose={() => setPaymentState(null)}
          onPaid={() => {
            setPaymentState(null);
            showToast(
              "Thanh toán thành công! Email xác nhận đã được gửi.",
              "success",
            );
            loadData?.();
          }}
        />
      ) : null}
    </>
  );
}
