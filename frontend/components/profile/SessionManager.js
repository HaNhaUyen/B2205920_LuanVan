import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ToastContext";
export default function SessionManager() {
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const load = () =>
    apiFetch("/operations-v2/sessions")
      .then((x) => setItems(x || []))
      .catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  return (
    <div
      style={{ marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 20 }}
    >
      <h3>Thiết bị đang đăng nhập</h3>
      <p style={{ color: "#64748b" }}>
        Thu hồi từng phiên hoặc đăng xuất khỏi tất cả thiết bị.
      </p>
      {items.map((s) => (
        <div
          key={s.session_id || s.sessionId}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "12px 0",
            borderBottom: "1px solid #eef2f7",
          }}
        >
          <div style={{ flex: 1 }}>
            <b>
              {s.device_name ||
                s.deviceName ||
                s.browser ||
                "Thiết bị không xác định"}
            </b>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              {s.ip_address || s.ipAddress || ""} ·{" "}
              {formatDateTime(s.last_active_at || s.lastActiveAt)}
            </div>
          </div>
          <button
            onClick={async () => {
              await apiFetch(
                `/operations-v2/sessions/${s.session_id || s.sessionId}/revoke`,
                { method: "PATCH" },
              );
              showToast("Đã thu hồi phiên", "success");
              load();
            }}
          >
            Đăng xuất
          </button>
        </div>
      ))}
      <button
        onClick={async () => {
          await apiFetch("/operations-v2/sessions/revoke-all", {
            method: "POST",
            body: JSON.stringify({}),
          });
          showToast("Đã thu hồi các phiên", "success");
          load();
        }}
      >
        Đăng xuất tất cả thiết bị
      </button>
    </div>
  );
}
