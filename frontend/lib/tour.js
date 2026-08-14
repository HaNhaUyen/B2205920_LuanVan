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
  const ratingOptions = [1, 2, 3, 4, 5].map((value) => ({
    value: String(value),
    label: `Từ ${value}★ đánh giá`,
  }));

  const sortOptions = [
    { value: "recommended", label: "Gợi ý phù hợp nhất" },
    { value: "popular_desc", label: "Bán chạy nhất" },
    { value: "favorite_desc", label: "Được yêu thích nhất" },
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

function cleanFilterValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw ?? "").trim();
  const normalized = text.toLowerCase();

  if (
    !text ||
    normalized === "all" ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return "";
  }

  return text;
}

function getComparableText(...parts) {
  return normalizeSearchText(parts.filter(Boolean).join(" "));
}

function getTourPickupPoints(tour = {}) {
  const items = [
    ...(Array.isArray(tour.pickupPoints) ? tour.pickupPoints : []),
    ...(Array.isArray(tour.departures)
      ? tour.departures.flatMap((dep) => dep?.pickupPoints || [])
      : []),
  ];

  const map = new Map();

  items.forEach((point) => {
    if (!point) return;
    const key = [
      point.id,
      point.province,
      point.name,
      point.address,
      point.pickupTime,
    ]
      .filter(Boolean)
      .join("|");

    if (key && !map.has(key)) map.set(key, point);
  });

  return Array.from(map.values());
}

export function getPickupLocationOptions(tours = []) {
  const map = new Map();

  tours.forEach((tour) => {
    getTourPickupPoints(tour).forEach((point) => {
      const province = String(point?.province || "").trim();
      if (!province) return;
      const normalized = normalizeSearchText(province);
      if (!normalized || map.has(normalized)) return;

      map.set(normalized, {
        value: province,
        label: province,
      });
    });
  });

  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "vi"),
  );
}

const SEARCH_STOP_WORDS = new Set([
  "tour",
  "du lich",
  "chuyen di",
  "hanh trinh",
  "chuong trinh",
  "goi",
  "goi tour",
  "tim",
  "kiem",
  "tim kiem",
  "cho",
  "danh cho",
  "phu hop",
  "muon",
  "can",
  "toi",
  "minh",
  "co",
  "di",
]);

// Mỗi khóa là một ý định; người dùng chỉ cần nhập một cách diễn đạt trong nhóm.
const SEARCH_SYNONYM_GROUPS = {
  "gia dinh": [
    "gia dinh",
    "family",
    "tre em",
    "con nho",
    "bo me",
    "cha me",
    "nguoi than",
  ],
  "cap doi": [
    "cap doi",
    "couple",
    "tinh nhan",
    "hai nguoi",
    "trang mat",
    "lang man",
  ],
  "nghi duong": [
    "nghi duong",
    "resort",
    "thu gian",
    "cao cap",
    "sang trong",
    "chill",
  ],
  bien: ["bien", "tam bien", "dao", "hai dao", "ven bien", "bien dao"],
  nui: ["nui", "cao nguyen", "leo nui", "san may", "trekking", "rung"],
  "phieu luu": ["phieu luu", "mao hiem", "kham pha", "trekking", "trai nghiem"],
  "van hoa": ["van hoa", "lich su", "di san", "bao tang", "pho co"],
  "tam linh": ["tam linh", "hanh huong", "chua", "den", "mien"],
  "am thuc": ["am thuc", "mon an", "dac san", "food", "an uong"],
  "sinh thai": ["sinh thai", "mien tay", "song nuoc", "vuon", "thien nhien"],
  teambuilding: [
    "teambuilding",
    "team building",
    "tap the",
    "cong ty",
    "doan",
    "nhom",
  ],
  "cuoi tuan": ["cuoi tuan", "ngan ngay", "2 ngay 1 dem", "3 ngay 2 dem"],
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
}

function removeSearchNoise(value) {
  let result = ` ${normalizeSearchText(value)} `;

  [...SEARCH_STOP_WORDS]
    .sort((a, b) => b.length - a.length)
    .forEach((word) => {
      result = result.replace(
        new RegExp(
          `(^|\\\\s)${escapeRegExp(word).replace(/\\\\ /g, "\\\\s+")}(?=\\\\s|$)`,
          "g",
        ),
        " ",
      );
    });

  return result.replace(/\\s+/g, " ").trim();
}

