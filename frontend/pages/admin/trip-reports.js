import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Coins,
  Eye,
  FileCheck2,
  RefreshCcw,
  Search,
  Star,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

const STATUS_LABELS = {
  draft: "Bản nháp",
  submitted: "Chờ xem xét",
  reviewed: "Đã xem xét",
};

const STATUS_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "submitted", label: "Chờ xem xét" },
  { value: "reviewed", label: "Đã xem xét" },
  { value: "draft", label: "Bản nháp" },
];

/**
 * MySQL DATETIME không chứa múi giờ.
 *
 * Không dùng new Date(value) ở đây vì trình duyệt có thể hiểu chuỗi trả về
 * là UTC rồi tự cộng thêm UTC+7, làm 16:23 thành 23:23.
 */
function formatMySqlDateTime(value) {
  if (!value) return "--";

  const raw = String(value).trim();

  /*
   * Hỗ trợ các dạng backend có thể trả:
   * 2026-07-17 16:23:00
   * 2026-07-17T16:23:00.000Z
   * 2026-07-17T16:23:00+07:00
   *
   * Ta chỉ lấy trực tiếp thành phần ngày và giờ, không chuyển timezone.
   */
  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
  );

  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${hour}:${minute} ${day}/${month}/${year}`;
  }

  // Trường hợp backend đã trả sẵn dd/mm/yyyy HH:mm.
  const vietnameseMatch = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})[ ,T]+(\d{2}):(\d{2})/,
  );

  if (vietnameseMatch) {
    const [, day, month, year, hour, minute] = vietnameseMatch;
    return `${hour}:${minute} ${day}/${month}/${year}`;
  }

  return raw;
}

function GuideManagementTabs() {
  const tabs = [
    ["/admin/guides", "Tổng quan HDV"],
    ["/admin/guide-competencies", "Duyệt chứng chỉ"],
    ["/admin/incidents", "Duyệt sự cố"],
    ["/admin/guide-availabilities", "Duyệt lịch bận"],
    ["/admin/trip-reports", "Báo cáo chuyến đi"],
  ];

  return (
    <nav className="report-tabs" aria-label="Quản lý hướng dẫn viên">
      {tabs.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={href === "/admin/trip-reports" ? "active" : ""}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`report-status ${status || "draft"}`}>
      <i />
      {STATUS_LABELS[status] || status || "Chưa cập nhật"}
    </span>
  );
}

function SummaryCard({ icon: Icon, label, value, hint, tone }) {
  return (
    <article className={`report-summary-card ${tone}`}>
      <div className="summary-icon">
        <Icon size={20} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </article>
  );
}

function RatingChip({ label, value }) {
  const numericValue = Number(value || 0);
  return (
    <div className="rating-chip">
      <span>{label}</span>
      <strong>
        <Star size={14} fill="currentColor" />
        {numericValue || "--"}/5
      </strong>
    </div>
  );
}

export default function AdminTripReportsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [adminNote, setAdminNote] = useState("");
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 10,
    status: "submitted",
    search: "",
  });
  const [data, setData] = useState({
    items: [],
    pagination: { page: 1, totalPages: 1, total: 0 },
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== "" && value != null) params.set(key, String(value));
    });
    return params.toString();
  }, [filters]);

  const summary = useMemo(() => {
    const items = data.items || [];
    return {
      waiting: items.filter((item) => item.status === "submitted").length,
      reviewed: items.filter((item) => item.status === "reviewed").length,
      guests: items.reduce(
        (sum, item) => sum + Number(item.actualGuestCount || 0),
        0,
      ),
      extraCost: items.reduce(
        (sum, item) => sum + Number(item.extraCost || 0),
        0,
      ),
    };
  }, [data.items]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await apiFetch(`/trip-operations/admin/reports?${query}`);
      setData(
        result || {
          items: [],
          pagination: { page: 1, totalPages: 1, total: 0 },
        },
      );
    } catch (error) {
      showToast(error.message || "Không tải được báo cáo.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const openDetail = async (id) => {
    try {
      const detail = await apiFetch(`/trip-operations/admin/reports/${id}`);
      setSelected(detail);
      setAdminNote(detail.adminNote || detail.admin_note || "");
    } catch (error) {
      showToast(error.message || "Không tải được chi tiết báo cáo.", "error");
    }
  };

  const review = async (action = "review") => {
    if (!selected) return;

    setProcessing(true);
    try {
      const updated = await apiFetch(
        `/trip-operations/admin/reports/${selected.id}/review`,
        {
          method: "PATCH",
          body: JSON.stringify({ action, adminNote }),
        },
      );

      setSelected(updated);
      showToast(
        action === "review"
          ? "Đã xác nhận xem xét báo cáo."
          : "Đã chuyển báo cáo về chờ xem xét.",
        "success",
      );
      await load();
    } catch (error) {
      showToast(error.message || "Không cập nhật được báo cáo.", "error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AdminLayout
      current="/admin/guides"
      title="Báo cáo chuyến đi"
      subtitle="Theo dõi quyết toán, chất lượng dịch vụ và tổng kết sau tour của hướng dẫn viên"
    >
      <div className="report-page">
        <GuideManagementTabs />

        <section className="report-hero">
          <div className="hero-copy">
            <span className="hero-eyebrow">TRUNG TÂM ĐIỀU HÀNH SAU TOUR</span>
            <h2>Quản lý báo cáo chuyến đi</h2>
            <p>
              Kiểm tra số lượng khách, chi phí phát sinh, đánh giá dịch vụ và đề
              xuất cải thiện từ hướng dẫn viên.
            </p>
          </div>

          <button type="button" onClick={load} disabled={loading}>
            <RefreshCcw size={17} className={loading ? "spin" : ""} />
            {loading ? "Đang tải..." : "Làm mới dữ liệu"}
          </button>
        </section>

        <section className="report-summary-grid">
          <SummaryCard
            icon={Clock3}
            label="Chờ xem xét"
            value={summary.waiting}
            hint="Báo cáo cần xử lý"
            tone="amber"
          />
          <SummaryCard
            icon={FileCheck2}
            label="Đã xem xét"
            value={summary.reviewed}
            hint="Trong trang hiện tại"
            tone="green"
          />
          <SummaryCard
            icon={UsersRound}
            label="Khách thực tế"
            value={summary.guests}
            hint="Tổng khách đã phục vụ"
            tone="blue"
          />
          <SummaryCard
            icon={Coins}
            label="Chi phí phát sinh"
            value={formatCurrency(summary.extraCost)}
            hint="Tổng ở trang hiện tại"
            tone="violet"
          />
        </section>

        <section className="report-toolbar">
          <div className="report-search">
            <Search size={18} />
            <input
              placeholder="Tìm tên tour, mã tour, điểm đến hoặc hướng dẫn viên..."
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                  page: 1,
                }))
              }
            />
          </div>

          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value,
                page: 1,
              }))
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="report-total">
            <ClipboardCheck size={17} />
            <span>
              <strong>{data.pagination?.total || 0}</strong> báo cáo
            </span>
          </div>
        </section>

        <section className="report-list-card">
          {loading ? (
            <Loading text="Đang tải báo cáo chuyến đi..." />
          ) : !data.items?.length ? (
            <div className="report-empty">
              <div>
                <ClipboardCheck size={34} />
              </div>
              <strong>Không có báo cáo phù hợp</strong>
              <p>Thử đổi trạng thái hoặc nhập từ khóa khác.</p>
            </div>
          ) : (
            <div className="report-list">
              {data.items.map((item) => (
                <article className="report-item" key={item.id}>
                  <div className="report-item-accent" />

                  <div className="report-item-main">
                    <div className="report-item-head">
                      <div>
                        <div className="report-code-line">
                          <span>{item.tourCode || "Chưa có mã"}</span>
                          <i />
                          <span>{item.destinationName || "Chưa cập nhật"}</span>
                        </div>
                        <h3>{item.tourName || "Chuyến đi"}</h3>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>

                    <div className="report-meta-grid">
                      <div>
                        <UserRound size={15} />
                        <span>
                          HDV: <strong>{item.guideName || "--"}</strong>
                        </span>
                      </div>
                      <div>
                        <Clock3 size={15} />
                        <span>Khởi hành: {formatDate(item.departureDate)}</span>
                      </div>
                      <div>
                        <FileCheck2 size={15} />
                        <span>
                          Gửi lúc: {formatMySqlDateTime(item.submittedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="report-metrics-row">
                      <div>
                        <UsersRound size={16} />
                        <span>
                          <strong>{item.actualGuestCount || 0}</strong> khách
                          thực tế
                        </span>
                      </div>
                      <div>
                        <XCircle size={16} />
                        <span>
                          <strong>{item.absentGuestCount || 0}</strong> khách
                          vắng
                        </span>
                      </div>
                      <div>
                        <Coins size={16} />
                        <span>
                          <strong>{formatCurrency(item.extraCost || 0)}</strong>{" "}
                          phát sinh
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="view-report-btn"
                    onClick={() => openDetail(item.id)}
                  >
                    <Eye size={17} />
                    Xem báo cáo
                  </button>
                </article>
              ))}
            </div>
          )}

          {data.pagination?.totalPages > 1 && (
            <div className="report-pagination">
              <Pagination
                page={data.pagination.page}
                totalPages={data.pagination.totalPages}
                onPageChange={(page) =>
                  setFilters((current) => ({ ...current, page }))
                }
              />
            </div>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => !processing && setSelected(null)}
        title="Chi tiết báo cáo chuyến đi"
        size="lg"
      >
        {selected && (
          <div className="report-detail">
            <section className="detail-hero">
              <div>
                <span>
                  {selected.tourCode || "Tour"} ·{" "}
                  {selected.destinationName || "Điểm đến"}
                </span>
                <h3>{selected.tourName || "Chuyến đi"}</h3>
                <p>
                  HDV {selected.guideName || "--"} · Gửi lúc{" "}
                  {formatMySqlDateTime(selected.submittedAt)}
                </p>
              </div>
              <StatusBadge status={selected.status} />
            </section>

            <div className="detail-grid">
              <Info label="Hướng dẫn viên" value={selected.guideName} />
              <Info
                label="Thời gian tour"
                value={`${formatDate(selected.departureDate)} - ${formatDate(
                  selected.endDate,
                )}`}
              />
              <Info
                label="Khách thực tế"
                value={`${selected.actualGuestCount || 0} khách`}
              />
              <Info
                label="Khách vắng"
                value={`${selected.absentGuestCount || 0} khách`}
              />
              <Info
                label="Chi phí phát sinh"
                value={formatCurrency(selected.extraCost || 0)}
              />
              <Info
                label="Ghi chú chi phí"
                value={selected.extraCostNote || "Không có"}
              />
            </div>

            <Section title="Đánh giá chất lượng dịch vụ">
              <div className="ratings-grid">
                <RatingChip
                  label="Lịch trình"
                  value={selected.itineraryRating}
                />
                <RatingChip
                  label="Xe vận chuyển"
                  value={selected.vehicleRating}
                />
                <RatingChip label="Khách sạn" value={selected.hotelRating} />
                <RatingChip
                  label="Nhà hàng"
                  value={selected.restaurantRating}
                />
              </div>
            </Section>

            <div className="detail-two-col">
              <Section title="Tổng kết chuyến đi">
                <p>{selected.summary || "Chưa có nội dung tổng kết."}</p>
              </Section>
              <Section title="Sự cố đáng chú ý">
                <p>
                  {selected.incidentsSummary || "Không có sự cố đáng chú ý."}
                </p>
              </Section>
            </div>

            <Section title="Đề xuất cải thiện">
              <p>{selected.recommendations || "Không có đề xuất."}</p>
            </Section>

            <label className="admin-note">
              <span>Ghi chú của admin</span>
              <textarea
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                placeholder="Nhập nhận xét, kết quả đối soát hoặc nội dung cần lưu ý..."
              />
            </label>

            <div className="detail-actions">
              {selected.status !== "reviewed" ? (
                <button
                  type="button"
                  className="primary"
                  disabled={processing}
                  onClick={() => review("review")}
                >
                  <CheckCircle2 size={17} />
                  {processing ? "Đang xử lý..." : "Xác nhận đã xem xét"}
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  disabled={processing}
                  onClick={() => review("reopen")}
                >
                  <RefreshCcw size={17} />
                  Chuyển về chờ xem xét
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <style jsx global>{`
        .report-page {
          display: grid;
          gap: 18px;
          color: #0f172a;
        }

        .report-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          box-shadow: 0 8px 28px rgba(15, 23, 42, 0.05);
        }

        .report-tabs a {
          min-height: 42px;
          padding: 0 16px;
          border-radius: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          font-size: 14px;
          font-weight: 800;
          color: #475569;
          transition: all 0.2s ease;
        }

        .report-tabs a:hover {
          background: #f8fafc;
          color: #1d4ed8;
        }

        .report-tabs a.active {
          color: #fff;
          background: linear-gradient(135deg, #2563eb, #4f46e5);
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.25);
        }

        .report-hero {
          position: relative;
          overflow: hidden;
          min-height: 150px;
          padding: 28px 30px;
          border-radius: 22px;
          background:
            radial-gradient(
              circle at 88% 20%,
              rgba(255, 255, 255, 0.24),
              transparent 28%
            ),
            linear-gradient(135deg, #0f4c81 0%, #2563eb 50%, #4f46e5 100%);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          box-shadow: 0 18px 42px rgba(37, 99, 235, 0.2);
        }

        .report-hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(
            rgba(255, 255, 255, 0.14) 1.5px,
            transparent 1.5px
          );
          background-size: 22px 22px;
          pointer-events: none;
        }

        .hero-copy,
        .report-hero button {
          position: relative;
          z-index: 1;
        }

        .hero-eyebrow {
          display: inline-flex;
          margin-bottom: 10px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.09em;
          color: #dbeafe;
        }

        .report-hero h2 {
          margin: 0 0 8px;
          font-size: clamp(24px, 3vw, 32px);
          letter-spacing: -0.03em;
        }

        .report-hero p {
          max-width: 720px;
          margin: 0;
          color: rgba(255, 255, 255, 0.84);
          line-height: 1.65;
        }

        .report-hero button {
          min-height: 44px;
          padding: 0 16px;
          border: 1px solid rgba(255, 255, 255, 0.34);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
          backdrop-filter: blur(10px);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .report-hero button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.24);
          transform: translateY(-1px);
        }

        .report-hero button:disabled {
          opacity: 0.68;
          cursor: not-allowed;
        }

        .report-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .report-summary-card {
          min-height: 110px;
          padding: 18px;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          background: #fff;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.045);
        }

        .summary-icon {
          width: 46px;
          height: 46px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
        }

        .report-summary-card > div:last-child {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        .report-summary-card span {
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
        }

        .report-summary-card strong {
          color: #0f172a;
          font-size: 22px;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }

        .report-summary-card small {
          color: #94a3b8;
          font-size: 11px;
        }

        .report-summary-card.amber .summary-icon {
          background: #fff7ed;
          color: #ea580c;
        }
        .report-summary-card.green .summary-icon {
          background: #ecfdf5;
          color: #059669;
        }
        .report-summary-card.blue .summary-icon {
          background: #eff6ff;
          color: #2563eb;
        }
        .report-summary-card.violet .summary-icon {
          background: #f5f3ff;
          color: #7c3aed;
        }

        .report-toolbar {
          padding: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          background: #fff;
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 200px auto;
          gap: 12px;
          align-items: center;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
        }

        .report-search {
          min-height: 44px;
          padding: 0 13px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 9px;
          color: #94a3b8;
          transition: all 0.2s ease;
        }

        .report-search:focus-within {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .report-search input {
          width: 100%;
          border: 0;
          outline: 0;
          color: #0f172a;
          background: transparent;
          font-size: 14px;
        }

        .report-toolbar select {
          min-height: 44px;
          padding: 0 12px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          background: #fff;
          color: #334155;
          font-weight: 700;
          outline: none;
        }

        .report-total {
          min-height: 44px;
          padding: 0 14px;
          border-radius: 12px;
          background: #f8fafc;
          color: #475569;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }

        .report-total strong {
          color: #0f172a;
        }

        .report-list-card {
          padding: 18px;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
        }

        .report-list {
          display: grid;
          gap: 14px;
        }

        .report-item {
          position: relative;
          overflow: hidden;
          padding: 18px 18px 18px 22px;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: linear-gradient(180deg, #ffffff, #fbfdff);
          display: flex;
          align-items: center;
          gap: 18px;
          transition: all 0.2s ease;
        }

        .report-item:hover {
          border-color: #bfdbfe;
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(37, 99, 235, 0.09);
        }

        .report-item-accent {
          position: absolute;
          inset: 0 auto 0 0;
          width: 5px;
          background: linear-gradient(180deg, #2563eb, #4f46e5);
        }

        .report-item-main {
          flex: 1;
          min-width: 0;
        }

        .report-item-head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
        }

        .report-code-line {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .report-code-line i {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #94a3b8;
        }

        .report-item h3 {
          margin: 5px 0 0;
          color: #0f172a;
          font-size: 18px;
          line-height: 1.35;
        }

        .report-status {
          min-height: 30px;
          padding: 0 10px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 900;
          white-space: nowrap;
        }

        .report-status i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
        }

        .report-status.submitted {
          background: #fff7ed;
          color: #c2410c;
        }

        .report-status.reviewed {
          background: #ecfdf5;
          color: #047857;
        }

        .report-status.draft {
          background: #f1f5f9;
          color: #64748b;
        }

        .report-meta-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 18px;
          margin-top: 13px;
          color: #64748b;
          font-size: 12px;
        }

        .report-meta-grid > div {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .report-meta-grid strong {
          color: #334155;
        }

        .report-metrics-row {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          margin-top: 13px;
        }

        .report-metrics-row > div {
          min-height: 38px;
          padding: 0 11px;
          border-radius: 10px;
          background: #f8fafc;
          color: #64748b;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
        }

        .report-metrics-row strong {
          color: #0f172a;
        }

        .view-report-btn {
          min-height: 42px;
          padding: 0 15px;
          border: 1px solid #bfdbfe;
          border-radius: 12px;
          background: #eff6ff;
          color: #1d4ed8;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
        }

        .view-report-btn:hover {
          background: #dbeafe;
          transform: translateY(-1px);
        }

        .report-empty {
          min-height: 260px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 8px;
          text-align: center;
        }

        .report-empty > div {
          width: 66px;
          height: 66px;
          border-radius: 50%;
          background: #eff6ff;
          color: #2563eb;
          display: grid;
          place-items: center;
        }

        .report-empty strong {
          margin-top: 4px;
          font-size: 17px;
        }

        .report-empty p {
          margin: 0;
          color: #94a3b8;
        }

        .report-pagination {
          display: flex;
          justify-content: center;
          margin-top: 18px;
        }

        .detail-hero {
          padding: 18px;
          border-radius: 16px;
          background: linear-gradient(135deg, #eff6ff, #f8fafc);
          border: 1px solid #dbeafe;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }

        .detail-hero > div:first-child {
          min-width: 0;
        }

        .detail-hero span {
          color: #2563eb;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .detail-hero h3 {
          margin: 6px 0 5px;
          font-size: 22px;
        }

        .detail-hero p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .detail-grid > div {
          min-height: 76px;
          padding: 13px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #fff;
          display: grid;
          gap: 5px;
        }

        .detail-grid span {
          color: #64748b;
          font-size: 11px;
        }

        .detail-grid strong {
          color: #0f172a;
          font-size: 13px;
          line-height: 1.45;
        }

        .report-section {
          margin-top: 16px;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #fff;
        }

        .report-section h3 {
          margin: 0 0 12px;
          font-size: 15px;
        }

        .report-section p {
          margin: 0;
          color: #475569;
          line-height: 1.65;
          white-space: pre-wrap;
        }

        .ratings-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .rating-chip {
          min-height: 68px;
          padding: 12px;
          border-radius: 12px;
          background: #fffbeb;
          color: #92400e;
          display: grid;
          gap: 6px;
        }

        .rating-chip span {
          color: #78716c;
          font-size: 11px;
        }

        .rating-chip strong {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 15px;
        }

        .detail-two-col {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .admin-note {
          display: grid;
          gap: 8px;
          margin-top: 16px;
        }

        .admin-note span {
          color: #0f172a;
          font-size: 13px;
          font-weight: 800;
        }

        .admin-note textarea {
          min-height: 110px;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          resize: vertical;
          outline: none;
          font: inherit;
        }

        .admin-note textarea:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .detail-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 16px;
        }

        .detail-actions button {
          min-height: 42px;
          padding: 0 15px;
          border-radius: 11px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
          cursor: pointer;
        }

        .detail-actions .primary {
          border: 1px solid #2563eb;
          background: #2563eb;
          color: #fff;
        }

        .detail-actions .secondary {
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #334155;
        }

        .detail-actions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spin {
          animation: report-spin 0.85s linear infinite;
        }

        @keyframes report-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1100px) {
          .report-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .ratings-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 820px) {
          .report-hero {
            align-items: flex-start;
            flex-direction: column;
          }
          .report-toolbar {
            grid-template-columns: 1fr;
          }
          .report-item {
            align-items: stretch;
            flex-direction: column;
          }
          .view-report-btn {
            width: 100%;
          }
          .detail-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .detail-two-col {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 560px) {
          .report-summary-grid,
          .detail-grid,
          .ratings-grid {
            grid-template-columns: 1fr;
          }
          .report-item-head,
          .detail-hero {
            flex-direction: column;
          }
          .report-tabs a {
            flex: 1 1 150px;
          }
        }
      `}</style>
    </AdminLayout>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value ?? "--"}</strong>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="report-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
