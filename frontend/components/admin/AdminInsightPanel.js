function toneStyle(severity) {
  const key = String(severity || "info").toLowerCase();

  if (key === "danger") {
    return {
      softBg: "#fff7f8",
      badgeBg: "#ffe4e8",
      actionBg: "#fff0f3",
      border: "#fecdd3",
      accent: "#e11d48",
      color: "#be123c",
      tag: "Cần xử lý",
      icon: "!",
    };
  }

  if (key === "warning") {
    return {
      softBg: "#fffdf7",
      badgeBg: "#fef3c7",
      actionBg: "#fff8e6",
      border: "#fde68a",
      accent: "#f59e0b",
      color: "#b45309",
      tag: "Cảnh báo",
      icon: "!",
    };
  }

  if (key === "success") {
    return {
      softBg: "#f7fffb",
      badgeBg: "#d1fae5",
      actionBg: "#ecfdf5",
      border: "#a7f3d0",
      accent: "#10b981",
      color: "#047857",
      tag: "Ổn định",
      icon: "✓",
    };
  }

  return {
    softBg: "#f8fbff",
    badgeBg: "#dbeafe",
    actionBg: "#eff6ff",
    border: "#bfdbfe",
    accent: "#3b82f6",
    color: "#1d4ed8",
    tag: "Gợi ý",
    icon: "i",
  };
}

