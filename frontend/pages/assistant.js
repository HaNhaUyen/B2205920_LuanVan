import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { useToast } from "@/components/ToastContext";
import { trackBehavior } from "@/lib/behavior";
import { mapImageUrl } from "@/lib/tour";

const BASE_STORAGE_KEY = "tourai_conversation_id";
const MESSAGE_STORAGE_KEY = "tourai_current_messages";
const MEMORY_STORAGE_KEY = "tourai_current_memory";

const CUSTOMER_STARTER_MESSAGES = [
  "Gợi ý tour phù hợp với tôi",
  "Tôi có voucher nào không?",
  "Kiểm tra booking của tôi",
  "Tôi ở Cần Thơ thì đón ở đâu?",
  "Tôi muốn đi Phú Quốc 3 ngày dưới 7 triệu",
  "Tháng 8 nên đi đâu?",
];

const GUIDE_STARTER_MESSAGES = [
  "Hôm nay tôi có tour nào?",
  "Chuyến sắp tới của tôi là chuyến nào?",
  "Cho tôi danh sách hành khách",
  "Có khách nào cần lưu ý sức khỏe không?",
  "Điểm đón chuyến sắp tới ở đâu?",
  "Cho tôi xem lịch trình chuyến sắp tới",
];

const CUSTOMER_GREETING =
  "Xin chào! Mình là Travela AI. Mình có thể gợi ý tour theo nhu cầu, kiểm tra voucher, booking, điểm đón và chính sách. Bạn muốn mình hỗ trợ gì trước?";

const GUIDE_GREETING =
  "Xin chào! Tôi là trợ lý dành cho hướng dẫn viên Travela. Tôi có thể hỗ trợ kiểm tra lịch phân công, chuyến sắp tới, danh sách hành khách, lưu ý ăn uống - sức khỏe, điểm đón và lịch trình chuyến đi.";

