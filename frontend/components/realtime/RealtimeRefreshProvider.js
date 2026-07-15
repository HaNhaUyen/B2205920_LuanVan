import { useEffect, useRef } from "react";
import {
  createRealtimeEventSource,
  emitDataChanged,
  subscribeDataChanged,
} from "@/lib/realtime";

const REFRESH_DEBOUNCE_MS = 180;
const REALTIME_REFRESH_EVENT = "travela:realtime-refresh";

function hasOpenModal() {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector(".modal-backdrop"));
}

export default function RealtimeRefreshProvider({ children }) {
  const timerRef = useRef(null);
  const lastEventIdRef = useRef("");
  const pendingRefreshRef = useRef(false);
  const pendingDetailRef = useRef({});

  useEffect(() => {
    const dispatchRefresh = (detail = {}) => {
      window.clearTimeout(timerRef.current);

      timerRef.current = window.setTimeout(() => {
        pendingRefreshRef.current = false;
        pendingDetailRef.current = {};

        window.dispatchEvent(
          new CustomEvent(REALTIME_REFRESH_EVENT, {
            detail,
          }),
        );
      }, REFRESH_DEBOUNCE_MS);
    };

    const scheduleRefresh = (detail = {}) => {
      if (detail.id && detail.id === lastEventIdRef.current) return;
      if (detail.id) lastEventIdRef.current = detail.id;

      if (hasOpenModal()) {
        pendingRefreshRef.current = true;
        pendingDetailRef.current = {
          ...pendingDetailRef.current,
          ...detail,
        };
        return;
      }

      dispatchRefresh(detail);
    };

    const unsubscribe = subscribeDataChanged(scheduleRefresh);
    const eventSource = createRealtimeEventSource();

    const onServerChange = (event) => {
      try {
        const detail = JSON.parse(event.data || "{}");

        emitDataChanged(
          {
            ...detail,
            source: "server",
          },
          false,
        );
      } catch {
        scheduleRefresh({
          source: "server",
        });
      }
    };

    eventSource?.addEventListener("data.changed", onServerChange);

    const observer = new MutationObserver(() => {
      if (pendingRefreshRef.current && !hasOpenModal()) {
        dispatchRefresh(pendingDetailRef.current);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      unsubscribe();

      eventSource?.removeEventListener("data.changed", onServerChange);

      eventSource?.close();
      observer.disconnect();
      window.clearTimeout(timerRef.current);
    };
  }, []);

  return children;
}
