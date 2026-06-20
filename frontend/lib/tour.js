import { formatCurrency, toNumber } from "./format";

export function mapImageUrl(url, apiBase) {
  if (!url) return "";

  const value = String(url).trim();
  if (!value) return "";

  if (/^data:image\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;

  const cleanBase = String(apiBase || "")
    .replace(/\/api\/?$/, "")
    .replace(/\/$/, "");

  const path = value.startsWith("/") ? value : `/${value}`;

  if (path.startsWith("/uploads")) {
    return cleanBase ? `${cleanBase}${path}` : path;
  }

  if (path.startsWith("/images")) return path;

  return cleanBase ? `${cleanBase}${path}` : path;
}

export function pickTourImage(tour = {}) {
  const media = Array.isArray(tour.media) ? tour.media : [];
  const imageUrls = Array.isArray(tour.imageUrls) ? tour.imageUrls : [];
  const images = Array.isArray(tour.images) ? tour.images : [];

  const coverMedia =
    media.find((item) => item?.isCover || item?.is_cover) || media[0] || null;

  return (
    tour.coverUrl ||
    tour.thumbnailUrl ||
    tour.imageUrl ||
    coverMedia?.fileUrl ||
    coverMedia?.file_url ||
    coverMedia?.url ||
    imageUrls[0] ||
    images[0]?.fileUrl ||
    images[0]?.file_url ||
    images[0]?.imageUrl ||
    images[0]?.image_url ||
    images[0]?.url ||
    tour.destination?.coverImage ||
    tour.destination?.cover_image ||
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=90"
  );
}

export function normalizeTour(tour = {}) {
  const reviews = tour.reviews || [];

  const rating = reviews.length
    ? reviews.reduce((sum, item) => sum + toNumber(item.rating || 0), 0) /
      reviews.length
    : 4.8;

  const departures = Array.isArray(tour.departures) ? tour.departures : [];

  const departurePrices = departures
    .map((item) => toNumber(item.adultPrice || 0))
    .filter((price) => price > 0);

  const basePrice = toNumber(
    tour.basePriceAdult ??
      tour.base_price_adult ??
      tour.priceAdult ??
      tour.price_adult ??
      tour.adultPrice ??
      tour.price ??
      0,
  );

  const minPrice = departurePrices.length
    ? Math.min(...departurePrices)
    : basePrice;

  return {
    ...tour,
    coverUrl: pickTourImage(tour),
    rating,
    reviewCount: reviews.length,
    basePriceAdult: basePrice,
    priceAdult: basePrice,
    adultPrice: basePrice,
    price: minPrice,
    minPrice,
  };
}

export function departureAvailability(item = {}) {
  return (
    toNumber(item.totalSlots || 0) -
    toNumber(item.bookedSlots || 0) -
    toNumber(item.heldSlots || 0)
  );
}

export function createPseudoQrMarkup(text) {
  const size = 25;
  let seed = 0;
  for (const char of text)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;

  const cell = 8;
  const width = size * cell;

  const finder = (x, y) => `
    <rect x="${x * cell}" y="${y * cell}" width="${7 * cell}" height="${7 * cell}" rx="4" fill="#0f172a"/>
    <rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${5 * cell}" height="${5 * cell}" rx="2" fill="#ffffff"/>
    <rect x="${(x + 2) * cell}" y="${(y + 2) * cell}" width="${3 * cell}" height="${3 * cell}" rx="1" fill="#0f172a"/>
  `;

  const isFinder = (x, y) =>
    (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
  const rects = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (isFinder(x, y)) continue;
      seed = (Math.imul(seed ^ (x + 31 * y + 17), 1103515245) + 12345) >>> 0;
      if (seed % 2 === 0) {
        rects.push(
          `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="#0f172a" rx="2" ry="2"/>`,
        );
      }
    }
  }

  return `
    <svg viewBox="0 0 ${width} ${width}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mã QR Thanh Toán" style="width: 100%; height: auto; display: block;">
      <rect width="${width}" height="${width}" rx="12" fill="#ffffff"/>
      ${finder(0, 0)}
      ${finder(size - 7, 0)}
      ${finder(0, size - 7)}
      ${rects.join("")}
    </svg>
  `;
}

export function getTourFilterOptions(destinations = []) {
  const provinces = [
    ...new Set(destinations.map((item) => item.province).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "vi"));
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: `Tháng ${index + 1}`,
  }));
  const ratingOptions = [3, 4, 4.5].map((value) => ({
    value: String(value),
    label: `Từ ${value}★ đánh giá`,
  }));

  const sortOptions = [
    { value: "recommended", label: "Gợi ý phù hợp nhất" },
    { value: "price_asc", label: "Giá: Thấp đến cao" },
    { value: "price_desc", label: "Giá: Cao đến thấp" },
    { value: "rating_desc", label: "Đánh giá cao nhất" },
    { value: "departure_asc", label: "Khởi hành gần nhất" },
    { value: "duration_asc", label: "Thời lượng ngắn nhất" },
  ];

  return { provinces, months, ratingOptions, sortOptions };
}

