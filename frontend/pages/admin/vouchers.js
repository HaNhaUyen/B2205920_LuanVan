import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import Modal from "@/components/Modal";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import { apiFetch } from "@/lib/api";
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

  async function exportExcel() {
    setExporting(true);

    try {
      const XLSX = await import("xlsx");

      const exportQuery = new URLSearchParams();
      exportQuery.set("page", "1");
      exportQuery.set("pageSize", "10000");

      if (filters.search) exportQuery.set("search", filters.search);
      if (filters.status) exportQuery.set("status", filters.status);

      const result = await apiFetch(`/vouchers?${exportQuery.toString()}`);
      const vouchers = Array.isArray(result) ? result : result?.items || [];

      const exportData = vouchers.map((v, index) => ({
        STT: index + 1,
        "Mã voucher": v.code || "",
        "Tên chương trình": v.name || "",
        "Mô tả": v.description || "",
        "Hạng áp dụng": memberTierLabel(v.memberTier),
        "Loại giảm": discountTypeLabel(v.discountType),
        "Giá trị giảm":
          v.discountType === "percent"
            ? `${Number(v.discountValue || 0)}%`
            : Number(v.discountValue || 0),
        "Giảm tối đa": Number(v.maxDiscount || 0),
        "Đơn tối thiểu": Number(v.minOrderAmount || 0),
        "Đã dùng": Number(v.usedCount || 0),
        Quota: Number(v.quota || 0),
        "Ngày bắt đầu": v.startDate ? formatDate(v.startDate) : "",
        "Ngày kết thúc": v.endDate ? formatDate(v.endDate) : "",
        "Trạng thái": voucherStatusLabel(v.status),
      }));

      const wb = XLSX.utils.book_new();

      const ws = XLSX.utils.json_to_sheet(
        exportData.length
          ? exportData
          : [
              {
                "Thông báo": "Không có dữ liệu voucher để xuất.",
              },
            ],
      );

      ws["!cols"] = [
        { wch: 8 },
        { wch: 18 },
        { wch: 32 },
        { wch: 38 },
        { wch: 16 },
        { wch: 18 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
        { wch: 12 },
        { wch: 12 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Vouchers");
      XLSX.writeFile(wb, `DanhSachVoucher_${Date.now()}.xlsx`);

      showToast("Đã xuất file Excel voucher thành công.", "success");
    } catch (error) {
      showToast(error.message || "Không thể xuất Excel voucher.", "error");
    } finally {
      setExporting(false);
    }
  }

  if (loading && data.items.length === 0) {
    return <Loading text="Đang tải voucher..." />;
  }

  return (
    <AdminLayout
      current="/admin/vouchers"
      title="Quản lý Voucher"
      subtitle="Tạo mã giảm giá theo hạng thành viên, xem chi tiết, sửa và xóa voucher."
    >
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
          }}
        >
          <div className="table-search-row" style={{ margin: 0, flex: 1 }}>
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
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
                          Chi tiết
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
              placeholder="Để trống để tự sinh theo tên"
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