function scopeStorageKey(baseKey, isGuide) {
  return isGuide ? `${baseKey}_guide` : baseKey;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "Đang cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Đang cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTime(value) {
  if (!value) return "Liên hệ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Liên hệ";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
function formatPaymentMethod(value) {
  const method = String(value || "").toLowerCase();
  if (["bank_transfer", "sepay", "vietqr", "qr", "transfer"].includes(method)) {
    return "SePay / VietQR chuyển khoản";
  }
  if (method === "momo") return "MoMo";
  if (method === "vnpay") return "VNPay";
  if (method === "cash") return "Tiền mặt";
  return value || "Đang cập nhật";
}

function formatMessageTime() {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function assetUrl(value) {
  if (!value) return "";
  return mapImageUrl(value, API_URL);
}

const TOUR_PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=90";

function appPath(value) {
  if (!value) return "/mytour";
  if (/^https?:\/\//i.test(value)) return value;
  return String(value).startsWith("/") ? value : `/${value}`;
}

function TourCard({ card, onAskMore, compact, cardIndex = 0 }) {
  const departures = Array.isArray(card.departures)
    ? card.departures.filter((item) => item?.departureId)
    : [];
  const hasMultipleDepartures = departures.length > 1;
  const primaryDeparture = departures[0] || null;
  const departureLabel = hasMultipleDepartures
    ? `${departures.length} lịch gần nhất`
    : formatDate(card.departureDate || primaryDeparture?.departureDate);
  const handleBookTour = () => {
    // Chỉ chọn TOUR ở bước này.
    // Lịch khởi hành sẽ được backend kiểm tra lại theo thời điểm hiện tại,
    // số chỗ còn lại và lịch booking hiện có của khách rồi mới hiển thị.
    onAskMore(`Chọn tour số ${cardIndex + 1}`);
  };

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "82px 1fr" : "110px 1fr",
          gap: 12,
          padding: 12,
        }}
      >
        <div
          style={{
            borderRadius: 12,
            overflow: "hidden",
            background: "#e2e8f0",
            minHeight: compact ? 82 : 96,
          }}
        >
          <img
            src={
              card.imageUrl ? assetUrl(card.imageUrl) : TOUR_PLACEHOLDER_IMAGE
            }
            alt={card.name || "Tour"}
            loading="lazy"
            decoding="async"
            onError={(event) => {
              event.currentTarget.src = TOUR_PLACEHOLDER_IMAGE;
            }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              display: "block",
            }}
          />
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong
                style={{
                  display: "block",
                  color: "#0f172a",
                  fontSize: compact ? "0.86rem" : "0.95rem",
                  lineHeight: 1.45,
                }}
              >
                {card.name}
              </strong>
              <span style={{ color: "#64748b", fontSize: compact ? 12 : 13 }}>
                {card.destination} • {card.durationText}
              </span>
            </div>
            <strong
              style={{
                color: "#16a34a",
                whiteSpace: "nowrap",
                fontSize: compact ? 13 : 14,
              }}
            >
              {formatCurrency(card.priceAdult)}
            </strong>
          </div>

          <p
            style={{
              margin: "0 0 8px",
              color: "#475569",
              fontSize: compact ? 12 : 13,
              lineHeight: 1.5,
            }}
          >
            {card.shortDescription ||
              card.reason ||
              "Tour phù hợp để bạn tham khảo."}
          </p>

          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            {(card.tags || []).slice(0, 3).map((tag) => (
              <span
                key={`${card.tourId}-${tag}`}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "#f1f5f9",
                  color: "#475569",
                  fontSize: 11,
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "#64748b", fontSize: 12 }}>
              Khởi hành: {departureLabel}
            </span>

            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button
                type="button"
                onClick={() => onAskMore(`Tư vấn kỹ hơn về tour ${card.name}`)}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#334155",
                  borderRadius: 999,
                  padding: "7px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Hỏi thêm
              </button>
              <button
                type="button"
                onClick={handleBookTour}
                style={{
                  border: "none",
                  background: "linear-gradient(135deg, #f97316, #fb923c)",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "7px 10px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Đặt tour
              </button>
              <Link
                href={`/tour/${card.slug}`}
                target="_top"
                rel="noopener noreferrer"
                style={{
                  textDecoration: "none",
                  background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "7px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Xem tour
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VoucherCard({ voucher }) {
  return (
    <div
      style={{
        border: "1px solid #fed7aa",
        background: "#fff7ed",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <div>
          <strong style={{ color: "#9a3412" }}>{voucher.code}</strong>
          <div style={{ color: "#7c2d12", fontSize: 13, marginTop: 3 }}>
            {voucher.name}
          </div>
        </div>
        <strong style={{ color: "#ea580c", whiteSpace: "nowrap" }}>
          {voucher.discountText}
        </strong>
      </div>
      <div style={{ color: "#9a3412", fontSize: 12, marginTop: 8 }}>
        Đơn tối thiểu: {formatCurrency(voucher.minOrderAmount)} • HSD:{" "}
        {formatDate(voucher.endDate)}
      </div>
      {voucher.description ? (
        <p style={{ margin: "8px 0 0", color: "#7c2d12", fontSize: 12 }}>
          {voucher.description}
        </p>
      ) : null}
    </div>
  );
}

function BookingCard({ booking, onRefund }) {
  const bookingStatus = String(booking?.status || "").toLowerCase();
  const canRequestRefund =
    Boolean(booking?.id || booking?.bookingId) &&
    ![
      "cancelled",
      "canceled",
      "expired",
      "refunded",
      "completed",
      "failed",
    ].includes(bookingStatus);

  return (
    <div
      style={{
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
      >
        <strong style={{ color: "#1e3a8a" }}>{booking.bookingCode}</strong>
        <strong style={{ color: "#2563eb" }}>
          {formatCurrency(booking.amount)}
        </strong>
      </div>
      <div style={{ color: "#1e40af", fontSize: 13, marginTop: 6 }}>
        {booking.tourName}{" "}
        {booking.destination ? `• ${booking.destination}` : ""}
      </div>
      <div
        style={{
          display: "grid",
          gap: 4,
          color: "#334155",
          fontSize: 12,
          marginTop: 8,
        }}
      >
        <span>Trạng thái đơn: {booking.status}</span>
        <span>Thanh toán: {booking.paymentStatus || "chưa có giao dịch"}</span>
        <span>
          Ngày đi: {formatDate(booking.departureDate)} - Ngày về:{" "}
          {formatDate(booking.endDate)}
        </span>
        <span>
          Điểm đón: {booking.pickupName || "Travela sẽ liên hệ xác nhận"}
        </span>
        {booking.pickupAddress ? (
          <span>Địa chỉ: {booking.pickupAddress}</span>
        ) : null}
        {booking.pickupTime ? (
          <span>Giờ đón: {formatTime(booking.pickupTime)}</span>
        ) : null}
      </div>
      {canRequestRefund ? (
        <button
          type="button"
          onClick={() => onRefund?.(booking)}
          style={{
            marginTop: 10,
            border: "none",
            background: "linear-gradient(135deg, #f97316, #fb923c)",
            color: "#fff",
            borderRadius: 999,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Yêu cầu hoàn tiền
        </button>
      ) : null}
    </div>
  );
}

function BookingCheckoutCard({ checkout }) {
  if (!checkout) return null;

  const qrUrl =
    checkout.qrCodeUrl ||
    `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
      checkout.mobilePaymentUrl || checkout.paymentUrl || "",
    )}`;

  const mobileUrl = checkout.mobilePaymentUrl || checkout.paymentUrl || "";
  const isSepay =
    checkout.qrProvider === "sepay" ||
    String(checkout.paymentMethod || "").toLowerCase() === "bank_transfer";

  return (
    <div
      style={{
        border: "1px solid #bbf7d0",
        background: "#f0fdf4",
        borderRadius: 16,
        padding: 14,
        display: "grid",
        gap: 12,
      }}
    >
      <div>
        <strong style={{ color: "#14532d", display: "block" }}>
          Thanh toán booking {checkout.bookingCode}
        </strong>
        <span style={{ color: "#166534", fontSize: 13 }}>
          Phương thức: {formatPaymentMethod(checkout.paymentMethod)} • Trạng
          thái: {checkout.paymentStatus || "pending"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gap: 6,
          color: "#14532d",
          fontSize: 13,
          lineHeight: 1.5,
          background: "#ecfdf5",
          border: "1px solid #bbf7d0",
          borderRadius: 14,
          padding: 12,
        }}
      >
        {checkout.tourName ? (
          <span>
            Tour: <strong>{checkout.tourName}</strong>
          </span>
        ) : null}
        {checkout.departureDate ? (
          <span>
            Lịch khởi hành:{" "}
            <strong>{formatDate(checkout.departureDate)}</strong>
            {checkout.endDate ? ` - ${formatDate(checkout.endDate)}` : ""}
          </span>
        ) : null}
        {checkout.pickupName ? (
          <span>
            Điểm đón: <strong>{checkout.pickupName}</strong>
            {checkout.pickupAddress ? ` - ${checkout.pickupAddress}` : ""}
          </span>
        ) : null}
        {checkout.pickupTime ? (
          <span>
            Giờ đón: <strong>{formatTime(checkout.pickupTime)}</strong>
          </span>
        ) : null}
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #dcfce7",
          borderRadius: 14,
          padding: 12,
          textAlign: "center",
        }}
      >
        <img
          src={qrUrl}
          alt="Mã QR thanh toán SePay/VietQR"
          style={{
            width: 240,
            height: 240,
            maxWidth: "100%",
            objectFit: "contain",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: 6,
          color: "#14532d",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <span>
          Tổng tiền:{" "}
          <strong>
            {formatCurrency(checkout.finalAmount || checkout.amount)}
          </strong>
        </span>

        <span>
          Nội dung chuyển khoản:{" "}
          <strong>
            {checkout.transferContent ||
              checkout.transactionCode ||
              "Đang cập nhật"}
          </strong>
        </span>

        <span>
          Mã giao dịch:{" "}
          <strong>{checkout.transactionCode || "Đang cập nhật"}</strong>
        </span>

        {isSepay && checkout.accountNo ? (
          <>
            <span>
              Ngân hàng: <strong>{checkout.bankCode || "Đang cập nhật"}</strong>
            </span>
            <span>
              Số tài khoản: <strong>{checkout.accountNo}</strong>
            </span>
            {checkout.accountName ? (
              <span>
                Chủ tài khoản: <strong>{checkout.accountName}</strong>
              </span>
            ) : null}
          </>
        ) : null}

        <span>
          Giữ chỗ đến: <strong>{formatDate(checkout.holdExpiresAt)}</strong>
        </span>
      </div>

      <div
        style={{
          color: "#475569",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {isSepay
          ? "Vui lòng mở app ngân hàng và quét mã VietQR/SePay. App ngân hàng sẽ tự điền số tiền và nội dung chuyển khoản. Sau khi SePay ghi nhận giao dịch, hệ thống sẽ tự cập nhật trạng thái booking."
          : "Vui lòng dùng điện thoại quét mã QR để thanh toán. Sau khi thanh toán thành công, chatbot sẽ tự thông báo và cập nhật trạng thái booking cho bạn."}
      </div>

      {mobileUrl ? (
        <button
          type="button"
          onClick={() => window.open(mobileUrl, "_blank")}
          style={{
            border: "none",
            background: "linear-gradient(135deg, #16a34a, #22c55e)",
            color: "#fff",
            borderRadius: 999,
            padding: "10px 14px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Mở trang thanh toán
        </button>
      ) : null}
    </div>
  );
}

function GuestQuantityPicker({ onSubmit, disabled = false }) {
  const [adultCount, setAdultCount] = useState(1);
  const [childCount, setChildCount] = useState(0);

  const totalGuests = adultCount + childCount;

  const submit = () => {
    if (disabled) return;

    const parts = [`${adultCount} người lớn`];
    if (childCount > 0) {
      parts.push(`${childCount} trẻ em`);
    }

    onSubmit?.(parts.join(", "));
  };

  const rowStyle = {
    minHeight: 66,
    padding: "0 14px 0 16px",
    border: "1px solid #dbe3ef",
    borderRadius: 14,
    background: "#f8fafc",
    display: "grid",
    gridTemplateColumns: "1fr auto auto auto",
    alignItems: "center",
    gap: 12,
  };

  const circleButtonStyle = (isDisabled) => ({
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#334155",
    fontSize: 20,
    lineHeight: 1,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.45 : 1,
    boxShadow: "0 1px 3px rgba(15,23,42,.06)",
  });

  return (
    <div style={{ width: "100%", maxWidth: 430, display: "grid", gap: 10 }}>
      <div style={rowStyle}>
        <strong style={{ color: "#0f172a", fontSize: 14 }}>Người lớn</strong>
        <button
          type="button"
          onClick={() => setAdultCount((value) => Math.max(1, value - 1))}
          disabled={disabled || adultCount <= 1}
          style={circleButtonStyle(disabled || adultCount <= 1)}
        >
          −
        </button>
        <strong
          style={{
            minWidth: 24,
            textAlign: "center",
            color: "#0f172a",
            fontSize: 18,
          }}
        >
          {adultCount}
        </strong>
        <button
          type="button"
          onClick={() => setAdultCount((value) => Math.min(20, value + 1))}
          disabled={disabled || adultCount >= 20}
          style={circleButtonStyle(disabled || adultCount >= 20)}
        >
          +
        </button>
      </div>

      <div style={rowStyle}>
        <strong style={{ color: "#0f172a", fontSize: 14 }}>Trẻ em</strong>
        <button
          type="button"
          onClick={() => setChildCount((value) => Math.max(0, value - 1))}
          disabled={disabled || childCount <= 0}
          style={circleButtonStyle(disabled || childCount <= 0)}
        >
          −
        </button>
        <strong
          style={{
            minWidth: 24,
            textAlign: "center",
            color: "#0f172a",
            fontSize: 18,
          }}
        >
          {childCount}
        </strong>
        <button
          type="button"
          onClick={() => setChildCount((value) => Math.min(20, value + 1))}
          disabled={disabled || childCount >= 20}
          style={circleButtonStyle(disabled || childCount >= 20)}
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        style={{
          width: "100%",
          minHeight: 42,
          border: "none",
          borderRadius: 12,
          background: "linear-gradient(135deg, #16a34a, #22c55e)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 800,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        Tiếp tục với {totalGuests} khách
      </button>
    </div>
  );
}

function PassengerDetailsForm({
  adultCount = 1,
  childCount = 0,
  existingGuests = [],
  onSubmit,
  disabled = false,
}) {
  const createRows = () => {
    const rows = [];
    const saved = Array.isArray(existingGuests) ? existingGuests : [];

    for (let i = 1; i <= Math.max(1, Number(adultCount || 1)); i += 1) {
      const existing = saved.find(
        (guest) => guest?.guestType === "adult" && Number(guest?.index) === i,
      );

      rows.push({
        guestType: "adult",
        index: i,
        fullName: existing?.fullName || "",
        dateOfBirth: existing?.dateOfBirth
          ? String(existing.dateOfBirth).slice(0, 10)
          : "",
        gender: existing?.gender || "",
        idNumber: existing?.idNumber || "",
      });
    }

    for (let i = 1; i <= Math.max(0, Number(childCount || 0)); i += 1) {
      const existing = saved.find(
        (guest) => guest?.guestType === "child" && Number(guest?.index) === i,
      );

      rows.push({
        guestType: "child",
        index: i,
        fullName: existing?.fullName || "",
        dateOfBirth: existing?.dateOfBirth
          ? String(existing.dateOfBirth).slice(0, 10)
          : "",
        gender: existing?.gender || "",
        idNumber: existing?.idNumber || "",
      });
    }

    return rows;
  };

  const [guests, setGuests] = useState(createRows);
  const [error, setError] = useState("");

  useEffect(() => {
    setGuests(createRows());
    setError("");
  }, [adultCount, childCount, existingGuests]);

  const updateGuest = (rowIndex, field, value) => {
    setGuests((current) =>
      current.map((guest, index) =>
        index === rowIndex ? { ...guest, [field]: value } : guest,
      ),
    );
  };

  const isDone = (guest) =>
    Boolean(
      String(guest.fullName || "").trim() &&
      String(guest.dateOfBirth || "").trim() &&
      String(guest.gender || "").trim() &&
      String(guest.idNumber || "").trim(),
    );

  const submit = () => {
    if (disabled) return;

    const missing = guests.find((guest) => !isDone(guest));

    if (missing) {
      setError(
        "Vui lòng nhập đầy đủ họ tên, ngày sinh, giới tính và CCCD/hộ chiếu cho tất cả hành khách.",
      );
      return;
    }

    const invalidId = guests.find(
      (guest) =>
        !/^[A-Za-z0-9]{6,20}$/.test(String(guest.idNumber || "").trim()),
    );

    if (invalidId) {
      setError("CCCD/hộ chiếu chỉ gồm chữ và số, từ 6 đến 20 ký tự.");
      return;
    }

    const ids = new Set();
    const duplicated = guests.find((guest) => {
      const id = String(guest.idNumber || "")
        .trim()
        .toUpperCase();
      if (!id) return false;
      if (ids.has(id)) return true;
      ids.add(id);
      return false;
    });

    if (duplicated) {
      setError("CCCD/hộ chiếu không được trùng giữa các hành khách.");
      return;
    }

    const lines = guests.map((guest) => {
      const label =
        guest.guestType === "adult"
          ? `Người lớn ${guest.index}`
          : `Trẻ em ${guest.index}`;

      return `${label}: Họ tên=${String(guest.fullName).trim()} | Ngày sinh=${guest.dateOfBirth} | Giới tính=${guest.gender} | CCCD=${String(guest.idNumber).trim()}`;
    });

    setError("");
    onSubmit?.(["Xác nhận thông tin hành khách", ...lines].join("\n"));
  };

  const fieldStyle = {
    width: "100%",
    minHeight: 40,
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "0 10px",
    background: "#fff",
    color: "#0f172a",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "grid",
    gap: 5,
    color: "#475569",
    fontSize: 11,
    fontWeight: 700,
  };

  return (
    <div
      style={{
        width: "100%",
        display: "grid",
        gap: 10,
        padding: 10,
        border: "1px solid #dbe3ef",
        borderRadius: 14,
        background: "#ffffff",
        boxShadow: "0 5px 18px rgba(15,23,42,.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
          padding: "2px 2px 4px",
        }}
      >
        <div>
          <strong style={{ color: "#0f172a", fontSize: 14 }}>
            Thông tin hành khách
          </strong>
          <div
            style={{
              color: "#64748b",
              fontSize: 11,
              lineHeight: 1.45,
              marginTop: 3,
            }}
          >
            Kiểm tra thông tin có sẵn và bổ sung các mục còn thiếu.
          </div>
        </div>
        <span
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            background: "#ecfdf5",
            color: "#047857",
            fontSize: 10,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {guests.filter(isDone).length}/{guests.length} đầy đủ
        </span>
      </div>

      {guests.map((guest, rowIndex) => {
        const owner = guest.guestType === "adult" && guest.index === 1;
        const complete = isDone(guest);
        const label =
          guest.guestType === "adult"
            ? `Người lớn ${guest.index}`
            : `Trẻ em ${guest.index}`;

        return (
          <details
            key={`${guest.guestType}-${guest.index}`}
            open={!complete || rowIndex === 0}
            style={{
              border: complete ? "1px solid #bbf7d0" : "1px solid #dbe3ef",
              borderRadius: 12,
              background: complete ? "#f7fef9" : "#f8fafc",
              overflow: "hidden",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
                padding: "10px 11px",
                display: "flex",
                alignItems: "center",
                gap: 7,
                userSelect: "none",
              }}
            >
              <strong
                style={{
                  color: "#0f172a",
                  fontSize: 12,
                  flex: 1,
                }}
              >
                {label}
              </strong>

              {owner ? (
                <span
                  style={{
                    padding: "3px 6px",
                    borderRadius: 6,
                    background: "#dbeafe",
                    color: "#1d4ed8",
                    fontSize: 9,
                    fontWeight: 800,
                  }}
                >
                  Người đặt tour
                </span>
              ) : null}

              <span
                style={{
                  padding: "3px 6px",
                  borderRadius: 6,
                  background: complete ? "#dcfce7" : "#fef3c7",
                  color: complete ? "#166534" : "#92400e",
                  fontSize: 9,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                {complete ? "✓ Đã đủ" : "Cần nhập"}
              </span>
            </summary>

            <div
              style={{
                display: "grid",
                gap: 9,
                padding: "10px 11px 11px",
                borderTop: "1px dashed #dbe3ef",
              }}
            >
              <label style={labelStyle}>
                Họ và tên
                <input
                  type="text"
                  value={guest.fullName}
                  onChange={(event) =>
                    updateGuest(rowIndex, "fullName", event.target.value)
                  }
                  placeholder="Họ và tên đúng giấy tờ"
                  disabled={disabled}
                  style={fieldStyle}
                />
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 8,
                }}
              >
                <label style={labelStyle}>
                  Ngày sinh
                  <input
                    type="date"
                    value={guest.dateOfBirth}
                    onChange={(event) =>
                      updateGuest(rowIndex, "dateOfBirth", event.target.value)
                    }
                    disabled={disabled}
                    style={fieldStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Giới tính
                  <select
                    value={guest.gender}
                    onChange={(event) =>
                      updateGuest(rowIndex, "gender", event.target.value)
                    }
                    disabled={disabled}
                    style={fieldStyle}
                  >
                    <option value="">Chọn</option>
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                    <option value="other">Khác</option>
                  </select>
                </label>
              </div>

              <label style={labelStyle}>
                CCCD / Hộ chiếu
                <input
                  type="text"
                  value={guest.idNumber}
                  onChange={(event) =>
                    updateGuest(
                      rowIndex,
                      "idNumber",
                      event.target.value.replace(/[^A-Za-z0-9]/g, ""),
                    )
                  }
                  placeholder="Nhập số giấy tờ"
                  maxLength={20}
                  disabled={disabled}
                  style={fieldStyle}
                />
              </label>
            </div>
          </details>
        );
      })}

      {error ? (
        <div
          style={{
            color: "#b91c1c",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        style={{
          minHeight: 42,
          border: "none",
          borderRadius: 11,
          background: "linear-gradient(135deg, #16a34a, #22c55e)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 800,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          boxShadow: "0 5px 14px rgba(34,197,94,.18)",
        }}
      >
        Xác nhận thông tin hành khách
      </button>
    </div>
  );
}

function RefundBankForm({ onSubmit, disabled = false }) {
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (disabled) return;

    if (!bankName.trim() || !accountNo.trim() || !accountName.trim()) {
      setError(
        "Vui lòng nhập đầy đủ ngân hàng, số tài khoản và chủ tài khoản.",
      );
      return;
    }

    if (!/^[0-9A-Za-z_.-]{4,50}$/.test(accountNo.trim())) {
      setError("Số tài khoản không hợp lệ.");
      return;
    }

    setError("");
    onSubmit?.(
      [
        `Ngân hàng: ${bankName.trim()}`,
        `STK: ${accountNo.trim()}`,
        `Chủ tài khoản: ${accountName.trim().toUpperCase()}`,
      ].join("\n"),
    );
  };

  return (
    <div
      style={{
        width: "100%",
        display: "grid",
        gap: 9,
        padding: 12,
        border: "1px solid #fed7aa",
        borderRadius: 14,
        background: "#fff7ed",
      }}
    >
      <div>
        <strong style={{ color: "#9a3412", fontSize: 14 }}>
          Thông tin nhận hoàn tiền
        </strong>
        <div style={{ color: "#9a3412", fontSize: 12, marginTop: 3 }}>
          Booking đã thanh toán cần đủ thông tin ngân hàng để hoàn tiền.
        </div>
      </div>

      <input
        type="text"
        value={bankName}
        onChange={(event) => setBankName(event.target.value)}
        placeholder="Ngân hàng, ví dụ: MBBank"
        disabled={disabled}
        style={{
          minHeight: 40,
          border: "1px solid #fdba74",
          borderRadius: 10,
          padding: "0 11px",
          background: "#fff",
        }}
      />

      <input
        type="text"
        value={accountNo}
        onChange={(event) =>
          setAccountNo(event.target.value.replace(/\s+/g, ""))
        }
        placeholder="Số tài khoản"
        disabled={disabled}
        style={{
          minHeight: 40,
          border: "1px solid #fdba74",
          borderRadius: 10,
          padding: "0 11px",
          background: "#fff",
        }}
      />

      <input
        type="text"
        value={accountName}
        onChange={(event) => setAccountName(event.target.value)}
        placeholder="Chủ tài khoản"
        disabled={disabled}
        style={{
          minHeight: 40,
          border: "1px solid #fdba74",
          borderRadius: 10,
          padding: "0 11px",
          background: "#fff",
          textTransform: "uppercase",
        }}
      />

      {error ? (
        <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        style={{
          minHeight: 42,
          border: "none",
          borderRadius: 12,
          background: "linear-gradient(135deg, #f97316, #fb923c)",
          color: "#fff",
          fontWeight: 800,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        Xác nhận thông tin ngân hàng
      </button>
    </div>
  );
}

function shouldShowGuestQuantityPicker(message, isLatest) {
  if (!isLatest || message?.role === "user") return false;
  const content = String(message?.content || "").toLowerCase();

  return (
    content.includes("bạn đi mấy người lớn") ||
    content.includes("mấy trẻ em để mình tính đúng giá") ||
    content.includes("chọn lại số lượng người lớn và trẻ em")
  );
}

function shouldShowPassengerForm(message, memory, isLatest) {
  if (!isLatest || message?.role === "user") return false;

  const content = String(message?.content || "").toLowerCase();
  const draft = memory?.bookingDraft || {};
  const adultCount = Number(draft.adultCount || 0);
  const childCount = Number(draft.childCount || 0);

  if (adultCount + childCount <= 0) return false;

  const explicitlyAsksForPassengerForm =
    content.includes("biểu mẫu bên dưới") ||
    content.includes("vui lòng kiểm tra và bổ sung thông tin hành khách") ||
    content.includes("vui lòng nhập thông tin hành khách");

  const isBookingPreview =
    content.includes("mình tóm tắt booking trước khi tạo mã qr") ||
    content.includes("tổng cần thanh toán:") ||
    content.includes("xác nhận đặt");

  return explicitlyAsksForPassengerForm && !isBookingPreview;
}

function shouldShowRefundBankForm(message, memory, isLatest) {
  if (!isLatest || message?.role === "user") return false;

  const content = String(message?.content || "").toLowerCase();
  const draft = memory?.refundDraft || {};

  const missingBank =
    draft?.started &&
    (!draft.refundBankName ||
      !draft.refundAccountNo ||
      !draft.refundAccountName);

  return Boolean(
    missingBank &&
    (content.includes("thông tin ngân hàng") ||
      content.includes("ngân hàng nhận tiền") ||
      content.includes("số tài khoản") ||
      content.includes("chủ tài khoản")),
  );
}

function PassengerConfirmationBubble({ content, time }) {
  const raw = String(content || "");
  const header = "Xác nhận thông tin hành khách";

  if (!raw.toLowerCase().startsWith(header.toLowerCase())) {
    return null;
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1);

  const guests = lines
    .map((line) => {
      const match = line.match(
        /^(Người lớn|Trẻ em)\s+(\d+)\s*:\s*Họ tên=([^|]+)\|\s*Ngày sinh=([^|]+)\|\s*Giới tính=([^|]+)\|\s*CCCD=([^|]+)$/i,
      );

      if (!match) return null;

      return {
        type: match[1],
        index: Number(match[2]),
        fullName: String(match[3] || "").trim(),
        dateOfBirth: String(match[4] || "").trim(),
        gender: String(match[5] || "")
          .trim()
          .toLowerCase(),
        idNumber: String(match[6] || "").trim(),
      };
    })
    .filter(Boolean);

  if (!guests.length) return null;

  const genderLabel = (value) => {
    if (value === "male") return "Nam";
    if (value === "female") return "Nữ";
    if (value === "other") return "Khác";
    return value || "Chưa cập nhật";
  };

  const maskId = (value) => {
    const clean = String(value || "").trim();
    if (clean.length <= 4) return clean;
    return `${"•".repeat(Math.max(4, clean.length - 4))}${clean.slice(-4)}`;
  };

  const formatBirthDate = (value) => {
    if (!value) return "Chưa cập nhật";
    const [year, month, day] = String(value).split("-");
    if (year && month && day) return `${day}/${month}/${year}`;
    return value;
  };

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #16a34a, #22c55e)",
        color: "#fff",
        borderRadius: "18px 18px 4px 18px",
        padding: "12px 13px",
        boxShadow: "0 10px 25px rgba(34,197,94,0.18)",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 9 }}>
        Đã xác nhận thông tin hành khách
      </div>

      <div style={{ display: "grid", gap: 7 }}>
        {guests.map((guest) => (
          <div
            key={`${guest.type}-${guest.index}`}
            style={{
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 10,
              padding: "8px 9px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: 12 }}>
                {guest.type} {guest.index}
              </strong>
              <span style={{ opacity: 0.85, fontSize: 11 }}>•</span>
              <strong style={{ fontSize: 12 }}>{guest.fullName}</strong>
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                lineHeight: 1.5,
                opacity: 0.94,
              }}
            >
              Ngày sinh: {formatBirthDate(guest.dateOfBirth)} · Giới tính:{" "}
              {genderLabel(guest.gender)}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 11,
                lineHeight: 1.5,
                opacity: 0.94,
              }}
            >
              CCCD/Hộ chiếu: {maskId(guest.idNumber)}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          fontSize: 11,
          opacity: 0.68,
          marginTop: 7,
          textAlign: "right",
        }}
      >
        {time}
      </div>
    </div>
  );
}

function PickupCard({ point }) {
  return (
    <div
      style={{
        border: "1px solid #bbf7d0",
        background: "#f0fdf4",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <strong style={{ color: "#166534" }}>
        {point.province} • {point.name}
      </strong>
      <div style={{ color: "#14532d", fontSize: 13, marginTop: 6 }}>
        {point.tourName}
      </div>
      <div style={{ color: "#334155", fontSize: 12, marginTop: 6 }}>
        {point.address}
      </div>
      <div style={{ color: "#166534", fontSize: 12, marginTop: 6 }}>
        Giờ đón: {formatTime(point.pickupTime)}
      </div>
      {point.note ? (
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
          {point.note}
        </div>
      ) : null}
    </div>
  );
}

export default function AssistantPage({ embed: embedProp = false }) {
  const router = useRouter();
  const embed = embedProp || router.query.embed === "1";
  const isGuide = router.query.scope === "guide";
  const chatScope = isGuide ? "guide" : "user";

  const starterMessages = isGuide
    ? GUIDE_STARTER_MESSAGES
    : CUSTOMER_STARTER_MESSAGES;

  const greeting = isGuide ? GUIDE_GREETING : CUSTOMER_GREETING;

  const conversationStorageKey = scopeStorageKey(BASE_STORAGE_KEY, isGuide);
  const messageStorageKey = scopeStorageKey(MESSAGE_STORAGE_KEY, isGuide);
  const memoryStorageKey = scopeStorageKey(MEMORY_STORAGE_KEY, isGuide);

  const { showToast } = useToast();
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: greeting,
      time: "",
      cards: [],
      vouchers: [],
      bookings: [],
      pickupPoints: [],
      bookingCheckout: null,
      suggestedReplies: starterMessages.slice(0, 3),
    },
  ]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversationList, setConversationList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [chatMemory, setChatMemory] = useState({});
  const [watchingCheckout, setWatchingCheckout] = useState(null);
  const notifiedPaymentsRef = useRef(new Set());
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setMessages((prev) => {
      if (!prev.length || prev[0].time) return prev;
      return [{ ...prev[0], time: formatMessageTime() }, ...prev.slice(1)];
    });
  }, []);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") {
      return;
    }

    const saved = window.localStorage.getItem(conversationStorageKey);
    const savedMessages = window.localStorage.getItem(messageStorageKey);
    const savedMemory = window.localStorage.getItem(memoryStorageKey);

    let restoredMessages = false;

    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);

        if (Array.isArray(parsedMessages) && parsedMessages.length) {
          setMessages(parsedMessages.map(normalizeLoadedMessage));
          restoredMessages = true;
        }
      } catch (error) {}
    }

    if (!restoredMessages) {
      setMessages([
        {
          role: "assistant",
          content: greeting,
          time: formatMessageTime(),
          cards: [],
          vouchers: [],
          bookings: [],
          pickupPoints: [],
          bookingCheckout: null,
          suggestedReplies: starterMessages.slice(0, 3),
        },
      ]);
    }

    if (savedMemory) {
      try {
        const parsedMemory = JSON.parse(savedMemory);

        if (parsedMemory && typeof parsedMemory === "object") {
          setChatMemory(parsedMemory);
        }
      } catch (error) {}
    } else {
      setChatMemory({});
    }

    refreshConversations(saved || null);

    if (saved) {
      setConversationId(saved);
      loadConversation(saved, { silent: true });
    } else {
      setConversationId(null);
    }
  }, [
    router.isReady,
    chatScope,
    conversationStorageKey,
    messageStorageKey,
    memoryStorageKey,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (conversationId)
      window.localStorage.setItem(conversationStorageKey, conversationId);
  }, [conversationId, conversationStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(messageStorageKey, JSON.stringify(messages));
  }, [messages, messageStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      memoryStorageKey,
      JSON.stringify(chatMemory || {}),
    );
  }, [chatMemory, memoryStorageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!watchingCheckout?.transactionCode) return;

    const transactionCode = watchingCheckout.transactionCode;
    const bookingCode = watchingCheckout.bookingCode;

    if (notifiedPaymentsRef.current.has(transactionCode)) return;

    const timer = setInterval(async () => {
      try {
        const status = await apiFetch(
          `/payments/status/${encodeURIComponent(transactionCode)}`,
        );

        const paymentStatus = String(
          status?.paymentStatus || status?.payment_status || "",
        ).toLowerCase();

        const bookingStatus = String(
          status?.bookingStatus || status?.booking_status || "",
        ).toLowerCase();

        const isPaid =
          paymentStatus === "paid" ||
          paymentStatus === "success" ||
          paymentStatus === "completed" ||
          bookingStatus === "confirmed";

        if (!isPaid) return;

        notifiedPaymentsRef.current.add(transactionCode);
        setWatchingCheckout(null);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: [
              `Thanh toán thành công!`,
              `Booking ${bookingCode || status?.bookingCode || ""} đã được xác nhận.`,
              `Travela đã ghi nhận thanh toán và cập nhật trạng thái đơn của bạn.`,
            ]
              .filter(Boolean)
              .join("\n"),
            time: formatMessageTime(),
            cards: [],
            vouchers: [],
            bookings: [],
            pickupPoints: [],
            bookingCheckout: null,
            suggestedReplies: [
              "Kiểm tra booking của tôi",
              "Xem điểm đón",
              "Gợi ý tour khác",
            ],
          },
        ]);
      } catch (error) {
        // Không hiện lỗi liên tục trong chat vì polling chạy nền.
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [watchingCheckout]);

  const normalizeLoadedMessage = (msg) => ({
    role: msg.role || "assistant",
    content: msg.content || "",
    time: msg.time || formatMessageTime(),
    cards: msg.cards || msg.tours || [],
    vouchers: msg.vouchers || [],
    bookings: msg.bookings || [],
    pickupPoints: msg.pickupPoints || [],
    bookingCheckout: msg.bookingCheckout || null,
    refundRequest: msg.refundRequest || null,
    suggestedReplies: Array.isArray(msg.suggestedReplies)
      ? msg.suggestedReplies
      : [],
  });

  const refreshConversations = async (preferredId = null) => {
    try {
      const list = await apiFetch(`/chatbot/conversations?scope=${chatScope}`);
      const normalized = Array.isArray(list) ? list : [];
      setConversationList(normalized);
      const idToKeep = preferredId || conversationId;
      if (
        idToKeep &&
        !normalized.some((item) => String(item.id) === String(idToKeep))
      ) {
        // Nếu backend chưa có hoặc user chưa đăng nhập, vẫn giữ conversationId local để không mất mạch chat hiện tại.
        return;
      }
    } catch (error) {
      // Khách chưa đăng nhập vẫn dùng được chat hiện tại, chỉ không tải được lịch sử server.
    }
  };

  const requestRefundFromChat = async (booking) => {
    const bookingId = booking?.id || booking?.bookingId;
    if (!bookingId) {
      showToast("Không tìm thấy mã booking để hoàn tiền.", "error");
      return;
    }

    try {
      const refund = await apiFetch("/refunds", {
        method: "POST",
        body: JSON.stringify({
          bookingId,
          reason: "Khách yêu cầu hoàn tiền từ Travela AI",
        }),
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Mình đã gửi yêu cầu hoàn tiền cho booking ${booking.bookingCode || bookingId}. Số tiền đề nghị hoàn: ${formatCurrency(refund?.refundAmount || booking.amount)}. Trạng thái hiện tại: chờ admin duyệt.`,
          time: formatMessageTime(),
          cards: [],
          vouchers: [],
          bookings: [],
          pickupPoints: [],
          bookingCheckout: null,
          refundRequest: null,
          suggestedReplies: [
            "Kiểm tra booking của tôi",
            "Chính sách hoàn tiền",
          ],
        },
      ]);
      showToast("Đã gửi yêu cầu hoàn tiền", "success");
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Booking này chưa đủ điều kiện hoàn tiền: ${error.message}`,
          time: formatMessageTime(),
          cards: [],
          vouchers: [],
          bookings: [],
          pickupPoints: [],
          bookingCheckout: null,
          refundRequest: null,
          suggestedReplies: ["Chính sách hoàn tiền", "Liên hệ hỗ trợ"],
        },
      ]);
      showToast(error.message, "error");
    }
  };

  const loadConversation = async (id, options = {}) => {
    if (!id) return;
    setLoadingHistory(true);
    try {
      const detail = await apiFetch(
        `/chatbot/conversations/${encodeURIComponent(id)}`,
      );
      const loadedMessages = Array.isArray(detail?.messages)
        ? detail.messages.map(normalizeLoadedMessage)
        : [];

      setConversationId(String(detail?.conversationId || detail?.id || id));
      setChatMemory(
        detail?.memory && typeof detail.memory === "object"
          ? detail.memory
          : {},
      );
      setMessages(
        loadedMessages.length
          ? loadedMessages
          : [
              {
                role: "assistant",
                content: greeting,
                time: formatMessageTime(),
                cards: [],
                vouchers: [],
                bookings: [],
                pickupPoints: [],
                bookingCheckout: null,
                suggestedReplies: starterMessages.slice(0, 3),
              },
            ],
      );
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          conversationStorageKey,
          String(detail?.conversationId || detail?.id || id),
        );
      }
    } catch (error) {
      if (!options.silent)
        showToast(error.message || "Không tải được hội thoại.", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  const canSend = useMemo(
    () => question.trim().length > 0 && !sending,
    [question, sending],
  );

  const sendMessage = async (text) => {
    const clean = String(text || "").trim();
    if (!clean || sending) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: clean, time: formatMessageTime() },
    ]);

    trackBehavior({
      action: "ask_ai",
      keyword: clean,
      score: 2,
      meta: {
        source: isGuide ? "guide_assistant" : "assistant",
        conversationId: conversationId || null,
      },
    });

    setQuestion("");
    setSending(true);

    try {
      const result = await apiFetch("/chatbot/message", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          message: clean,
          memory: chatMemory,
          scope: chatScope,
        }),
      });
      if (result?.conversationId) {
        const nextConversationId = String(result.conversationId);
        setConversationId(nextConversationId);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            conversationStorageKey,
            nextConversationId,
          );
        }
        refreshConversations(nextConversationId);
      }
      if (result?.memory && typeof result.memory === "object") {
        setChatMemory(result.memory);
      }

      if (
        result?.bookingCheckout?.transactionCode &&
        result?.bookingCheckout?.paymentStatus !== "paid"
      ) {
        setWatchingCheckout(result.bookingCheckout);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            result?.answer ||
            "Mình chưa xử lý được câu này. Bạn thử hỏi lại ngắn hơn nha.",
          cards: result?.cards || result?.tours || [],
          vouchers: result?.vouchers || [],
          bookings: result?.bookings || [],
          pickupPoints: result?.pickupPoints || [],
          bookingCheckout: result?.bookingCheckout || null,
          refundRequest: result?.refundRequest || null,
          suggestedReplies: Array.isArray(result?.suggestedReplies)
            ? result.suggestedReplies
            : [],
          time: formatMessageTime(),
        },
      ]);
    } catch (error) {
      showToast(error.message, "error");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Mình đang không kết nối được hệ thống. Bạn kiểm tra backend đang chạy chưa rồi thử lại nha.",
          time: formatMessageTime(),
          cards: [],
          vouchers: [],
          bookings: [],
          pickupPoints: [],
          bookingCheckout: null,
          refundRequest: null,
          suggestedReplies: [],
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) sendMessage(question);
    }
  };

  const clearConversation = () => {
    setConversationId(null);
    setChatMemory({});
    setWatchingCheckout(null);
    notifiedPaymentsRef.current = new Set();

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(conversationStorageKey);
      window.localStorage.removeItem(messageStorageKey);
      window.localStorage.removeItem(memoryStorageKey);
    }

    setMessages([
      {
        role: "assistant",
        content: greeting,
        time: formatMessageTime(),
        cards: [],
        vouchers: [],
        bookings: [],
        pickupPoints: [],
        bookingCheckout: null,
        suggestedReplies: starterMessages.slice(0, 3),
      },
    ]);
  };

  return (
    <>
      <Head>
        <title>
          {isGuide ? "Trợ lý Hướng dẫn viên | Travela" : "Travela AI Assistant"}
        </title>
        <style>{`
          html, body, #__next { height: 100%; }
          .chat-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
          .chat-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
          .quick-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(15,23,42,0.08); }
          @media (max-width: 900px) {
            .assistant-layout { grid-template-columns: 1fr !important; }
            .assistant-side { display: none !important; }
          }
        `}</style>
      </Head>

      {!embed ? (
        <section
          style={{
            padding: "30px 0",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            textAlign: "center",
          }}
        >
          <div className="container">
            <div style={{ color: "#16a34a", fontWeight: 800, marginBottom: 8 }}>
              {isGuide ? "TRAVELA GUIDE AI" : "TRAVELA AI"}
            </div>
            <h1
              style={{
                margin: "0 0 8px",
                color: "#0f172a",
                fontSize: "2.2rem",
              }}
            >
              {isGuide
                ? "Trợ lý dành cho hướng dẫn viên"
                : "Trợ lý tư vấn tour"}
            </h1>
            <p style={{ margin: "0 auto", color: "#64748b", maxWidth: 660 }}>
              {isGuide
                ? "Hỗ trợ lịch phân công, hành khách, lưu ý sức khỏe, điểm đón và lịch trình từ dữ liệu thật của Travela."
                : "Hỏi tự nhiên về tour, voucher, booking, điểm đón và chính sách. Bot dùng dữ liệu thật trong hệ thống Travela."}
            </p>
          </div>
        </section>
      ) : null}

      <section
        style={{
          background: embed ? "#fff" : "#f1f5f9",
          padding: embed ? 0 : "26px 0 60px",
          minHeight: embed ? "100dvh" : "calc(100vh - 170px)",
        }}
      >
        <div
          className={embed ? undefined : "container assistant-layout"}
          style={
            embed
              ? undefined
              : { display: "grid", gridTemplateColumns: "280px 1fr", gap: 24 }
          }
        >
          {!embed ? (
            <aside
              className="assistant-side"
              style={{ display: "grid", gap: 18, alignContent: "start" }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: 18,
                  borderRadius: 24,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <h3 style={{ margin: 0, color: "#0f172a" }}>
                    Cuộc hội thoại
                  </h3>
                  <button
                    type="button"
                    onClick={clearConversation}
                    style={{
                      border: "none",
                      background: "#dcfce7",
                      color: "#166534",
                      borderRadius: 999,
                      padding: "7px 10px",
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    + Mới
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    maxHeight: 240,
                    overflowY: "auto",
                  }}
                  className="chat-scroll"
                >
                  {conversationList.length ? (
                    conversationList.map((item) => {
                      const active =
                        String(item.id) === String(conversationId || "");
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => loadConversation(item.id)}
                          disabled={loadingHistory}
                          style={{
                            textAlign: "left",
                            border: active
                              ? "1px solid #16a34a"
                              : "1px solid #e2e8f0",
                            background: active ? "#f0fdf4" : "#f8fafc",
                            color: "#334155",
                            borderRadius: 14,
                            padding: "10px 12px",
                            cursor: loadingHistory ? "wait" : "pointer",
                          }}
                        >
                          <strong
                            style={{
                              display: "block",
                              color: active ? "#166534" : "#0f172a",
                              fontSize: 13,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.title || "Cuộc hội thoại"}
                          </strong>
                          <span
                            style={{
                              display: "block",
                              color: "#64748b",
                              fontSize: 11,
                              marginTop: 4,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.lastMessage ||
                              item.summary ||
                              "Nhấn để mở lại"}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div
                      style={{
                        color: "#64748b",
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      Chưa có lịch sử hội thoại. Khi bạn nhắn tin, cuộc trò
                      chuyện sẽ được lưu và mở lại ở đây.
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  background: "#fff",
                  padding: 22,
                  borderRadius: 24,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
                }}
              >
                <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>
                  Gợi ý nhanh
                </h3>
                <div style={{ display: "grid", gap: 10 }}>
                  {starterMessages.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="quick-btn"
                      onClick={() => sendMessage(item)}
                      style={{
                        textAlign: "left",
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                        color: "#334155",
                        borderRadius: 14,
                        padding: "12px 14px",
                        cursor: "pointer",
                        transition: "0.18s",
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: "#fff",
                  padding: 20,
                  borderRadius: 24,
                  border: "1px solid #e2e8f0",
                  color: "#64748b",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <strong
                  style={{
                    display: "block",
                    color: "#0f172a",
                    marginBottom: 8,
                  }}
                >
                  Mẹo hỏi bot
                </strong>
                Ví dụ: “Đà Lạt 3 ngày dưới 6 triệu”, “Tôi có voucher nào?”,
                “Kiểm tra đơn BK...”, “Tôi ở Cần Thơ đón ở đâu?”.
              </div>
            </aside>
          ) : null}

          <div
            style={{
              height: embed ? "100dvh" : "calc(100vh - 230px)",
              minHeight: embed ? "100dvh" : 620,
              background: "#fff",
              borderRadius: embed ? 0 : 28,
              border: embed ? "none" : "1px solid #e2e8f0",
              boxShadow: embed ? "none" : "0 24px 70px rgba(15,23,42,0.12)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <header
              style={{
                padding: embed ? "14px 16px" : "16px 20px",
                background: embed
                  ? "#f8fafc"
                  : "linear-gradient(135deg, #16a34a, #22c55e)",
                color: embed ? "#0f172a" : "#fff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: embed ? "1px solid #e2e8f0" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {!embed ? (
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    AI
                  </div>
                ) : null}

                <div>
                  <strong
                    style={{
                      display: "block",
                      fontSize: embed ? 18 : 16,
                      color: embed ? "#0f172a" : "#fff",
                    }}
                  >
                    {isGuide ? "Trợ lý Hướng dẫn viên" : "Travela AI"}
                  </strong>
                  <span
                    style={{
                      fontSize: 12,
                      color: embed ? "#64748b" : "rgba(255,255,255,0.9)",
                    }}
                  >
                    {embed
                      ? isGuide
                        ? "Lịch tour, hành khách, điểm đón và điều hành"
                        : "Hỏi nhanh tour, booking, voucher..."
                      : isGuide
                        ? "Trợ lý nghiệp vụ dành riêng cho hướng dẫn viên"
                        : "Đang trực tuyến • trả lời theo dữ liệu hệ thống"}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={clearConversation}
                  title="Tạo cuộc hội thoại mới"
                  style={{
                    border: embed ? "1px solid #cbd5e1" : "none",
                    background: embed ? "#fff" : "rgba(255,255,255,0.16)",
                    color: embed ? "#0f172a" : "#fff",
                    borderRadius: 999,
                    padding: embed ? "9px 18px" : "8px 12px",
                    cursor: "pointer",
                    fontWeight: 800,
                    boxShadow: embed
                      ? "0 4px 12px rgba(15,23,42,0.08)"
                      : "none",
                  }}
                >
                  Mới
                </button>

                {embed ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.parent?.postMessage?.(
                        { type: "TRAVELA_CHAT_CLOSE" },
                        "*",
                      );
                      window.parent?.postMessage?.("TRAVELA_CHAT_CLOSE", "*");
                    }}
                    title="Đóng chatbot"
                    style={{
                      width: 38,
                      height: 38,
                      border: "none",
                      borderRadius: 999,
                      background: "#0f172a",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 22,
                      fontWeight: 900,
                      lineHeight: "38px",
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </header>

            <div
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                padding: "10px 12px",
                borderBottom: "1px solid #e2e8f0",
              }}
              className="chat-scroll"
            >
              {starterMessages.slice(0, 4).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => sendMessage(item)}
                  style={{
                    whiteSpace: "nowrap",
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    color: "#334155",
                    borderRadius: 999,
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {item}
                </button>
              ))}
            </div>

            <main
              className="chat-scroll"
              style={{
                flex: 1,
                overflowY: "auto",
                padding: embed ? "16px 14px" : "22px 20px",
                background: "#f8fafc",
              }}
            >
              <div style={{ display: "grid", gap: 16 }}>
                {messages.map((msg, index) => {
                  const isUser = msg.role === "user";
                  return (
                    <div
                      key={`${msg.role}-${index}-${msg.time}`}
                      style={{
                        display: "flex",
                        justifyContent: isUser ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: isUser ? "78%" : "92%",
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        {isUser &&
                        String(msg.content || "")
                          .toLowerCase()
                          .startsWith("xác nhận thông tin hành khách") ? (
                          <PassengerConfirmationBubble
                            content={msg.content}
                            time={msg.time}
                          />
                        ) : (
                          <div
                            style={{
                              background: isUser
                                ? "linear-gradient(135deg, #16a34a, #22c55e)"
                                : "#fff",
                              color: isUser ? "#fff" : "#0f172a",
                              border: isUser ? "none" : "1px solid #e2e8f0",
                              borderRadius: isUser
                                ? "18px 18px 4px 18px"
                                : "18px 18px 18px 4px",
                              padding: "12px 14px",
                              boxShadow: isUser
                                ? "0 10px 25px rgba(34,197,94,0.18)"
                                : "0 8px 22px rgba(15,23,42,0.05)",
                              whiteSpace: "pre-line",
                              lineHeight: 1.55,
                            }}
                          >
                            {msg.content}
                            <div
                              style={{
                                fontSize: 11,
                                opacity: 0.65,
                                marginTop: 6,
                              }}
                            >
                              {msg.time}
                            </div>
                          </div>
                        )}

                        {!isUser && (msg.cards || []).length ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            {msg.cards.map((card, cardIndex) => (
                              <TourCard
                                key={`${index}-${card.tourId}`}
                                card={card}
                                cardIndex={cardIndex}
                                compact={embed}
                                onAskMore={sendMessage}
                              />
                            ))}
                          </div>
                        ) : null}

                        {!isUser && (msg.vouchers || []).length ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            {msg.vouchers.map((voucher) => (
                              <VoucherCard
                                key={`${index}-${voucher.code}`}
                                voucher={voucher}
                              />
                            ))}
                          </div>
                        ) : null}

                        {!isUser && (msg.bookings || []).length ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            {msg.bookings.map((booking) => (
                              <BookingCard
                                key={`${index}-${booking.bookingCode}`}
                                booking={booking}
                                onRefund={(selectedBooking) =>
                                  sendMessage(
                                    `Tôi muốn hủy booking ${
                                      selectedBooking.bookingCode ||
                                      selectedBooking.id ||
                                      selectedBooking.bookingId
                                    }`,
                                  )
                                }
                              />
                            ))}
                          </div>
                        ) : null}

                        {!isUser && (msg.pickupPoints || []).length ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            {msg.pickupPoints.map((point) => (
                              <PickupCard
                                key={`${index}-${point.id}`}
                                point={point}
                              />
                            ))}
                          </div>
                        ) : null}

                        {!isUser && msg.bookingCheckout ? (
                          <BookingCheckoutCard checkout={msg.bookingCheckout} />
                        ) : null}

                        {!isUser &&
                        shouldShowGuestQuantityPicker(
                          msg,
                          index === messages.length - 1,
                        ) ? (
                          <GuestQuantityPicker
                            disabled={sending}
                            onSubmit={(value) => sendMessage(value)}
                          />
                        ) : !isUser &&
                          shouldShowPassengerForm(
                            msg,
                            chatMemory,
                            index === messages.length - 1,
                          ) ? (
                          <PassengerDetailsForm
                            adultCount={
                              chatMemory?.bookingDraft?.adultCount || 1
                            }
                            childCount={
                              chatMemory?.bookingDraft?.childCount || 0
                            }
                            existingGuests={
                              chatMemory?.bookingDraft?.guests || []
                            }
                            disabled={sending}
                            onSubmit={(value) => sendMessage(value)}
                          />
                        ) : !isUser &&
                          shouldShowRefundBankForm(
                            msg,
                            chatMemory,
                            index === messages.length - 1,
                          ) ? (
                          <RefundBankForm
                            disabled={sending}
                            onSubmit={(value) => sendMessage(value)}
                          />
                        ) : !isUser &&
                          !shouldShowPassengerForm(
                            msg,
                            chatMemory,
                            index === messages.length - 1,
                          ) &&
                          (msg.suggestedReplies || []).length ? (
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            {msg.suggestedReplies.map((reply) => (
                              <button
                                key={`${index}-${reply}`}
                                type="button"
                                onClick={() => sendMessage(reply)}
                                disabled={sending}
                                style={{
                                  border: "1px solid #cbd5e1",
                                  background: "#fff",
                                  color: "#334155",
                                  borderRadius: 999,
                                  padding: "7px 10px",
                                  fontSize: 12,
                                  cursor: sending ? "not-allowed" : "pointer",
                                  opacity: sending ? 0.6 : 1,
                                }}
                              >
                                {reply}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {sending ? (
                  <div
                    style={{ display: "flex", justifyContent: "flex-start" }}
                  >
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "18px 18px 18px 4px",
                        padding: "12px 14px",
                        color: "#64748b",
                      }}
                    >
                      {isGuide
                        ? "Trợ lý HDV đang kiểm tra dữ liệu..."
                        : "Travela AI đang suy nghĩ..."}
                    </div>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            </main>

            <footer
              style={{
                borderTop: "1px solid #e2e8f0",
                padding: embed ? "12px 14px" : 16,
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  alignItems: "end",
                }}
              >
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder={
                    isGuide
                      ? "Hỏi về lịch tour, hành khách, điểm đón..."
                      : "Nhập câu hỏi của bạn..."
                  }
                  style={{
                    resize: "none",
                    minHeight: 44,
                    maxHeight: 110,
                    border: "1px solid #cbd5e1",
                    borderRadius: 16,
                    padding: "12px 14px",
                    outline: "none",
                    fontSize: 14,
                    lineHeight: 1.45,
                  }}
                />
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={() => sendMessage(question)}
                  style={{
                    border: "none",
                    borderRadius: 16,
                    background: canSend
                      ? "linear-gradient(135deg, #16a34a, #22c55e)"
                      : "#cbd5e1",
                    color: "#fff",
                    padding: "0 18px",
                    minHeight: 44,
                    fontWeight: 800,
                    cursor: canSend ? "pointer" : "not-allowed",
                  }}
                >
                  Gửi
                </button>
              </div>
              <p
                style={{
                  margin: "8px 0 0",
                  color: "#94a3b8",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                {isGuide
                  ? "Dữ liệu được lấy theo phân công của bạn. Hãy đối chiếu lại các thông tin quan trọng trước khi điều hành chuyến đi."
                  : "TourAI có thể mắc lỗi. Vui lòng kiểm tra thông tin quan trọng trước khi thanh toán."}
              </p>
            </footer>
          </div>
        </div>
      </section>
    </>
  );
}