function getTourSearchText(tour = {}) {
  const destinations = Array.isArray(tour.destinations)
    ? tour.destinations
        .map((item) =>
          typeof item === "string"
            ? item
            : [item?.name, item?.province, item?.title, item?.description]
                .filter(Boolean)
                .join(" "),
        )
        .join(" ")
    : "";

  const pickupPoints = [
    ...(Array.isArray(tour.pickupPoints) ? tour.pickupPoints : []),
    ...(Array.isArray(tour.departures)
      ? tour.departures.flatMap((departure) => departure?.pickupPoints || [])
      : []),
  ]
    .map((item) =>
      typeof item === "string"
        ? item
        : [item?.name, item?.province, item?.address].filter(Boolean).join(" "),
    )
    .join(" ");

  const itinerary = Array.isArray(tour.itinerary)
    ? tour.itinerary
        .map((item) =>
          typeof item === "string"
            ? item
            : [item?.title, item?.description, item?.content, item?.destination]
                .filter(Boolean)
                .join(" "),
        )
        .join(" ")
    : "";

  return normalizeSearchText(
    [
      tour.code,
      tour.name,
      tour.title,
      tour.slug,
      tour.shortDescription,
      tour.fullDescription,
      tour.description,
      tour.summary,
      tour.tourTheme,
      tour.theme,
      tour.tourType,
      tour.type,
      tour.category,
      tour.destination?.name,
      tour.destination?.province,
      tour.destination?.description,
      tour.departureProvince,
      tour.transportation,
      tour.accommodation,
      tour.hotelName,
      tour.durationDays ? `${tour.durationDays} ngay` : "",
      tour.durationNights ? `${tour.durationNights} dem` : "",
      destinations,
      pickupPoints,
      itinerary,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = old;
    }
  }

  return previous[b.length];
}

function textContainsTerm(searchText, term) {
  if (!term) return true;
  if (searchText.includes(term)) return true;

  // Cho phép sai một ký tự với từ đủ dài, ví dụ "dalat" / "dalta".
  if (!term.includes(" ") && term.length >= 5) {
    return searchText
      .split(" ")
      .some(
        (word) =>
          Math.abs(word.length - term.length) <= 1 &&
          levenshteinDistance(word, term) <= 1,
      );
  }

  return false;
}

function buildKeywordGroups(rawKeyword) {
  const cleaned = removeSearchNoise(rawKeyword);
  if (!cleaned) return [];

  const groups = [];
  let remaining = ` ${cleaned} `;

  Object.values(SEARCH_SYNONYM_GROUPS).forEach((synonyms) => {
    const normalizedSynonyms = synonyms.map(normalizeSearchText);
    const matched = normalizedSynonyms.some((synonym) =>
      remaining.includes(` ${synonym} `),
    );

    if (matched) {
      groups.push([...new Set(normalizedSynonyms)]);
      normalizedSynonyms
        .sort((a, b) => b.length - a.length)
        .forEach((synonym) => {
          remaining = remaining.replace(
            new RegExp(
              `(^|\\\\s)${escapeRegExp(synonym).replace(/\\\\ /g, "\\\\s+")}(?=\\\\s|$)`,
              "g",
            ),
            " ",
          );
        });
    }
  });

  remaining
    .replace(/\\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token))
    .forEach((token) => groups.push([token]));

  return groups;
}

function matchesFlexibleKeyword(tour, rawKeyword) {
  const groups = buildKeywordGroups(rawKeyword);
  if (!groups.length) return true;

  const searchText = getTourSearchText(tour);

  // AND giữa các ý định, OR giữa các từ đồng nghĩa trong cùng một ý định.
  return groups.every((group) =>
    group.some((term) => textContainsTerm(searchText, term)),
  );
}

export const TOUR_LABEL_THRESHOLDS = {
  bestSellerBookings: 5,
  favoriteCount: 5,
};

export function getTourBookingCount(tour = {}) {
  return toNumber(tour.bookingCount ?? tour._count?.bookings ?? 0);
}

export function getTourFavoriteCount(tour = {}) {
  return toNumber(tour.favoriteCount ?? tour._count?.favorites ?? 0);
}

export function isDynamicBestSeller(tour) {
  return Boolean(
    tour.dynamicIsBestSeller ||
    getTourBookingCount(tour) >= TOUR_LABEL_THRESHOLDS.bestSellerBookings,
  );
}

export function isDynamicFavorite(tour) {
  return Boolean(
    tour.dynamicIsFavorite ||
    getTourFavoriteCount(tour) >= TOUR_LABEL_THRESHOLDS.favoriteCount,
  );
}

export function buildTourBadges(tour = {}) {
  return [
    isDynamicBestSeller(tour)
      ? {
          key: "bestSeller",
          label: "B\u00e1n ch\u1ea1y",
          title: `${getTourBookingCount(tour)} l\u01b0\u1ee3t \u0111\u1eb7t h\u1ee3p l\u1ec7`,
          priority: 1,
        }
      : null,
    isDynamicFavorite(tour)
      ? {
          key: "favorite",
          label: "\u0110\u01b0\u1ee3c y\u00eau th\u00edch",
          title: `${getTourFavoriteCount(tour)} l\u01b0\u1ee3t y\u00eau th\u00edch`,
          priority: 2,
        }
      : null,
  ]
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority);
}

