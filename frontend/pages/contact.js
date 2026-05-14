import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/storage";
import { useToast } from "@/components/ToastContext";

const emptyForm = {
  fullName: "",
  phone: "",
  email: "",
  subject: "",
  message: "",
};

export default function ContactPage() {
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    const sessionUser = getUser();
    if (sessionUser) {
      setForm((prev) => ({
        ...prev,
        fullName: sessionUser.fullName || prev.fullName,
        phone: sessionUser.phone || prev.phone,
        email: sessionUser.email || prev.email,
      }));
    }

    apiFetch("/auth/me")
      .then((profile) => {
        setForm((prev) => ({
          ...prev,
          fullName: profile.fullName || prev.fullName,
          phone: profile.phone || prev.phone,
          email: profile.email || prev.email,
        }));
      })
      .catch(() => {
        // Khách chưa đăng nhập thì giữ form trống bình thường.
      });
  }, []);

  const onChangeField = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onContactSubmit = async (event) => {
    event.preventDefault();
    setSending(true);
    try {
      await apiFetch("/contacts", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm((prev) => ({
        ...prev,
        subject: "",
        message: "",
      }));
      showToast(
        "Cảm ơn bạn! Yêu cầu đã được ghi nhận trong hệ thống liên hệ của Travela. Admin sẽ phản hồi và hệ thống sẽ gửi email lại cho bạn sớm nhất.",
        "success",
      );
    } catch (error) {
      showToast(
        error.message || "Có lỗi xảy ra khi gửi yêu cầu. Vui lòng thử lại!",
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .contact-input {
            width: 100%;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px 16px;
            font-size: 1rem;
            color: #1f2937;
            transition: all 0.2s ease;
            outline: none;
          }
          .contact-input:focus {
            background: #ffffff;
            border-color: #72b44b;
            box-shadow: 0 0 0 4px rgba(114, 180, 75, 0.15);
          }
          .contact-input::placeholder {
            color: #94a3b8;
          }
          .info-row {
            transition: transform 0.2s ease;
          }
          .info-row:hover {
            transform: translateX(4px);
          }
          @media (max-width: 900px) {
            .contact-grid-layout {
              grid-template-columns: 1fr !important;
            }
          }
        `,
        }}
      />

      {/* Hero Banner: Nền ảnh xịn xò với Dark Overlay */}
      <section
        className="page-hero"
        style={{
          position: "relative",
          padding: "100px 0 80px",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "url('https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1920&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundAttachment: "fixed",
            zIndex: 0,
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(15,23,42,0.6) 0%, rgba(15,23,42,0.85) 100%)",
            zIndex: 1,
          }}
        ></div>

        <div className="container" style={{ position: "relative", zIndex: 2 }}>
          <div
            className="eyebrow"
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(8px)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.3)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              letterSpacing: "1px",
              textTransform: "uppercase",
              fontSize: "0.85rem",
              padding: "8px 20px",
            }}
          >
            Liên hệ & Hỗ trợ
          </div>
          <h1
            style={{
              fontSize: "clamp(2.8rem, 6vw, 4rem)",
              maxWidth: "860px",
              margin: "24px auto 16px",
              lineHeight: 1.15,
              color: "#ffffff",
              textShadow: "0 2px 10px rgba(0,0,0,0.3)",
            }}
          >
            Chúng tôi luôn ở đây để <br />
            <span style={{ color: "#42f2b8" }}>lắng nghe bạn</span>
          </h1>
          <p
            style={{
              fontSize: "1.15rem",
              color: "rgba(255,255,255,0.85)",
              maxWidth: "680px",
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            Bất kể bạn có câu hỏi về lịch trình, cần hỗ trợ thay đổi thông tin
            booking hay muốn thiết kế một tour theo ý riêng, đội ngũ chuyên viên
            của Travela luôn sẵn lòng giải đáp.
          </p>
        </div>
      </section>

      {/* Main Content Area */}
      <section
        className="section section-light"
        style={{ background: "#f8fafc", padding: "80px 0 100px" }}
      >
        <div
          className="container contact-grid-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: "40px",
            alignItems: "start",
          }}
        >
          {/* Cột trái: Form liên hệ cao cấp */}
          <article
            className="section-card"
            style={{
              padding: "48px 40px",
              background: "#fff",
              borderRadius: "28px",
              boxShadow: "0 20px 40px rgba(15,23,42,0.04)",
              border: "1px solid #f1f5f9",
            }}
          >
            <h2
              style={{
                fontSize: "2rem",
                margin: "0 0 12px",
                color: "#0f172a",
              }}
            >
              Gửi tin nhắn cho Travela
            </h2>
            <p
              style={{
                marginBottom: "32px",
                fontSize: "1.05rem",
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              Hãy để lại thông tin, chuyên viên tư vấn của chúng tôi sẽ liên hệ
              lại ngay để hỗ trợ bạn chuyến đi tuyệt vời nhất.
            </p>

            <form
              onSubmit={onContactSubmit}
              style={{ display: "grid", gap: "24px" }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <label
                    style={{
                      color: "#334155",
                      fontWeight: 600,
                      fontSize: "0.95rem",
                    }}
                  >
                    Họ và tên <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    name="fullName"
                    required
                    placeholder="VD: Nguyễn Văn A"
                    className="contact-input"
                    value={form.fullName}
                    onChange={onChangeField}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <label
                    style={{
                      color: "#334155",
                      fontWeight: 600,
                      fontSize: "0.95rem",
                    }}
                  >
                    Số điện thoại <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    name="phone"
                    required
                    placeholder="VD: 0901 234 567"
                    className="contact-input"
                    value={form.phone}
                    onChange={onChangeField}
                  />
                </div>
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <label
                  style={{
                    color: "#334155",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                  }}
                >
                  Email <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="VD: ban@example.com"
                  className="contact-input"
                  value={form.email}
                  onChange={onChangeField}
                />
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <label
                  style={{
                    color: "#334155",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                  }}
                >
                  Chủ đề quan tâm <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  name="subject"
                  required
                  placeholder="VD: Cần tư vấn tour biển cho gia đình 4 người"
                  className="contact-input"
                  value={form.subject}
                  onChange={onChangeField}
                />
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <label
                  style={{
                    color: "#334155",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                  }}
                >
                  Nội dung chi tiết <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <textarea
                  name="message"
                  required
                  placeholder="Chia sẻ thêm về mong muốn của bạn (địa điểm, thời gian dự kiến khởi hành, ngân sách...)"
                  className="contact-input"
                  style={{ minHeight: "160px", resize: "vertical" }}
                  value={form.message}
                  onChange={onChangeField}
                />
              </div>

              <div style={{ marginTop: "16px" }}>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={sending}
                  style={{
                    padding: "16px 32px",
                    fontSize: "1.1rem",
                    width: "100%",
                    borderRadius: "14px",
                    background: sending
                      ? "#94a3b8"
                      : "linear-gradient(135deg, #72b44b, #5a9d34)",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    boxShadow: sending
                      ? "none"
                      : "0 8px 20px rgba(114, 180, 75, 0.3)",
                    cursor: sending ? "not-allowed" : "pointer",
                    transition: "all 0.3s ease",
                  }}
                >
                  {sending ? "Đang gửi yêu cầu..." : "Gửi yêu cầu tư vấn"}
                </button>
              </div>
            </form>
          </article>

          {/* Cột phải: Thông tin liên hệ & Quy trình */}
          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "32px",
              position: "sticky",
              top: "100px",
            }}
          >
            {/* Card 1: Thông tin trực tiếp */}
            <div
              style={{
                padding: "36px 32px",
                background: "linear-gradient(135deg, #0f172a, #1e293b)",
                borderRadius: "28px",
                color: "#fff",
                boxShadow: "0 20px 40px rgba(15,23,42,0.15)",
              }}
            >
              <h3 style={{ fontSize: "1.5rem", marginBottom: "24px" }}>
                Kết nối trực tiếp với Travela
              </h3>

              <div style={{ display: "grid", gap: "24px" }}>
                <div
                  className="info-row"
                  style={{ display: "flex", gap: "16px" }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      flexShrink: 0,
                      borderRadius: "14px",
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(66, 242, 184, 0.12)",
                      fontSize: "1.3rem",
                    }}
                  >
                    📞
                  </div>
                  <div>
                    <strong style={{ display: "block", marginBottom: "4px" }}>
                      Hotline 24/7
                    </strong>
                    <span style={{ color: "rgba(255,255,255,0.78)" }}>
                      1900 1234 - 0909 888 666
                    </span>
                  </div>
                </div>

                <div
                  className="info-row"
                  style={{ display: "flex", gap: "16px" }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      flexShrink: 0,
                      borderRadius: "14px",
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(66, 242, 184, 0.12)",
                      fontSize: "1.3rem",
                    }}
                  >
                    ✉️
                  </div>
                  <div>
                    <strong style={{ display: "block", marginBottom: "4px" }}>
                      Email hỗ trợ
                    </strong>
                    <span style={{ color: "rgba(255,255,255,0.78)" }}>
                      travela.system@gmail.com
                    </span>
                  </div>
                </div>

                <div
                  className="info-row"
                  style={{ display: "flex", gap: "16px" }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      flexShrink: 0,
                      borderRadius: "14px",
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(66, 242, 184, 0.12)",
                      fontSize: "1.3rem",
                    }}
                  >
                    🕒
                  </div>
                  <div>
                    <strong style={{ display: "block", marginBottom: "4px" }}>
                      Giờ làm việc
                    </strong>
                    <span style={{ color: "rgba(255,255,255,0.78)" }}>
                      08:00 - 21:30 mỗi ngày
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Quy trình phản hồi */}
            <div
              style={{
                padding: "36px 32px",
                background: "#fff",
                borderRadius: "28px",
                boxShadow: "0 20px 40px rgba(15,23,42,0.04)",
                border: "1px solid #f1f5f9",
              }}
            >
              <h3 style={{ fontSize: "1.35rem", marginBottom: "24px" }}>
                Quy trình hỗ trợ của Travela
              </h3>
              <div style={{ display: "grid", gap: "22px" }}>
                {[
                  {
                    step: "1",
                    title: "Tiếp nhận yêu cầu",
                    desc: "Hệ thống ghi nhận thông tin và chuyển về bộ phận phù hợp.",
                  },
                  {
                    step: "2",
                    title: "Tư vấn & đề xuất",
                    desc: "Chuyên viên liên hệ lại để làm rõ nhu cầu, ngân sách và thời gian.",
                  },
                  {
                    step: "3",
                    title: "Chốt phương án",
                    desc: "Travela gửi giải pháp tour, báo giá hoặc hướng dẫn xử lý booking nhanh chóng.",
                  },
                ].map((item) => (
                  <div key={item.step} style={{ display: "flex", gap: "16px" }}>
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        background: "linear-gradient(135deg, #72b44b, #42f2b8)",
                        color: "#fff",
                        fontWeight: 700,
                        flexShrink: 0,
                        boxShadow: "0 8px 20px rgba(114,180,75,0.24)",
                      }}
                    >
                      {item.step}
                    </div>
                    <div>
                      <strong style={{ display: "block", marginBottom: "4px" }}>
                        {item.title}
                      </strong>
                      <span style={{ color: "#64748b", lineHeight: 1.6 }}>
                        {item.desc}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
