import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import Modal from "@/components/Modal";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import { apiFetch } from "@/lib/api";
import { exportAdminSmartReport } from "@/lib/exportExcel";
import { useToast } from "@/components/ToastContext";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { mapLabel } from "@/lib/labels";

const emptyPage = {
  items: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
};

const initialForm = {
  id: "",
  code: "",
  name: "",
  description: "",
  memberTier: "bronze",
  discountType: "percent",
  discountValue: 10,
  maxDiscount: 500000,
  minOrderAmount: 0,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  quota: 100,
  status: "active",
};

function Badge({ children, tone = "default" }) {
  return (
    <span className={`voucher-badge voucher-badge--${tone}`}>{children}</span>
  );
}

function toneStatus(status) {
  if (status === "active") return "success";
  if (status === "inactive") return "warning";
  return "danger";
}

function voucherStatusLabel(status) {
  if (status === "active") return "Đang phát hành";
  if (status === "inactive") return "Tạm ngưng";
  if (status === "expired") return "Hết hạn";
  return status || "Không rõ";
}

function memberTierLabel(tier) {
  if (tier === "bronze") return "Đồng";
  if (tier === "silver") return "Bạc";
  if (tier === "gold") return "Vàng";
  if (tier === "diamond") return "Kim cương";
  return tier || "";
}

function discountTypeLabel(type) {
  if (type === "percent") return "Phần trăm";
  if (type === "fixed") return "Số tiền cố định";
  return type || "";
}

function normalizePercentValue(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) return 0;

  // Tương thích dữ liệu cũ: 10000 được hiểu là 10%.
  if (number > 100 && number % 1000 === 0) {
    return number / 1000;
  }

  return number;
}

function formatVoucherDiscountValue(voucher) {
  if (!voucher) return "0";

  if (voucher.discountType === "percent") {
    return `${normalizePercentValue(voucher.discountValue)}%`;
  }

  return formatCurrency(voucher.discountValue || 0);
}

function getTierTone(tier) {
  const tones = {
    bronze: "bronze",
    silver: "silver",
    gold: "gold",
    diamond: "diamond",
  };

  return tones[String(tier || "").toLowerCase()] || "default";
}

