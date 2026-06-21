import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/router";
import TourCard from "@/components/TourCard";
import Loading from "@/components/Loading";
import FilterSidebar from "@/components/FilterSidebar";
import AISmartSearchBar from "@/components/AISmartSearchBar";
import Pagination from "@/components/Pagination";
import { apiFetch } from "@/lib/api";
import { normalizeTour, filterTours } from "@/lib/tour";
import { formatNumber } from "@/lib/format";
import { useToast } from "@/components/ToastContext";
import { trackBehavior } from "@/lib/behavior";

const resetKeys = [
  "search",
  "destination",
  "imageDestinations",
  "province",
  "departureProvince",
  "theme",
  "type",
  "minPrice",
  "maxPrice",
  "durationMax",
  "minRating",
  "month",
  "sort",
  "featured",
  "bestDeal",
  "page",
];
const PAGE_SIZE = 6;

// Danh sách ảnh tự động chuyển cho Slide Hero
const heroImages = [
  "https://images.unsplash.com/photo-1499678329028-101435549a4e?auto=format&fit=crop&w=1920&q=80",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1920&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80",
];

export default function ToursPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tours, setTours] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const { showToast } = useToast();

  // State cho Background Slider & Mobile Filter
  const [currentBg, setCurrentBg] = useState(0);
  const [showMobileFilter, setShowMobileFilter] = useState(false);

  // Effect chạy Slider
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBg((prev) => (prev + 1) % heroImages.length);
    }, 5000); // Chuyển ảnh mỗi 5 giây
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch("/tours").catch(() => []),
      apiFetch("/destinations").catch(() => []),
    ])
      .then(([tourData, destinationData]) => {
        if (!active) return;
        setTours((tourData || []).map(normalizeTour));
        setDestinations(destinationData || []);
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

  const query = useMemo(
    () => ({
      ...router.query,
      sort: router.query.sort || "recommended",
      page: Number(router.query.page || 1),
    }),
    [router.query],
  );

  const filteredTours = useMemo(() => {
    const base = filterTours(tours, query);

    if (query.sort === "popular_desc") {
      return [...base].sort(
        (a, b) => Number(b.bookingCount || 0) - Number(a.bookingCount || 0),
      );
    }

    if (query.sort === "favorite_desc") {
      return [...base].sort(
        (a, b) => Number(b.favoriteCount || 0) - Number(a.favoriteCount || 0),
      );
    }

    if (query.sort === "remaining_asc") {
      return [...base].sort(
        (a, b) =>
          Number(a.remainingSlots ?? 999999) -
          Number(b.remainingSlots ?? 999999),
      );
    }

    return base;
  }, [tours, query]);

  const totalPages = Math.max(1, Math.ceil(filteredTours.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(Number(query.page || 1), 1), totalPages);

  const pagedTours = useMemo(
    () => filteredTours.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredTours, safePage],
  );

  const updateQuery = (next) => {
    const merged = { ...router.query, ...next };
    Object.keys(merged).forEach((key) => {
      if (
        merged[key] === null ||
        merged[key] === undefined ||
        merged[key] === ""
      )
        delete merged[key];
    });
    router.push({ pathname: "/tours", query: merged }, undefined, {
      shallow: true,
    });
  };

  const onFilterSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextQuery = {
      search: formData.get("search"),
      destination: formData.get("destination"),
      // Khi người dùng lọc thủ công thì bỏ chế độ lọc nhiều điểm đến bằng ảnh.
      imageDestinations: null,
      province: formData.get("province"),
      departureProvince: formData.get("departureProvince"),
      theme: formData.get("theme"),
      type: formData.get("type"),
      minPrice: formData.get("minPrice"),
      maxPrice: formData.get("maxPrice"),
      durationMax: formData.get("durationMax"),
      minRating: formData.get("minRating"),
      month: formData.get("month"),
      sort: formData.get("sort"),
      featured: formData.get("featured") ? "1" : null,
      bestDeal: formData.get("bestDeal") ? "1" : null,
      page: 1,
    };

    const keyword = String(nextQuery.search || "").trim();
    const destination = String(nextQuery.destination || "").trim();
    if (keyword || destination) {
      trackBehavior({
        action: "search",
        keyword: keyword || destination,
        score: 1,
        meta: { source: "tours_filter_sidebar", filters: nextQuery },
      });
    }

    updateQuery(nextQuery);
    setShowMobileFilter(false); // Đóng bộ lọc trên mobile sau khi submit
  };

  if (loading) return <Loading text="Đang tải danh sách tour..." />;

  const isDestinationView = !!query.destination;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .responsive-tour-layout {
            display: grid;
            grid-template-columns: 280px 1fr;
            gap: 32px;
            align-items: start;
          }
          .mobile-filter-toggle {
            display: none;
          }
          @media (max-width: 1024px) {
            .responsive-tour-layout {
              grid-template-columns: 1fr;
              gap: 24px;
            }
            .responsive-tour-layout > :first-child {
              position: relative !important;
              top: 0 !important;
            }
            .mobile-filter-toggle {
              display: flex;
              justify-content: space-between;
              align-items: center;
              background: #fff;
              padding: 14px 20px;
              border-radius: 16px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.04);
              margin-bottom: 8px;
            }
            .filter-sidebar-wrapper {
              display: none;
            }
            .filter-sidebar-wrapper.open {
              display: block;
              animation: slideDown 0.3s ease-out;
            }
          }
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `,
        }}
      />

      <section
        className="page-hero page-hero-travel-list tour-page-hero-like-home"
        style={{
          position: "relative",
          minHeight: isDestinationView ? "58vh" : "70vh",
          display: "flex",
          alignItems: "center",
          padding: isDestinationView ? "90px 0 80px" : "100px 0 110px",
          backgroundImage: `url(${heroImages[currentBg]})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          overflow: "hidden",
          borderBottom: "none",
        }}
      >
        <div
          className="tour-page-hero-overlay"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(7, 13, 24, 0.28) 0%, rgba(7, 13, 24, 0.54) 100%)",
            zIndex: 0,
          }}
        />
        <div
          className="container"
          style={{ position: "relative", zIndex: 1, width: "100%" }}
        >
          {isDestinationView ? (
            /* HERO 1: Giao diện khi đã chọn Điểm đến */
            <div
              className="panel tour-page-hero-panel"
              style={{
                position: "relative",
                background: "transparent",
                transition: "background-image 1s ease-in-out",
                border: "none",
                boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
                borderRadius: "28px",
                padding: "60px 20px",
                textAlign: "center",
                overflow: "hidden",
              }}
            >
              {/* Lớp phủ mờ để chữ nổi bật */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(15, 23, 42, 0.6)",
                }}
              />

              <div style={{ position: "relative", zIndex: 1 }}>
                <div
                  className="eyebrow"
                  style={{
                    background: "rgba(255, 255, 255, 0.2)",
                    color: "#fff",
                    backdropFilter: "blur(8px)",
                    marginBottom: "16px",
                    display: "inline-block",
                    padding: "8px 18px",
                    borderRadius: "999px",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                  }}
                >
                  Khám phá vùng đất mới
                </div>
                <h1
                  style={{
                    fontSize: "3.2rem",
                    color: "#fff",
                    margin: "0 0 16px",
                    textShadow: "0 2px 10px rgba(0,0,0,0.3)",
                  }}
                >
                  Tour du lịch {query.destination}
                </h1>
                <p
                  style={{
                    color: "rgba(255,255,255,0.9)",
                    fontSize: "1.15rem",
                    maxWidth: "640px",
                    margin: "0 auto 32px",
                    lineHeight: 1.6,
                  }}
                >
                  Tìm thấy <strong>{filteredTours.length}</strong> hành trình
                  tuyệt vời đang mở bán. Hãy sử dụng bộ lọc bên dưới để chọn ra
                  tour ưng ý nhất.
                </p>
                <button
                  onClick={() => updateQuery({ destination: null, page: 1 })}
                  className="btn btn-light"
                  style={{
                    borderRadius: "999px",
                    padding: "12px 28px",
                    fontSize: "1rem",
                    border: "none",
                    background: "#fff",
                    color: "#0f172a",
                    cursor: "pointer",
                    fontWeight: 700,
                    boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
                  }}
                >
                  &larr; Xem toàn bộ điểm đến khác
                </button>
              </div>
            </div>
          ) : (
            /* HERO 2: Giao diện có AI Search (Slide background) */
            <div
              className="travel-list-banner panel tour-page-hero-panel"
              style={{
                position: "relative",
                background: "transparent",
                transition: "background-image 1s ease-in-out",
                border: "none",
                boxShadow: "none",
                borderRadius: 0,
                padding: 0,
                overflow: "visible",
              }}
            >
              {/* Lớp phủ mờ (Dark Overlay) */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(15, 23, 42, 0.5)",
                }}
              />

              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                  maxWidth: "820px",
                  margin: "0 auto",
                  textAlign: "center",
                }}
              >
                <h2
                  style={{
                    color: "#fff",
                    fontSize: "clamp(2.6rem, 5vw, 4.2rem)",
                    margin: "0 0 24px",
                    textAlign: "center",
                    textShadow: "0 2px 10px rgba(0,0,0,0.3)",
                  }}
                >
                  Khám phá thế giới cùng Travela
                </h2>

                <div
                  className="tour-ai-search-frame"
                  style={{
                    background: "transparent",
                    backdropFilter: "none",
                    padding: 0,
                    borderRadius: "999px",
                    boxShadow: "none",
                    maxWidth: "760px",
                    margin: "0 auto",
                  }}
                >
                  <AISmartSearchBar
                    destinations={destinations}
                    onApplyQuery={(next) => {
                      const keyword = String(
                        next?.search || next?.destination || "",
                      ).trim();
                      if (keyword) {
                        trackBehavior({
                          action: "search",
                          keyword,
                          score: 1,
                          meta: { source: "ai_smart_search_bar", query: next },
                        });
                      }
                      updateQuery({
                        ...next,
                        sort: query.sort || "recommended",
                        page: 1,
                      });
                    }}
                    placeholder="Ví dụ: Đà Nẵng 4 ngày cho gia đình..."
                  />
                </div>

                <div
                  className="travel-list-kpis"
                  style={{
                    marginTop: "28px",
                    display: "flex",
                    gap: "12px",
                    flexWrap: "wrap",
                    justifyContent: "center",
                  }}
                >
                  <span
                    className="badge"
                    style={{
                      background: "#72b44b",
                      color: "#fff",
                      border: "none",
                      fontWeight: 700,
                      padding: "8px 18px",
                      borderRadius: "999px",
                      boxShadow: "0 4px 12px rgba(114, 180, 75, 0.4)",
                    }}
                  >
                    {formatNumber(filteredTours.length)} tour phù hợp
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: "rgba(255,255,255,0.2)",
                      backdropFilter: "blur(4px)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.4)",
                      padding: "8px 18px",
                      borderRadius: "999px",
                    }}
                  >
                    Bộ lọc nâng cao
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: "rgba(255,255,255,0.2)",
                      backdropFilter: "blur(4px)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.4)",
                      padding: "8px 18px",
                      borderRadius: "999px",
                    }}
                  >
                    Cập nhật 24/7
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section
        className="section section-light"
        style={{ padding: "40px 0 80px" }}
      >
        <div className="container responsive-tour-layout">
          {/* Cột trái: Nút Toggle Mobile & Bộ lọc */}
          <div>
            <div className="mobile-filter-toggle">
              <strong style={{ color: "#1f2937", fontSize: "1.1rem" }}>
                Bộ lọc tìm kiếm
              </strong>
              <button
                type="button"
                onClick={() => setShowMobileFilter(!showMobileFilter)}
                style={{
                  background: showMobileFilter
                    ? "#f1f5f9"
                    : "linear-gradient(135deg, #72b44b, #5a9d34)",
                  color: showMobileFilter ? "#475569" : "#fff",
                  border: "none",
                  padding: "8px 20px",
                  borderRadius: "999px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {showMobileFilter ? "Đóng lại" : "Lọc ngay"}
              </button>
            </div>

            <div
              className={`filter-sidebar-wrapper ${showMobileFilter ? "open" : ""}`}
            >
              <FilterSidebar
                destinations={destinations}
                query={query}
                onSubmit={onFilterSubmit}
                onReset={() => {
                  updateQuery(
                    Object.fromEntries(resetKeys.map((key) => [key, null])),
                  );
                  setShowMobileFilter(false);
                }}
                onQuickDestination={(value) => {
                  updateQuery({
                    destination: value,
                    imageDestinations: null,
                    page: 1,
                  });
                  setShowMobileFilter(false);
                }}
                onRemoveChip={(key) => updateQuery({ [key]: null, page: 1 })}
              />
            </div>
          </div>

          {/* Cột phải: Danh sách Tour */}
          <div className="section-stack results-column">
            {/* Thanh công cụ sắp xếp */}
            <div
              className="results-toolbar-panel section-card travel-results-toolbar"
              style={{
                padding: "16px 24px",
                background: "#fff",
                borderRadius: "20px",
                border: "1px solid #f1f5f9",
                boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "16px",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "1.4rem",
                    margin: "0 0 4px",
                    color: "#1f2937",
                  }}
                >
                  Danh sách tour
                </h2>
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                  Trang {safePage}/{totalPages} · Đang hiển thị{" "}
                  <strong>{pagedTours.length}</strong> / {filteredTours.length}{" "}
                  tour.
                </p>
              </div>
              <div className="field results-sort-field" style={{ margin: 0 }}>
                <select
                  value={query.sort || "recommended"}
                  onChange={(e) =>
                    updateQuery({ sort: e.target.value, page: 1 })
                  }
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "10px 16px",
                    color: "#334155",
                    fontWeight: 500,
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value="recommended">Gợi ý phù hợp nhất</option>
                  <option value="popular_desc">Bán chạy nhất</option>
                  <option value="favorite_desc">Được yêu thích nhất</option>
                  <option value="remaining_asc">Sắp hết chỗ</option>
                  <option value="price_asc">Giá thấp đến cao</option>
                  <option value="price_desc">Giá cao đến thấp</option>
                  <option value="rating_desc">Đánh giá cao nhất</option>
                  <option value="departure_asc">Khởi hành gần nhất</option>
                  <option value="duration_asc">Thời lượng ngắn nhất</option>
                </select>
              </div>
            </div>

            {/* Trạng thái trống / Lưới hiển thị */}
            {!filteredTours.length ? (
              <div
                className="empty-state-card"
                style={{
                  padding: "60px 20px",
                  background: "#f8fafc",
                  borderRadius: "24px",
                  border: "1px dashed #cbd5e1",
                  textAlign: "center",
                }}
              >
                <svg
                  width="48"
                  height="48"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ margin: "0 auto 16px" }}
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <h3 style={{ color: "#334155", margin: "0 0 8px" }}>
                  Không tìm thấy tour phù hợp
                </h3>
                <p style={{ color: "#64748b", margin: 0 }}>
                  Hãy thử thay đổi điểm đến, nới lỏng mức giá hoặc bộ lọc để xem
                  thêm các lựa chọn khác.
                </p>
                <button
                  onClick={() =>
                    updateQuery(
                      Object.fromEntries(resetKeys.map((key) => [key, null])),
                    )
                  }
                  className="btn btn-light"
                  style={{
                    marginTop: "20px",
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    padding: "10px 24px",
                    borderRadius: "999px",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Xóa bộ lọc
                </button>
              </div>
            ) : (
              <>
                <div
                  className="tour-grid-next travel-tour-grid-3"
                  style={{ display: "grid", gap: "24px" }}
                >
                  {pagedTours.map((tour) => (
                    <TourCard key={tour.id} tour={tour} />
                  ))}
                </div>
                <div
                  style={{
                    marginTop: "32px",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <Pagination
                    page={safePage}
                    totalPages={totalPages}
                    onPageChange={(page) => updateQuery({ page })}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
