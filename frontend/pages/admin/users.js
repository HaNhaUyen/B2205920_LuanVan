import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { formatDate, formatNumber } from "@/lib/format";
import { mapImageUrl } from "@/lib/tour";
import { exportAdminSmartReport } from "@/lib/exportExcel";

const emptyPage = {
  items: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
};

const initialForm = {
  id: "",
  fullName: "",
  email: "",
  phone: "",
  status: "active",
  avatarUrl: "",
  avatarFile: null,
  password: "",
  newPassword: "",
};

function resolveAvatarUrl(url) {
  if (!url) return "";
  if (String(url).startsWith("/images/")) return url;
  return mapImageUrl(url, API_URL);
}

function firstLetter(name = "") {
  return (
    String(name || "U")
      .trim()
      .charAt(0)
      .toUpperCase() || "U"
  );
}

function buildUserFormData(form, isCreate = false) {
  const fd = new FormData();
  fd.append("fullName", form.fullName || "");
  fd.append("email", form.email || "");
  fd.append("phone", form.phone || "");
  fd.append("status", isCreate ? "active" : form.status || "active");
  fd.append("avatarUrl", form.avatarUrl || "");
  if (form.avatarFile) fd.append("avatarFile", form.avatarFile);
  if (isCreate) fd.append("password", form.password || "");
  else if (form.newPassword) fd.append("newPassword", form.newPassword);
  return fd;
}

function UserStatusBadge({ status }) {
  const map = {
    active: { bg: "#dcfce7", color: "#166534", label: "Đang hoạt động" },
    inactive: { bg: "#fef3c7", color: "#92400e", label: "Tạm ngưng" },
    blocked: { bg: "#fee2e2", color: "#991b1b", label: "Bị khóa" },
  };
  const current = map[status] || {
    bg: "#f1f5f9",
    color: "#475569",
    label: status || "Không rõ",
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "999px",
        background: current.bg,
        color: current.color,
        fontSize: "0.85rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {current.label}
    </span>
  );
}

function UserAvatar({ user, size = 46, previewUrl = "" }) {
  const url = previewUrl || resolveAvatarUrl(user?.avatarUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={user?.fullName || "Avatar"}
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: "2px solid rgba(148, 163, 184, .35)",
          background: "#e2e8f0",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #d7f1ff, #bfe7ff)",
        color: "#0077b6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: size >= 56 ? "1.45rem" : "1.15rem",
        border: "1px solid rgba(2,132,199,.12)",
        flexShrink: 0,
      }}
    >
      {firstLetter(user?.fullName)}
    </div>
  );
}

function SortSelects({ filters, setFilters }) {
  return (
    <>
      <select
        className="modern-input"
        style={{ width: "auto", minWidth: 150, cursor: "pointer" }}
        value={filters.sortBy}
        onChange={(e) =>
          setFilters((prev) => ({ ...prev, sortBy: e.target.value, page: 1 }))
        }
      >
        <option value="createdAt">Ngày thêm</option>
        <option value="fullName">Tên người dùng</option>
        <option value="email">Email</option>
        <option value="phone">Số điện thoại</option>
      </select>
      <select
        className="modern-input"
        style={{ width: "auto", minWidth: 130, cursor: "pointer" }}
        value={filters.sortOrder}
        onChange={(e) =>
          setFilters((prev) => ({
            ...prev,
            sortOrder: e.target.value,
            page: 1,
          }))
        }
      >
        <option value="desc">Giảm dần</option>
        <option value="asc">Tăng dần</option>
      </select>
    </>
  );
}

