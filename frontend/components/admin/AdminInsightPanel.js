function toneStyle(severity) {
  const key = String(severity || "info").toLowerCase();
  if (key === "danger")
    return {
      bg: "#fef2f2",
      border: "#fecaca",
      color: "#b91c1c",
      tag: "Cần xử lý",
    };
  if (key === "warning")
    return {
      bg: "#fffbeb",
      border: "#fde68a",
      color: "#b45309",
      tag: "Cảnh báo",
    };
  if (key === "success")
    return {
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#047857",
      tag: "Ổn định",
    };
  return { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8", tag: "Gợi ý" };
}

export default function AdminInsightPanel({ insights }) {
  const alerts = insights?.alerts || [];
  const suggestions = insights?.suggestions || [];
  const counters = insights?.counters || {};

  return (
    <section className="admin-card" style={{ display: "grid", gap: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: "#0f172a" }}>
            Trung tâm cảnh báo thông minh
          </h3>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {alerts.length ? (
          alerts.slice(0, 6).map((item, index) => {
            const tone = toneStyle(item.severity);
            return (
              <article
                key={`${item.type}-${index}`}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: `1px solid ${tone.border}`,
                  background: tone.bg,
                }}
              >
                <span
                  style={{ color: tone.color, fontWeight: 800, fontSize: 12 }}
                >
                  {tone.tag}
                </span>
                <h4
                  style={{
                    margin: "8px 0 6px",
                    color: "#0f172a",
                    fontSize: 15,
                  }}
                >
                  {item.title}
                </h4>
                <p
                  style={{
                    margin: 0,
                    color: "#475569",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {item.message}
                </p>
                {item.action ? (
                  <p
                    style={{
                      margin: "8px 0 0",
                      color: tone.color,
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    → {item.action}
                  </p>
                ) : null}
              </article>
            );
          })
        ) : (
          <article
            style={{
              padding: 14,
              borderRadius: 14,
              border: "1px solid #a7f3d0",
              background: "#ecfdf5",
            }}
          >
            <strong style={{ color: "#047857" }}>Hệ thống đang ổn định</strong>
            <p style={{ margin: "6px 0 0", color: "#475569", fontSize: 13 }}>
              Chưa phát hiện cảnh báo vận hành nghiêm trọng.
            </p>
          </article>
        )}
      </div>

      {suggestions.length ? (
        <div
          style={{
            padding: 14,
            borderRadius: 14,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
          }}
        >
          <strong style={{ color: "#0f172a" }}>Gợi ý vận hành</strong>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {suggestions.map((item, index) => (
              <span key={index} style={{ color: "#475569", fontSize: 13 }}>
                • {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
