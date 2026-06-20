import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Loading from "@/components/Loading";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ToastContext";
import { API_URL } from "@/lib/config";
import { mapImageUrl } from "@/lib/tour";

// Fallback ảnh tuyệt đẹp cho các điểm đến chưa có ảnh bìa
const destFallbacks = [
  "https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1555921015-c26228f4ff12?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1512100356356-de1b84283e18?auto=format&fit=crop&w=800&q=80",
];

export default function DestinationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState([]);
  const [keyword, setKeyword] = useState("");
  const { showToast } = useToast();

  // 1. Đồng bộ URL Query vào state Keyword khi trang tải
  useEffect(() => {
    if (router.isReady && router.query.destination) {
      setKeyword(router.query.destination);
    }
  }, [router.isReady, router.query.destination]);

  // 2. Fetch dữ liệu từ API
  useEffect(() => {
    let active = true;
    apiFetch("/destinations")
      .then((data) => {
        if (!active) return;
        setDestinations(data || []);
        setLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        showToast(error.message, "error");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  // 3. Logic lọc điểm đến
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((item) =>
      [item.name, item.province, item.region, item.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [destinations, keyword]);

  if (loading) return <Loading text="Đang tải danh sách điểm đến..." />;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .dest-card {
            transition: all 0.3s ease;
          }
          .dest-bg {
            transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          }
          .dest-card:hover .dest-bg {
            transform: scale(1.08);
          }
          .dest-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 20px 40px rgba(0,0,0,0.15) !important;
          }
          .search-input-glass:focus-within {
            box-shadow: 0 0 0 4px rgba(114, 180, 75, 0.2);
            border-color: #72b44b !important;
          }
        `,
        }}
      />

      {/* Hero Banner: Có background image + Search lớn */}
      <section
        className="page-hero"
        style={{
          position: "relative",
          padding: "100px 0 80px",
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "url('https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1920&q=80')",
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
              "linear-gradient(to bottom, rgba(15,23,42,0.5) 0%, rgba(15,23,42,0.85) 100%)",
            zIndex: 1,
          }}
        ></div>

        <div className="container" style={{ position: "relative", zIndex: 2 }}>
          <div
            className="eyebrow"
            style={{
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(8px)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.3)",
              marginBottom: "16px",
              display: "inline-block",
              padding: "8px 20px",
              borderRadius: "999px",
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "1px",
              fontWeight: 600,
            }}
          >
            Khám phá bản đồ
          </div>
          <h1
            style={{
              fontSize: "clamp(2.5rem, 5vw, 3.8rem)",
              color: "#ffffff",
              marginBottom: "16px",
              textShadow: "0 2px 10px rgba(0,0,0,0.3)",
            }}
          >
            Tìm điểm đến lý tưởng
          </h1>
          <p
            style={{
              color: "rgba(255,255,255,0.85)",
              fontSize: "1.1rem",
              maxWidth: "640px",
              margin: "0 auto 40px",
              lineHeight: 1.6,
            }}
          >
            Tra cứu thông tin theo khu vực, tỉnh thành hoặc phong cách du lịch.
            Hãy nhập từ khóa để bắt đầu hành trình của bạn.
          </p>

          {/* Input Search: Glassmorphism */}
          <div
            className="search-input-glass hero-destination-search"
            style={{
              maxWidth: "760px",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(14px)",
              borderRadius: "999px",
              padding: "10px",
              border: "1px solid rgba(255,255,255,0.65)",
              transition: "all 0.3s ease",
              boxShadow: "0 24px 50px rgba(0,0,0,0.20)",
            }}
          >
            <svg
              width="22"
              height="22"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              className="hero-destination-search-input"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              type="text"
              placeholder="Ví dụ: Phú Quốc, Miền Trung, biển..."
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                outline: "none",
                padding: "16px 20px",
                fontSize: "1.08rem",
                color: "#1f2937",
                borderRadius: "999px",
              }}
            />
            {keyword ? (
              <button
                onClick={() => setKeyword("")}
                style={{
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  color: "#64748b",
                  cursor: "pointer",
                  padding: "13px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = "#e2e8f0")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.background = "#f1f5f9")
                }
              >
                <svg
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            ) : (
              <div
                className="hero-destination-search-btn"
                style={{
                  padding: "16px 28px",
                  background: "linear-gradient(135deg, #ff9f1a, #fb923c)",
                  color: "#111827",
                  borderRadius: "999px",
                  fontWeight: 800,
                  fontSize: "1rem",
                  boxShadow: "0 12px 28px rgba(251, 146, 60, 0.28)",
                }}
              >
                Tìm kiếm
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Kết quả danh sách Điểm đến */}
      <section
        className="section section-light"
        style={{
          padding: "60px 0 80px",
          background: "#f8fafc",
          minHeight: "50vh",
        }}
      >
        <div className="container">
          <div
            className="section-title"
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              borderBottom: "1px solid #e2e8f0",
              paddingBottom: "20px",
              marginBottom: "40px",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "2rem",
                  color: "#0f172a",
                  margin: "0 0 8px",
                }}
              >
                {keyword ? "Kết quả tìm kiếm" : "Điểm đến phổ biến"}
              </h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: "1.05rem" }}>
                Tìm thấy <strong>{filtered.length}</strong> điểm đến phù hợp.
              </p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "80px 20px",
                background: "#fff",
                borderRadius: "24px",
                border: "1px dashed #cbd5e1",
                boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
              }}
            >
              <svg
                width="64"
                height="64"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ margin: "0 auto 20px" }}
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <h3
                style={{
                  color: "#1f2937",
                  margin: "0 0 12px",
                  fontSize: "1.4rem",
                }}
              >
                Không tìm thấy điểm đến nào
              </h3>
              <p style={{ color: "#64748b", margin: 0, fontSize: "1.05rem" }}>
                Vui lòng thử lại với một từ khóa khác hoặc xóa bộ lọc.
              </p>
            </div>
          ) : (
            <div
              className="card-grid destination-page-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: "32px",
              }}
            >
              {filtered.map((destination, index) => {
                const bgUrl = destination.coverImage
                  ? mapImageUrl(destination.coverImage, API_URL)
                  : destFallbacks[index % destFallbacks.length];

                return (
                  <div
                    key={destination.id}
                    className="dest-card"
                    style={{
                      position: "relative",
                      borderRadius: "24px",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      minHeight: "420px",
                      background: "#fff",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                    }}
                  >
                    {/* Background Image Layer */}
                    <div
                      className="dest-bg"
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `url(${bgUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        zIndex: 0,
                      }}
                    ></div>

                    {/* Gradient Overlay để đọc chữ dễ dàng */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(180deg, rgba(15,23,42,0.1) 0%, rgba(15,23,42,0.4) 40%, rgba(15,23,42,0.9) 100%)",
                        zIndex: 1,
                      }}
                    ></div>

                    {/* Content Layer */}
                    <div
                      style={{
                        position: "relative",
                        zIndex: 2,
                        padding: "28px",
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                      }}
                    >
                      {/* Badges Top */}
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          marginBottom: "auto",
                        }}
                      >
                        <span
                          style={{
                            background: "rgba(0,0,0,0.4)",
                            backdropFilter: "blur(8px)",
                            color: "#fff",
                            padding: "6px 14px",
                            borderRadius: "999px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            letterSpacing: "1px",
                            textTransform: "uppercase",
                            border: "1px solid rgba(255,255,255,0.2)",
                          }}
                        >
                          {destination.region || "Việt Nam"}
                        </span>
                      </div>

                      {/* Info Bottom */}
                      <div>
                        <div
                          style={{
                            color: "#ffb547",
                            fontWeight: 700,
                            fontSize: "0.9rem",
                            marginBottom: "4px",
                          }}
                        >
                          {destination.province || "Tỉnh/Thành"}
                        </div>
                        <h3
                          style={{
                            fontSize: "1.8rem",
                            color: "#fff",
                            margin: "0 0 12px",
                            textShadow: "0 2px 4px rgba(0,0,0,0.5)",
                          }}
                        >
                          {destination.name}
                        </h3>
                        <p
                          style={{
                            color: "rgba(255,255,255,0.85)",
                            fontSize: "0.95rem",
                            lineHeight: 1.6,
                            margin: "0 0 24px",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {destination.description ||
                            "Điểm đến hấp dẫn với các cảnh quan tuyệt đẹp, văn hóa đặc sắc và ẩm thực phong phú, hứa hẹn mang đến những trải nghiệm khó quên."}
                        </p>

                        {/* Action Buttons */}
                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                          }}
                        >
                          <Link
                            href={`/tours?destination=${encodeURIComponent(destination.name)}`}
                            className="btn"
                            style={{
                              flex: 1,
                              padding: "12px",
                              background:
                                "linear-gradient(135deg, #72b44b, #5a9d34)",
                              color: "#fff",
                              fontSize: "0.95rem",
                              fontWeight: 600,
                              border: "none",
                              borderRadius: "14px",
                              textAlign: "center",
                              textDecoration: "none",
                            }}
                          >
                            Xem Tour
                          </Link>
                          <Link
                            href="/contact"
                            className="btn"
                            style={{
                              flex: 1,
                              padding: "12px",
                              background: "rgba(255,255,255,0.15)",
                              backdropFilter: "blur(8px)",
                              color: "#fff",
                              fontSize: "0.95rem",
                              fontWeight: 600,
                              border: "1px solid rgba(255,255,255,0.3)",
                              borderRadius: "14px",
                              textAlign: "center",
                              textDecoration: "none",
                            }}
                          >
                            Nhờ tư vấn
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