export default function AdminUsersPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
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
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [avatarPreview, setAvatarPreview] = useState("");

  const qs = useMemo(() => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        query.set(key, value);
      }
    });
    return query.toString();
  }, [filters]);

  const load = async () => {
    const result = await apiFetch(`/admin/users?${qs}`);
    setData(result || emptyPage);
  };

  useEffect(() => {
    load()
      .catch((error) => showToast(error.message, "error"))
      .finally(() => setLoading(false));
  }, [qs, showToast]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const resetAvatarPreview = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview("");
  };

  const openCreate = () => {
    resetAvatarPreview();
    setForm(initialForm);
    setModalOpen(true);
  };

  const openEdit = async (id) => {
    try {
      const detail = await apiFetch(`/admin/users/${id}`);
      resetAvatarPreview();
      setForm({
        id: String(detail.id),
        fullName: detail.fullName || "",
        email: detail.email || "",
        phone: detail.phone || "",
        status: detail.status || "active",
        avatarUrl: detail.avatarUrl || "",
        avatarFile: null,
        password: "",
        newPassword: "",
      });
      setModalOpen(true);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const changeAvatarFile = (file) => {
    resetAvatarPreview();
    if (!file) {
      setForm((prev) => ({ ...prev, avatarFile: null }));
      return;
    }
    setForm((prev) => ({ ...prev, avatarFile: file }));
    setAvatarPreview(URL.createObjectURL(file));
  };

  const save = async () => {
    setSubmitting(true);
    try {
      if (!form.fullName.trim() || !form.email.trim()) {
        throw new Error("Cần nhập họ tên và email.");
      }
      if (!form.id && !form.password.trim()) {
        throw new Error("Cần nhập mật khẩu khởi tạo.");
      }

      if (!form.id) {
        await apiFetch("/admin/users", {
          method: "POST",
          body: buildUserFormData(form, true),
        });
        showToast("Đã thêm người dùng mới.", "success");
      } else {
        await apiFetch(`/admin/users/${form.id}`, {
          method: "PATCH",
          body: buildUserFormData(form, false),
        });
        showToast("Đã cập nhật tài khoản.", "success");
      }

      setModalOpen(false);
      setForm(initialForm);
      resetAvatarPreview();
      await load();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLockUser = async (item) => {
    const nextStatus = item.status === "blocked" ? "active" : "blocked";
    try {
      await apiFetch(`/admin/users/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: item.fullName,
          email: item.email,
          phone: item.phone || "",
          status: nextStatus,
          avatarUrl: item.avatarUrl || "",
        }),
      });
      showToast(
        nextStatus === "blocked"
          ? "Đã khóa tài khoản người dùng."
          : "Đã mở khóa tài khoản người dùng.",
        "success",
      );
      await load();
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      await exportAdminSmartReport("users", filters);
      showToast("Đã xuất file Excel người dùng.", "success");
    } catch (error) {
      showToast(error.message || "Không thể xuất Excel người dùng.", "error");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <Loading text="Đang tải danh sách người dùng..." />;

  return (
    <AdminLayout current="/admin/users" title="Quản lý người dùng">
      <style jsx global>{`
        .modern-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #1f2937;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          outline: none;
        }
        .modern-input:focus {
          border-color: #72b44b;
          box-shadow: 0 0 0 3px rgba(114, 180, 75, 0.15);
        }
        .table-responsive-container {
          width: 100%;
          overflow-x: auto;
          border-radius: 20px;
        }
        .console-table {
          width: 100%;
          min-width: 980px;
          border-collapse: collapse;
        }
        .console-table th {
          padding: 16px 24px;
          text-align: left;
          color: #64748b;
          font-weight: 700;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        .console-table td {
          padding: 16px 24px;
          vertical-align: middle;
          border-bottom: 1px solid #f1f5f9;
        }
        .admin-table-row {
          transition: background-color 0.2s ease;
        }
        .admin-table-row:hover {
          background: #f8fafc;
        }
        .stat-pill {
          display: inline-flex;
          align-items: center;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.8rem;
          color: #475569;
          margin-right: 6px;
          margin-bottom: 6px;
          white-space: nowrap;
        }
        .avatar-upload-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          border: 1px dashed #cbd5e1;
          border-radius: 16px;
          background: #f8fafc;
        }
        @media (max-width: 768px) {
          .modal-responsive-grid {
            grid-template-columns: 1fr !important;
          }
          .search-filter-row {
            flex-direction: column;
            align-items: stretch !important;
          }
          .toolbar-actions {
            width: 100%;
            display: flex;
            gap: 12px;
          }
          .toolbar-actions button {
            flex: 1;
            justify-content: center;
          }
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="admin-card" style={{ padding: 20, borderRadius: 20 }}>
          <div
            className="search-filter-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div
              className="search-filter-row"
              style={{
                display: "flex",
                gap: 12,
                flex: 1,
                minWidth: 300,
                flexWrap: "wrap",
              }}
            >
              <input
                className="modern-input"
                style={{ flex: 1, minWidth: 240 }}
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    search: e.target.value,
                    page: 1,
                  }))
                }
                placeholder="Tìm theo tên, email hoặc SĐT..."
              />
              <select
                className="modern-input"
                style={{ width: "auto", minWidth: 170, cursor: "pointer" }}
                value={filters.status}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Tạm ngưng</option>
                <option value="blocked">Bị khóa</option>
              </select>
              <SortSelects filters={filters} setFilters={setFilters} />
            </div>

            <div
              className="toolbar-actions"
              style={{ display: "flex", gap: 12 }}
            >
              <button
                type="button"
                className="btn btn-light"
                onClick={exportExcel}
                disabled={exporting}
              >
                {exporting ? "Đang xuất..." : "Xuất Excel"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={openCreate}
              >
                + Thêm người dùng
              </button>
            </div>
          </div>
        </div>

        <div className="admin-card" style={{ borderRadius: 20 }}>
          <div className="table-responsive-container">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Trạng thái</th>
                  <th>Hoạt động</th>
                  <th>Ngày tạo</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan="5"
                      style={{
                        textAlign: "center",
                        padding: 60,
                        color: "#64748b",
                      }}
                    >
                      Không tìm thấy người dùng nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  data.items.map((item) => (
                    <tr key={item.id} className="admin-table-row">
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 16,
                          }}
                        >
                          <UserAvatar user={item} />
                          <div>
                            <strong
                              style={{
                                display: "block",
                                color: "#0f172a",
                                fontSize: "1.05rem",
                              }}
                            >
                              {item.fullName}
                            </strong>
                            <div
                              style={{ color: "#64748b", fontSize: ".9rem" }}
                            >
                              {item.email}
                            </div>
                            <div
                              style={{ color: "#94a3b8", fontSize: ".85rem" }}
                            >
                              {item.phone || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <UserStatusBadge status={item.status} />
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        <span className="stat-pill">
                          <strong>
                            {formatNumber(item._count?.bookings || 0)}
                          </strong>
                          &nbsp;đơn đặt
                        </span>
                        <span className="stat-pill">
                          <strong>
                            {formatNumber(item._count?.reviews || 0)}
                          </strong>
                          &nbsp;đánh giá
                        </span>
                        <span className="stat-pill">
                          <strong>
                            {formatNumber(item._count?.favoriteTours || 0)}
                          </strong>
                          &nbsp;yêu thích
                        </span>
                      </td>
                      <td style={{ color: "#475569" }}>
                        {formatDate(item.createdAt)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "flex-end",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={() => openEdit(item.id)}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className={
                              item.status === "blocked"
                                ? "btn btn-light btn-sm"
                                : "btn btn-danger btn-sm"
                            }
                            onClick={() => toggleLockUser(item)}
                          >
                            {item.status === "blocked" ? "Mở khóa" : "Khóa"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingBottom: 20,
          }}
        >
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          />
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => !submitting && setModalOpen(false)}
        title={form.id ? "Cập nhật người dùng" : "Thêm người dùng mới"}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-light"
              onClick={() => setModalOpen(false)}
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={submitting}
            >
              {submitting ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </>
        }
      >
        <div
          className="modal-responsive-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <label
              style={{ display: "block", marginBottom: 8, fontWeight: 700 }}
            >
              Ảnh đại diện
            </label>
            <div className="avatar-upload-card">
              <UserAvatar user={form} size={60} previewUrl={avatarPreview} />
              <div style={{ flex: 1 }}>
                <input
                  className="modern-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    changeAvatarFile(e.target.files?.[0] || null)
                  }
                />
                <div
                  style={{ color: "#64748b", fontSize: ".85rem", marginTop: 6 }}
                >
                  Không chọn ảnh thì hệ thống sẽ hiện chữ cái đầu như avatar mặc
                  định.
                </div>
              </div>
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label
              style={{ display: "block", marginBottom: 8, fontWeight: 700 }}
            >
              Họ và tên <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              className="modern-input"
              value={form.fullName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, fullName: e.target.value }))
              }
              placeholder="VD: Nguyễn Văn A"
            />
          </div>

          <div>
            <label
              style={{ display: "block", marginBottom: 8, fontWeight: 700 }}
            >
              Email <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              className="modern-input"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="VD: example@gmail.com"
            />
          </div>

          <div>
            <label
              style={{ display: "block", marginBottom: 8, fontWeight: 700 }}
            >
              Số điện thoại
            </label>
            <input
              className="modern-input"
              value={form.phone}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, phone: e.target.value }))
              }
              placeholder="VD: 0901234567"
            />
          </div>

          {form.id && (
            <div>
              <label
                style={{ display: "block", marginBottom: 8, fontWeight: 700 }}
              >
                Trạng thái tài khoản
              </label>
              <select
                className="modern-input"
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value }))
                }
              >
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Tạm ngưng</option>
                <option value="blocked">Bị khóa</option>
              </select>
            </div>
          )}

          <div>
            <label
              style={{ display: "block", marginBottom: 8, fontWeight: 700 }}
            >
              {form.id ? "Đặt lại mật khẩu" : "Mật khẩu khởi tạo"}
            </label>
            <input
              className="modern-input"
              type="password"
              value={form.id ? form.newPassword : form.password}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  [form.id ? "newPassword" : "password"]: e.target.value,
                }))
              }
              placeholder={
                form.id ? "Bỏ trống nếu không muốn đổi" : "Tối thiểu 6 ký tự"
              }
            />
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
