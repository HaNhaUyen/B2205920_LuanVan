import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

function formatCurrency(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function sanitizeTransferContent(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 80);
}

export default function MobilePaymentPage() {
  const router = useRouter();
  const { transactionCode } = router.query;
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const transferContent = useMemo(
    () => sanitizeTransferContent(transactionCode || ""),
    [transactionCode],
  );

  useEffect(() => {
    if (!transactionCode) return;

    let alive = true;

    const loadStatus = async () => {
      try {
        const result = await apiFetch(
          `/payments/status/${encodeURIComponent(transactionCode)}`,
        );
        if (!alive) return;
        setStatus(result || null);
        setError("");
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Chưa đọc được trạng thái thanh toán.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadStatus();
    const timer = setInterval(loadStatus, 4000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [transactionCode]);

  const isPaid = ["paid", "success", "completed", "confirmed"].includes(
    String(status?.paymentStatus || status?.bookingStatus || "").toLowerCase(),
  );

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={isPaid ? styles.successIcon : styles.loadingIcon}>
          {isPaid ? "✓" : "QR"}
        </div>
        <h1 style={styles.title}>
          {isPaid ? "Thanh toán đã được xác nhận" : "Thanh toán SePay / VietQR"}
        </h1>
        <p style={styles.message}>
          Trang này không tự xác nhận thanh toán khi mở link. Bạn cần chuyển
          khoản bằng app ngân hàng hoặc quét mã VietQR trong chatbot. Hệ thống
          sẽ tự cập nhật khi SePay webhook ghi nhận giao dịch.
        </p>

        <div style={styles.codeBox}>
          <span>Nội dung chuyển khoản</span>
          <strong>{transferContent || "--"}</strong>
        </div>

        {status?.amount || status?.finalAmount ? (
          <div style={styles.codeBox}>
            <span>Số tiền</span>
            <strong>
              {formatCurrency(status.finalAmount || status.amount)}
            </strong>
          </div>
        ) : null}

        <div style={styles.codeBox}>
          <span>Trạng thái</span>
          <strong>
            {loading
              ? "Đang kiểm tra..."
              : status?.paymentStatus ||
                status?.bookingStatus ||
                error ||
                "pending"}
          </strong>
        </div>

        <button
          type="button"
          style={styles.button}
          onClick={() => router.replace("/assistant")}
        >
          Quay lại chatbot
        </button>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg,#eff6ff,#f8fafc)",
    padding: 20,
    fontFamily: "Arial,sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 460,
    background: "#fff",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 20px 60px rgba(15,23,42,.12)",
    textAlign: "center",
  },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: "50%",
    background: "#dcfce7",
    color: "#16a34a",
    display: "grid",
    placeItems: "center",
    fontSize: 44,
    fontWeight: 900,
    margin: "0 auto 18px",
  },
  loadingIcon: {
    width: 76,
    height: 76,
    borderRadius: "50%",
    background: "#dbeafe",
    color: "#2563eb",
    display: "grid",
    placeItems: "center",
    fontSize: 24,
    fontWeight: 900,
    margin: "0 auto 18px",
  },
  title: { margin: 0, color: "#0f172a", fontSize: 26 },
  message: { color: "#64748b", lineHeight: 1.6, margin: "14px 0 20px" },
  codeBox: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 16,
    display: "grid",
    gap: 6,
    color: "#64748b",
    marginTop: 10,
  },
  button: {
    marginTop: 22,
    border: 0,
    borderRadius: 999,
    background: "#2563eb",
    color: "#fff",
    padding: "12px 22px",
    fontWeight: 800,
    cursor: "pointer",
  },
};