export function normalizeSearchText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function recommendedScore(tour) {
  return [
    Number(Boolean(tour.isTrending)) * 4,
    Number(Boolean(tour.isBestDeal)) * 3,
    toNumber(tour.rating || 0),
    -toNumber(tour.minPrice || 0) / 10000000,
  ].reduce((sum, value) => sum + value, 0);
}

export function filterTours(tours = [], query = {}) {
  const keyword = normalizeSearchText(query.search || "");
  const destination = query.destination || "";
  const imageDestinations = String(query.imageDestinations || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  const normalizedImageDestinations = imageDestinations.map((item) =>
    normalizeSearchText(item),
  );
  const province = query.province || "";
  const departureProvince = query.departureProvince || "";
  const theme = query.theme || "";
  const type = query.type || "";
  const month = toNumber(query.month || 0);
  const minPrice = toNumber(query.minPrice || 0);
  const maxPrice = toNumber(query.maxPrice || 0);
  const durationMax = toNumber(query.durationMax || 0);
  const minRating = toNumber(query.minRating || query.hotelStars || 0);
  const featured =
    query.featured === "1" || query.featured === 1 || query.featured === true;
  const bestDeal =
    query.bestDeal === "1" || query.bestDeal === 1 || query.bestDeal === true;
  const sort = query.sort || "recommended";

  const filtered = tours.filter((tour) => {
    const matchesKeyword =
      !keyword ||
      normalizeSearchText(
        [
          tour.code,
          tour.name,
          tour.slug,
          tour.shortDescription,
          tour.fullDescription,
          tour.destination?.name,
          tour.destination?.province,
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(keyword);
    const tourDestinationName = tour.destination?.name || "";
    const matchesDestination = normalizedImageDestinations.length
      ? normalizedImageDestinations.includes(
          normalizeSearchText(tourDestinationName),
        )
      : !destination || tourDestinationName === destination;
    const matchesProvince =
      !province || tour.destination?.province === province;
    const normalizedDepartureProvince = normalizeSearchText(departureProvince);
    const pickupPoints = [
      ...(Array.isArray(tour.pickupPoints) ? tour.pickupPoints : []),
      ...(Array.isArray(tour.departures)
        ? tour.departures.flatMap((dep) => dep.pickupPoints || [])
        : []),
    ];
    const matchesDepartureProvince =
      !departureProvince ||
      pickupPoints.some((point) =>
        normalizeSearchText(point?.province || "").includes(
          normalizedDepartureProvince,
        ),
      );
    const matchesTheme = !theme || tour.tourTheme === theme;
    const matchesType = !type || tour.tourType === type;
    const matchesMonth =
      !month ||
      (tour.departures || []).some(
        (item) => new Date(item.departureDate).getMonth() + 1 === month,
      );
    const matchesMinPrice = !minPrice || toNumber(tour.minPrice) >= minPrice;
    const matchesMaxPrice = !maxPrice || toNumber(tour.minPrice) <= maxPrice;
    const matchesDuration =
      !durationMax || toNumber(tour.durationDays) <= durationMax;
    const matchesRating = !minRating || toNumber(tour.rating || 0) >= minRating;
    const matchesFeatured = !featured || Boolean(tour.isTrending);
    const matchesBestDeal = !bestDeal || Boolean(tour.isBestDeal);

    return [
      matchesKeyword,
      matchesDestination,
      matchesProvince,
      matchesDepartureProvince,
      matchesTheme,
      matchesType,
      matchesMonth,
      matchesMinPrice,
      matchesMaxPrice,
      matchesDuration,
      matchesRating,
      matchesFeatured,
      matchesBestDeal,
    ].every(Boolean);
  });

  return [...filtered].sort((a, b) => {
    if (sort === "price_asc")
      return toNumber(a.minPrice) - toNumber(b.minPrice);
    if (sort === "price_desc")
      return toNumber(b.minPrice) - toNumber(a.minPrice);
    if (sort === "rating_desc") return toNumber(b.rating) - toNumber(a.rating);
    if (sort === "duration_asc")
      return toNumber(a.durationDays) - toNumber(b.durationDays);
    if (sort === "departure_asc") {
      const aDate = a.departures?.[0]
        ? new Date(a.departures[0].departureDate).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bDate = b.departures?.[0]
        ? new Date(b.departures[0].departureDate).getTime()
        : Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    }
    return recommendedScore(b) - recommendedScore(a);
  });
}

export function renderDeparturePreview(
  tour,
  departureId,
  adultCount = 2,
  childCount = 0,
) {
  const departure =
    (tour.departures || []).find(
      (item) => String(item.id) === String(departureId),
    ) || tour.departures?.[0];

  if (!departure) {
    return { available: 0, total: 0, departure: null, rows: [] };
  }

  const available = departureAvailability(departure);
  const total =
    toNumber(departure.adultPrice || 0) * toNumber(adultCount || 0) +
    toNumber(departure.childPrice || 0) * toNumber(childCount || 0);

  return {
    available,
    total,
    departure,
    rows: [
      ["Ngày đi", departure.departureDate],
      ["Ngày về", departure.endDate],
      ["Giá người lớn", formatCurrency(departure.adultPrice)],
      ["Giá trẻ em", formatCurrency(departure.childPrice)],
      ["Còn trống", `${available} chỗ`],
    ],
  };
}
