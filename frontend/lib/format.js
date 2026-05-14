export function toNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
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
      const text = value.toString();
      const parsed = Number(text);
      if (Number.isFinite(parsed)) return parsed;
    }
    if ("value" in value) return toNumber(value.value);
  }
  const fallback = Number(value);
  return Number.isFinite(fallback) ? fallback : 0;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(toNumber(value));
}

export function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(toNumber(value));
}

export function formatDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export function renderStars(value) {
  const rounded = Math.round(toNumber(value));
  return Array.from({ length: 5 }, (_, index) => index < rounded ? '★' : '☆').join('');
}

export function slugify(text = '') {
  return text.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
