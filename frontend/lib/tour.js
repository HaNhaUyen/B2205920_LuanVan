import { formatCurrency, toNumber } from "./format";

export function mapImageUrl(value, apiUrl) {
  if (!value) return "";

  const raw = String(value).trim();

  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const base = String(
    apiUrl || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api",
  )
    .replace(/\/$/, "")
    .replace(/\/api$/, "");

  const cleanPath = raw.startsWith("/") ? raw : `/${raw}`;

  return `${base}${cleanPath}`;
}

export function pickTourImage(tour = {}) {
  const media = Array.isArray(tour.media) ? tour.media : [];
  const imageUrls = Array.isArray(tour.imageUrls) ? tour.imageUrls : [];
  const images = Array.isArray(tour.images) ? tour.images : [];

  const coverMedia =
    media.find((item) => item?.isCover || item?.is_cover) ||
    media.find(
      (item) => item?.displayOrder === 1 || item?.display_order === 1,
    ) ||
    media[0] ||
    null;

  return (
    tour.coverUrl ||
    tour.cover_url ||
    tour.thumbnailUrl ||
    tour.thumbnail_url ||
    tour.imageUrl ||
    tour.image_url ||
    tour.mainImage ||
    tour.main_image ||
    tour.image ||
    coverMedia?.fileUrl ||
    coverMedia?.file_url ||
    coverMedia?.imageUrl ||
    coverMedia?.image_url ||
    coverMedia?.url ||
    coverMedia?.path ||
    imageUrls[0] ||
    images[0]?.fileUrl ||
    images[0]?.file_url ||
    images[0]?.imageUrl ||
    images[0]?.image_url ||
    images[0]?.url ||
    images[0]?.path ||
    tour.destination?.coverImage ||
    tour.destination?.cover_image ||
    tour.destination?.imageUrl ||
    tour.destination?.image_url ||
    ""
  );
}

export function normalizeTour(tour = {}) {
  const reviews = tour.reviews || [];

  const rating = reviews.length
    ? reviews.reduce((sum, item) => sum + toNumber(item.rating || 0), 0) /
      reviews.length
    : 4.8;

const departures = (tour.departures || []).map((item) => {
  const totalSlots = toNumber(item.totalSlots ?? item.total_slots ?? 0);
  const bookedSlots = toNumber(item.bookedSlots ?? item.booked_slots ?? 0);
  const heldSlots = toNumber(item.heldSlots ?? item.held_slots ?? 0);
  const remainingSlots = Math.max(0, totalSlots - bookedSlots - heldSlots);

  return {
    ...item,
    totalSlots,
    bookedSlots,
    heldSlots,
    remainingSlots,
  };
});

const nextDeparture =
  tour.nextDeparture ||
  departures.find(
    (item) => String(item.status || "").toLowerCase() === "open",
  ) ||
  departures[0] ||
  null;

const remainingSlots = nextDeparture
  ? nextDeparture.remainingSlots
  : Math.max(
      0,
      toNumber(tour.totalSlots ?? tour.total_slots ?? 0) -
        toNumber(tour.bookedSlots ?? tour.booked_slots ?? 0) -
        toNumber(tour.heldSlots ?? tour.held_slots ?? 0),
    );

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
    departures,
    nextDeparture,
    remainingSlots,
    totalSlots:
      nextDeparture?.totalSlots ??
      toNumber(tour.totalSlots ?? tour.total_slots ?? 0),
    bookedSlots:
      nextDeparture?.bookedSlots ??
      toNumber(tour.bookedSlots ?? tour.booked_slots ?? 0),
    heldSlots:
      nextDeparture?.heldSlots ??
      toNumber(tour.heldSlots ?? tour.held_slots ?? 0),
  };
}

export function departureAvailability(item = {}) {
  const totalSlots = toNumber(item.totalSlots ?? item.total_slots ?? 0);
  const bookedSlots = toNumber(item.bookedSlots ?? item.booked_slots ?? 0);
  const heldSlots = toNumber(item.heldSlots ?? item.held_slots ?? 0);

  return Math.max(0, totalSlots - bookedSlots - heldSlots);
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
    { value: "popular_desc", label: "Bán chạy nhất" },
    { value: "favorite_desc", label: "Được yêu thích nhất" },
    { value: "best_deal_desc", label: "Giá tốt nhất" },
    { value: "remaining_asc", label: "Sắp hết chỗ" },
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
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDynamicBestSeller(tour) {
  return Boolean(
    tour.dynamicIsBestSeller ||
    Number(tour.bookingCount || tour._count?.bookings || 0) >= 5,
  );
}

function isDynamicFavorite(tour) {
  return Boolean(
    tour.dynamicIsFavorite ||
    Number(tour.favoriteCount || tour._count?.favorites || 0) >= 5,
  );
}

function isDynamicBestDeal(tour) {
  return Boolean(tour.dynamicIsBestDeal);
}

function recommendedScore(tour) {
  const bookingCount = toNumber(
    tour.bookingCount || tour._count?.bookings || 0,
  );
  const favoriteCount = toNumber(
    tour.favoriteCount || tour._count?.favorites || 0,
  );
  const bestSellerScore = isDynamicBestSeller(tour) ? 4 : 0;
  const bestDealScore = isDynamicBestDeal(tour) ? 3 : 0;
  const favoriteScore = isDynamicFavorite(tour) ? 2 : 0;

  return [
    bestSellerScore,
    bestDealScore,
    favoriteScore,
    toNumber(tour.rating || 0),
    bookingCount / 10,
    favoriteCount / 20,
    -toNumber(tour.minPrice || 0) / 10000000,
  ].reduce((sum, value) => sum + value, 0);
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    try {
      return JSON.parse(decodeURIComponent(String(value)));
    } catch {
      return fallback;
    }
  }
}

