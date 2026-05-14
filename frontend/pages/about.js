import Link from "next/link";

// Nội dung đã được viết lại 100% hướng tới trải nghiệm khách hàng (B2C)
const values = [
  {
    title: "Trải nghiệm tối ưu",
    desc: "Giao diện thân thiện, thông tin minh bạch, giúp bạn dễ dàng tìm kiếm và lựa chọn tour du lịch hoàn hảo cho riêng mình.",
    icon: (
      <svg
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
    ),
  },
  {
    title: "Tìm kiếm thông minh (AI)",
    desc: "Kết hợp linh hoạt tìm kiếm bằng chữ, phân tích hình ảnh và nhận diện giọng nói để chốt tour nhanh chóng, trúng ý.",
    icon: (
      <svg
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
      </svg>
    ),
  },
  {
    title: "Quản lý hành trình",
    desc: "Lưu trữ lịch sử đặt chỗ, vé điện tử và theo dõi trạng thái thanh toán an toàn ngay trên một tài khoản duy nhất.",
    icon: (
      <svg
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <path d="M3 9h18"></path>
        <path d="M9 21V9"></path>
      </svg>
    ),
  },
  {
    title: "Đồng hành xuyên suốt",
    desc: "Đội ngũ chăm sóc khách hàng Travela luôn sẵn sàng hỗ trợ, giải đáp thắc mắc của bạn 24/7 trước, trong và sau chuyến đi.",
    icon: (
      <svg
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
    ),
  },
];

const flows = [
  "Khám phá các điểm đến hấp dẫn và các tour du lịch đa dạng qua danh mục được phân loại rõ ràng.",
  "Sử dụng bộ lọc chi tiết hoặc trợ lý AI (giọng nói, hình ảnh) để chốt ngay tour đúng sở thích và ngân sách.",
  "Tiến hành đặt chỗ, thanh toán an toàn và nhận ngay vé điện tử cùng lịch trình chi tiết qua email.",
  "Xách ba lô lên và tận hưởng kỳ nghỉ tuyệt vời với sự hỗ trợ tận tâm từ đội ngũ Travela.",
];