function recommendedScore(tour) {
  const bookingCount = getTourBookingCount(tour);
  const favoriteCount = getTourFavoriteCount(tour);
  const bestSellerScore = isDynamicBestSeller(tour) ? 4 : 0;
  const favoriteScore = isDynamicFavorite(tour) ? 2 : 0;

  return [
    bestSellerScore,
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
            item?.destination ||
              item?.destination_name ||
              item?.name ||
              item?.label ||
              "",
          ).trim(),
          confidence: (() => {
            const raw = Number(
              item?.confidence ||
                item?.score ||
                Number(item?.confidence_percent || 0) / 100 ||
                0,
            );
            return raw > 1 ? raw / 100 : raw;
          })(),
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

  return Array.from(map.values())
    .sort((a, b) => b.confidence - a.confidence || a.rank - b.rank)
    .slice(0, 3);
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
    return getTourBookingCount(b) - getTourBookingCount(a);
  if (sort === "favorite_desc")
    return getTourFavoriteCount(b) - getTourFavoriteCount(a);
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

function parseNonNegativeIntegerFilter(value) {
  const cleaned = cleanFilterValue(value);
  if (!cleaned) return 0;

  const numeric = Number(cleaned);
  if (!Number.isInteger(numeric) || numeric < 0) return 0;

  return numeric;
}

export function filterTours(tours = [], query = {}) {
  const rawKeyword = cleanFilterValue(query.search);
  const destination = cleanFilterValue(
    query.destinationId || query.destination || "",
  );
  const imageScores = parseImageDestinationScores(query);
  const normalizedImageDestinations = imageScores.map(
    (item) => item.normalized,
  );
  const province = cleanFilterValue(query.province);
  const departureProvince = cleanFilterValue(
    query.departureProvince ||
      query.departureLocation ||
      query.pickupLocation ||
      "",
  );
  const theme = cleanFilterValue(query.theme);
  const type = cleanFilterValue(query.type || query.tourType || "");
  const month = toNumber(cleanFilterValue(query.month || query.departureMonth));
  const minPrice = parseNonNegativeIntegerFilter(query.minPrice);
  const maxPrice = parseNonNegativeIntegerFilter(query.maxPrice);
  const durationMax = parseNonNegativeIntegerFilter(
    query.durationMax || query.durationDays,
  );
  const minRating = parseNonNegativeIntegerFilter(
    query.minRating || query.hotelStars,
  );
  const featured =
    query.featured === "1" || query.featured === 1 || query.featured === true;
  const favorite =
    query.favorite === "1" || query.favorite === 1 || query.favorite === true;
  const sort = query.sort || "recommended";

  const filtered = tours
    .map((tour) => ({
      tour,
      imageMatch: getImageMatchForTour(tour, imageScores),
    }))
    .filter(({ tour, imageMatch }) => {
      const matchesKeyword =
        !rawKeyword || matchesFlexibleKeyword(tour, rawKeyword);

      const destinationText = getComparableText(
        tour.destinationId,
        tour.destination?.id,
        tour.destination?.name,
        tour.destination?.slug,
      );
      const normalizedDestination = normalizeSearchText(destination);
      const matchesImageDestination = normalizedImageDestinations.length
        ? Boolean(imageMatch)
        : true;
      const matchesDestination = normalizedImageDestinations.length
        ? matchesImageDestination
        : !destination || destinationText.includes(normalizedDestination);
      const matchesProvince =
        !province ||
        getComparableText(tour.destination?.province).includes(
          normalizeSearchText(province),
        );
      const normalizedDepartureProvince =
        normalizeSearchText(departureProvince);
      const pickupPoints = getTourPickupPoints(tour);
      const matchesDepartureProvince =
        !departureProvince ||
        pickupPoints.some((point) => {
          const pickupText = getComparableText(
            point?.id,
            point?.province,
            point?.name,
            point?.address,
          );
          return pickupText.includes(normalizedDepartureProvince);
        });
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
        !durationMax || toNumber(tour.durationDays) === durationMax;
      const matchesRating =
        !minRating || toNumber(tour.rating || 0) >= minRating;
      const matchesFeatured = !featured || isDynamicBestSeller(tour);
      const matchesFavorite = !favorite || isDynamicFavorite(tour);
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
        matchesFavorite,
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
    .map((item) => ({
      ...item.tour,
      _imageMatchConfidence: imageScores.length
        ? Number(item.imageMatch?.confidence || 0)
        : null,
      _imageMatchDestination: imageScores.length
        ? item.imageMatch?.name || ""
        : "",
      _imageMatchRank: imageScores.length
        ? Number(item.imageMatch?.rank ?? 9999) + 1
        : null,
    }));
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
