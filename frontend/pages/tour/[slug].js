import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Loading from "@/components/Loading";
import TourCard from "@/components/TourCard";
import TourReviewSection from "@/components/reviews/TourReviewSection";
import PaymentModal from "@/components/PaymentModal";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { formatCurrency, formatDate, renderStars } from "@/lib/format";
import { mapLabel } from "@/lib/labels";
import { normalizeTour, mapImageUrl, renderDeparturePreview } from "@/lib/tour";
import { getUser } from "@/lib/storage";
import { useToast } from "@/components/ToastContext";
import { trackBehavior } from "@/lib/behavior";

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
      dateOfBirth: old?.dateOfBirth || "",
      gender: old?.gender || "",
      idNumber:
        old?.idNumber || (i === 0 ? currentUser?.identityNumber || "" : ""),
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
      dateOfBirth: old?.dateOfBirth || "",
      gender: old?.gender || "",
      idNumber: old?.idNumber || "",
    });
  }

  return rows;
}

function updateGuestAtIndex(rows, rowIndex, field, value) {
  return rows.map((item, index) =>
    index === rowIndex ? { ...item, [field]: value } : item,
  );
}

function getFavoriteTourId(item) {
  return item?.tourId || item?.tour_id || item?.tour?.id || item?.id || "";
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

export default function TourDetailPage() {
  const router = useRouter();
  const { slug } = router.query;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [tour, setTour] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [allTours, setAllTours] = useState([]);
  const [selectedImage, setSelectedImage] = useState("");
  const [bookingResult, setBookingResult] = useState(null);
  const [paymentState, setPaymentState] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [selectedDepartureId, setSelectedDepartureId] = useState("");
  const [bookingPassengers, setBookingPassengers] = useState({
    adultCount: 2,
    childCount: 0,
  });
  const [bookingGuests, setBookingGuests] = useState([]);
  const [myVouchers, setMyVouchers] = useState([]);
  const [selectedVoucherCode, setSelectedVoucherCode] = useState("");
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });

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

        const gallery = normalized.media?.length
          ? normalized.media
          : [{ fileUrl: normalized.coverUrl }];
        setSelectedImage(mapImageUrl(gallery[0]?.fileUrl, API_URL));
        const firstBookableDeparture = normalized.departures?.[0] || null;
        setSelectedDepartureId(firstBookableDeparture?.id || "");
        const initialPassengers = { adultCount: 2, childCount: 0 };
        setBookingPassengers(initialPassengers);
        setBookingGuests(buildDefaultGuests(2, 0, getUser(), []));
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

        const current = getUser();
        if (current) {
          apiFetch("/favorites/me")
            .then((items) => {
              if (!active) return;
              setFavorite(
                (items || []).some(
                  (fav) =>
                    String(getFavoriteTourId(fav)) === String(rawTour.id),
                ),
              );
            })
            .catch(() => {});

          apiFetch("/vouchers/me")
            .then((items) => {
              if (!active) return;
              setMyVouchers(items || []);
            })
            .catch(() => setMyVouchers([]));
        } else {
          setMyVouchers([]);
          setSelectedVoucherCode("");
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

  const currentUser = getUser();

  const selectedDeparture =
    (tour?.departures || []).find(
      (item) => String(item.id) === String(selectedDepartureId),
    ) || tour?.departures?.[0];
  const pickupOptions = selectedDeparture?.pickupPoints?.length
    ? selectedDeparture.pickupPoints
    : tour?.pickupPoints || [];
  const formatPickupTime = (value) =>
    value
      ? new Date(value).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Liên hệ";

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

    if (payload.guests.length !== expectedGuests) {
      showToast("Số form hành khách chưa khớp với số vé đã chọn.", "error");
      return;
    }

    const missingGuest = payload.guests.find((guest) => !guest.fullName);
    if (missingGuest) {
      showToast("Vui lòng nhập họ tên cho tất cả hành khách.", "error");
      return;
    }

    const action = event.nativeEvent?.submitter?.value || "hold";
    const paymentMethod = "bank_transfer";

    try {
      const booking = await apiFetch("/bookings", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const bookingId = getBookingId(booking);

      if (!bookingId) {
        console.log("Booking response không có id:", booking);
        throw new Error("Không lấy được bookingId sau khi tạo đơn");
      }

      if (action === "pay_now") {
        const checkout = await apiFetch("/payments/checkout", {
          method: "POST",
          body: JSON.stringify({
            bookingId: String(bookingId),
            paymentMethod,
          }),
        });

        setBookingResult(null);
        setPaymentState(getPaymentSession(checkout, booking));
        showToast(
          `Đã tạo mã QR thanh toán cho booking ${booking.bookingCode || checkout.bookingCode || ""}`,
          "success",
        );
        return;
      }

      setBookingResult(booking);
      showToast(`Giữ chỗ thành công với mã ${booking.bookingCode}`, "success");
    } catch (error) {
      showToast(error.message, "error");
      if (error.message?.toLowerCase().includes("unauthorized")) {
        setTimeout(() => router.push("/login"), 500);
      }
    }
  };

  const handlePaymentInit = async (event) => {
    event.preventDefault();

    const bookingId = getBookingId(bookingResult);

    if (!bookingId) {
      console.log("bookingResult không có id:", bookingResult);
      showToast(
        "Không lấy được bookingId để thanh toán. Vui lòng giữ chỗ lại.",
        "error",
      );
      return;
    }

    const paymentMethod = "bank_transfer";
    try {
      const checkout = await apiFetch("/payments/checkout", {
        method: "POST",
        body: JSON.stringify({
          bookingId: String(bookingId),
          paymentMethod,
        }),
      });

      setPaymentState(getPaymentSession(checkout, bookingResult));
      showToast(
        "Đã tạo mã QR thanh toán. Vui lòng quét mã bằng điện thoại.",
        "success",
      );
    } catch (error) {
      showToast(error.message, "error");
      if (error.message?.toLowerCase().includes("unauthorized")) {
        setTimeout(() => router.push("/login"), 500);
      }
    }
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
    if (!currentUser) {
      showToast("Bạn cần đăng nhập để lưu tour yêu thích.", "error");
      setTimeout(() => router.push("/login"), 300);
      return;
    }

    try {
      if (favorite) {
        await apiFetch(`/favorites/${tour.id}`, { method: "DELETE" });
        setFavorite(false);
        showToast("Đã bỏ khỏi tour yêu thích.", "success");
      } else {
        await apiFetch(`/favorites/${tour.id}`, { method: "POST" });
        setFavorite(true);

        await trackBehavior({
          action: "favorite",
          tourId: tour.id,
          score: 3,
          keyword: tour.destination?.name || tour.tourTheme || "",
          meta: {
            source: "tour_detail",
            destination: tour.destination?.name,
            theme: tour.tourTheme,
          },
        });

        showToast("Đã thêm vào tour yêu thích.", "success");
      }
    } catch (error) {
      const message = error.message || "Không cập nhật được yêu thích.";
      if (
        message.toLowerCase().includes("đã có") ||
        message.toLowerCase().includes("already")
      ) {
        setFavorite(true);
        showToast(
          "Tour này đã nằm trong danh sách yêu thích của bạn.",
          "success",
        );
        return;
      }
      showToast(message, "error");
    }
  };

  if (loading || !tour) return <Loading text="Đang tải chi tiết tour..." />;

  const gallery = tour.media?.length
    ? tour.media
    : [{ fileUrl: tour.coverUrl }];
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
        `,
        }}
      />

      {/* Header gọn gàng chứa tiêu đề và nút Yêu thích */}
      <section
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
                onClick={toggleFavorite}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 20px",
                  borderRadius: "999px",
                  background: favorite ? "#fef2f2" : "#fff",
                  border: `1px solid ${favorite ? "#fecdd3" : "#e2e8f0"}`,
                  color: favorite ? "#e11d48" : "#475569",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  fill={favorite ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                {favorite ? "Đã lưu" : "Lưu yêu thích"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "#f8fafc", padding: "40px 0 80px" }}>
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
                  const url = mapImageUrl(item.fileUrl, API_URL);
                  return (
                    <button
                      key={`${item.fileUrl}-${index}`}
                      type="button"
                      className={`gallery-thumb-btn ${selectedImage === url ? "active" : ""}`}
                      onClick={() => setSelectedImage(url)}
                    >
                      <img src={url} alt={`Gallery ${index + 1}`} />
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
            <TourReviewSection
              tour={tour}
              currentUser={currentUser}
              onRequireLogin={() => {
                showToast("Bạn cần đăng nhập để gửi đánh giá.", "error");
                setTimeout(() => router.push("/login"), 300);
              }}
            />
          </div>

          {/* CỘT PHẢI: Sticky Booking Widget */}
          <aside className="sticky-booking">
            {bookingResult ? (
              /* CARD THANH TOÁN (Hiện khi đã Giữ chỗ thành công) */
              <div
                style={{
                  background: "#fff",
                  borderRadius: "28px",
                  padding: "32px",
                  boxShadow: "0 20px 40px rgba(15,23,42,0.08)",
                  border: "1px solid #f1f5f9",
                }}
              >
                <div style={{ textAlign: "center", marginBottom: "24px" }}>
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      background: "#dcfce7",
                      color: "#16a34a",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}
                  >
                    <svg
                      width="32"
                      height="32"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                  </div>
                  <h2
                    style={{
                      fontSize: "1.6rem",
                      color: "#0f172a",
                      margin: "0 0 8px",
                    }}
                  >
                    Giữ chỗ thành công
                  </h2>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "6px 16px",
                      background: "#f1f5f9",
                      color: "#334155",
                      borderRadius: "999px",
                      fontWeight: 700,
                      letterSpacing: "1px",
                    }}
                  >
                    Mã: {bookingResult.bookingCode}
                  </span>
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    padding: "20px",
                    borderRadius: "16px",
                    marginBottom: "24px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "12px",
                    }}
                  >
                    <span style={{ color: "#64748b" }}>Tổng tiền</span>
                    <strong style={{ color: "#0f172a", fontSize: "1.1rem" }}>
                      {formatCurrency(bookingResult.finalAmount)}
                    </strong>
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#64748b" }}>Trạng thái</span>
                    <strong style={{ color: "#d97706" }}>Chờ thanh toán</strong>
                  </div>
                </div>

                <form
                  onSubmit={handlePaymentInit}
                  style={{ display: "grid", gap: "20px" }}
                >
                  <div>
                    <input
                      type="hidden"
                      name="paymentMethod"
                      value="bank_transfer"
                    />

                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "12px",
                          fontWeight: 600,
                          color: "#1f2937",
                        }}
                      >
                        Phương thức thanh toán
                      </label>

                      <div
                        style={{
                          padding: "16px",
                          borderRadius: "14px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <strong style={{ display: "block", color: "#0f172a" }}>
                          Chuyển khoản ngân hàng qua SePay / MBBank VietQR
                        </strong>
                        <p
                          style={{
                            margin: "6px 0 0",
                            color: "#64748b",
                            fontSize: "0.9rem",
                            lineHeight: 1.5,
                          }}
                        >
                          Travela hiện chỉ hỗ trợ thanh toán bằng mã QR ngân
                          hàng. Sau khi bấm thanh toán, hệ thống sẽ tạo mã QR để
                          bạn quét bằng app ngân hàng.
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{
                      padding: "16px",
                      borderRadius: "14px",
                      background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                      color: "#fff",
                      border: "none",
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      width: "100%",
                      cursor: "pointer",
                      boxShadow: "0 8px 20px rgba(114, 180, 75, 0.3)",
                    }}
                  >
                    Thanh toán ngay
                  </button>
                </form>
              </div>
            ) : (
              /* CARD ĐẶT TOUR */
              <div
                style={{
                  background: "#fff",
                  borderRadius: "28px",
                  padding: "32px",
                  boxShadow: "0 20px 40px rgba(15,23,42,0.08)",
                  border: "1px solid #f1f5f9",
                }}
              >
                <div
                  style={{
                    marginBottom: "24px",
                    paddingBottom: "24px",
                    borderBottom: "1px solid #e2e8f0",
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
                  <form
                    onSubmit={handleBooking}
                    style={{ display: "grid", gap: "20px" }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "8px",
                          fontWeight: 600,
                          color: "#334155",
                          fontSize: "0.95rem",
                        }}
                      >
                        Lịch khởi hành
                      </label>
                      <select
                        name="departureId"
                        value={
                          selectedDepartureId || tour.departures?.[0]?.id || ""
                        }
                        className="input-modern"
                        onChange={handleDepartureChange}
                      >
                        {(tour.departures || []).map((item) => {
                          const remaining = getDepartureRemainingSlots(item);
                          const isSoldOut = remaining <= 0;

                          return (
                            <option
                              key={item.id}
                              value={item.id}
                              disabled={isSoldOut}
                            >
                              {formatDate(item.departureDate)} ·{" "}
                              {formatCurrency(item.adultPrice)} ·{" "}
                              {isSoldOut ? "Hết chỗ" : `Còn ${remaining} chỗ`}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "16px",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "8px",
                            fontWeight: 600,
                            color: "#334155",
                            fontSize: "0.95rem",
                          }}
                        >
                          Người lớn
                        </label>
                        <input
                          name="adultCount"
                          type="number"
                          min="1"
                          value={bookingPassengers.adultCount}
                          className="input-modern"
                          onChange={handlePassengerChange("adultCount")}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "8px",
                            fontWeight: 600,
                            color: "#334155",
                            fontSize: "0.95rem",
                          }}
                        >
                          Trẻ em
                        </label>
                        <input
                          name="childCount"
                          type="number"
                          min="0"
                          value={bookingPassengers.childCount}
                          className="input-modern"
                          onChange={handlePassengerChange("childCount")}
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "8px",
                          fontWeight: 600,
                          color: "#334155",
                          fontSize: "0.95rem",
                        }}
                      >
                        Điểm đón
                      </label>
                      <select
                        name="pickupPointId"
                        className="input-modern"
                        defaultValue=""
                        required
                      >
                        <option value="">Chọn điểm đón phù hợp</option>
                        {(pickupOptions || []).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.province} · {item.name} ·{" "}
                            {formatPickupTime(item.pickupTime)}
                          </option>
                        ))}
                      </select>
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: "0.82rem",
                          color: "#64748b",
                        }}
                      >
                        Thông tin điểm đón sẽ được lưu vào booking và hiển thị
                        trong email xác nhận.
                      </p>
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "8px",
                          fontWeight: 600,
                          color: "#334155",
                          fontSize: "0.95rem",
                        }}
                      >
                        Họ tên liên hệ
                      </label>
                      <input
                        name="contactName"
                        defaultValue={currentUser?.fullName || ""}
                        required
                        className="input-modern"
                        placeholder="VD: Nguyễn Văn A"
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "16px",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "8px",
                            fontWeight: 600,
                            color: "#334155",
                            fontSize: "0.95rem",
                          }}
                        >
                          Email
                        </label>
                        <input
                          name="contactEmail"
                          type="email"
                          defaultValue={currentUser?.email || ""}
                          required
                          className="input-modern"
                          placeholder="Email"
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "8px",
                            fontWeight: 600,
                            color: "#334155",
                            fontSize: "0.95rem",
                          }}
                        >
                          Điện thoại
                        </label>
                        <input
                          name="contactPhone"
                          defaultValue={currentUser?.phone || ""}
                          required
                          className="input-modern"
                          placeholder="SĐT"
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "16px",
                        borderRadius: "18px",
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "center",
                          marginBottom: "14px",
                        }}
                      >
                        <div>
                          <strong style={{ color: "#0f172a" }}>
                            Thông tin hành khách
                          </strong>
                          <p
                            style={{
                              margin: "4px 0 0",
                              color: "#64748b",
                              fontSize: "0.85rem",
                            }}
                          >
                            Nhập đúng{" "}
                            {bookingPassengers.adultCount +
                              bookingPassengers.childCount}{" "}
                            người tương ứng số vé đã chọn.
                          </p>
                        </div>
                        <span
                          style={{
                            padding: "6px 10px",
                            borderRadius: "999px",
                            background: "#ecfdf5",
                            color: "#047857",
                            fontWeight: 800,
                            fontSize: "0.85rem",
                          }}
                        >
                          {bookingGuests.length} khách
                        </span>
                      </div>

                      <div style={{ display: "grid", gap: "14px" }}>
                        {bookingGuests.map((guest, index) => (
                          <div
                            key={`${guest.guestType}-${guest.index}`}
                            style={{
                              padding: "14px",
                              borderRadius: "16px",
                              background: "#fff",
                              border: "1px solid #e2e8f0",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "12px",
                              }}
                            >
                              <strong style={{ color: "#334155" }}>
                                {guest.guestType === "adult"
                                  ? "Người lớn"
                                  : "Trẻ em"}{" "}
                                {guest.index + 1}
                              </strong>
                              <span
                                style={{
                                  color:
                                    guest.guestType === "adult"
                                      ? "#2563eb"
                                      : "#d97706",
                                  background:
                                    guest.guestType === "adult"
                                      ? "#eff6ff"
                                      : "#fffbeb",
                                  padding: "4px 8px",
                                  borderRadius: "999px",
                                  fontSize: "0.78rem",
                                  fontWeight: 800,
                                }}
                              >
                                {guest.guestType === "adult"
                                  ? "adult"
                                  : "child"}
                              </span>
                            </div>

                            <div style={{ display: "grid", gap: "10px" }}>
                              <input
                                className="input-modern"
                                value={guest.fullName}
                                onChange={handleGuestChange(index, "fullName")}
                                required
                                placeholder="Họ tên hành khách"
                              />
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: "10px",
                                }}
                              >
                                <input
                                  className="input-modern"
                                  type="date"
                                  value={guest.dateOfBirth}
                                  onChange={handleGuestChange(
                                    index,
                                    "dateOfBirth",
                                  )}
                                />
                                <select
                                  className="input-modern"
                                  value={guest.gender}
                                  onChange={handleGuestChange(index, "gender")}
                                >
                                  <option value="">Giới tính</option>
                                  <option value="male">Nam</option>
                                  <option value="female">Nữ</option>
                                  <option value="other">Khác</option>
                                </select>
                              </div>
                              <input
                                className="input-modern"
                                value={guest.idNumber}
                                onChange={handleGuestChange(index, "idNumber")}
                                placeholder="CCCD/Hộ chiếu/Giấy tờ (nếu có)"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "8px",
                          fontWeight: 600,
                          color: "#334155",
                          fontSize: "0.95rem",
                        }}
                      >
                        Voucher của bạn
                      </label>

                      {currentUser ? (
                        availableVouchers.length ? (
                          <div
                            style={{
                              display: "grid",
                              gap: "10px",
                              maxHeight: "260px",
                              overflowY: "auto",
                              paddingRight: "4px",
                            }}
                          >
                            <label
                              style={{
                                display: "grid",
                                gridTemplateColumns: "20px 1fr",
                                gap: "12px",
                                padding: "14px",
                                borderRadius: "14px",
                                border: !selectedVoucherCode
                                  ? "2px solid #72b44b"
                                  : "1px solid #e2e8f0",
                                background: !selectedVoucherCode
                                  ? "rgba(114,180,75,0.08)"
                                  : "#fff",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="radio"
                                name="voucherCode"
                                value=""
                                checked={!selectedVoucherCode}
                                onChange={() => setSelectedVoucherCode("")}
                                style={{
                                  marginTop: "4px",
                                  accentColor: "#72b44b",
                                }}
                              />
                              <div>
                                <strong style={{ color: "#0f172a" }}>
                                  Không dùng voucher
                                </strong>
                                <p
                                  style={{
                                    margin: "4px 0 0",
                                    color: "#64748b",
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  Thanh toán theo giá gốc của tour.
                                </p>
                              </div>
                            </label>

                            {availableVouchers.map((voucher) => {
                              const minOrder = Number(
                                voucher.minOrderAmount || 0,
                              );
                              const notEnough =
                                Number(preview?.total || 0) < minOrder;
                              const discount = estimateVoucherDiscount(
                                voucher,
                                preview?.total,
                              );
                              const checked =
                                String(selectedVoucherCode) ===
                                String(voucher.code);

                              return (
                                <label
                                  key={`${voucher.userVoucherId || voucher.id}-${voucher.code}`}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "20px 1fr",
                                    gap: "12px",
                                    padding: "14px",
                                    borderRadius: "14px",
                                    border: checked
                                      ? "2px solid #72b44b"
                                      : "1px solid #e2e8f0",
                                    background: checked
                                      ? "rgba(114,180,75,0.08)"
                                      : notEnough
                                        ? "#f8fafc"
                                        : "#fff",
                                    opacity: notEnough ? 0.65 : 1,
                                    cursor: notEnough
                                      ? "not-allowed"
                                      : "pointer",
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name="voucherCode"
                                    value={voucher.code}
                                    checked={checked}
                                    disabled={notEnough}
                                    onChange={() =>
                                      setSelectedVoucherCode(voucher.code)
                                    }
                                    style={{
                                      marginTop: "4px",
                                      accentColor: "#72b44b",
                                    }}
                                  />
                                  <div>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: "12px",
                                        alignItems: "flex-start",
                                      }}
                                    >
                                      <div>
                                        <strong
                                          style={{
                                            display: "block",
                                            color: "#0f172a",
                                            marginBottom: "4px",
                                          }}
                                        >
                                          {voucher.code}
                                        </strong>
                                        <span
                                          style={{
                                            display: "block",
                                            color: "#475569",
                                            fontSize: "0.88rem",
                                          }}
                                        >
                                          {voucher.name || "Voucher ưu đãi"}
                                        </span>
                                      </div>
                                      <span
                                        style={{
                                          flexShrink: 0,
                                          padding: "4px 8px",
                                          borderRadius: "999px",
                                          background: "#fff7ed",
                                          color: "#ea580c",
                                          fontWeight: 700,
                                          fontSize: "0.8rem",
                                        }}
                                      >
                                        {formatVoucherDiscount(voucher)}
                                      </span>
                                    </div>

                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "8px",
                                        flexWrap: "wrap",
                                        marginTop: "8px",
                                        color: "#64748b",
                                        fontSize: "0.82rem",
                                      }}
                                    >
                                      <span>
                                        Đơn tối thiểu:{" "}
                                        {formatCurrency(minOrder)}
                                      </span>
                                      {voucher.endDate ? (
                                        <span>
                                          HSD: {formatDate(voucher.endDate)}
                                        </span>
                                      ) : null}
                                      {notEnough ? (
                                        <span style={{ color: "#dc2626" }}>
                                          Chưa đủ điều kiện
                                        </span>
                                      ) : discount > 0 ? (
                                        <span style={{ color: "#16a34a" }}>
                                          Dự kiến giảm{" "}
                                          {formatCurrency(discount)}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: "14px",
                              borderRadius: "14px",
                              background: "#f8fafc",
                              border: "1px dashed #cbd5e1",
                              color: "#64748b",
                              fontSize: "0.9rem",
                            }}
                          >
                            Tài khoản của bạn hiện chưa có voucher khả dụng.
                          </div>
                        )
                      ) : (
                        <div
                          style={{
                            padding: "14px",
                            borderRadius: "14px",
                            background: "#f8fafc",
                            border: "1px dashed #cbd5e1",
                            color: "#64748b",
                            fontSize: "0.9rem",
                          }}
                        >
                          Vui lòng đăng nhập để xem voucher của bạn.
                        </div>
                      )}

                      {selectedVoucher ? (
                        <div
                          style={{
                            marginTop: "10px",
                            padding: "12px",
                            borderRadius: "12px",
                            background: "#ecfdf5",
                            color: "#166534",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                          }}
                        >
                          Đã chọn {selectedVoucher.code}. Dự kiến giảm{" "}
                          {formatCurrency(selectedVoucherDiscount)}.
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "8px",
                          fontWeight: 600,
                          color: "#334155",
                          fontSize: "0.95rem",
                        }}
                      >
                        Ghi chú (Tùy chọn)
                      </label>
                      <textarea
                        name="note"
                        rows={2}
                        className="input-modern"
                        placeholder="Yêu cầu đặc biệt..."
                      />
                    </div>

                    <div>
                      <input
                        type="hidden"
                        name="paymentMethod"
                        value="bank_transfer"
                      />

                      <label
                        style={{
                          display: "block",
                          marginBottom: "12px",
                          fontWeight: 600,
                          color: "#334155",
                          fontSize: "0.95rem",
                        }}
                      >
                        Phương thức thanh toán
                      </label>

                      <div
                        style={{
                          padding: "14px",
                          borderRadius: "14px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <strong style={{ display: "block", color: "#0f172a" }}>
                          Chuyển khoản ngân hàng qua mã QR
                        </strong>
                        <p
                          style={{
                            margin: "6px 0 0",
                            color: "#64748b",
                            fontSize: "0.88rem",
                            lineHeight: 1.5,
                          }}
                        >
                          Sau khi tạo booking, Travela sẽ hiển thị mã QR
                          SePay/VietQR. Bạn dùng app ngân hàng để quét mã và
                          chuyển khoản đúng nội dung.
                        </p>
                      </div>
                    </div>

                    {/* Khối Tạm tính */}
                    {preview?.departure && (
                      <div
                        style={{
                          background: "#f8fafc",
                          padding: "16px",
                          borderRadius: "16px",
                          marginTop: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "8px",
                            fontSize: "0.95rem",
                          }}
                        >
                          <span style={{ color: "#64748b" }}>Số người lớn</span>
                          <strong style={{ color: "#1f2937" }}>
                            {bookingPassengers.adultCount} người
                          </strong>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "8px",
                            fontSize: "0.95rem",
                          }}
                        >
                          <span style={{ color: "#64748b" }}>Số trẻ em</span>
                          <strong style={{ color: "#1f2937" }}>
                            {bookingPassengers.childCount} trẻ
                          </strong>
                        </div>

                        {preview.rows.map(([label, value]) => (
                          <div
                            key={label}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "8px",
                              fontSize: "0.95rem",
                            }}
                          >
                            <span style={{ color: "#64748b" }}>{label}</span>
                            <strong style={{ color: "#1f2937" }}>
                              {label.includes("Ngày")
                                ? formatDate(value)
                                : value}
                            </strong>
                          </div>
                        ))}

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: "16px",
                            paddingTop: "16px",
                            borderTop: "1px dashed #cbd5e1",
                          }}
                        >
                          <span style={{ color: "#0f172a", fontWeight: 600 }}>
                            Tạm tính
                          </span>
                          <strong
                            style={{ color: "#0f172a", fontSize: "1rem" }}
                          >
                            {formatCurrency(preview.total)}
                          </strong>
                        </div>

                        {selectedVoucher && selectedVoucherDiscount > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginTop: "8px",
                            }}
                          >
                            <span style={{ color: "#16a34a", fontWeight: 600 }}>
                              Voucher {selectedVoucher.code}
                            </span>
                            <strong
                              style={{ color: "#16a34a", fontSize: "1rem" }}
                            >
                              -{formatCurrency(selectedVoucherDiscount)}
                            </strong>
                          </div>
                        ) : null}

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: "12px",
                            paddingTop: "12px",
                            borderTop: "1px solid #e2e8f0",
                          }}
                        >
                          <span style={{ color: "#0f172a", fontWeight: 800 }}>
                            Thành tiền
                          </span>
                          <strong
                            style={{ color: "#ff9f1a", fontSize: "1.25rem" }}
                          >
                            {formatCurrency(
                              Math.max(
                                Number(preview.total || 0) -
                                  Number(selectedVoucherDiscount || 0),
                                0,
                              ),
                            )}
                          </strong>
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginTop: "8px",
                      }}
                    >
                      <button
                        type="submit"
                        value="hold"
                        className="btn btn-primary"
                        style={{
                          padding: "16px",
                          borderRadius: "14px",
                          background: "#f8fafc",
                          color: "#0f172a",
                          border: "1px solid #cbd5e1",
                          fontSize: "1rem",
                          fontWeight: 700,
                          width: "100%",
                          cursor: "pointer",
                        }}
                      >
                        Giữ chỗ trước
                      </button>
                      <button
                        type="submit"
                        value="pay_now"
                        className="btn btn-primary"
                        style={{
                          padding: "16px",
                          borderRadius: "14px",
                          background:
                            "linear-gradient(135deg, #72b44b, #5a9d34)",
                          color: "#fff",
                          border: "none",
                          fontSize: "1rem",
                          fontWeight: 700,
                          width: "100%",
                          cursor: "pointer",
                          boxShadow: "0 8px 20px rgba(114, 180, 75, 0.3)",
                        }}
                      >
                        Thanh toán ngay
                      </button>
                    </div>
                    <p
                      style={{
                        textAlign: "center",
                        margin: 0,
                        fontSize: "0.85rem",
                        color: "#94a3b8",
                      }}
                    >
                      Bạn có thể thanh toán ngay mà không cần bấm giữ chỗ trước.
                      Nếu chọn giữ chỗ, hệ thống chỉ khóa tạm chỗ ngồi trong
                      thời gian ngắn để chờ thanh toán.
                    </p>
                  </form>
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
            )}
          </aside>
        </div>
      </section>

      {/* Tour liên quan Full Width ở dưới cùng */}
      {relatedTours.length > 0 && (
        <section
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