export default function AboutPage() {
  return (
    <>
      {/* Khối Style nội bộ cho các hiệu ứng xịn xò */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .value-card {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid #f1f5f9;
          }
          .value-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 20px 40px -12px rgba(0,0,0,0.12) !important;
            border-color: #dcfce7;
          }
          .timeline-step {
            position: relative;
            padding-bottom: 40px;
          }
          .timeline-step:last-child {
            padding-bottom: 0;
          }
          /* Đường kẻ dọc nối các bước timeline */
          .timeline-step:not(:last-child)::after {
            content: '';
            position: absolute;
            left: 21px; /* Căn giữa theo vòng tròn 42px */
            top: 48px;
            bottom: 0;
            width: 2px;
            background: #e2e8f0;
            z-index: 0;
          }
          .eco-row {
            transition: background 0.2s ease;
          }
          .eco-row:hover {
            background: #f8fafc;
            border-radius: 12px;
          }
          .hero-about-bg {
            background-image: url('https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1920&q=80');
            background-size: cover;
            background-position: center;
            background-attachment: fixed;
          }
        `,
        }}
      />

      {/* Hero Banner: Đổi thành nền ảnh có overlay tối sang trọng */}
      <section
        className="page-hero hero-about-bg"
        style={{
          position: "relative",
          padding: "120px 0 100px",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        {/* Lớp phủ Gradient Tối */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(15,23,42,0.7) 0%, rgba(15,23,42,0.85) 100%)",
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
            Về Travela
          </div>
          <h1
            style={{
              fontSize: "clamp(2.8rem, 6vw, 4rem)",
              maxWidth: "900px",
              margin: "24px auto",
              lineHeight: 1.15,
              color: "#ffffff",
              textShadow: "0 2px 10px rgba(0,0,0,0.3)",
            }}
          >
            Nền tảng du lịch thông minh, <br />
            <span style={{ color: "#42f2b8" }}>
              thiết kế riêng cho niềm đam mê xê dịch
            </span>
          </h1>
          <p
            style={{
              fontSize: "1.15rem",
              color: "rgba(255,255,255,0.85)",
              maxWidth: "680px",
              margin: "0 auto 40px",
              lineHeight: 1.6,
            }}
          >
            Travela đồng hành cùng bạn từ lúc ươm mầm ý tưởng cho đến khi đặt
            chân đến vùng đất mới. Khám phá ngay cách chúng tôi giúp chuyến đi
            của bạn trở nên hoàn hảo.
          </p>
          <div
            style={{
              display: "flex",
              gap: "16px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              className="btn btn-primary"
              href="/tours"
              style={{
                padding: "16px 32px",
                fontSize: "1.05rem",
                background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                border: "none",
                color: "#fff",
                boxShadow: "0 8px 20px rgba(114,180,75,0.4)",
              }}
            >
              Khám phá tour ngay
            </Link>
            <Link
              className="btn btn-light"
              href="/contact"
              style={{
                padding: "16px 32px",
                fontSize: "1.05rem",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.3)",
              }}
            >
              Cần hỗ trợ tư vấn?
            </Link>
          </div>
        </div>
      </section>

      {/* Điểm mạnh nền tảng (Dạng Card 3D) */}
      <section
        className="section section-light"
        style={{
          background: "#f8fafc",
          paddingTop: "80px",
          paddingBottom: "80px",
        }}
      >
        <div className="container">
          <div
            className="section-title"
            style={{ textAlign: "center", marginBottom: "50px" }}
          >
            <div
              style={{
                color: "#72b44b",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: "8px",
                fontSize: "0.9rem",
              }}
            >
              Lợi thế của chúng tôi
            </div>
            <h2
              style={{
                fontSize: "2.5rem",
                color: "#0f172a",
                margin: "0 0 16px",
              }}
            >
              Tại sao chọn Travela?
            </h2>
            <p
              style={{
                maxWidth: "600px",
                margin: "0 auto",
                color: "#64748b",
                fontSize: "1.1rem",
              }}
            >
              Chúng tôi ứng dụng công nghệ hiện đại nhất để tối ưu hóa thời gian
              chuẩn bị, mang lại sự an tâm tuyệt đối cho kỳ nghỉ của bạn.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "24px",
            }}
          >
            {values.map((item) => (
              <article
                key={item.title}
                className="section-card value-card"
                style={{
                  padding: "36px 28px",
                  background: "#fff",
                  borderRadius: "24px",
                  cursor: "default",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "20px",
                    background: "linear-gradient(135deg, #eafff0, #dcfce7)",
                    color: "#22c55e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "24px",
                    boxShadow: "0 8px 16px rgba(34,197,94,0.15)",
                  }}
                >
                  {item.icon}
                </div>
                <h3
                  style={{
                    fontSize: "1.3rem",
                    marginBottom: "12px",
                    color: "#1e293b",
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    color: "#64748b",
                    lineHeight: 1.6,
                    fontSize: "0.95rem",
                  }}
                >
                  {item.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Luồng sử dụng & Cấu trúc trang */}
      <section
        className="section section-light"
        style={{ background: "#fff", padding: "80px 0 100px" }}
      >
        <div
          className="container detail-grid"
          style={{ alignItems: "stretch", gap: "40px" }}
        >
          {/* Cột trái: Luồng sử dụng (Timeline Design) */}
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
            <div
              className="section-title compact-title"
              style={{ marginBottom: "40px" }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "2rem",
                    margin: "0 0 12px",
                    color: "#0f172a",
                  }}
                >
                  Hành trình vi vu cùng Travela
                </h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: "1.05rem" }}>
                  Chỉ với 4 thao tác đơn giản, chuyến đi mơ ước đã sẵn sàng.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {flows.map((item, index) => (
                <div
                  key={index}
                  className="timeline-step"
                  style={{
                    display: "flex",
                    gap: "24px",
                    alignItems: "flex-start",
                  }}
                >
                  {/* Cục số thứ tự */}
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      flexShrink: 0,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      fontSize: "1.1rem",
                      boxShadow: "0 4px 12px rgba(114, 180, 75, 0.3)",
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {index + 1}
                  </div>
                  {/* Nội dung text */}
                  <div style={{ paddingBottom: "8px", paddingTop: "8px" }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        color: "#334155",
                        lineHeight: 1.6,
                      }}
                    >
                      {item}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Cột phải: Sidebar giải thích trang */}
          <aside
            className="detail-sidebar"
            style={{
              alignSelf: "start",
              position: "sticky",
              top: "100px",
            }}
          >
            <div
              className="booking-preview-card"
              style={{
                padding: "36px 32px",
                background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
                borderRadius: "28px",
                border: "1px solid #e2e8f0",
              }}
            >
              <h3
                style={{
                  fontSize: "1.4rem",
                  margin: "0 0 24px",
                  color: "#0f172a",
                }}
              >
                Khám phá hệ sinh thái
              </h3>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div
                  className="eco-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "12px",
                    marginLeft: "-12px",
                    marginRight: "-12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "#e0e7ff",
                      color: "#4f46e5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                  </div>
                  <div>
                    <span
                      style={{
                        display: "block",
                        color: "#64748b",
                        fontSize: "0.85rem",
                        marginBottom: "2px",
                      }}
                    >
                      Trang chủ
                    </span>
                    <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>
                      Xu hướng & Điểm đến hot
                    </strong>
                  </div>
                </div>

                <div
                  className="eco-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "12px",
                    marginLeft: "-12px",
                    marginRight: "-12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "#ffedd5",
                      color: "#ea580c",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M12 16v-4"></path>
                      <path d="M12 8h.01"></path>
                    </svg>
                  </div>
                  <div>
                    <span
                      style={{
                        display: "block",
                        color: "#64748b",
                        fontSize: "0.85rem",
                        marginBottom: "2px",
                      }}
                    >
                      Giới thiệu
                    </span>
                    <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>
                      Sứ mệnh & Giá trị cốt lõi
                    </strong>
                  </div>
                </div>

                <div
                  className="eco-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "12px",
                    marginLeft: "-12px",
                    marginRight: "-12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "#dcfce7",
                      color: "#16a34a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                  </div>
                  <div>
                    <span
                      style={{
                        display: "block",
                        color: "#64748b",
                        fontSize: "0.85rem",
                        marginBottom: "2px",
                      }}
                    >
                      Điểm đến
                    </span>
                    <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>
                      Cẩm nang vùng miền
                    </strong>
                  </div>
                </div>

                <div
                  className="eco-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "12px",
                    marginLeft: "-12px",
                    marginRight: "-12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "#fce7f3",
                      color: "#e11d48",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                  </div>
                  <div>
                    <span
                      style={{
                        display: "block",
                        color: "#64748b",
                        fontSize: "0.85rem",
                        marginBottom: "2px",
                      }}
                    >
                      Tour
                    </span>
                    <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>
                      Tìm kiếm thông minh & Đặt chỗ
                    </strong>
                  </div>
                </div>

                <div
                  className="eco-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "12px",
                    marginLeft: "-12px",
                    marginRight: "-12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "#f3f4f6",
                      color: "#475569",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                  </div>
                  <div>
                    <span
                      style={{
                        display: "block",
                        color: "#64748b",
                        fontSize: "0.85rem",
                        marginBottom: "2px",
                      }}
                    >
                      Liên hệ
                    </span>
                    <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>
                      Hỗ trợ khách hàng 24/7
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
