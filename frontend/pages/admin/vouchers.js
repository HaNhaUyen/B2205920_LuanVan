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
  const palette = {
    success: ["#dcfce7", "#166534"],
    warning: ["#fef3c7", "#92400e"],
    danger: ["#fee2e2", "#991b1b"],
    default: ["#e2e8f0", "#334155"],
  };

  const [bg, color] = palette[tone] || palette.default;

  return (
    <span
      style={{
        display: "inline-flex",
        padding: "6px 12px",
        borderRadius: 999,
        background: bg,
        color,
        fontWeight: 700,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
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
        discountValue: Number(form.discountValue || 0),
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
        /* Bổ sung CSS Grid cho bộ lọc */
        .filter-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          flex: 1;
          width: 100%;
        }
        .filter-grid > input,
        .filter-grid > select {
          width: 100%;
          box-sizing: border-box;
        }
        @media (max-width: 640px) {
          .filter-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Các style có sẵn */
        .row-actions,
        .admin-inline-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .row-actions .btn,
        .admin-inline-actions .btn {
          height: 30px;
          min-width: 58px;
          padding: 0 14px;
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

      <div
        className="admin-card"
        style={{ display: "flex", flexDirection: "column", gap: 18 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          {/* Đã thêm class filter-grid vào thẻ div này */}
          <div className="table-search-row filter-grid" style={{ margin: 0 }}>
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
              value={filters.sortBy}
              onChange={(e) =>
                setFilters((p) => ({ ...p, sortBy: e.target.value, page: 1 }))
              }
            >
              <option value="createdAt">Ngày thêm</option>
              <option value="code">Mã voucher</option>
              <option value="name">Tên chương trình</option>
              <option value="discountValue">Giá trị giảm</option>
              <option value="quota">Quota</option>
              <option value="usedCount">Số lần dùng</option>
              <option value="endDate">Ngày hết hạn</option>
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

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: "4px",
            }}
          >
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
              Thêm voucher
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="console-table">
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
                      <strong>{v.code}</strong>
                    </td>

                    <td>{v.name}</td>

                    <td>
                      <Badge>{mapLabel("memberTier", v.memberTier)}</Badge>
                    </td>

                    <td>
                      {v.discountType === "percent"
                        ? `${v.discountValue}%`
                        : formatCurrency(v.discountValue)}
                      {v.maxDiscount ? (
                        <div className="table-muted">
                          Tối đa {formatCurrency(v.maxDiscount)}
                        </div>
                      ) : null}
                    </td>

                    <td>
                      {formatNumber(v.usedCount || 0)} /{" "}
                      {formatNumber(v.quota || 0)}
                    </td>

                    <td>
                      {formatDate(v.startDate)} - {formatDate(v.endDate)}
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
                  <td
                    colSpan="8"
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "#64748b",
                    }}
                  >
                    Không có voucher phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          onPageChange={(page) => setFilters((p) => ({ ...p, page }))}
        />
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
