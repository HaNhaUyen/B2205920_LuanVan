import { API_URL } from "./config";

export const DATA_CHANGED_EVENT = "travela:data-changed";
const CHANNEL_NAME = "travela-realtime";

let channel = null;

function getChannel() {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return null;
  }
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function emitDataChanged(detail = {}, broadcast = true) {
  if (typeof window === "undefined") return;

  const eventDetail = {
    id: detail.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    source: detail.source || "local",
    method: detail.method || "UNKNOWN",
    resource: detail.resource || "unknown",
    occurredAt: detail.occurredAt || new Date().toISOString(),
  };

  window.dispatchEvent(
    new CustomEvent(DATA_CHANGED_EVENT, { detail: eventDetail }),
  );

  if (broadcast) {
    getChannel()?.postMessage(eventDetail);
  }
}

export function subscribeDataChanged(listener) {
  if (typeof window === "undefined") return () => {};

  const onWindowEvent = (event) => listener(event.detail || {});
  const broadcastChannel = getChannel();
  const onBroadcast = (event) =>
    listener({ ...(event.data || {}), source: "tab" });

  window.addEventListener(DATA_CHANGED_EVENT, onWindowEvent);
  broadcastChannel?.addEventListener("message", onBroadcast);

  return () => {
    window.removeEventListener(DATA_CHANGED_EVENT, onWindowEvent);
    broadcastChannel?.removeEventListener("message", onBroadcast);
  };
}

export function createRealtimeEventSource() {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return null;
  }

  const base = String(API_URL || "").replace(/\/$/, "");
  return new EventSource(`${base}/realtime/events`);
}
