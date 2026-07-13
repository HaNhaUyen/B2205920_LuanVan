import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Clock3,
  PlusCircle,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ToastContext";
import { formatDateTime } from "@/lib/format";

const availabilityLabels = {
  unavailable: "Không thể nhận tour",
  leave: "Nghỉ phép",
  training: "Đào tạo",
  personal: "Việc cá nhân",
};

const availabilityTone = {
  unavailable: "danger",
  leave: "danger",
  training: "warning",
  personal: "info",
};

function normalizeAvailability(item) {
  return {
    ...item,
    availabilityType:
      item.availabilityType || item.availability_type || "unavailable",
    startAt: item.startAt || item.start_at,
    endAt: item.endAt || item.end_at,
  };
}

export default function GuideAdvancedTools() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState([]);
  const [busy, setBusy] = useState({
    startAt: "",
    endAt: "",
    availabilityType: "unavailable",
    reason: "",
  });

  const normalizedAvailability = useMemo(
    () => availability.map(normalizeAvailability),
    [availability],
  );

  const loadAvailability = async () => {
    const result = await apiFetch("/operations-v2/guides/availability");
    setAvailability(Array.isArray(result) ? result : []);
  };

  useEffect(() => {
    loadAvailability()
      .catch((error) =>
        showToast(error.message || "Không tải được lịch bận.", "error"),
      )
      .finally(() => setLoading(false));
  }, []);

  const addBusy = async (event) => {
    event.preventDefault();

    const start = new Date(busy.startAt);
    const end = new Date(busy.endAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return showToast("Vui lòng nhập đầy đủ thời gian.", "error");
    }

    if (end <= start) {
      return showToast(
        "Thời gian kết thúc phải sau thời gian bắt đầu.",
        "error",
      );
    }

    try {
      setSaving(true);
      await apiFetch("/operations-v2/guides/availability", {
        method: "POST",
        body: JSON.stringify(busy),
      });
      await loadAvailability();
      setBusy({
        startAt: "",
        endAt: "",
        availabilityType: "unavailable",
        reason: "",
      });
      showToast("Đã lưu lịch bận cá nhân.", "success");
    } catch (error) {
      showToast(error.message || "Không thể lưu lịch bận.", "error");
    } finally {
      setSaving(false);
    }
  };

  const removeBusy = async (id) => {
    if (!window.confirm("Xóa khoảng thời gian bận này?")) return;

    try {
      await apiFetch(`/operations-v2/guides/availability/${id}`, {
        method: "DELETE",
      });
      setAvailability((items) => items.filter((item) => item.id !== id));
      showToast("Đã xóa lịch bận.", "success");
    } catch (error) {
      showToast(error.message || "Không thể xóa lịch bận.", "error");
    }
  };

  return (
    <section className="availability-panel">
      <div className="availability-panel-head">
        <div>
          <span className="availability-eyebrow">Lịch cá nhân</span>
          <h2>Quản lý lịch bận</h2>
          <p>
            Khai báo ngày không thể nhận tour. Những ngày này sẽ hiển thị màu đỏ
            trên lịch công tác.
          </p>
        </div>

        <button
          type="button"
          className="availability-refresh"
          onClick={loadAvailability}
          disabled={loading}
        >
          <RefreshCcw size={17} className={loading ? "spin" : ""} />
          Làm mới
        </button>
      </div>

      <div className="availability-layout">
        <article className="availability-card form-card">
          <div className="availability-card-title">
            <div className="title-icon blue">
              <PlusCircle size={19} />
            </div>
            <div>
              <h3>Thêm khoảng thời gian bận</h3>
              <p>Ban điều hành sẽ không thể phân công tour trùng khoảng này.</p>
            </div>
          </div>

          <form className="availability-form" onSubmit={addBusy}>
            <label className="full-field">
              <span>Loại lịch bận</span>
              <select
                value={busy.availabilityType}
                onChange={(event) =>
                  setBusy((current) => ({
                    ...current,
                    availabilityType: event.target.value,
                  }))
                }
              >
                <option value="unavailable">Không thể nhận tour</option>
                <option value="leave">Nghỉ phép</option>
                <option value="training">Đào tạo</option>
                <option value="personal">Việc cá nhân</option>
              </select>
            </label>

            <label>
              <span>Bắt đầu</span>
              <input
                required
                type="datetime-local"
                value={busy.startAt}
                onChange={(event) =>
                  setBusy((current) => ({
                    ...current,
                    startAt: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span>Kết thúc</span>
              <input
                required
                type="datetime-local"
                value={busy.endAt}
                onChange={(event) =>
                  setBusy((current) => ({
                    ...current,
                    endAt: event.target.value,
                  }))
                }
              />
            </label>

            <label className="full-field">
              <span>Lý do</span>
              <textarea
                value={busy.reason}
                onChange={(event) =>
                  setBusy((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Ví dụ: nghỉ phép, tham gia đào tạo nghiệp vụ..."
              />
            </label>

            <button
              type="submit"
              className="availability-primary full-field"
              disabled={saving}
            >
              <CalendarClock size={17} />
              {saving ? "Đang lưu..." : "Lưu lịch bận"}
            </button>
          </form>
        </article>

        <article className="availability-card list-card">
          <div className="availability-card-title list-title">
            <div>
              <div className="title-icon red">
                <CalendarClock size={19} />
              </div>
              <div>
                <h3>Lịch bận đã lưu</h3>
                <p>Các khoảng thời gian đang có hiệu lực.</p>
              </div>
            </div>
            <span className="availability-count">
              {normalizedAvailability.length} khoảng
            </span>
          </div>

          {loading ? (
            <div className="availability-empty">Đang tải lịch bận...</div>
          ) : !normalizedAvailability.length ? (
            <div className="availability-empty">
              <CalendarClock size={34} />
              <strong>Chưa có lịch bận</strong>
              <p>Bạn có thể nhận phân công tour ở mọi thời điểm hiện tại.</p>
            </div>
          ) : (
            <div className="availability-list">
              {normalizedAvailability.map((item) => {
                const tone = availabilityTone[item.availabilityType] || "info";
                return (
                  <article
                    className={`availability-item ${tone}`}
                    key={item.id}
                  >
                    <div className="availability-item-icon">
                      {tone === "danger" ? (
                        <AlertTriangle size={18} />
                      ) : (
                        <Clock3 size={18} />
                      )}
                    </div>

                    <div className="availability-item-content">
                      <div className="availability-item-head">
                        <strong>
                          {availabilityLabels[item.availabilityType] ||
                            "Lịch bận"}
                        </strong>
                        <span>{item.status || "active"}</span>
                      </div>
                      <p>
                        {formatDateTime(item.startAt)} →{" "}
                        {formatDateTime(item.endAt)}
                      </p>
                      {item.reason && <small>{item.reason}</small>}
                    </div>

                    <button
                      type="button"
                      className="availability-delete"
                      onClick={() => removeBusy(item.id)}
                      title="Xóa lịch bận"
                    >
                      <Trash2 size={17} />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </article>
      </div>

      <style jsx global>{`
        .availability-panel {
          margin-top: 24px;
          padding: 24px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          box-shadow: 0 8px 28px rgba(15, 23, 42, 0.05);
        }
        .availability-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 22px;
        }
        .availability-eyebrow {
          color: #2563eb;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .availability-panel-head h2 {
          margin: 5px 0 7px;
          color: #0f172a;
          font-size: 23px;
        }
        .availability-panel-head p {
          margin: 0;
          color: #64748b;
          line-height: 1.6;
        }
        .availability-refresh {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 15px;
          border: 1px solid #dbe3ee;
          border-radius: 11px;
          background: #fff;
          color: #334155;
          font-weight: 750;
          cursor: pointer;
        }
        .availability-layout {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          gap: 18px;
          align-items: start;
        }
        .availability-card {
          min-width: 0;
          padding: 20px;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: #fff;
        }
        .list-card {
          background: #f8fafc;
        }
        .availability-card-title {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          margin-bottom: 18px;
        }
        .availability-card-title.list-title {
          justify-content: space-between;
        }
        .availability-card-title.list-title > div {
          display: flex;
          align-items: flex-start;
          gap: 11px;
        }
        .title-icon {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          border-radius: 12px;
          display: grid;
          place-items: center;
        }
        .title-icon.blue {
          background: #eff6ff;
          color: #2563eb;
        }
        .title-icon.red {
          background: #fef2f2;
          color: #dc2626;
        }
        .availability-card-title h3 {
          margin: 0 0 4px;
          color: #0f172a;
          font-size: 17px;
        }
        .availability-card-title p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.5;
        }
        .availability-count {
          flex: 0 0 auto;
          padding: 6px 10px;
          border-radius: 999px;
          background: #fff;
          border: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 12px;
          font-weight: 750;
        }
        .availability-form {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .availability-form label {
          min-width: 0;
          display: grid;
          gap: 7px;
        }
        .availability-form label > span {
          color: #334155;
          font-size: 13px;
          font-weight: 700;
        }
        .availability-form .full-field {
          grid-column: 1 / -1;
        }
        .availability-form input,
        .availability-form select,
        .availability-form textarea {
          display: block;
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 11px 12px;
          background: #fff;
          color: #0f172a;
          font: inherit;
          outline: 0;
        }
        .availability-form textarea {
          min-height: 92px;
          resize: vertical;
          line-height: 1.5;
        }
        .availability-form input:focus,
        .availability-form select:focus,
        .availability-form textarea:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
        .availability-primary {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          border-radius: 10px;
          background: #2563eb;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        .availability-primary:disabled,
        .availability-refresh:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .availability-list {
          max-height: 465px;
          overflow-y: auto;
          display: grid;
          gap: 10px;
          padding-right: 3px;
        }
        .availability-item {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) 38px;
          align-items: center;
          gap: 12px;
          padding: 13px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-left-width: 4px;
          border-radius: 13px;
        }
        .availability-item.danger {
          border-left-color: #ef4444;
        }
        .availability-item.warning {
          border-left-color: #f59e0b;
        }
        .availability-item.info {
          border-left-color: #3b82f6;
        }
        .availability-item-icon {
          width: 42px;
          height: 42px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          background: #f1f5f9;
          color: #475569;
        }
        .availability-item.danger .availability-item-icon {
          background: #fef2f2;
          color: #dc2626;
        }
        .availability-item.warning .availability-item-icon {
          background: #fffbeb;
          color: #d97706;
        }
        .availability-item-content {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .availability-item-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .availability-item-head strong {
          color: #0f172a;
          font-size: 14px;
        }
        .availability-item-head span {
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .availability-item-content p,
        .availability-item-content small {
          margin: 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.45;
        }
        .availability-item-content small {
          color: #334155;
        }
        .availability-delete {
          width: 36px;
          height: 36px;
          border: 0;
          border-radius: 9px;
          background: #fef2f2;
          color: #dc2626;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .availability-empty {
          min-height: 220px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 24px;
          text-align: center;
          color: #94a3b8;
          border: 1px dashed #cbd5e1;
          border-radius: 13px;
          background: #fff;
        }
        .availability-empty strong {
          color: #334155;
        }
        .availability-empty p {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
        }
        .spin {
          animation: availability-spin 1s linear infinite;
        }
        @keyframes availability-spin {
          to {
            transform: rotate(360deg);
          }
        }
        @media (max-width: 1050px) {
          .availability-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 700px) {
          .availability-panel {
            padding: 16px;
          }
          .availability-panel-head {
            flex-direction: column;
          }
          .availability-form {
            grid-template-columns: 1fr;
          }
          .availability-form .full-field {
            grid-column: auto;
          }
          .availability-item {
            grid-template-columns: 38px minmax(0, 1fr);
          }
          .availability-delete {
            grid-column: 2;
            justify-self: end;
          }
        }
      `}</style>
    </section>
  );
}
