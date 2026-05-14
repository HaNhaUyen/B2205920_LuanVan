import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function MobilePaymentPage() {
  const router = useRouter();
  const { transactionCode } = router.query;
  const [status, setStatus] = useState("Đang xác nhận thanh toán...");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!transactionCode) return;

    const run = async () => {
      try {
        const result = await apiFetch(
          `/payments/confirm-scan/${encodeURIComponent(transactionCode)}`,
          {
            method: "POST",
          },
        );
        setSuccess(true);
        setStatus(
          "Thanh toán thành công. Email xác nhận đã được gửi về khách hàng.",
        );
        setTimeout(() => {
          router.replace(
            `/payment-success?tx=${encodeURIComponent(transactionCode)}&code=${encodeURIComponent(result?.bookingCode || "")}`,
          );
        }, 1600);
      } catch (error) {
        setSuccess(false);
        setStatus(
          error?.message ||
            "Thanh toán thất bại hoặc phiên thanh toán đã hết hạn.",
        );
      }
    };

    run();
  }, [transactionCode, router]);

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={success ? styles.successIcon : styles.loadingIcon}>
          {success ? "✓" : "•"}
        </div>
        <h1 style={styles.title}>
          {success ? "Thanh toán thành công" : "Thanh toán QR"}
        </h1>
        <p style={styles.message}>{status}</p>
        <div style={styles.codeBox}>
          <span>Mã giao dịch</span>
          <strong>{transactionCode || "--"}</strong>
        </div>
        <button
          type="button"
          style={styles.button}
          onClick={() => router.replace("/")}
        >
          Về trang chủ
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
    maxWidth: 430,
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
    fontSize: 56,
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
