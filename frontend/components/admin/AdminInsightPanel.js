function toneStyle(severity) {
  const key = String(severity || "info").toLowerCase();
  if (key === "danger") {
    return {
      bg: "#fff1f2",
      border: "#fecdd3",
      color: "#be123c",
      tag: "Cần xử lý",
    };
  }
  if (key === "warning") {
    return {
      bg: "#fffbeb",
      border: "#fde68a",
      color: "#b45309",
      tag: "Cảnh báo",
    };
  }
  if (key === "success") {
    return {
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#047857",
      tag: "Ổn định",
    };
  }
  return { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8", tag: "Gợi ý" };
}

export default function AdminInsightPanel({ insights }) {
  const alerts = insights?.alerts || [];
  const suggestions = insights?.suggestions || [];

  return (
    <section className="admin-card admin-insight-panel">
      <style jsx>{`
        .admin-insight-panel {
          display: grid;
          gap: 18px;
        }
        .admin-alert-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
          align-items: stretch;
        }
        .admin-alert-card {
          min-height: 168px;
          padding: 16px 18px;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          gap: 8px;
        }
        .admin-alert-tag {
          font-weight: 800;
          font-size: 12px;
        }
        .admin-alert-title {
          margin: 0;
          color: #0f172a;
          font-size: 15px;
          line-height: 1.42;
        }
        .admin-alert-message {
          margin: 0;
          color: #475569;
          font-size: 13px;
          line-height: 1.55;
        }
        .admin-alert-action {
          margin-top: auto;
          display: inline-flex;
          align-items: flex-start;
          gap: 6px;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.45;
        }
        .admin-action-dot {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          flex: 0 0 18px;
          margin-top: 1px;
        }
        @media (max-width: 1500px) {
          .admin-alert-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 900px) {
          .admin-alert-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 620px) {
          .admin-alert-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

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

      <div className="admin-alert-grid">
        {alerts.length ? (
          alerts.slice(0, 5).map((item, index) => {
            const tone = toneStyle(item.severity);
            return (
              <article
                key={`${item.type}-${index}`}
                className="admin-alert-card"
                style={{
                  border: `1px solid ${tone.border}`,
                  background: tone.bg,
                }}
              >
                <span className="admin-alert-tag" style={{ color: tone.color }}>
                  {tone.tag}
                </span>
                <h4 className="admin-alert-title">{item.title}</h4>
                <p className="admin-alert-message">{item.message}</p>
                {item.action ? (
                  <div
                    className="admin-alert-action"
                    style={{ color: tone.color }}
                  >
                    <span
                      className="admin-action-dot"
                      style={{
                        background: `${tone.color}18`,
                        color: tone.color,
                      }}
                    >
                      ›
                    </span>
                    <span>{item.action}</span>
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <article
            className="admin-alert-card"
            style={{
              border: "1px solid #a7f3d0",
              background: "#ecfdf5",
            }}
          >
            <strong style={{ color: "#047857" }}>Hệ thống đang ổn định</strong>
            <p className="admin-alert-message">
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
