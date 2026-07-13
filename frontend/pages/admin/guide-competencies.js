import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Filter,
  Languages,
  MapPinned,
  RefreshCcw,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import Modal from "@/components/Modal";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";

const TYPE_LABELS = {
  language: "Ngoại ngữ",
  route: "Tuyến điểm chuyên sâu",
  skill: "Kỹ năng đặc biệt",
  certificate: "Chứng chỉ ngành",
};

const STATUS_LABELS = {
  pending: "Đang chờ duyệt",
  verified: "Đã xác minh",
  rejected: "Đã từ chối",
};

function GuideManagementTabs() {
  const tabs = [
    { href: "/admin/guides", label: "Tổng quan HDV" },
    { href: "/admin/guide-competencies", label: "Duyệt chứng chỉ" },
    { href: "/admin/incidents", label: "Duyệt sự cố" },
    { href: "/admin/guide-availabilities", label: "Duyệt lịch bận" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        padding: 8,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
      }}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          style={{
            minHeight: 42,
            padding: "0 16px",
            borderRadius: 11,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            fontWeight: 800,
            color:
              tab.href === "/admin/guide-competencies" ? "#fff" : "#475569",
            background:
              tab.href === "/admin/guide-competencies"
                ? "#2563eb"
                : "transparent",
            boxShadow:
              tab.href === "/admin/guide-competencies"
                ? "0 6px 16px rgba(37, 99, 235, .22)"
                : "none",
          }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function TypeIcon({ type }) {
  if (type === "language") return <Languages size={19} />;
  if (type === "route") return <MapPinned size={19} />;
  if (type === "certificate") return <Award size={19} />;
  return <Sparkles size={19} />;
}

export default function AdminGuideCompetenciesPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [data, setData] = useState({
    items: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  });
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 10,
    search: "",
    status: "pending",
    competencyType: "all",
  });
  const [selected, setSelected] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== "" && value != null) params.set(key, String(value));
    });
    return params.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await apiFetch(
        `/trip-operations/admin/guide-competencies?${queryString}`,
      );
      setData(
        result || {
          items: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
        },
      );
    } catch (error) {
      showToast(error?.message || "Không tải được hồ sơ năng lực.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [queryString]);

  const review = async (item, action, reason = "") => {
    try {
      setReviewing(true);
      await apiFetch(
        `/trip-operations/admin/guide-competencies/${item.id}/review`,
        {
          method: "PATCH",
          body: JSON.stringify({ action, reason }),
        },
      );
      showToast(
        action === "approve"
          ? "Đã xác minh hồ sơ năng lực."
          : "Đã từ chối hồ sơ năng lực.",
        "success",
      );
      setSelected(null);
      setRejecting(null);
      setRejectReason("");
      await load();
    } catch (error) {
      showToast(error?.message || "Không thể xử lý hồ sơ.", "error");
    } finally {
      setReviewing(false);
    }
  };

  return (
    <AdminLayout
      current="/admin/guides"
      title="Duyệt năng lực Hướng dẫn viên"
      subtitle="Kiểm tra minh chứng, phê duyệt ngoại ngữ, kỹ năng và chứng chỉ"
    >
      <div className="competency-admin-page">
        <GuideManagementTabs />
        <section className="competency-header-card">
          <div>
            <span>QUẢN LÝ CHUYÊN MÔN</span>
            <h2>Hồ sơ năng lực chờ duyệt</h2>
            <p>
              Chỉ hồ sơ đã xác minh mới hiển thị trong hồ sơ chính và được dùng
              để hỗ trợ phân công tour.
            </p>
          </div>
          <div className="header-actions">
            <Link href="/admin/guides">Quay lại danh sách HDV</Link>
            <button type="button" onClick={load}>
              <RefreshCcw size={16} /> Làm mới
            </button>
          </div>
        </section>

        <section className="competency-filter-card">
          <div className="search-box">
            <Search size={18} />
            <input
              value={filters.search}
              placeholder="Tìm HDV, kỹ năng, số chứng chỉ..."
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
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Đang chờ duyệt</option>
            <option value="verified">Đã xác minh</option>
            <option value="rejected">Đã từ chối</option>
          </select>
          <select
            value={filters.competencyType}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                competencyType: event.target.value,
                page: 1,
              }))
            }
          >
            <option value="all">Tất cả phân loại</option>
            <option value="language">Ngoại ngữ</option>
            <option value="route">Tuyến điểm</option>
            <option value="skill">Kỹ năng</option>
            <option value="certificate">Chứng chỉ</option>
          </select>
          <div className="filter-total">
            <Filter size={16} /> {data.pagination.total} hồ sơ
          </div>
        </section>

        <section className="competency-list-card">
          {loading ? (
            <Loading text="Đang tải hồ sơ năng lực..." />
          ) : !data.items?.length ? (
            <div className="empty-state">
              <FileCheck2 size={34} />
              <strong>Không có hồ sơ phù hợp</strong>
              <p>Thử thay đổi trạng thái hoặc từ khóa tìm kiếm.</p>
            </div>
          ) : (
            <div className="competency-list">
              {data.items.map((item) => {
                const status = item.verificationStatus || "pending";
                return (
                  <article className="competency-row" key={item.id}>
                    <div className={`type-icon ${item.competencyType}`}>
                      <TypeIcon type={item.competencyType} />
                    </div>
                    <div className="main-info">
                      <div className="row-head">
                        <div>
                          <span>
                            {TYPE_LABELS[item.competencyType] || "Năng lực"}
                          </span>
                          <h3>{item.name}</h3>
                        </div>
                        <em className={status}>
                          {STATUS_LABELS[status] || status}
                        </em>
                      </div>
                      <div className="guide-info">
                        <strong>{item.guideName}</strong>
                        <span>{item.guidePhone || "Chưa có SĐT"}</span>
                        <span>{item.guideEmail || "Chưa có email"}</span>
                      </div>
                      <div className="meta-grid">
                        <span>
                          <b>Trình độ:</b> {item.level || "--"}
                        </span>
                        <span>
                          <b>Đơn vị cấp:</b> {item.issuedBy || "--"}
                        </span>
                        <span>
                          <b>Số hiệu:</b> {item.certificateNo || "--"}
                        </span>
                        <span>
                          <b>Ngày khai báo:</b> {formatDate(item.createdAt)}
                        </span>
                      </div>
                      {status === "rejected" && item.rejectionReason && (
                        <div className="rejection-note">
                          Lý do từ chối: {item.rejectionReason}
                        </div>
                      )}
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="view"
                        onClick={() => setSelected(item)}
                      >
                        Xem chi tiết
                      </button>
                      {item.documentUrl && (
                        <a
                          href={item.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={15} /> Minh chứng
                        </a>
                      )}
                      {status === "pending" && (
                        <>
                          <button
                            type="button"
                            className="approve"
                            onClick={() => review(item, "approve")}
                            disabled={reviewing}
                          >
                            <CheckCircle2 size={16} /> Duyệt
                          </button>
                          <button
                            type="button"
                            className="reject"
                            onClick={() => setRejecting(item)}
                            disabled={reviewing}
                          >
                            <XCircle size={16} /> Từ chối
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {data.pagination.totalPages > 1 && (
            <div className="pagination-wrap">
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
        onClose={() => setSelected(null)}
        title="Chi tiết hồ sơ năng lực"
        size="md"
      >
        {selected && (
          <div className="detail-modal">
            <div className="detail-grid">
              <div>
                <span>Hướng dẫn viên</span>
                <strong>{selected.guideName}</strong>
              </div>
              <div>
                <span>Phân loại</span>
                <strong>{TYPE_LABELS[selected.competencyType]}</strong>
              </div>
              <div>
                <span>Tên năng lực</span>
                <strong>{selected.name}</strong>
              </div>
              <div>
                <span>Trình độ</span>
                <strong>{selected.level || "--"}</strong>
              </div>
              <div>
                <span>Số hiệu</span>
                <strong>{selected.certificateNo || "--"}</strong>
              </div>
              <div>
                <span>Đơn vị cấp</span>
                <strong>{selected.issuedBy || "--"}</strong>
              </div>
              <div>
                <span>Ngày cấp</span>
                <strong>{formatDate(selected.issuedDate)}</strong>
              </div>
              <div>
                <span>Ngày hết hạn</span>
                <strong>{formatDate(selected.expiryDate)}</strong>
              </div>
            </div>
            {selected.note && (
              <div className="detail-note">
                <span>Ghi chú</span>
                <p>{selected.note}</p>
              </div>
            )}
            {selected.documentUrl ? (
              <a
                className="evidence-link"
                href={selected.documentUrl}
                target="_blank"
                rel="noreferrer"
              >
                <FileCheck2 size={17} /> Mở minh chứng{" "}
                <ExternalLink size={15} />
              </a>
            ) : (
              <div className="missing-evidence">
                Hồ sơ này chưa có minh chứng.
              </div>
            )}
            {selected.verificationStatus === "pending" && (
              <div className="modal-actions">
                <button
                  className="approve"
                  type="button"
                  onClick={() => review(selected, "approve")}
                  disabled={reviewing}
                >
                  Duyệt hồ sơ
                </button>
                <button
                  className="reject"
                  type="button"
                  onClick={() => setRejecting(selected)}
                  disabled={reviewing}
                >
                  Từ chối
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => !reviewing && setRejecting(null)}
        title="Từ chối hồ sơ năng lực"
        size="sm"
      >
        <div className="reject-modal">
          <p>
            Nhập lý do để hướng dẫn viên biết cần bổ sung hoặc chỉnh sửa gì.
          </p>
          <textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Ví dụ: Ảnh minh chứng không rõ, chứng chỉ đã hết hạn..."
          />
          <div>
            <button
              type="button"
              onClick={() => setRejecting(null)}
              disabled={reviewing}
            >
              Hủy
            </button>
            <button
              type="button"
              className="reject"
              onClick={() => review(rejecting, "reject", rejectReason)}
              disabled={reviewing || !rejectReason.trim()}
            >
              Xác nhận từ chối
            </button>
          </div>
        </div>
      </Modal>

      <style jsx global>{`
        .competency-admin-page {
          display: grid;
          gap: 18px;
          color: #0f172a;
        }
        .competency-header-card,
        .competency-filter-card,
        .competency-list-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
        }
        .competency-header-card {
          padding: 22px 24px;
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: center;
        }
        .competency-header-card > div:first-child > span {
          color: #2563eb;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }
        .competency-header-card h2 {
          margin: 5px 0;
          font-size: 24px;
        }
        .competency-header-card p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }
        .header-actions {
          display: flex;
          gap: 9px;
          align-items: center;
        }
        .header-actions a,
        .header-actions button {
          min-height: 40px;
          border: 1px solid #dbe3ef;
          border-radius: 10px;
          padding: 0 13px;
          background: #fff;
          color: #334155;
          font-weight: 800;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
        }
        .competency-filter-card {
          padding: 15px;
          display: grid;
          grid-template-columns: minmax(280px, 1fr) 190px 190px auto;
          gap: 11px;
        }
        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 0 12px;
          color: #94a3b8;
        }
        .search-box input {
          border: 0;
          outline: 0;
          width: 100%;
          min-height: 42px;
        }
        .competency-filter-card select {
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 0 11px;
        }
        .filter-total {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
        }
        .competency-list-card {
          padding: 18px;
        }
        .competency-list {
          display: grid;
          gap: 11px;
        }
        .competency-row {
          display: grid;
          grid-template-columns: 46px minmax(0, 1fr) 150px;
          gap: 14px;
          padding: 15px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
        }
        .type-icon {
          width: 46px;
          height: 46px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          background: #f1f5f9;
          color: #475569;
        }
        .type-icon.language {
          background: #eff6ff;
          color: #2563eb;
        }
        .type-icon.route {
          background: #ecfdf5;
          color: #059669;
        }
        .type-icon.certificate {
          background: #fff7ed;
          color: #ea580c;
        }
        .row-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .row-head span {
          color: #64748b;
          font-size: 11px;
        }
        .row-head h3 {
          margin: 3px 0 0;
          font-size: 16px;
        }
        .row-head em {
          font-style: normal;
          font-size: 10px;
          font-weight: 800;
          border-radius: 999px;
          padding: 5px 8px;
          height: fit-content;
        }
        .row-head em.pending {
          background: #fef3c7;
          color: #92400e;
        }
        .row-head em.verified {
          background: #dcfce7;
          color: #166534;
        }
        .row-head em.rejected {
          background: #fee2e2;
          color: #991b1b;
        }
        .guide-info,
        .meta-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          margin-top: 9px;
          color: #64748b;
          font-size: 11px;
        }
        .guide-info strong {
          color: #0f172a;
        }
        .rejection-note {
          margin-top: 9px;
          padding: 8px 10px;
          border-radius: 8px;
          background: #fef2f2;
          color: #991b1b;
          font-size: 11px;
        }
        .row-actions {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .row-actions button,
        .row-actions a {
          min-height: 35px;
          border-radius: 9px;
          padding: 0 10px;
          border: 1px solid #dbe3ef;
          background: #fff;
          font-weight: 800;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          text-decoration: none;
          cursor: pointer;
        }
        .row-actions .approve,
        .modal-actions .approve {
          background: #ecfdf5;
          color: #047857;
          border-color: #a7f3d0;
        }
        .row-actions .reject,
        .modal-actions .reject,
        .reject-modal .reject {
          background: #fef2f2;
          color: #b91c1c;
          border-color: #fecaca;
        }
        .pagination-wrap {
          display: flex;
          justify-content: center;
          margin-top: 16px;
        }
        .empty-state {
          min-height: 280px;
          display: grid;
          place-content: center;
          justify-items: center;
          gap: 7px;
          color: #64748b;
        }
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 11px;
        }
        .detail-grid > div,
        .detail-note {
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
          display: grid;
          gap: 4px;
        }
        .detail-grid span,
        .detail-note span {
          color: #64748b;
          font-size: 11px;
        }
        .detail-note {
          margin-top: 12px;
        }
        .detail-note p {
          margin: 0;
        }
        .evidence-link {
          margin-top: 13px;
          min-height: 42px;
          border-radius: 10px;
          background: #eff6ff;
          color: #1d4ed8;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          text-decoration: none;
          font-weight: 800;
        }
        .missing-evidence {
          margin-top: 13px;
          padding: 12px;
          border-radius: 10px;
          background: #fff7ed;
          color: #9a3412;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 15px;
        }
        .modal-actions button,
        .reject-modal button {
          min-height: 39px;
          border-radius: 9px;
          padding: 0 13px;
          border: 1px solid #dbe3ef;
          background: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        .reject-modal textarea {
          width: 100%;
          min-height: 120px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 11px;
          box-sizing: border-box;
        }
        .reject-modal > div {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 12px;
        }
        @media (max-width: 900px) {
          .competency-filter-card {
            grid-template-columns: 1fr 1fr;
          }
          .competency-row {
            grid-template-columns: 46px minmax(0, 1fr);
          }
          .row-actions {
            grid-column: 2;
            flex-direction: row;
            flex-wrap: wrap;
          }
        }
        @media (max-width: 650px) {
          .competency-header-card {
            flex-direction: column;
            align-items: stretch;
          }
          .competency-filter-card {
            grid-template-columns: 1fr;
          }
          .detail-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </AdminLayout>
  );
}
