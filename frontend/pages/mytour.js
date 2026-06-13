import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Loading from "@/components/Loading";
import PaymentModal from "@/components/PaymentModal";
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

function resolveImageUrl(value) {
  if (!value) return FALLBACK_TOUR_IMAGE;

  const raw = String(value).trim();
  if (!raw) return FALLBACK_TOUR_IMAGE;

  if (/^https?:\/\//i.test(raw)) return raw;

  if (raw.startsWith("/img/") || raw.startsWith("/images/")) {
    return raw;
  }

  const base = String(API_URL || "").replace(/\/$/, "");

  if (raw.startsWith("/uploads/")) {
    return `${base}${raw}`;
  }

  if (raw.startsWith("uploads/")) {
    return `${base}/${raw}`;
  }

  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`;
}

function getTourImage(tour) {
  const image =
    tour?.media?.find?.((item) => item?.isCover)?.fileUrl ||
    tour?.media?.[0]?.fileUrl ||
    tour?.media?.[0]?.imageUrl ||
    tour?.media?.[0]?.url ||
    tour?.images?.[0]?.fileUrl ||
    tour?.images?.[0]?.imageUrl ||
    tour?.images?.[0]?.url ||
    tour?.imageUrls?.[0] ||
    tour?.tourImages?.[0]?.fileUrl ||
    tour?.tourImages?.[0]?.imageUrl ||
    tour?.coverUrl ||
    tour?.coverImage ||
    tour?.thumbnailUrl ||
    tour?.imageUrl ||
    tour?.destination?.coverImage ||
    tour?.destination?.imageUrl ||
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
  const [paymentState, setPaymentState] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const loadData = async () => {
    try {
      const [bookingData, favoriteData, notificationData] = await Promise.all([
        apiFetch("/bookings/me").catch(() => []),
        apiFetch("/favorites/me").catch(() => []),
        apiFetch("/notifications/me?limit=4").catch(() => []),
      ]);

      setBookings(Array.isArray(bookingData) ? bookingData : []);
      setFavorites(Array.isArray(favoriteData) ? favoriteData : []);
      setNotifications(Array.isArray(notificationData) ? notificationData : []);
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
                  {bookings.map((booking) => (
                    <BookingCard
                      key={String(booking.id)}
                      booking={booking}
                      onPay={handlePay}
                      onCancel={handleCancelBooking}
                      cancellingId={cancellingId}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-box">
                  Bạn chưa có booking nào. Hãy chọn một tour và đặt lịch ngay.
                </div>
              )}
            </div>

            <aside className="side-stack">
              <div className="section-card">
                <div className="section-title">
                  <div>
                    <h2>Tour yêu thích</h2>
                    <p>Những hành trình bạn đã lưu lại để cân nhắc.</p>
                  </div>
                </div>

                {favorites.length ? (
                  <div className="favorites-grid">
                    {favorites.map((item, index) => (
                      <FavoriteCard
                        key={String(item.favoriteId || item.id || index)}
                        item={item}
                      />
                    ))}
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
