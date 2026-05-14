import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ToastContext";

export default function MockPaymentPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { tx, method, bookingCode } = router.query;
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [countdown, setCountdown] = useState(5);

  const label = useMemo(() => {
    const map = { momo: "MoMo", vnpay: "VNPay", card: "Thẻ ngân hàng", bank_transfer: "Chuyển khoản", cash: "Tiền mặt" };
    return map[method] || method || "Thanh toán";
  }, [method]);

  useEffect(() => {
    if (!done) return undefined;
    const timer = setInterval(() => setCountdown((value) => Math.max(value - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [done]);

  useEffect(() => {
    if (!done || countdown > 0) return;
    router.push("/mytour");
  }, [countdown, done, router]);

  const confirmPayment = async () => {
    if (!tx) return showToast("Thiếu mã giao dịch.", "error");
    setLoading(true);
    try {
      const result = await apiFetch("/payments/callback", {
        method: "POST",
        body: JSON.stringify({
          internalTransactionCode: tx,
          gatewayTransactionId: `${String(method || "PAY").toUpperCase()}-${Date.now()}`,
          paymentStatus: "paid",
        }),
      });
      setDone(true);
      showToast(result?.email?.sent ? "Thanh toán thành công và đã gửi mail xác nhận." : "Thanh toán thành công.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const failPayment = async () => {
    if (!tx) return showToast("Thiếu mã giao dịch.", "error");
    setLoading(true);
    try {
      await apiFetch("/payments/callback", {
        method: "POST",
        body: JSON.stringify({ internalTransactionCode: tx, paymentStatus: "failed" }),
      });
      showToast("Đã hủy phiên thanh toán.", "warning");
      router.push("/tours");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="section mock-pay-page">
      <div className="container" style={{ maxWidth: 760 }}>
        <article className="section-card" style={{ textAlign: "center", padding: 36 }}>
          <div className="mock-pay-icon">✓</div>
          <small className="eyebrow eyebrow-small">Cổng thanh toán mô phỏng</small>
          <h1>Thanh toán {label}</h1>
          <p className="muted">
            Trang này dùng để demo luồng “lấy điện thoại quét QR → thanh toán thành công → web cập nhật booking → gửi mail xác nhận”.
          </p>
          <div className="mock-pay-box">
            <div><span>Mã đơn</span><strong>{bookingCode || "Tự động nhận từ phiên QR"}</strong></div>
            <div><span>Mã giao dịch</span><strong>{tx || "Không có"}</strong></div>
            <div><span>Phương thức</span><strong>{label}</strong></div>
          </div>
          {done ? (
            <div className="success-banner">
              Thanh toán thành công. Hệ thống sẽ chuyển về Tour của tôi sau {countdown}s.
            </div>
          ) : (
            <div className="form-actions" style={{ justifyContent: "center" }}>
              <button className="btn btn-primary" disabled={loading || !tx} onClick={confirmPayment}>
                {loading ? "Đang xác nhận..." : "Xác nhận đã thanh toán"}
              </button>
              <button className="btn btn-light" disabled={loading || !tx} onClick={failPayment}>
                Hủy thanh toán
              </button>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