export default function AdminInsightPanel({ insights }) {
  const alerts = Array.isArray(insights?.alerts) ? insights.alerts : [];
  const suggestions = Array.isArray(insights?.suggestions)
    ? insights.suggestions
    : [];

  const counters =
    insights?.counters && typeof insights.counters === "object"
      ? insights.counters
      : {};

  const coreAlertDefinitions = [
    {
      type: "payment_review",
      count: Number(counters.waitingConfirmations || 0),
      severity: "warning",
      title: (count) =>
        count > 0
          ? `${count.toLocaleString("vi-VN")} giao dịch đang chờ đối soát`
          : "Không có giao dịch chờ đối soát",
      message: (count) =>
        count > 0
          ? "Các booking chuyển khoản chưa được xác nhận thành công cần được đối chiếu trước khi cập nhật trạng thái."
          : "Hiện không có booking chuyển khoản nào đang chờ Admin xác nhận.",
      action: (count) =>
        count > 0
          ? "Đối soát giao dịch và xác nhận các khoản thu hợp lệ."
          : "Tiếp tục theo dõi giao dịch mới.",
    },
    {
      type: "refund_pending",
      count: Number(counters.pendingRefunds || 0),
      severity: "danger",
      title: (count) =>
        count > 0
          ? `${count.toLocaleString("vi-VN")} yêu cầu hoàn tiền chưa xử lý`
          : "Không có yêu cầu hoàn tiền tồn đọng",
      message: (count) =>
        count > 0
          ? "Các yêu cầu hoàn tiền đang chờ phê duyệt hoặc từ chối cần được xử lý theo chính sách."
          : "Hiện không có yêu cầu hoàn tiền nào đang chờ xử lý.",
      action: (count) =>
        count > 0
          ? "Kiểm tra điều kiện hủy, số tiền hoàn và phê duyệt theo chính sách."
          : "Tiếp tục theo dõi yêu cầu hoàn tiền mới.",
    },
    {
      type: "missing_guide",
      count: Number(counters.noGuideBookings || 0),
      severity: "warning",
      title: (count) =>
        count > 0
          ? `${count.toLocaleString("vi-VN")} lịch khởi hành chưa có hướng dẫn viên`
          : "Các lịch cần HDV đã được phân công",
      message: (count) =>
        count > 0
          ? "Một số booking hợp lệ chưa có hướng dẫn viên, cần ưu tiên các đoàn sắp khởi hành."
          : "Hiện không ghi nhận booking hợp lệ nào còn thiếu hướng dẫn viên.",
      action: (count) =>
        count > 0
          ? "Phân công hướng dẫn viên và kiểm tra khả năng đáp ứng lịch."
          : "Tiếp tục theo dõi lịch phân công.",
    },
    {
      type: "booking_expired",
      count: Number(counters.expiredHolds || 0),
      severity: "warning",
      title: (count) =>
        count > 0
          ? `${count.toLocaleString("vi-VN")} booking đã quá hạn giữ chỗ`
          : "Không có booking quá hạn giữ chỗ",
      message: (count) =>
        count > 0
          ? "Các booking quá hạn cần được kiểm tra để bảo đảm trạng thái đơn và số chỗ đã đồng bộ đúng."
          : "Hiện không ghi nhận booking pending_payment nào đã quá thời gian giữ chỗ.",
      action: (count) =>
        count > 0
          ? "Kiểm tra booking quá hạn và xác nhận số chỗ đã được giải phóng đúng."
          : "Tiếp tục theo dõi thời gian giữ chỗ.",
    },
  ];

  const normalizedType = (value) => String(value || "").toLowerCase();

  const coreTypeAliases = {
    payment_review: ["payment_review", "waiting_confirmation"],
    refund_pending: ["refund_pending", "refund"],
    missing_guide: ["missing_guide", "no_guide", "unassigned_guide"],
    booking_expired: ["booking_expired", "expired_hold", "expired_booking"],
  };

  const findActualCoreAlert = (type) => {
    const aliases = coreTypeAliases[type] || [type];
    return alerts.find((item) =>
      aliases.some((alias) => normalizedType(item?.type).includes(alias)),
    );
  };

  const usedActualAlerts = new Set();

  const coreAlerts = coreAlertDefinitions.map((definition) => {
    const actual = findActualCoreAlert(definition.type);

    if (actual) {
      usedActualAlerts.add(actual);
      return actual;
    }

    const count = definition.count;
    return {
      type: definition.type,
      severity: count > 0 ? definition.severity : "success",
      title: definition.title(count),
      message: definition.message(count),
      action: definition.action(count),
      count,
      generatedFromCounter: true,
    };
  });

  const additionalActualAlerts = alerts.filter(
    (item) => !usedActualAlerts.has(item),
  );

  // Ưu tiên cảnh báo thực tế trước, sau đó dùng các bộ đếm cốt lõi để luôn
  // duy trì tối đa 4 mục giám sát rõ ràng, không tạo dữ liệu giả.
  const activeCoreAlerts = coreAlerts.filter(
    (item) => Number(item?.count || 0) > 0 || !item?.generatedFromCounter,
  );
  const healthyCoreAlerts = coreAlerts.filter(
    (item) => item?.generatedFromCounter && Number(item?.count || 0) === 0,
  );

  const displayedAlerts = [
    ...activeCoreAlerts,
    ...additionalActualAlerts,
    ...healthyCoreAlerts,
  ].slice(0, 4);

  return (
    <section className="admin-card admin-insight-panel">
      <style jsx>{`
        .admin-insight-panel {
          display: flex;
          flex-direction: column;
          gap: 22px;
          padding: 24px;
          overflow: hidden;
          background:
            radial-gradient(
              circle at top right,
              rgba(59, 130, 246, 0.06),
              transparent 30%
            ),
            #ffffff;
        }

        .admin-insight-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
        }

        .admin-insight-title-wrap {
          display: flex;
          align-items: flex-start;
          gap: 13px;
        }

        .admin-insight-title-icon {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          color: #ffffff;
          font-size: 17px;
          font-weight: 900;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.22);
        }

        .admin-insight-heading {
          margin: 0;
          color: #0f172a;
          font-size: 20px;
          line-height: 1.3;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .admin-insight-subtitle {
          margin: 5px 0 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.6;
        }

        .admin-insight-count {
          min-height: 36px;
          padding: 0 13px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #eff6ff;
          border: 1px solid #dbeafe;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .admin-alert-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          align-items: stretch;
        }

        .admin-alert-card {
          position: relative;
          min-width: 0;
          min-height: 245px;
          padding: 18px;
          border-radius: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: hidden;
          box-shadow: 0 9px 24px rgba(15, 23, 42, 0.045);
          transition:
            transform 0.25s ease,
            box-shadow 0.25s ease,
            border-color 0.25s ease;
        }

        .admin-alert-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: var(--alert-accent);
        }

        .admin-alert-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.09);
        }

        .admin-alert-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .admin-alert-tag {
          min-height: 27px;
          padding: 0 10px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 11px;
          letter-spacing: 0.025em;
        }

        .admin-alert-icon {
          width: 32px;
          height: 32px;
          flex: 0 0 32px;
          border-radius: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 900;
        }

        .admin-alert-title {
          margin: 0;
          color: #0f172a;
          font-size: 17px;
          font-weight: 800;
          line-height: 1.42;
          letter-spacing: -0.012em;
          overflow-wrap: anywhere;
        }

        .admin-alert-message {
          margin: 0;
          color: #475569;
          font-size: 13px;
          line-height: 1.68;
          flex: 1;
        }

        .admin-alert-action {
          margin-top: auto;
          padding: 12px 13px;
          border-radius: 13px;
          display: flex;
          align-items: flex-start;
          gap: 9px;
          font-size: 13px;
          font-weight: 750;
          line-height: 1.52;
        }

        .admin-action-dot {
          width: 20px;
          height: 20px;
          flex: 0 0 20px;
          margin-top: 1px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-size: 13px;
          font-weight: 900;
        }

        .admin-empty-alert {
          grid-column: 1 / -1;
          min-height: 115px;
          padding: 20px;
          border: 1px solid #a7f3d0;
          border-radius: 18px;
          background: #f0fdf4;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .admin-empty-icon {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #d1fae5;
          color: #047857;
          font-size: 18px;
          font-weight: 900;
        }

        .admin-empty-alert strong {
          display: block;
          margin-bottom: 4px;
          color: #047857;
          font-size: 15px;
        }

        .admin-suggestion-box {
          padding: 16px 18px;
          border-radius: 16px;
          background: linear-gradient(135deg, #f8fafc, #f0f7ff);
          border: 1px solid #dbe4f0;
        }

        .admin-suggestion-heading {
          margin: 0 0 11px;
          color: #0f172a;
          font-size: 14px;
          font-weight: 800;
        }

        .admin-suggestion-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 9px;
        }

        .admin-suggestion-item {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          color: #475569;
          font-size: 13px;
          line-height: 1.55;
        }

        .admin-suggestion-bullet {
          width: 7px;
          height: 7px;
          margin-top: 7px;
          flex: 0 0 7px;
          border-radius: 999px;
          background: #3b82f6;
        }

        @media (max-width: 1450px) {
          .admin-alert-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .admin-alert-card {
            min-height: 220px;
          }
        }

        @media (max-width: 780px) {
          .admin-insight-panel {
            padding: 18px;
          }

          .admin-alert-grid {
            grid-template-columns: 1fr;
          }

          .admin-alert-card {
            min-height: auto;
          }
        }
      `}</style>

      <header className="admin-insight-header">
        <div className="admin-insight-title-wrap">
          <span className="admin-insight-title-icon">AI</span>

          <div>
            <h3 className="admin-insight-heading">
              Trung tâm cảnh báo thông minh
            </h3>

            <p className="admin-insight-subtitle">
              Tổng hợp các vấn đề cần Admin ưu tiên theo dõi và xử lý.
            </p>
          </div>
        </div>

        <span className="admin-insight-count">
          {displayedAlerts.length} mục đang giám sát
        </span>
      </header>

      <div className="admin-alert-grid">
        {displayedAlerts.length ? (
          displayedAlerts.map((item, index) => {
            const tone = toneStyle(item.severity);

            return (
              <article
                key={`${item.type || "alert"}-${index}`}
                className="admin-alert-card"
                style={{
                  "--alert-accent": tone.accent,
                  border: `1px solid ${tone.border}`,
                  background: tone.softBg,
                }}
              >
                <div className="admin-alert-head">
                  <span
                    className="admin-alert-tag"
                    style={{
                      color: tone.color,
                      background: tone.badgeBg,
                    }}
                  >
                    {tone.tag}
                  </span>

                  <span
                    className="admin-alert-icon"
                    style={{
                      color: tone.color,
                      background: tone.badgeBg,
                    }}
                  >
                    {tone.icon}
                  </span>
                </div>

                <h4 className="admin-alert-title">
                  {item.title || "Cảnh báo vận hành"}
                </h4>

                <p className="admin-alert-message">
                  {item.message || "Chưa có nội dung mô tả chi tiết."}
                </p>

                {item.action ? (
                  <div
                    className="admin-alert-action"
                    style={{
                      color: tone.color,
                      background: tone.actionBg,
                    }}
                  >
                    <span
                      className="admin-action-dot"
                      style={{ background: tone.accent }}
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
          <article className="admin-empty-alert">
            <span className="admin-empty-icon">✓</span>

            <div>
              <strong>Hệ thống đang vận hành ổn định</strong>

              <p className="admin-alert-message">
                Chưa phát hiện cảnh báo nghiêm trọng cần Admin xử lý.
              </p>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
