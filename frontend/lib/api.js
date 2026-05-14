import { API_URL, AI_API_URL } from "./config";
import { getToken } from "./storage";

async function parsePayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

function extractMessage(payload) {
  if (typeof payload === "string") return payload;

  const message =
    payload?.message || payload?.error || payload?.detail || "Yêu cầu thất bại";

  return Array.isArray(message) ? message.join(", ") : message;
}

async function safeFetch(url, options, serviceName) {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw new Error(
      `${serviceName} hiện chưa phản hồi. Bạn kiểm tra service đã chạy đúng port chưa.`,
    );
  }
}

function getStoredToken() {
  if (typeof window === "undefined") return "";

  return (
    getToken?.() ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("travela_token") ||
    ""
  );
}

function buildUrl(baseUrl, path) {
  if (/^https?:\/\//i.test(path)) return path;

  const base = String(baseUrl || "").replace(/\/$/, "");
  const safePath = String(path || "").startsWith("/") ? path : `/${path}`;

  return `${base}${safePath}`;
}

export async function apiFetch(path, options = {}) {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers = {
    ...(options.headers || {}),
  };

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const token = getStoredToken();

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = buildUrl(API_URL, path);

  const response = await safeFetch(
    url,
    {
      ...options,
      headers,
    },
    "Backend API",
  );

  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new Error(extractMessage(payload));
  }

  return payload;
}

export async function aiFetch(path, options = {}) {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers = {
    ...(options.headers || {}),
  };

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const url = buildUrl(AI_API_URL, path);

  const response = await safeFetch(
    url,
    {
      ...options,
      headers,
    },
    "AI service",
  );

  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new Error(extractMessage(payload));
  }

  return payload;
}