export default function AdminVouchersPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState(emptyPage);
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 10,
    search: "",
    status: "",
    memberTier: "",
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(initialForm);

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== "") q.set(k, String(v));
    });
    return q.toString();
  }, [filters]);

  async function load() {
    setLoading(true);
    try {
      setData(await apiFetch(`/vouchers?${qs}`));
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [qs]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEdit(v) {
    setForm({
      ...initialForm,
      ...v,
      id: String(v.id),
      startDate: String(v.startDate || "").slice(0, 10),
      endDate: String(v.endDate || "").slice(0, 10),
    });
    setModalOpen(true);
  }

  async function openDetail(id) {
    try {
      setDetail(await apiFetch(`/vouchers/${id}`));
      setDetailOpen(true);
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function remove(id) {
    if (
      !window.confirm(
        "Xóa voucher này? Voucher đã dùng sẽ không được xóa cứng.",
      )
    ) {
      return;
    }

    try {
      await apiFetch(`/vouchers/${id}`, { method: "DELETE" });
      showToast("Đã xóa voucher.", "success");
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function save(e) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        ...form,
        code: form.code || undefined,
        discountValue:
          form.discountType === "percent"
            ? normalizePercentValue(form.discountValue)
            : Number(form.discountValue || 0),
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        minOrderAmount: Number(form.minOrderAmount || 0),
        quota: Number(form.quota || 0),
      };

      if (form.id) {
        await apiFetch(`/vouchers/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/vouchers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setModalOpen(false);
      setForm(initialForm);
      await load();

      showToast(
        form.id
          ? "Đã cập nhật voucher."
          : "Đã thêm voucher. Mã có thể tự sinh từ tên chương trình.",
        "success",
      );
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const exportExcel = async () => {
    setExporting(true);
    try {
      await exportAdminSmartReport("vouchers", filters || {});
      showToast(
        "Đã xuất báo cáo Excel gồm Summary + Insights + Data.",
        "success",
      );
    } catch (error) {
      showToast(
        error.message || "Lỗi xuất Excel. Vui lòng kiểm tra lại hệ thống.",
        "error",
      );
    } finally {
      setExporting(false);
    }
  };

  if (loading && data.items.length === 0) {
    return <Loading text="Đang tải voucher..." />;
  }

  return (
    <AdminLayout current="/admin/vouchers" title="Quản lý Voucher">
      <style jsx global>{`
        .voucher-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .voucher-filter-grid {
          display: grid;
          grid-template-columns:
            minmax(240px, 1.7fr)
            minmax(145px, 0.85fr)
            minmax(145px, 0.85fr)
            minmax(170px, 1fr)
            minmax(135px, 0.75fr);
          gap: 12px;
          align-items: center;
          flex: 1;
          min-width: 0;
        }

        .voucher-filter-grid > input,
        .voucher-filter-grid > select {
          width: 100%;
          min-width: 0;
          min-height: 42px;
          padding: 10px 13px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: #ffffff;
          color: #0f172a;
          font-size: 14px;
          box-sizing: border-box;
          outline: none;
        }

        .voucher-filter-grid > input:focus,
        .voucher-filter-grid > select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .voucher-toolbar-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-shrink: 0;
        }

        .voucher-page-card {
          border-radius: 24px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
          overflow: hidden;
        }

        .voucher-toolbar-shell {
          padding: 18px;
          border-bottom: 1px solid #eef2f7;
          background:
            radial-gradient(
              circle at top right,
              rgba(59, 130, 246, 0.08),
              transparent 34%
            ),
            #ffffff;
        }

        .voucher-table-wrap {
          overflow-x: auto;
          padding: 0 18px 18px;
        }

        .voucher-table {
          width: 100%;
          min-width: 1180px;
          border-collapse: separate;
          border-spacing: 0;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          overflow: hidden;
        }

        .voucher-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #f8fafc;
          color: #475569;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 15px 14px;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          white-space: nowrap;
        }

        .voucher-table tbody td {
          padding: 16px 14px;
          border-bottom: 1px solid #eef2f7;
          color: #334155;
          vertical-align: middle;
        }

        .voucher-table tbody tr {
          transition:
            background 0.18s ease,
            transform 0.18s ease;
        }

        .voucher-table tbody tr:hover {
          background: #f8fbff;
        }

        .voucher-table tbody tr:last-child td {
          border-bottom: none;
        }

        .voucher-code {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          padding: 6px 10px;
          border-radius: 10px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.03em;
        }

        .voucher-name {
          max-width: 260px;
          color: #0f172a;
          font-weight: 700;
          line-height: 1.4;
        }

        .voucher-discount {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .voucher-discount strong {
          color: #ea580c;
          font-size: 16px;
        }

        .voucher-discount span {
          color: #94a3b8;
          font-size: 12px;
        }

        .voucher-quota {
          display: flex;
          flex-direction: column;
          gap: 7px;
          min-width: 110px;
        }

        .voucher-quota-bar {
          width: 100%;
          height: 7px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
        }

        .voucher-quota-bar > div {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #3b82f6, #22c55e);
        }

        .voucher-date {
          min-width: 180px;
          line-height: 1.5;
          color: #475569;
        }

        .voucher-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          padding: 5px 11px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
          border: 1px solid transparent;
        }

        .voucher-badge--success {
          background: #dcfce7;
          color: #166534;
          border-color: #bbf7d0;
        }

        .voucher-badge--warning {
          background: #fef3c7;
          color: #92400e;
          border-color: #fde68a;
        }

        .voucher-badge--danger {
          background: #fee2e2;
          color: #991b1b;
          border-color: #fecaca;
        }

        .voucher-badge--default {
          background: #f1f5f9;
          color: #475569;
          border-color: #e2e8f0;
        }

        .voucher-badge--bronze {
          background: #fff7ed;
          color: #9a3412;
          border-color: #fed7aa;
        }

        .voucher-badge--silver {
          background: #f8fafc;
          color: #475569;
          border-color: #cbd5e1;
        }

        .voucher-badge--gold {
          background: #fefce8;
          color: #a16207;
          border-color: #fde68a;
        }

        .voucher-badge--diamond {
          background: #eef2ff;
          color: #4338ca;
          border-color: #c7d2fe;
        }

        .voucher-pagination {
          padding: 0 18px 18px;
        }

        .voucher-toolbar-actions .btn {
          min-height: 42px;
          border-radius: 12px;
          font-weight: 800;
        }

        .voucher-toolbar-actions .btn-primary {
          background: linear-gradient(135deg, #f59e0b, #fb923c);
          border: none;
          color: #ffffff;
          box-shadow: 0 10px 24px rgba(249, 115, 22, 0.24);
        }

        .voucher-toolbar-actions .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 30px rgba(249, 115, 22, 0.28);
        }

        .voucher-empty {
          padding: 52px 20px !important;
          text-align: center;
          color: #64748b;
          background: #f8fafc;
        }

        .voucher-toolbar-summary {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          margin-top: 12px;
          color: #64748b;
          font-size: 13px;
        }

        .voucher-toolbar-summary strong {
          color: #1d4ed8;
          font-size: 14px;
        }

        .voucher-table th:last-child,
        .voucher-table td:last-child {
          min-width: 210px;
          width: 210px;
          text-align: right;
        }

        .row-actions .btn {
          flex: 0 0 auto;
        }

        @media (max-width: 1280px) {
          .voucher-filter-grid {
            grid-template-columns: repeat(3, minmax(180px, 1fr));
          }

          .voucher-toolbar-actions {
            width: 100%;
          }
        }

        @media (max-width: 860px) {
          .voucher-filter-grid {
            grid-template-columns: repeat(2, minmax(160px, 1fr));
          }
        }

        @media (max-width: 640px) {
          .voucher-filter-grid {
            grid-template-columns: 1fr;
          }

          .voucher-toolbar-summary {
            justify-content: flex-start;
          }

          .voucher-toolbar-actions {
            display: grid;
            grid-template-columns: 1fr;
          }

          .voucher-toolbar-actions .btn {
            width: 100%;
          }
        }

        /* Các style có sẵn */
        .row-actions,
        .admin-inline-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: nowrap;
          white-space: nowrap;
        }
        .row-actions .btn,
        .admin-inline-actions .btn {
          height: 32px;
          min-width: 56px;
          padding: 0 12px;
          border-radius: 8px;
          border: 1px solid transparent;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
          box-shadow: none;
          gap: 6px;
          white-space: nowrap;
        }
        .row-actions .btn-light,
        .admin-inline-actions .btn-light {
          background: #ffffff;
          color: #111827;
          border-color: #e5e7eb;
        }
        .row-actions .btn-light:hover,
        .admin-inline-actions .btn-light:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .row-actions .btn-primary,
        .admin-inline-actions .btn-primary {
          background: #ffffff;
          color: #111827;
          border-color: #e5e7eb;
        }
        .row-actions .btn-primary:hover,
        .admin-inline-actions .btn-primary:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .row-actions .btn-danger,
        .admin-inline-actions .btn-danger {
          background: #fee2e2;
          color: #dc2626;
          border-color: #fee2e2;
        }
        .row-actions .btn-danger:hover,
        .admin-inline-actions .btn-danger:hover {
          background: #fecaca;
          border-color: #fecaca;
        }
      `}</style>

      <div className="voucher-page-card">
        <div className="voucher-toolbar-shell">
          <div className="voucher-toolbar">
            <div className="voucher-filter-grid">
              <input
                placeholder="Tìm mã voucher, tên chương trình..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((p) => ({
                    ...p,
                    search: e.target.value,
                    page: 1,
                  }))
                }
              />

              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters((p) => ({
                    ...p,
                    status: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả trạng thái</option>
                <option value="active">Đang phát hành</option>
                <option value="inactive">Tạm ngưng</option>
                <option value="expired">Hết hạn</option>
              </select>

              <select
                value={filters.memberTier}
                onChange={(e) =>
                  setFilters((p) => ({
                    ...p,
                    memberTier: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả hạng thành viên</option>
                <option value="bronze">Đồng</option>
                <option value="silver">Bạc</option>
                <option value="gold">Vàng</option>
                <option value="diamond">Kim cương</option>
              </select>

              <select
                value={filters.sortBy}
                onChange={(e) =>
                  setFilters((p) => ({
                    ...p,
                    sortBy: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="createdAt">Ngày thêm</option>
                <option value="code">Mã voucher</option>
                <option value="name">Tên chương trình</option>
                <option value="memberTier">Hạng thành viên</option>
                <option value="discountValue">Giá trị giảm</option>
                <option value="quota">Quota</option>
                <option value="usedCount">Số lần dùng</option>
                <option value="endDate">Ngày hết hạn</option>
                <option value="status">Trạng thái</option>
              </select>

              <select
                value={filters.sortOrder}
                onChange={(e) =>
                  setFilters((p) => ({
                    ...p,
                    sortOrder: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="desc">Giảm dần</option>
                <option value="asc">Tăng dần</option>
              </select>
            </div>

            <div className="voucher-toolbar-actions">
              <button
                className="btn btn-light"
                type="button"
                onClick={() =>
                  setFilters({
                    page: 1,
                    pageSize: 10,
                    search: "",
                    status: "",
                    memberTier: "",
                    sortBy: "createdAt",
                    sortOrder: "desc",
                  })
                }
              >
                Xóa lọc
              </button>

              <button
                className="btn btn-light"
                type="button"
                onClick={exportExcel}
                disabled={exporting}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {exporting ? "Đang xuất..." : "Xuất Excel"}
              </button>

              <button
                className="btn btn-primary"
                type="button"
                onClick={openCreate}
              >
                + Thêm voucher
              </button>
            </div>
          </div>

          <div className="voucher-toolbar-summary">
            <span>
              Tìm thấy <strong>{formatNumber(data.pagination.total)}</strong>{" "}
              voucher
            </span>
          </div>
        </div>

        <div className="voucher-table-wrap">
          <table className="voucher-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên chương trình</th>
                <th>Hạng</th>
                <th>Giảm</th>
                <th>Quota</th>
                <th>Thời hạn</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>

            <tbody>
              {data.items.length ? (
                data.items.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="voucher-code">{v.code}</span>
                    </td>

                    <td>
                      <div className="voucher-name">{v.name}</div>
                    </td>

                    <td>
                      <Badge tone={getTierTone(v.memberTier)}>
                        {memberTierLabel(v.memberTier)}
                      </Badge>
                    </td>

                    <td>
                      <div className="voucher-discount">
                        <strong>{formatVoucherDiscountValue(v)}</strong>
                        {v.maxDiscount ? (
                          <span>Tối đa {formatCurrency(v.maxDiscount)}</span>
                        ) : (
                          <span>Không giới hạn mức giảm</span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="voucher-quota">
                        <strong>
                          {formatNumber(v.usedCount || 0)} /{" "}
                          {formatNumber(v.quota || 0)}
                        </strong>
                        <div className="voucher-quota-bar">
                          <div
                            style={{
                              width: `${
                                Number(v.quota || 0) > 0
                                  ? Math.min(
                                      (Number(v.usedCount || 0) /
                                        Number(v.quota || 1)) *
                                        100,
                                      100,
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="voucher-date">
                        <div>{formatDate(v.startDate)}</div>
                        <div style={{ color: "#94a3b8", fontSize: 12 }}>
                          đến {formatDate(v.endDate)}
                        </div>
                      </div>
                    </td>

                    <td>
                      <Badge tone={toneStatus(v.status)}>
                        {voucherStatusLabel(v.status)}
                      </Badge>
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn-light btn-sm"
                          type="button"
                          onClick={() => openDetail(v.id)}
                        >
                          Xem
                        </button>

                        <button
                          className="btn btn-light btn-sm"
                          type="button"
                          onClick={() => openEdit(v)}
                        >
                          Sửa
                        </button>

                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          onClick={() => remove(v.id)}
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="voucher-empty">
                    Không có voucher phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="voucher-pagination">
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={(page) => setFilters((p) => ({ ...p, page }))}
          />
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => !submitting && setModalOpen(false)}
        title={form.id ? "Sửa voucher" : "Thêm voucher"}
        size="lg"
        footer={
          <>
            <button
              className="btn btn-light"
              type="button"
              onClick={() => setModalOpen(false)}
            >
              Đóng
            </button>

            <button
              className="btn btn-primary"
              type="button"
              disabled={submitting}
              onClick={save}
            >
              {submitting ? "Đang lưu..." : "Lưu voucher"}
            </button>
          </>
        }
      >
        <form className="modal-form-grid two-col" onSubmit={save}>
          <div className="field">
            <label>Mã voucher</label>
            <input
              value={form.code || ""}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
            />
          </div>

          <div className="field">
            <label>Tên chương trình</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>

          <div className="field">
            <label>Hạng áp dụng</label>
            <select
              value={form.memberTier}
              onChange={(e) =>
                setForm((p) => ({ ...p, memberTier: e.target.value }))
              }
            >
              <option value="bronze">Đồng</option>
              <option value="silver">Bạc</option>
              <option value="gold">Vàng</option>
              <option value="diamond">Kim cương</option>
            </select>
          </div>

          <div className="field">
            <label>Loại giảm</label>
            <select
              value={form.discountType}
              onChange={(e) =>
                setForm((p) => ({ ...p, discountType: e.target.value }))
              }
            >
              <option value="percent">Phần trăm</option>
              <option value="fixed">Số tiền cố định</option>
            </select>
          </div>

          <div className="field">
            <label>Giá trị giảm</label>
            <input
              type="number"
              min="0"
              max={form.discountType === "percent" ? 100 : undefined}
              step={form.discountType === "percent" ? "0.1" : "1000"}
              value={form.discountValue}
              onChange={(e) =>
                setForm((p) => ({ ...p, discountValue: e.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Giảm tối đa</label>
            <input
              type="number"
              value={form.maxDiscount || ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, maxDiscount: e.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Đơn tối thiểu</label>
            <input
              type="number"
              value={form.minOrderAmount}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  minOrderAmount: e.target.value,
                }))
              }
            />
          </div>

          <div className="field">
            <label>Quota</label>
            <input
              type="number"
              value={form.quota}
              onChange={(e) =>
                setForm((p) => ({ ...p, quota: e.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Ngày bắt đầu</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) =>
                setForm((p) => ({ ...p, startDate: e.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Ngày kết thúc</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) =>
                setForm((p) => ({ ...p, endDate: e.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Trạng thái</label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((p) => ({ ...p, status: e.target.value }))
              }
            >
              <option value="active">Đang phát hành</option>
              <option value="inactive">Tạm ngưng</option>
              <option value="expired">Hết hạn</option>
            </select>
          </div>

          <div className="field span-2">
            <label>Mô tả</label>
            <textarea
              rows={4}
              value={form.description || ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Chi tiết voucher"
        size="xl"
      >
        {detail ? (
          <div className="section-stack">
            <div className="detail-grid">
              <div className="detail-card">
                <h4>{detail.code}</h4>

                <ul className="detail-list">
                  <li>
                    <span>Tên</span>
                    <strong>{detail.name}</strong>
                  </li>

                  <li>
                    <span>Hạng áp dụng</span>
                    <strong>{mapLabel("memberTier", detail.memberTier)}</strong>
                  </li>

                  <li>
                    <span>Đã dùng</span>
                    <strong>
                      {detail.usedCount || 0} / {detail.quota || 0}
                    </strong>
                  </li>

                  <li>
                    <span>Thời hạn</span>
                    <strong>
                      {formatDate(detail.startDate)} -{" "}
                      {formatDate(detail.endDate)}
                    </strong>
                  </li>

                  <li>
                    <span>Trạng thái</span>
                    <strong>{voucherStatusLabel(detail.status)}</strong>
                  </li>
                </ul>
              </div>

              <div className="detail-card">
                <h4>Người đã nhận voucher</h4>

                {(detail.userVouchers || []).length ? (
                  <div className="overview-list">
                    {detail.userVouchers.map((uv) => (
                      <div key={uv.id} className="overview-list-item">
                        <div>
                          <strong>{uv.user?.fullName}</strong>
                          <span
                            style={{
                              display: "block",
                              color: "#64748b",
                              fontSize: 13,
                            }}
                          >
                            {uv.user?.email}
                          </span>
                        </div>

                        <Badge>{uv.status}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Chưa gán cho khách hàng nào.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </AdminLayout>
  );
}