function parseImageDestinationScores(query = {}) {
  const rawNames = String(query.imageDestinations || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  const rawScores = safeJsonParse(query.imageDestinationScores, []);
  const fromScores = Array.isArray(rawScores)
    ? rawScores
        .map((item) => ({
          name: String(
            item?.destination || item?.name || item?.label || "",
          ).trim(),
          confidence: Number(item?.confidence || item?.score || 0),
        }))
        .filter((item) => item.name)
    : [];

  const source = fromScores.length
    ? fromScores
    : rawNames.map((name, index) => ({
        name,
        confidence: Math.max(0, 1 - index * 0.01),
      }));

  const map = new Map();
  source.forEach((item, index) => {
    const normalized = normalizeSearchText(item.name);
    if (!normalized) return;
    const old = map.get(normalized);
    const confidence = Number.isFinite(item.confidence)
      ? Number(item.confidence)
      : 0;
    if (!old || confidence > old.confidence) {
      map.set(normalized, {
        name: item.name,
        normalized,
        confidence,
        rank: index,
      });
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => b.confidence - a.confidence || a.rank - b.rank,
  );
}

function getTourDestinationText(tour = {}) {
  return [
    tour.destination?.name,
    tour.destination?.province,
    tour.name,
    tour.slug,
    tour.shortDescription,
    tour.fullDescription,
  ]
    .filter(Boolean)
    .map(normalizeSearchText)
    .join(" ");
}

function getImageMatchForTour(tour = {}, imageScores = []) {
  if (!imageScores.length) return null;

  const destinationName = normalizeSearchText(tour.destination?.name || "");
  const provinceName = normalizeSearchText(tour.destination?.province || "");
  const searchableText = getTourDestinationText(tour);

  for (const item of imageScores) {
    const target = item.normalized;
    if (!target) continue;

    const exactDestination = destinationName === target;
    const exactProvince = provinceName === target;
    const fuzzyDestination =
      destinationName.includes(target) || target.includes(destinationName);
    const fuzzyProvince =
      provinceName.includes(target) || target.includes(provinceName);
    const fuzzyText = searchableText.includes(target);

    if (
      exactDestination ||
      exactProvince ||
      fuzzyDestination ||
      fuzzyProvince ||
      fuzzyText
    ) {
      return item;
    }
  }

  return null;
}

function sortByNormalRule(a, b, sort) {
  if (sort === "popular_desc")
    return (
      toNumber(b.bookingCount || b._count?.bookings || 0) -
      toNumber(a.bookingCount || a._count?.bookings || 0)
    );
  if (sort === "favorite_desc")
    return (
      toNumber(b.favoriteCount || b._count?.favorites || 0) -
      toNumber(a.favoriteCount || a._count?.favorites || 0)
    );
  if (sort === "best_deal_desc")
    return (
      Number(isDynamicBestDeal(b)) - Number(isDynamicBestDeal(a)) ||
      recommendedScore(b) - recommendedScore(a)
    );
  if (sort === "remaining_asc")
    return (
      toNumber(a.remainingSlots ?? 999999) -
      toNumber(b.remainingSlots ?? 999999)
    );
  if (sort === "price_asc") return toNumber(a.minPrice) - toNumber(b.minPrice);
  if (sort === "price_desc") return toNumber(b.minPrice) - toNumber(a.minPrice);
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
}

export function filterTours(tours = [], query = {}) {
  const keyword = normalizeSearchText(query.search || "");
  const destination = query.destination || "";
  const imageScores = parseImageDestinationScores(query);
  const normalizedImageDestinations = imageScores.map(
    (item) => item.normalized,
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

  const filtered = tours
    .map((tour) => ({
      tour,
      imageMatch: getImageMatchForTour(tour, imageScores),
    }))
    .filter(({ tour, imageMatch }) => {
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
      const matchesImageDestination = normalizedImageDestinations.length
        ? Boolean(imageMatch)
        : true;
      const matchesDestination = normalizedImageDestinations.length
        ? matchesImageDestination
        : !destination || tourDestinationName === destination;
      const matchesProvince =
        !province || tour.destination?.province === province;
      const normalizedDepartureProvince =
        normalizeSearchText(departureProvince);
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
      const matchesRating =
        !minRating || toNumber(tour.rating || 0) >= minRating;
      const matchesFeatured = !featured || isDynamicBestSeller(tour);
      const matchesBestDeal = !bestDeal || isDynamicBestDeal(tour);

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

  return filtered
    .sort((a, b) => {
      // Khi tìm bằng ảnh, luôn ưu tiên nhóm địa điểm có % cao hơn trước.
      // Ví dụ AI trả: Tây Ninh 43%, Cần Thơ 9%, An Giang 8%
      // thì tour Tây Ninh lên trước, rồi mới tới Cần Thơ, An Giang.
      if (imageScores.length) {
        const imageDiff =
          Number(b.imageMatch?.confidence || 0) -
          Number(a.imageMatch?.confidence || 0);
        if (Math.abs(imageDiff) > 0.000001) return imageDiff;

        const rankDiff =
          Number(a.imageMatch?.rank ?? 9999) -
          Number(b.imageMatch?.rank ?? 9999);
        if (rankDiff) return rankDiff;
      }

      return sortByNormalRule(a.tour, b.tour, sort);
    })
    .map((item) => item.tour);
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
