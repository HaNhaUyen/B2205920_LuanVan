import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

export default function MobilePaymentPage() {
  const router = useRouter();
  const { transactionCode } = router.query;
  const [status, setStatus] = useState("checking");
  const [payment, setPayment] = useState(null);

  useEffect(() => {
    if (!transactionCode) return;

    let stopped = false;

    const check = async () => {
      try {
        const res = await apiFetch(
          `/payments/status/${encodeURIComponent(transactionCode)}`,
        );
        if (stopped) return;
        setPayment(res);
        setStatus(res.paymentStatus || "pending");
      } catch (error) {
        if (!stopped) setStatus("error");
      }
    };

    check();
    const timer = setInterval(check, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [transactionCode]);

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.title}>Thanh toán SePay / VietQR</h1>
        <p style={styles.desc}>
          Trang này chỉ dùng để xem trạng thái. Thanh toán thật được xác nhận
          bởi webhook SePay sau khi tiền vào tài khoản MBBank.
        </p>

        <div style={styles.box}>
          <div>
            Mã thanh toán: <strong>{transactionCode || "--"}</strong>
          </div>
          <div>
            Số tiền: <strong>{formatCurrency(payment?.amount || 0)}</strong>
          </div>
          <div>
            Trạng thái: <strong>{status}</strong>
          </div>
        </div>

        <Link href="/mytour" style={styles.button}>
          Về đơn tour của tôi
        </Link>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f8fafc",
    padding: 24,
  },
  card: {
    width: "min(520px, 100%)",
    background: "#fff",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 20px 60px rgba(15,23,42,.12)",
    textAlign: "center",
  },
  title: { margin: 0, color: "#0f172a" },
  desc: { color: "#64748b", lineHeight: 1.7 },
  box: {
    margin: "20px 0",
    background: "#f1f5f9",
    borderRadius: 16,
    padding: 18,
    display: "grid",
    gap: 10,
    textAlign: "left",
  },
  button: {
    display: "inline-flex",
    padding: "12px 18px",
    borderRadius: 999,
    background: "#2563eb",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 800,
  },
};
