import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";

function pickTransactionCode(session) {
  return (
    session?.transactionCode ||
    session?.internalTransactionCode ||
    session?.internal_transaction_code ||
    session?.txn ||
    session?.payment?.transactionCode ||
    session?.payment?.internalTransactionCode ||
    ""
  );
}

function pickBookingCode(session) {
  return (
    session?.bookingCode ||
    session?.booking_code ||
    session?.booking?.bookingCode ||
    session?.booking?.booking_code ||
    ""
  );
}

function pickAmount(session) {
  return Number(
    session?.amount ||
      session?.finalAmount ||
      session?.final_amount ||
      session?.booking?.finalAmount ||
      session?.booking?.final_amount ||
      0,
  );
}

function pickExpiresAt(session) {
  return (
    session?.expiresAt ||
    session?.expireAt ||
    session?.holdExpiresAt ||
    session?.hold_expires_at ||
    session?.booking?.holdExpiresAt ||
    session?.booking?.hold_expires_at ||
    null
  );
}

export default function PaymentModal({
  open = true,
  paymentSession,
  onClose,
  onPaid,
  onResolve,
  bookingCode,
  amount,
  paymentMethod,
  txn,
  transactionCode,
  internalTransactionCode,
  expireAt,
  expiresAt,
  holdExpiresAt,
}) {
  const legacySession = {
    bookingCode,
    amount,
    paymentMethod,
    txn,
    transactionCode,
    internalTransactionCode,
    expireAt,
    expiresAt,
    holdExpiresAt,
  };

  const session = paymentSession || legacySession;
  const sepayInfo = session?.sepay || {};

  const [checking, setChecking] = useState(false);
  const [statusText, setStatusText] = useState(
    "Chờ SePay xác nhận giao dịch tiền vào",
  );
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const finalTransactionCode = pickTransactionCode(session);
  const finalBookingCode = pickBookingCode(session);
  const finalAmount = pickAmount(session);
  const finalExpiresAt = pickExpiresAt(session);
  const qrSrc =
    session?.qrImageUrl || session?.qrCodeUrl || sepayInfo?.qrImageUrl || "";
  const transferContent =
    sepayInfo?.transferContent ||
    session?.transferContent ||
    finalTransactionCode;

  useEffect(() => {
    if (!open || !finalExpiresAt) {
      setRemainingSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const end = new Date(finalExpiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setRemainingSeconds(diff);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [open, finalExpiresAt]);

  useEffect(() => {
    if (!open || !finalTransactionCode) return;

    let stopped = false;

    const checkStatus = async () => {
      try {
        setChecking(true);
        const res = await apiFetch(
          `/payments/status/${encodeURIComponent(finalTransactionCode)}`,
        );

        const paymentStatus =
          res?.paymentStatus || res?.payment_status || res?.status || "";

        if (paymentStatus === "paid") {
          stopped = true;
          setStatusText("Thanh toán thành công");
          if (onPaid) onPaid(res);
          else if (onResolve) onResolve("paid");
          return;
        }

        if (paymentStatus === "expired") {
          stopped = true;
          setStatusText("Phiên thanh toán đã hết hạn");
          return;
        }

        if (paymentStatus === "failed") {
          stopped = true;
          setStatusText("Thanh toán thất bại");
          return;
        }

        setStatusText("Chờ SePay xác nhận giao dịch tiền vào");
      } catch (error) {
        setStatusText("Đang chờ xác nhận thanh toán từ SePay...");
      } finally {
        setChecking(false);
      }
    };

    checkStatus();
    const interval = setInterval(() => {
      if (!stopped) checkStatus();
    }, 2500);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [open, finalTransactionCode, onPaid, onResolve]);

  const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  if (!open) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <button type="button" onClick={onClose} style={styles.closeButton}>
          ×
        </button>

        <div style={styles.leftPanel}>
          <div style={styles.methodBadge}>SePay / MBBank VietQR</div>

          <div style={styles.qrOuter}>
            {qrSrc ? (
              <img
                src={qrSrc}
                alt="QR thanh toán MBBank"
                style={styles.qrImage}
              />
            ) : (
              <div style={styles.qrPlaceholder}>Thiếu QR thanh toán</div>
            )}
          </div>

          <p style={styles.scanNote}>
            Dùng app MBBank hoặc app ngân hàng bất kỳ để quét VietQR. Chuyển
            đúng số tiền và đúng nội dung để SePay tự xác nhận.
          </p>

          <div style={styles.debugLinkBox}>
            <div style={styles.debugLabel}>Thông tin chuyển khoản</div>
            <div style={styles.debugText}>
              Ngân hàng: {sepayInfo.bankCode || "MBBank"}
              <br />
              STK: {sepayInfo.accountNo || "0788036220"}
              <br />
              Chủ TK: {sepayInfo.accountName || "HA NHU UYEN"}
              <br />
              Nội dung: <strong>{transferContent || "--"}</strong>
            </div>
          </div>
        </div>

        <div style={styles.rightPanel}>
          <div style={styles.smallBadge}>Thanh toán thật qua SePay</div>
          <h2 style={styles.title}>Chi tiết đặt tour</h2>

          <div style={styles.infoBox}>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Mã đơn</span>
              <strong style={styles.infoValue}>
                {finalBookingCode || "--"}
              </strong>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Mã thanh toán</span>
              <strong style={styles.infoValue}>
                {finalTransactionCode || "--"}
              </strong>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Giữ chỗ đến</span>
              <strong style={styles.infoValue}>
                {finalExpiresAt ? formatDateTime(finalExpiresAt) : "--"}
              </strong>
            </div>
          </div>

          <div style={styles.totalBox}>
            <span>Tổng thanh toán</span>
            <strong>{formatCurrency(finalAmount)}</strong>
          </div>

          <div style={styles.countdownBox}>
            <div style={styles.countdownLabel}>THỜI GIAN GIỮ CHỖ CÒN LẠI</div>
            <div style={styles.countdownTime}>
              {minutes}:{seconds}
            </div>
          </div>

          <div style={styles.statusBox}>
            {checking ? "Đang kiểm tra trạng thái..." : statusText}
          </div>

          <p style={styles.bottomNote}>
            Email xác nhận chỉ gửi sau khi SePay báo tiền đã vào tài khoản.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 99999,
    background: "rgba(15,23,42,.68)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modal: {
    width: "min(980px, calc(100vw - 32px))",
    maxHeight: "calc(100vh - 32px)",
    minHeight: 620,
    background: "#fff",
    borderRadius: 28,
    overflow: "auto",
    display: "grid",
    gridTemplateColumns: "1fr 1.08fr",
    position: "relative",
    boxShadow: "0 24px 80px rgba(15,23,42,.35)",
  },
  closeButton: {
    position: "absolute",
    right: 18,
    top: 18,
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: 0,
    background: "#e5e7eb",
    color: "#0f172a",
    fontSize: 28,
    cursor: "pointer",
    zIndex: 2,
  },
  leftPanel: {
    background: "linear-gradient(160deg,#0f172a,#1e293b)",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 46,
    gap: 22,
  },
  methodBadge: {
    border: "1px solid rgba(255,255,255,.25)",
    borderRadius: 999,
    padding: "10px 30px",
    fontWeight: 900,
    background: "rgba(255,255,255,.12)",
  },
  qrOuter: {
    background: "#ffffff",
    padding: 22,
    borderRadius: 18,
    border: "1px solid #ffffff",
    boxShadow: "0 18px 40px rgba(0,0,0,.18)",
  },
  qrImage: {
    width: 320,
    height: 320,
    display: "block",
    objectFit: "contain",
    borderRadius: 0,
  },
  qrPlaceholder: {
    width: 320,
    height: 320,
    display: "grid",
    placeItems: "center",
    color: "#334155",
    background: "#fff",
  },
  scanNote: {
    maxWidth: 340,
    textAlign: "center",
    color: "#cbd5e1",
    lineHeight: 1.6,
    margin: 0,
  },
  debugLinkBox: {
    maxWidth: 380,
    background: "rgba(255,255,255,.08)",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 12,
    padding: 12,
    wordBreak: "break-word",
  },
  debugLabel: { fontSize: 12, color: "#cbd5e1", marginBottom: 6 },
  debugText: { color: "#bfdbfe", fontSize: 13, lineHeight: 1.7 },
  rightPanel: {
    padding: "52px 40px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  smallBadge: {
    display: "inline-flex",
    alignSelf: "flex-start",
    background: "#f1f5f9",
    color: "#475569",
    padding: "8px 16px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 13,
  },
  title: { fontSize: 28, margin: "12px 0 18px", color: "#0f172a" },
  infoBox: { display: "grid", gap: 14 },
  infoRow: {
    background: "#f8fafc",
    borderRadius: 16,
    padding: "16px 18px",
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
  },
  infoLabel: { color: "#64748b" },
  infoValue: { color: "#0f172a", textAlign: "right" },
  totalBox: {
    marginTop: 4,
    border: "1px solid #93c5fd",
    background: "#eff6ff",
    color: "#1e3a8a",
    borderRadius: 16,
    padding: "18px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontWeight: 800,
    fontSize: 18,
  },
  countdownBox: {
    marginTop: 22,
    border: "1px solid #fdba74",
    background: "#fff7ed",
    borderRadius: 18,
    padding: 22,
    textAlign: "center",
  },
  countdownLabel: {
    color: "#ea580c",
    fontWeight: 900,
    fontSize: 13,
    marginBottom: 8,
  },
  countdownTime: {
    color: "#b45309",
    fontWeight: 900,
    fontSize: 40,
    letterSpacing: 2,
  },
  statusBox: {
    marginTop: 2,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#334155",
    borderRadius: 14,
    padding: "14px 16px",
    textAlign: "center",
    fontWeight: 800,
  },
  bottomNote: {
    textAlign: "center",
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.6,
  },
};
