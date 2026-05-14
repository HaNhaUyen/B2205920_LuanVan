import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/router";
import { apiFetch } from "@/lib/api";
import { GOOGLE_CLIENT_ID } from "@/lib/config";
import { saveSession } from "@/lib/storage";
import { useToast } from "@/components/ToastContext";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [mode, setMode] = useState("login");
  const [googleReady, setGoogleReady] = useState(false);
  const [sending, setSending] = useState(false);

  // Đồng bộ mode với URL query
  useEffect(() => {
    if (router.query.mode === "register") setMode("register");
  }, [router.query.mode]);

  // Khởi tạo Google Sign-in
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !googleReady ||
      !window.google ||
      !GOOGLE_CLIENT_ID ||
      GOOGLE_CLIENT_ID.startsWith("YOUR_")
    )
      return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const payload = await apiFetch("/auth/google", {
            method: "POST",
            body: JSON.stringify({ credential: response.credential }),
          });
          saveSession(payload);
          showToast("Đăng nhập Google thành công", "success");
          setTimeout(() => {
            window.location.href =
              payload.user.role === "admin" ? "/admin" : "/";
          }, 350);
        } catch (error) {
          showToast(error.message, "error");
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    const box = document.getElementById("google-login-box");
    if (box) {
      box.innerHTML = "";
      window.google.accounts.id.renderButton(box, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        locale: "vi",
        shape: "pill",
        width: "100%", // Responsive width
      });
    }
  }, [googleReady, showToast]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setSending(true);
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    try {
      const session = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      saveSession(session);
      showToast("Đăng nhập thành công", "success");
      setTimeout(
        () => router.push(session.user.role === "admin" ? "/admin" : "/"),
        350,
      );
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSending(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setSending(true);
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    payload.fullName = String(payload.fullName || "").trim();
    payload.email = String(payload.email || "")
      .trim()
      .toLowerCase();
    payload.phone = String(payload.phone || "").trim();
    payload.password = String(payload.password || "");

    if (!payload.fullName) {
      showToast("Bạn hãy nhập họ và tên.", "error");
      setSending(false);
      return;
    }
    if (payload.password.length < 6) {
      showToast("Mật khẩu cần tối thiểu 6 ký tự.", "error");
      setSending(false);
      return;
    }
    if (!payload.phone) delete payload.phone;

    try {
      const session = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      saveSession(session);
      showToast("Tạo tài khoản thành công", "success");
      setTimeout(() => router.push("/"), 350);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setGoogleReady(true)}
      />

      <style
        dangerouslySetInnerHTML={{
          __html: `
          .auth-layout {
            display: flex;
            min-height: 100vh;
            background: #ffffff;
          }
          .auth-banner {
            flex: 1;
            position: relative;
            background: url('https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80') center/cover no-repeat;
            display: none;
          }
          .auth-banner::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, rgba(15,23,42,0.2) 0%, rgba(15,23,42,0.8) 100%);
          }
          .auth-form-wrapper {
            width: 100%;
            max-width: 580px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 40px;
          }
          @media (min-width: 900px) {
            .auth-banner { display: block; }
          }
          .auth-input {
            width: 100%;
            padding: 14px 16px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            font-size: 1rem;
            color: #1e293b;
            transition: all 0.2s ease;
            outline: none;
          }
          .auth-input:focus {
            background: #fff;
            border-color: #72b44b;
            box-shadow: 0 0 0 4px rgba(114, 180, 75, 0.15);
          }
          .auth-input::placeholder { color: #94a3b8; }
          .auth-label {
            display: block;
            font-size: 0.85rem;
            font-weight: 700;
            color: #475569;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          /* Toggle Switch Style */
          .auth-switch-container {
            display: flex;
            background: #f1f5f9;
            padding: 6px;
            border-radius: 14px;
            margin-bottom: 32px;
            position: relative;
          }
          .auth-switch-btn {
            flex: 1;
            padding: 12px;
            border: none;
            background: transparent;
            font-weight: 600;
            font-size: 1rem;
            color: #64748b;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            z-index: 2;
          }
          .auth-switch-btn.active {
            color: #0f172a;
          }
          .auth-switch-slider {
            position: absolute;
            top: 6px;
            bottom: 6px;
            width: calc(50% - 6px);
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1;
          }
        `,
        }}
      />

      <main className="auth-layout">
        {/* Cột trái: Banner ảnh (Ẩn trên Mobile) */}
        <div className="auth-banner">
          <div
            style={{
              position: "relative",
              zIndex: 2,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "60px",
            }}
          >
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                textDecoration: "none",
                color: "#fff",
              }}
            >
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #ff9f1a, #ffb547)",
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
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                </svg>
              </div>
              <strong style={{ fontSize: "1.5rem", letterSpacing: "-0.5px" }}>
                Travela
              </strong>
            </Link>

            <div>
              <h2
                style={{
                  color: "#fff",
                  fontSize: "2.8rem",
                  lineHeight: 1.2,
                  margin: "0 0 16px",
                  textShadow: "0 2px 4px rgba(0,0,0,0.3)",
                }}
              >
                Mở ra thế giới
                <br />
                với những hành trình mới.
              </h2>
              <p
                style={{
                  color: "rgba(255,255,255,0.85)",
                  fontSize: "1.1rem",
                  maxWidth: "480px",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                Tham gia cùng hàng ngàn tín đồ du lịch khác, lên kế hoạch cho
                chuyến đi của bạn một cách thông minh và dễ dàng nhất.
              </p>
            </div>
          </div>
        </div>

        {/* Cột phải: Khu vực Form */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            width: "100%",
            flex: 1,
            position: "relative",
          }}
        >
          {/* Nút quay lại trang chủ (chỉ dành cho Mobile, vì PC có logo bên banner) */}
          <Link
            href="/"
            style={{
              position: "absolute",
              top: "24px",
              left: "24px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              textDecoration: "none",
              color: "#64748b",
              fontWeight: 600,
              fontSize: "0.95rem",
            }}
            className="mobile-back-btn"
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Trang chủ
          </Link>

          <div className="auth-form-wrapper">
            <div style={{ marginBottom: "32px" }}>
              <h1
                style={{
                  fontSize: "2rem",
                  color: "#0f172a",
                  margin: "0 0 8px",
                }}
              >
                {mode === "login" ? "Chào mừng trở lại!" : "Tạo tài khoản mới"}
              </h1>
              <p style={{ color: "#64748b", fontSize: "1.05rem", margin: 0 }}>
                {mode === "login"
                  ? "Vui lòng đăng nhập để quản lý hành trình."
                  : "Chỉ mất vài giây để bắt đầu chuyến đi của bạn."}
              </p>
            </div>

            {/* Toggle Switch */}
            <div className="auth-switch-container">
              <div
                className="auth-switch-slider"
                style={{
                  transform:
                    mode === "login" ? "translateX(0)" : "translateX(100%)",
                }}
              />
              <button
                type="button"
                className={`auth-switch-btn ${mode === "login" ? "active" : ""}`}
                onClick={() => setMode("login")}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                className={`auth-switch-btn ${mode === "register" ? "active" : ""}`}
                onClick={() => setMode("register")}
              >
                Đăng ký
              </button>
            </div>

            {/* Forms */}
            {mode === "login" ? (
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: "20px" }}>
                  <label className="auth-label">Địa chỉ Email</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="VD: ban@example.com"
                    required
                    className="auth-input"
                  />
                </div>
                <div style={{ marginBottom: "32px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <label className="auth-label" style={{ margin: 0 }}>
                      Mật khẩu
                    </label>
                    <Link
                      href="#"
                      style={{
                        fontSize: "0.85rem",
                        color: "#72b44b",
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      Quên mật khẩu?
                    </Link>
                  </div>
                  <input
                    name="password"
                    type="password"
                    placeholder="Nhập mật khẩu của bạn"
                    required
                    className="auth-input"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    width: "100%",
                    padding: "16px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                    color: "#fff",
                    border: "none",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    cursor: sending ? "not-allowed" : "pointer",
                    boxShadow: "0 8px 20px rgba(114, 180, 75, 0.3)",
                    transition: "transform 0.2s",
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  {sending ? "Đang xử lý..." : "Đăng nhập"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div style={{ marginBottom: "20px" }}>
                  <label className="auth-label">Họ và tên</label>
                  <input
                    name="fullName"
                    placeholder="VD: Nguyễn Văn A"
                    required
                    className="auth-input"
                  />
                </div>
                <div style={{ marginBottom: "20px" }}>
                  <label className="auth-label">Địa chỉ Email</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="VD: ban@example.com"
                    required
                    className="auth-input"
                  />
                </div>
                <div style={{ marginBottom: "20px" }}>
                  <label className="auth-label">Số điện thoại (Tùy chọn)</label>
                  <input
                    name="phone"
                    placeholder="VD: 0901 234 567"
                    className="auth-input"
                  />
                </div>
                <div style={{ marginBottom: "32px" }}>
                  <label className="auth-label">Mật khẩu</label>
                  <input
                    name="password"
                    type="password"
                    placeholder="Tối thiểu 6 ký tự"
                    required
                    className="auth-input"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    width: "100%",
                    padding: "16px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                    color: "#fff",
                    border: "none",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    cursor: sending ? "not-allowed" : "pointer",
                    boxShadow: "0 8px 20px rgba(114, 180, 75, 0.3)",
                    transition: "transform 0.2s",
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  {sending ? "Đang xử lý..." : "Tạo tài khoản"}
                </button>
              </form>
            )}

            {/* Form Divider */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                margin: "32px 0",
                color: "#94a3b8",
                fontSize: "0.9rem",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                fontWeight: 600,
              }}
            >
              <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
              <span style={{ padding: "0 16px" }}>Hoặc tiếp tục với</span>
              <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
            </div>

            {/* Google Sign-in Box */}
            <div
              id="google-login-box"
              style={{
                display: "flex",
                justifyContent: "center",
                minHeight: "44px", // Tránh layout shift khi iframe Google chưa tải xong
              }}
            />
          </div>
        </div>
      </main>
    </>
  );
}
