import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { useToast } from "@/components/ToastContext";
import { trackBehavior } from "@/lib/behavior";

const STORAGE_KEY = "tourai_conversation_id";

const starterMessages = [
  "Gợi ý tour phù hợp với tôi",
  "Tôi có voucher nào không?",
  "Kiểm tra booking của tôi",
  "Tôi ở Cần Thơ thì đón ở đâu?",
  "Tôi muốn đi Phú Quốc 3 ngày dưới 7 triệu",
];

const greeting =
  "Xin chào! Mình là Travela AI. Mình có thể gợi ý tour theo nhu cầu, kiểm tra voucher, booking, điểm đón và chính sách. Bạn muốn mình hỗ trợ gì trước?";

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

function formatMessageTime() {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function assetUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const base = String(API_URL || "").replace(/\/$/, "");
  const path = String(value).startsWith("/") ? value : `/${value}`;
  return `${base}${path}`;
}

function appPath(value) {
  if (!value) return "/mytour";
  if (/^https?:\/\//i.test(value)) return value;
  return String(value).startsWith("/") ? value : `/${value}`;
}

function TourCard({ card, onAskMore, compact }) {
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
          {card.imageUrl ? (
            <img
              src={assetUrl(card.imageUrl)}
              alt={card.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : null}
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
              Khởi hành: {formatDate(card.departureDate)}
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
                onClick={() =>
                  onAskMore(
                    `Đặt tour này cho tôi ${card.departureId ? `lịch id ${card.departureId}` : ""}`,
                  )
                }
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

function BookingCard({ booking }) {
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
          Phương thức: {checkout.paymentMethod || "momo"} • Trạng thái:{" "}
          {checkout.paymentStatus || "pending"}
        </span>
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
          alt="Mã QR thanh toán"
          style={{
            width: 220,
            height: 220,
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
          Mã giao dịch:{" "}
          <strong>{checkout.transactionCode || "Đang cập nhật"}</strong>
        </span>

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
        Vui lòng dùng điện thoại quét mã QR để thanh toán. Sau khi thanh toán
        thành công, chatbot sẽ tự thông báo và cập nhật trạng thái booking cho
        bạn.
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
      suggestedReplies: [],
    },
  ]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState(null);
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
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setConversationId(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (conversationId)
      window.localStorage.setItem(STORAGE_KEY, conversationId);
  }, [conversationId]);

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
        source: "assistant",
        conversationId: conversationId || null,
      },
    });

    setQuestion("");
    setSending(true);

    try {
      const result = await apiFetch("/chatbot/message", {
        method: "POST",
        body: JSON.stringify({ conversationId, message: clean }),
      });
      if (result?.conversationId) {
        setConversationId(String(result.conversationId));
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
    setWatchingCheckout(null);
    notifiedPaymentsRef.current = new Set();

    if (typeof window !== "undefined")
      window.localStorage.removeItem(STORAGE_KEY);

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
        suggestedReplies: [],
      },
    ]);
  };

  return (
    <>
      <Head>
        <title>Travela AI Assistant</title>
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
              TRAVELA AI
            </div>
            <h1
              style={{
                margin: "0 0 8px",
                color: "#0f172a",
                fontSize: "2.2rem",
              }}
            >
              Trợ lý tư vấn tour
            </h1>
            <p style={{ margin: "0 auto", color: "#64748b", maxWidth: 660 }}>
              Hỏi tự nhiên về tour, voucher, booking, điểm đón và chính sách.
              Bot dùng dữ liệu thật trong hệ thống Travela.
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
            {!embed ? (
              <header
                style={{
                  padding: embed ? "12px 14px" : "16px 20px",
                  background: "linear-gradient(135deg, #16a34a, #22c55e)",
                  color: "#fff",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                  <div>
                    <strong style={{ display: "block" }}>Travela AI</strong>
                    <span style={{ fontSize: 12, opacity: 0.9 }}>
                      Đang trực tuyến • trả lời theo dữ liệu hệ thống
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearConversation}
                  style={{
                    border: "none",
                    background: "rgba(255,255,255,0.16)",
                    color: "#fff",
                    borderRadius: 999,
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Chat mới
                </button>
              </header>
            ) : null}

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

                        {!isUser && (msg.cards || []).length ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            {msg.cards.map((card) => (
                              <TourCard
                                key={`${index}-${card.tourId}`}
                                card={card}
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

                        {!isUser && (msg.suggestedReplies || []).length ? (
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
                      Travela AI đang suy nghĩ...
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
                  placeholder="Nhập câu hỏi của bạn..."
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
                TourAI có thể mắc lỗi. Vui lòng kiểm tra thông tin quan trọng
                trước khi thanh toán.
              </p>
            </footer>
          </div>
        </div>
      </section>
    </>
  );
}
