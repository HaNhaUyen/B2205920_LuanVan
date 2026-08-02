export function toNumber(value) {
  if (value == null || value === "") return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof value === "object") {
    if (typeof value.toNumber === "function") {
      const parsed = Number(value.toNumber());
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (typeof value.toString === "function") {
      const parsed = Number(value.toString());

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    if ("value" in value) {
      return toNumber(value.value);
    }
  }

  const fallback = Number(value);

  return Number.isFinite(fallback) ? fallback : 0;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(toNumber(value));
}

export function formatNumber(value) {
  return new Intl.NumberFormat("vi-VN").format(toNumber(value));
}

function parseLocalDateTime(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();

  /*
   * MySQL DATETIME của hệ thống lưu theo giờ Việt Nam.
   * Nếu Prisma thêm hậu tố Z, bỏ Z để tránh trình duyệt cộng thêm 7 giờ.
   */
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(
    text,
  )
    ? text.slice(0, -1)
    : text;

  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  if (!value) return "--";

  /*
   * Trường chỉ có ngày, ví dụ 2026-08-03,
   * được tách thủ công để không bị lệch ngày theo múi giờ.
   */
  const text = String(value);
  const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}/${month}/${year}`;
  }

  const date = parseLocalDateTime(value);

  if (!date) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateTime(value) {
  const date = parseLocalDateTime(value);

  if (!date) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function renderStars(value) {
  const rounded = Math.round(toNumber(value));

  return Array.from({ length: 5 }, (_, index) =>
    index < rounded ? "★" : "☆",
  ).join("");
}

export function slugify(text = "") {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
