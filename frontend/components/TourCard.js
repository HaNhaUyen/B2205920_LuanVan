import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { mapLabel } from "@/lib/labels";
import { mapImageUrl, pickTourImage } from "@/lib/tour";
import { getUser } from "@/lib/storage";
import Image from "next/image";
import {
  Heart,
  MapPin,
  Clock,
  Star,
  Calendar,
  Sparkles,
  CheckCircle2,
  Flame,
} from "lucide-react";

function formatRating(value) {
  const number = Number(value || 0);

  if (!number || Number.isNaN(number)) return "0";

  const rounded = Math.round(number * 10) / 10;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getTourRating(tour) {
  return (
    tour?.rating ??
    tour?.averageRating ??
    tour?.avgRating ??
    tour?.reviewAverage ??
    0
  );
}

function getTourReviewCount(tour) {
  return Number(
    tour?.reviewCount ??
      tour?.reviewsCount ??
      tour?._count?.reviews ??
      tour?.reviews?.length ??
      0,
  );
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getMatchPercent(tour) {
  const raw =
    tour?.recommendationScore ?? tour?.recommendation?.score ?? tour?.score;

  if (raw === undefined || raw === null || raw === "") return null;

  const numeric = Number(raw);
  if (Number.isNaN(numeric)) return null;

  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(60, Math.min(99, Math.round(normalized)));
}

const FALLBACK_TOUR_IMAGE =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#dbeafe"/>
          <stop offset="45%" stop-color="#f0f9ff"/>
          <stop offset="100%" stop-color="#dcfce7"/>
        </linearGradient>
      </defs>
      <rect width="900" height="600" fill="url(#g)"/>
      <circle cx="690" cy="150" r="72" fill="#facc15" opacity="0.85"/>
      <path d="M0 420 C160 360 280 470 430 405 C590 335 720 405 900 355 L900 600 L0 600 Z" fill="#2563eb" opacity="0.78"/>
      <path d="M0 485 C180 430 310 530 470 475 C620 425 760 480 900 440 L900 600 L0 600 Z" fill="#16a34a" opacity="0.55"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#0f172a">
        Travela Tour
      </text>
    </svg>
  `);

function buildImageCandidates(tour, rawCover) {
  const coverMedia =
    tour?.media?.find?.((item) => item?.isCover || item?.is_cover) ||
    tour?.media?.find?.(
      (item) => item?.displayOrder === 1 || item?.display_order === 1,
    ) ||
    tour?.media?.[0];

  const candidates = [
    rawCover,

    // Ưu tiên ảnh gốc / ảnh cover
    tour?.coverUrl,
    tour?.cover_url,
    tour?.mainImage,
    tour?.main_image,
    tour?.imageUrl,
    tour?.image_url,
    tour?.image,

    // Ưu tiên media gốc
    coverMedia?.fileUrl,
    coverMedia?.file_url,
    coverMedia?.imageUrl,
    coverMedia?.image_url,
    coverMedia?.url,
    coverMedia?.path,

    tour?.imageUrls?.[0],
    tour?.images?.[0]?.fileUrl,
    tour?.images?.[0]?.file_url,
    tour?.images?.[0]?.imageUrl,
    tour?.images?.[0]?.image_url,
    tour?.images?.[0]?.url,
    tour?.images?.[0]?.path,

    // Thumbnail để cuối cùng vì dễ bị mờ
    tour?.thumbnailUrl,
    tour?.thumbnail_url,

    tour?.destination?.coverImage,
    tour?.destination?.cover_image,
    tour?.destination?.imageUrl,
    tour?.destination?.image_url,
  ]
    .filter(Boolean)
    .map((item) => mapImageUrl(item, API_URL))
    .filter(Boolean);

  return [...new Set(candidates)];
}

export default function TourCard({
  tour,
  initialFavorite = false,
  onFavoriteChange,
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [favorite, setFavorite] = useState(Boolean(initialFavorite));

  useEffect(() => {
    setImageIndex(0);
  }, [tour?.id, tour?.coverUrl, tour?.imageUrl, tour?.media]);

  const rawCover = pickTourImage(tour);

  const imageCandidates = useMemo(
    () => buildImageCandidates(tour, rawCover),
    [tour, rawCover],
  );

  const cover = imageCandidates[imageIndex] || FALLBACK_TOUR_IMAGE;

  const firstDeparture = tour.nextDeparture || tour.departures?.[0];
  const currentUser = useMemo(() => getUser(), []);

  const bookingCount = Number(tour.bookingCount || tour._count?.bookings || 0);
  const favoriteCount = Number(
    tour.favoriteCount || tour._count?.favorites || 0,
  );
  const isBestSeller = Boolean(tour.dynamicIsBestSeller || bookingCount >= 5);
  const isPopularFavorite = Boolean(
    tour.dynamicIsFavorite || favoriteCount >= 5,
  );
  const matchPercent = getMatchPercent(tour);

  const price = tour.minPrice || tour.basePriceAdult || 0;
  const rating = getTourRating(tour);
  const reviewCount = getTourReviewCount(tour);

  const toggleFavorite = async (e) => {
    e.preventDefault();

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
      console.error("Lỗi khi thay đổi trạng thái yêu thích:", error);
    }
  };

  const styles = {
    card: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "#fff",
      borderRadius: "16px",
      overflow: "hidden",
      border: "1px solid #e2e8f0",
      boxShadow: isHovered
        ? "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
        : "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
      transform: isHovered ? "translateY(-4px)" : "none",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    },
    imageWrapper: {
      position: "relative",
      width: "100%",
      aspectRatio: "16 / 10",
      minHeight: "220px",
      overflow: "hidden",
      background: "#f1f5f9",
    },

    image: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center",
      display: "block",
      imageRendering: "auto",
      backfaceVisibility: "hidden",
      transform: isHovered ? "scale(1.03)" : "scale(1)",
      transition: "transform 0.5s ease",
    },
    overlayTop: {
      position: "absolute",
      top: "12px",
      left: "12px",
      right: "12px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      zIndex: 2,
    },
    badgeFeatured: {
      color: "#fff",
      padding: "6px 12px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 800,
      boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
    },
    favButton: {
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      background: "rgba(255,255,255,0.9)",
      border: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: favorite ? "#ef4444" : "#64748b",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      backdropFilter: "blur(4px)",
      transition: "all 0.2s",
      transform: isHovered ? "scale(1.05)" : "scale(1)",
    },
    body: {
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      flexGrow: 1,
      minWidth: 0,
    },
    location: {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      color: "#2563eb",
      fontSize: "13px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      marginBottom: "8px",
    },
    title: {
      margin: "0 0 12px",
      fontSize: "18px",
      fontWeight: 700,
      color: "#0f172a",
      lineHeight: 1.4,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
    },
    metaRow: {
      display: "flex",
      flexWrap: "wrap",
      gap: "12px",
      color: "#64748b",
      fontSize: "13px",
      marginBottom: "12px",
      fontWeight: 500,
    },
    metaItem: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
    },
    chipContainer: {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      marginBottom: "16px",
    },
    chip: {
      background: "#f1f5f9",
      color: "#475569",
      padding: "4px 10px",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
    },
    aiBox: {
      background: "linear-gradient(to right, #eff6ff, #f0fdfa)",
      border: "1px solid #bfdbfe",
      borderRadius: "12px",
      padding: "12px",
      marginBottom: "16px",
    },
    footer: {
      marginTop: "auto",
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      gap: "14px",
      alignItems: "end",
      paddingTop: "16px",
      borderTop: "1px solid #f1f5f9",
      minWidth: 0,
    },
    priceBlock: {
      minWidth: 0,
      overflow: "hidden",
    },
    priceLabel: {
      display: "block",
      fontSize: "12px",
      color: "#64748b",
      marginBottom: "3px",
      fontWeight: 600,
    },
    priceValue: {
      display: "block",
      fontSize: "18px",
      lineHeight: 1.15,
      color: "#ef4444",
      fontWeight: 900,
      letterSpacing: "-0.3px",
      whiteSpace: "normal",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
    },
    detailButton: {
      background: "#2563eb",
      color: "#fff",
      padding: "11px 16px",
      borderRadius: "12px",
      fontSize: "14px",
      fontWeight: 700,
      textDecoration: "none",
      transition: "background 0.2s",
      whiteSpace: "nowrap",
      flexShrink: 0,
      boxShadow: "0 8px 18px rgba(37, 99, 235, 0.22)",
    },
  };

  return (
    <article
      style={styles.card}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={styles.imageWrapper}>
        <Image
          key={`${tour?.id || tour?.slug || "tour"}-${imageIndex}`}
          src={cover}
          alt={tour.name || "Tour Travela"}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          quality={90}
          priority={false}
          unoptimized={cover.startsWith("data:image")}
          style={{
            objectFit: "cover",
            objectPosition: "center",
            transform: isHovered ? "scale(1.03)" : "scale(1)",
            transition: "transform 0.5s ease",
          }}
          onError={() => {
            if (imageIndex < imageCandidates.length - 1) {
              setImageIndex((prev) => prev + 1);
            }
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: "0 0 auto 0",
            height: "60px",
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.4), transparent)",
            zIndex: 1,
          }}
        />

        <div style={styles.overlayTop}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {isBestSeller ? (
              <span
                style={{
                  ...styles.badgeFeatured,
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                }}
                title={`${bookingCount} lượt đặt hợp lệ`}
              >
                🔥 Bán chạy
              </span>
            ) : tour.dynamicIsBestDeal ? (
              <span
                style={{
                  ...styles.badgeFeatured,
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                }}
              >
                ⭐ Giá tốt
              </span>
            ) : isPopularFavorite ? (
              <span
                style={{
                  ...styles.badgeFeatured,
                  background: "linear-gradient(135deg, #ec4899, #be185d)",
                }}
                title={`${favoriteCount} lượt yêu thích`}
              >
                💖 Yêu thích
              </span>
            ) : null}
          </div>

          <button
            type="button"
            aria-label="Yêu thích"
            onClick={toggleFavorite}
            style={styles.favButton}
          >
            <Heart
              size={18}
              fill={favorite ? "currentColor" : "none"}
              strokeWidth={favorite ? 0 : 2}
            />
          </button>
        </div>
      </div>

      <div style={styles.body}>
        <div style={styles.location}>
          <MapPin size={14} strokeWidth={2.5} />
          {tour.destination?.name || "Điểm đến hấp dẫn"}
        </div>

        <h3 style={styles.title} title={tour.name}>
          {tour.name}
        </h3>

        <div style={styles.metaRow}>
          <div style={styles.metaItem}>
            <Clock size={16} />
            <span>
              {tour.durationDays} ngày {tour.durationNights} đêm
            </span>
          </div>

          <div style={{ ...styles.metaItem, color: "#f59e0b" }}>
            <Star size={16} fill="currentColor" />
            <span style={{ color: "#64748b" }}>
              <strong style={{ color: "#1e293b" }}>
                {formatRating(rating)}
              </strong>{" "}
              ({reviewCount})
            </span>
          </div>
        </div>

        <div style={styles.chipContainer}>
          {tour.tourTheme && (
            <span style={styles.chip}>{mapLabel("theme", tour.tourTheme)}</span>
          )}

          <span style={styles.chip}>{tour.hotelStars || 4}★ Khách sạn</span>

          {firstDeparture && (
            <span style={styles.chip}>
              <Calendar size={12} />
              {formatDate(firstDeparture.departureDate)}
            </span>
          )}

          {bookingCount > 0 && (
            <span style={styles.chip} title="Tính từ số lượt đặt hợp lệ">
              <Flame size={12} />
              {bookingCount} lượt đặt
            </span>
          )}

          {matchPercent !== null && (
            <span
              style={{
                ...styles.chip,
                background: "#dcfce7",
                color: "#166534",
              }}
            >
              Phù hợp {matchPercent}%
            </span>
          )}
        </div>

        {Array.isArray(tour.recommendationReasons) &&
          tour.recommendationReasons.length > 0 && (
            <div style={styles.aiBox}>
              <strong
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  color: "#1d4ed8",
                  marginBottom: "8px",
                }}
              >
                <Sparkles size={14} /> Vì sao chọn tour này?
              </strong>

              <ul
                style={{
                  margin: 0,
                  paddingLeft: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {tour.recommendationReasons.slice(0, 2).map((reason, index) => (
                  <li
                    key={index}
                    style={{
                      fontSize: "12px",
                      color: "#334155",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "6px",
                      lineHeight: 1.4,
                    }}
                  >
                    <CheckCircle2
                      size={14}
                      color="#3b82f6"
                      style={{ flexShrink: 0, marginTop: "2px" }}
                    />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

        <div style={styles.footer}>
          <div style={styles.priceBlock}>
            <span style={styles.priceLabel}>Giá chỉ từ</span>
            <strong style={styles.priceValue}>{formatCurrency(price)}</strong>
          </div>

          <Link
            href={`/tour/${tour.slug}`}
            style={styles.detailButton}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#1d4ed8")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#2563eb")}
          >
            Xem chi tiết
          </Link>
        </div>
      </div>
    </article>
  );
}
