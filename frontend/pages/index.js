import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import TourCard from "@/components/TourCard";
import Loading from "@/components/Loading";
import { apiFetch } from "@/lib/api";
import { normalizeTour, mapImageUrl } from "@/lib/tour";
import { API_URL } from "@/lib/config";
import { useToast } from "@/components/ToastContext";
import { trackBehavior } from "@/lib/behavior";

// Slide ảnh nền chất lượng cao cho Hero Banner
const heroSlides = [
  "https://images.unsplash.com/photo-1499678329028-101435549a4e?auto=format&fit=crop&w=1920&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1920&q=80",
  "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1920&q=80",
];

// Fallback ảnh cho điểm đến nếu không có coverImage
const destFallbacks = [
  "https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1555921015-c26228f4ff12?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1512100356356-de1b84283e18?auto=format&fit=crop&w=800&q=80",
];

// Đã thêm icon SVG vào danh sách để giao diện trực quan hơn
const heroCards = [
  {
    tag: "Dịch vụ",
    title: "Tìm hiểu cách Travela đồng hành cùng bạn",
    desc: "Xem cách chúng tôi tư vấn hành trình và quản lý đặt chỗ.",
    href: "/about",
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
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 16v-4"></path>
        <path d="M12 8h.01"></path>
      </svg>
    ),
  },
  {
    tag: "Khám phá",
    title: "Điểm đến & Hành trình văn hóa nổi bật",
    desc: "Khám phá các thành phố biển và điểm nghỉ dưỡng.",
    href: "/destinations",
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
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
    ),
  },
  {
    tag: "Hỗ trợ",
    title: "Liên hệ tư vấn lịch trình riêng",
    desc: "Gửi yêu cầu để đội ngũ hỗ trợ lên lịch trình cho bạn.",
    href: "/contact",
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
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
    ),
  },
];

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [tours, setTours] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [recommendedTours, setRecommendedTours] = useState([]);
  const [recommendationStrategy, setRecommendationStrategy] = useState("");
  const { showToast } = useToast();

  // State quản lý Slide ảnh nền
  const [currentSlide, setCurrentSlide] = useState(0);

  // Effect chạy Slider tự động
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000); // Đổi ảnh mỗi 5 giây
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch("/tours").catch(() => []),
      apiFetch("/destinations").catch(() => []),
      apiFetch("/recommendations?limit=8").catch(() => []),
    ])
      .then(([tourData, destinationData, recommendationData]) => {
        if (!active) return;
        const normalizedTours = (tourData || []).map(normalizeTour);
        const normalizedRecommendations = (
          Array.isArray(recommendationData)
            ? recommendationData
            : recommendationData?.data ||
              recommendationData?.items ||
              recommendationData?.tours ||
              []
        ).map(normalizeTour);

        setTours(normalizedTours);
        setDestinations(destinationData || []);
        setRecommendationStrategy(recommendationData?.strategy || "");
        setRecommendedTours(
          normalizedRecommendations.length
            ? normalizedRecommendations
            : normalizedTours.slice(0, 8),
        );
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

  const featuredTours = useMemo(() => tours.slice(0, 6), [tours]);
  const topDestinations = useMemo(
    () => destinations.slice(0, 6),
    [destinations],
  );

  const onHeroSearch = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    formData.forEach((value, key) => {
      if (value) params.set(key, value.toString());
    });

    const keyword = String(formData.get("search") || "").trim();
    if (keyword) {
      trackBehavior({
        action: "search",
        keyword,
        score: 1,
        meta: { source: "home_hero_search" },
      });
    }

    window.location.href = `/tours?${params.toString()}`;
  };

  if (loading) return <Loading text="Đang tải trang chủ Travela..." />;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .hero-slider-bg {
            position: absolute;
            inset: 0;
            background-size: cover;
            background-position: center;
            transition: opacity 1.5s ease-in-out, transform 10s linear;
            z-index: 0;
          }
          .hero-slider-bg.active { opacity: 1; transform: scale(1.05); }
          .hero-slider-bg.inactive { opacity: 0; transform: scale(1); }
          
          .floating-card {
            transition: transform 0.3s ease, box-shadow 0.3s ease;
          }
          .floating-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 20px 40px rgba(0,0,0,0.1) !important;
          }

          .dest-poster {
            transition: transform 0.4s ease;
          }
          .destination-chip-card:hover .dest-poster {
            transform: scale(1.08);
          }
          .destination-chip-card:hover .dest-icon {
            background: #ff9f1a !important;
            color: #fff !important;
            transform: scale(1.1);
          }
        `,
        }}
      />

      {/* --- HERO SECTION --- */}
      <section
        className="hero hero-travel-home"
        style={{
          position: "relative",
          minHeight: "85vh",
          display: "flex",
          alignItems: "center",
          paddingTop: "80px",
          paddingBottom: "120px", // Để chừa khoảng trống cho khối Dịch Vụ nổi lên
          overflow: "hidden",
        }}
      >
        {/* Render các ảnh slide */}
        {heroSlides.map((src, index) => (
          <div
            key={src}
            className={`hero-slider-bg ${index === currentSlide ? "active" : "inactive"}`}
            style={{ backgroundImage: `url(${src})` }}
          />
        ))}

        {/* Lớp phủ tối mờ (Dark Overlay) giúp chữ nổi bật */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(15, 23, 42, 0.4) 0%, rgba(15, 23, 42, 0.7) 100%)",
            zIndex: 1,
          }}
        />

        <div
          className="container"
          style={{ position: "relative", zIndex: 2, width: "100%" }}
        >
          <div
            style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}
          >
            <div
              style={{
                display: "inline-block",
                background: "rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(8px)",
                color: "#fff",
                padding: "8px 20px",
                borderRadius: "999px",
                fontWeight: 600,
                letterSpacing: "1px",
                textTransform: "uppercase",
                fontSize: "0.85rem",
                marginBottom: "24px",
                border: "1px solid rgba(255,255,255,0.3)",
              }}
            >
              Nền tảng đặt tour thông minh
            </div>
            <h1
              style={{
                fontSize: "clamp(2.8rem, 6vw, 4.5rem)",
                lineHeight: 1.1,
                marginBottom: "24px",
                color: "#fff",
                textShadow: "0 4px 12px rgba(0,0,0,0.2)",
              }}
            >
              Trải nghiệm chuyến đi <br />{" "}
              <span style={{ color: "#42f2b8" }}>trọn vẹn từng giây</span>
            </h1>
            <p
              style={{
                fontSize: "1.2rem",
                color: "rgba(255,255,255,0.9)",
                marginBottom: "40px",
                lineHeight: 1.6,
              }}
            >
              Tìm kiếm hành trình, quản lý đặt chỗ và nhận hỗ trợ 24/7. Tất cả
              được tách biệt rõ ràng để bạn dễ dàng lên kế hoạch cho kỳ nghỉ
              tiếp theo.
            </p>

            {/* Thanh Tìm Kiếm Trun Tâm */}
            <form
              onSubmit={onHeroSearch}
              style={{
                background: "rgba(255, 255, 255, 0.95)",
                backdropFilter: "blur(12px)",
                padding: "10px",
                borderRadius: "999px",
                boxShadow: "0 24px 50px rgba(0,0,0,0.2)",
                display: "flex",
                gap: "12px",
                alignItems: "center",
              }}
            >
              <div style={{ paddingLeft: "16px", color: "#64748b" }}>
                <svg
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
              <input
                type="text"
                name="search"
                placeholder="Bạn muốn khám phá nơi nào? (VD: Phú Quốc, Đà Nẵng...)"
                style={{
                  border: "none",
                  background: "transparent",
                  flex: 1,
                  outline: "none",
                  fontSize: "1.1rem",
                  color: "#1f2937",
                  padding: "12px 0",
                }}
              />
              <button
                className="btn btn-primary"
                type="submit"
                style={{
                  padding: "16px 36px",
                  fontSize: "1.1rem",
                  borderRadius: "999px",
                  background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                  border: "none",
                  color: "#fff",
                  boxShadow: "0 8px 20px rgba(114, 180, 75, 0.4)",
                }}
              >
                Tìm kiếm ngay
              </button>
            </form>

            {/* Các thông số thống kê nổi bật */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "32px",
                marginTop: "40px",
              }}
            >
              <div style={{ textAlign: "center", color: "#fff" }}>
                <strong
                  style={{
                    fontSize: "2rem",
                    display: "block",
                    color: "#ff9f1a",
                    textShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  }}
                >
                  {tours.length}+
                </strong>
                <span style={{ fontSize: "0.95rem", opacity: 0.9 }}>
                  Tour đang mở bán
                </span>
              </div>
              <div
                style={{
                  width: "1px",
                  background: "rgba(255,255,255,0.2)",
                  height: "40px",
                  alignSelf: "center",
                }}
              ></div>
              <div style={{ textAlign: "center", color: "#fff" }}>
                <strong
                  style={{
                    fontSize: "2rem",
                    display: "block",
                    color: "#42f2b8",
                    textShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  }}
                >
                  {destinations.length}+
                </strong>
                <span style={{ fontSize: "0.95rem", opacity: 0.9 }}>
                  Điểm đến gợi ý
                </span>
              </div>
              <div
                style={{
                  width: "1px",
                  background: "rgba(255,255,255,0.2)",
                  height: "40px",
                  alignSelf: "center",
                }}
              ></div>
              <div style={{ textAlign: "center", color: "#fff" }}>
                <strong
                  style={{
                    fontSize: "2rem",
                    display: "block",
                    color: "#38bdf8",
                    textShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  }}
                >
                  24/7
                </strong>
                <span style={{ fontSize: "0.95rem", opacity: 0.9 }}>
                  Trợ lý AI hỗ trợ
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- KHỐI DỊCH VỤ (Nổi chìm lên Hero Banner) --- */}
      <section
        style={{
          position: "relative",
          zIndex: 10,
          marginTop: "-80px",
          paddingBottom: "60px",
        }}
      >
        <div className="container">
          <div
            className="quick-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "24px",
            }}
          >
            {heroCards.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="section-card floating-card"
                style={{
                  padding: "32px 24px",
                  background: "#fff",
                  borderRadius: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "20px",
                  textDecoration: "none",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
                  border: "1px solid #f1f5f9",
                }}
              >
                <div
                  style={{
                    padding: "16px",
                    background: "rgba(114, 180, 75, 0.1)",
                    color: "#72b44b",
                    borderRadius: "18px",
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: "1.25rem",
                      margin: "0 0 10px 0",
                      color: "#1f2937",
                      lineHeight: 1.4,
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      margin: "0 0 16px 0",
                      fontSize: "0.95rem",
                      color: "#64748b",
                      lineHeight: 1.6,
                    }}
                  >
                    {item.desc}
                  </p>
                  <span
                    className="inline-link"
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: "#ff9f1a",
                    }}
                  >
                    Khám phá ngay &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* --- GỢI Ý DÀNH CHO BẠN --- */}
      <section
        className="section section-light"
        style={{ background: "#fff", padding: "30px 0 70px" }}
      >
        <div className="container">
          <div
            className="section-title"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "32px",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
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
                Cá nhân hóa
              </div>
              <h2 style={{ fontSize: "2.35rem", color: "#0f172a", margin: 0 }}>
                Gợi ý dành cho bạn
              </h2>
              <p
                style={{
                  margin: "10px 0 0",
                  maxWidth: "680px",
                  color: "#64748b",
                  fontSize: "1.02rem",
                  lineHeight: 1.6,
                }}
              >
                Dựa trên tour bạn đã xem, yêu thích, đặt tour và tìm kiếm gần
                đây. Nếu chưa đăng nhập hoặc chưa có đủ dữ liệu, Travela sẽ hiển
                thị các tour nổi bật.
              </p>
            </div>
            <Link
              className="btn btn-light"
              href="/tours?sort=recommended"
              style={{
                padding: "14px 26px",
                fontWeight: 700,
                borderRadius: "999px",
                background: "#f8fafc",
                color: "#0f172a",
                border: "1px solid #e2e8f0",
                textDecoration: "none",
              }}
            >
              Xem thêm gợi ý →
            </Link>
          </div>

          {recommendedTours.length ? (
            <div
              className="card-grid travel-card-grid-3"
              style={{ display: "grid", gap: "24px" }}
            >
              {recommendedTours.slice(0, 6).map((tour) => (
                <TourCard key={tour.id} tour={tour} />
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "28px",
                borderRadius: "20px",
                background: "#f8fafc",
                border: "1px dashed #cbd5e1",
                color: "#64748b",
                textAlign: "center",
              }}
            >
              Chưa có gợi ý phù hợp. Hãy xem hoặc yêu thích vài tour để hệ thống
              cá nhân hóa tốt hơn.
            </div>
          )}
        </div>
      </section>

      {/* --- TOUR NỔI BẬT --- */}
      <section
        className="section section-light"
        style={{ background: "#f8fafc", paddingTop: "40px" }}
      >
        <div className="container">
          <div
            className="section-title"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "40px",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
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
                Hành trình yêu thích
              </div>
              <h2 style={{ fontSize: "2.5rem", color: "#0f172a", margin: 0 }}>
                Tour nổi bật tuần này
              </h2>
            </div>
            <Link
              className="btn btn-primary"
              href="/tours"
              style={{
                background: "#fff",
                color: "#1f2937",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              }}
            >
              Xem tất cả tour &rarr;
            </Link>
          </div>

          <div
            className="card-grid travel-card-grid-3"
            style={{ display: "grid", gap: "24px" }}
          >
            {featuredTours.map((tour) => (
              <TourCard key={tour.id} tour={tour} />
            ))}
          </div>
        </div>
      </section>

      {/* --- ĐIỂM ĐẾN NỔI BẬT --- */}
      <section
        className="section section-light"
        style={{ background: "#fff", padding: "80px 0" }}
      >
        <div className="container">
          <div
            className="section-title"
            style={{ textAlign: "center", marginBottom: "50px" }}
          >
            <div
              style={{
                color: "#ff9f1a",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: "8px",
                fontSize: "0.9rem",
              }}
            >
              Điểm đến lý tưởng
            </div>
            <h2
              style={{
                fontSize: "2.5rem",
                color: "#0f172a",
                margin: "0 0 16px",
              }}
            >
              Cảm hứng hành trình
            </h2>
            <p
              style={{
                margin: "0 auto",
                maxWidth: "600px",
                color: "#64748b",
                fontSize: "1.1rem",
              }}
            >
              Lựa chọn các điểm đến hot nhất hiện nay và bắt đầu chuẩn bị cho
              chuyến đi trong mơ của bạn.
            </p>
          </div>

          <div
            className="destination-chip-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "24px",
            }}
          >
            {topDestinations.map((destination, index) => {
              // Ưu tiên dùng coverImage thực tế, nếu không có thì dùng fallback tuyệt đẹp
              const bgUrl = destination.coverImage
                ? mapImageUrl(destination.coverImage, API_URL)
                : destFallbacks[index % destFallbacks.length];

              return (
                <Link
                  key={destination.id}
                  href={`/tours?destination=${encodeURIComponent(destination.name)}`}
                  className="destination-chip-card"
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    padding: "32px 24px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    minHeight: "220px",
                    border: "none",
                    borderRadius: "24px",
                    boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
                    textDecoration: "none",
                  }}
                >
                  {/* Ảnh nền Điểm đến */}
                  <div
                    className="dest-poster"
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: `url(${bgUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      zIndex: 0,
                    }}
                  ></div>

                  {/* Gradient Overlay để nổi bật chữ */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(to top, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.2) 60%, rgba(15,23,42,0) 100%)",
                      zIndex: 1,
                    }}
                  ></div>

                  {/* Nội dung điểm đến */}
                  <div
                    style={{
                      position: "relative",
                      zIndex: 2,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      width: "100%",
                    }}
                  >
                    <div>
                      <small
                        style={{
                          color: "#ffb547",
                          fontWeight: "bold",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                          fontSize: "0.8rem",
                          display: "inline-block",
                          background: "rgba(0,0,0,0.3)",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          backdropFilter: "blur(4px)",
                          marginBottom: "8px",
                        }}
                      >
                        {destination.province}
                      </small>
                      <strong
                        style={{
                          fontSize: "1.8rem",
                          display: "block",
                          color: "#fff",
                          textShadow: "0 2px 4px rgba(0,0,0,0.5)",
                        }}
                      >
                        {destination.name}
                      </strong>
                    </div>

                    {/* Nút mũi tên xịn xò */}
                    <div
                      className="dest-icon"
                      style={{
                        width: "44px",
                        height: "44px",
                        background: "rgba(255,255,255,0.2)",
                        backdropFilter: "blur(8px)",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        transition: "all 0.3s ease",
                        border: "1px solid rgba(255,255,255,0.3)",
                      }}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div style={{ textAlign: "center", marginTop: "50px" }}>
            <Link
              className="btn btn-light"
              href="/destinations"
              style={{
                padding: "16px 36px",
                fontSize: "1.1rem",
                fontWeight: 600,
                borderRadius: "999px",
                background: "#f1f5f9",
                border: "none",
                color: "#0f172a",
              }}
            >
              Khám phá toàn bộ điểm đến
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
