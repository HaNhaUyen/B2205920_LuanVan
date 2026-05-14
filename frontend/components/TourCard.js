import Link from "next/link";
import { useMemo, useState } from "react";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, renderStars } from "@/lib/format";
import { mapLabel } from "@/lib/labels";
import { mapImageUrl } from "@/lib/tour";
import { getUser } from "@/lib/storage";

export default function TourCard({
  tour,
  initialFavorite = false,
  onFavoriteChange,
}) {
  const cover = mapImageUrl(tour.coverUrl, API_URL);
  const firstDeparture = tour.departures?.[0];
  const [favorite, setFavorite] = useState(Boolean(initialFavorite));
  const currentUser = useMemo(() => getUser(), []);

  const toggleFavorite = async () => {
    if (!currentUser) {
      window.location.href = "/login";
      return;
    }
    try {
      if (favorite) {
        await apiFetch(`/favorites/${tour.id}`, { method: "DELETE" });
        setFavorite(false);
        onFavoriteChange?.(false);
      } else {
        await apiFetch(`/favorites/${tour.id}`, { method: "POST" });

        setFavorite(true);
        onFavoriteChange?.(true);
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <article
      className="card tour-card premium-tour-card travel-tour-card"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#fff",
        borderRadius: "24px",
        overflow: "hidden",
        border: "1px solid #f1f5f9",
        boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
        transition: "transform 0.3s, box-shadow 0.3s",
      }}
    >
      <div
        className="media"
        style={{
          position: "relative",
          aspectRatio: "1.25",
          overflow: "hidden",
        }}
      >
        <img
          src={cover}
          alt={tour.name}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "transform 0.5s ease",
          }}
        />
        <div
          className="tour-card-overlay"
          style={{
            position: "absolute",
            top: "12px",
            left: "12px",
            right: "12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            {tour.isTrending ? (
              <span
                className="tour-badge-featured"
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  padding: "6px 12px",
                  borderRadius: "999px",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                  boxShadow: "0 4px 10px rgba(239, 68, 68, 0.3)",
                  display: "inline-block",
                }}
              >
                🔥 Bán chạy
              </span>
            ) : tour.isBestDeal ? (
              <span
                className="tour-badge-featured"
                style={{
                  background: "#f59e0b",
                  color: "#fff",
                  padding: "6px 12px",
                  borderRadius: "999px",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                  boxShadow: "0 4px 10px rgba(245, 158, 11, 0.3)",
                  display: "inline-block",
                }}
              >
                ⭐ Giá tốt
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="tour-favorite-btn"
            aria-label="Yêu thích"
            onClick={toggleFavorite}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: favorite ? "#fee2e2" : "rgba(255,255,255,0.9)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: favorite ? "#e11d48" : "#94a3b8",
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
              backdropFilter: "blur(4px)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={favorite ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
      </div>

      <div
        className="card-body travel-tour-card-body"
        style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
        }}
      >
        <div
          className="tour-location-line"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: "#ff9f1a",
            fontSize: "0.85rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: "8px",
          }}
        >
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          {tour.destination?.name || "Điểm đến"}
        </div>

        <h3
          style={{
            margin: "0 0 12px",
            fontSize: "1.15rem",
            color: "#1f2937",
            lineHeight: "1.5",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {tour.name}
        </h3>

        <div
          className="tour-meta-inline"
          style={{
            display: "flex",
            gap: "16px",
            color: "#64748b",
            fontSize: "0.9rem",
            marginBottom: "12px",
            flexWrap: "wrap",
          }}
        >
          <span>
            {tour.durationDays} ngày {tour.durationNights} đêm
          </span>
          <span>
            {renderStars(tour.rating)} ({tour.reviewCount || 0})
          </span>
        </div>

        <p
          style={{
            color: "#64748b",
            fontSize: "0.95rem",
            marginBottom: "12px",
            minHeight: 50,
          }}
        >
          {tour.shortDescription ||
            "Khởi hành định kỳ, lịch trình tối ưu cho khách Việt."}
        </p>

        <div className="chips" style={{ marginBottom: 12 }}>
          <span className="badge">{mapLabel("theme", tour.tourTheme)}</span>
          <span className="badge">{tour.hotelStars || 4}★ KS</span>
          {firstDeparture ? (
            <span className="badge">
              {formatDate(firstDeparture.departureDate)}
            </span>
          ) : null}
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "end",
            gap: 12,
          }}
        >
          <div>
            <small className="muted">Giá từ</small>
            <div className="price-strong">
              {formatCurrency(tour.minPrice || tour.basePriceAdult || 0)}
            </div>
          </div>
          <Link className="btn btn-primary" href={`/tour/${tour.slug}`}>
            Xem chi tiết
          </Link>
        </div>
      </div>
    </article>
  );
}
