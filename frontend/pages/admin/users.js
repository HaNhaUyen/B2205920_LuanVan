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
  password: "",
  newPassword: "",
};

// Component hiển thị nhãn trạng thái người dùng
function UserStatusBadge({ status }) {
  let bg = "#f1f5f9",
    color = "#475569",
    label = status;
  if (status === "active") {
    bg = "#dcfce7";
    color = "#166534";
    label = "Đang hoạt động";
  } else if (status === "inactive") {
    bg = "#fef3c7";
    color = "#92400e";
    label = "Tạm ngưng";
  } else if (status === "blocked") {
    bg = "#fee2e2";
    color = "#991b1b";
    label = "Bị khóa";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "999px",
        background: bg,
        color: color,
        fontSize: "0.85rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
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
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState(initialForm);

  const qs = useMemo(() => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    return query.toString();
  }, [filters]);

  const load = async () => {
    const result = await apiFetch(`/admin/users?${qs}`);

    const rawItems = result?.items || [];
    const userOnlyItems = rawItems.filter(
      (item) => String(item.role || "").toLowerCase() !== "admin",
    );

    setData({
      ...(result || emptyPage),
      items: userOnlyItems,
      pagination: {
        ...(result?.pagination || emptyPage.pagination),
        total: Math.max(
          0,
          Number(result?.pagination?.total || userOnlyItems.length) -
            (rawItems.length - userOnlyItems.length),
        ),
      },
    });
  };

  useEffect(() => {
    load()
      .catch((error) => showToast(error.message, "error"))
      .finally(() => setLoading(false));
  }, [qs, showToast]);

  const openCreate = () => {
    setForm(initialForm);
    setModalOpen(true);
  };

  const openEdit = async (id) => {
    try {
      const detail = await apiFetch(`/admin/users/${id}`);
      setForm({
        id: String(detail.id),
        fullName: detail.fullName || "",
        email: detail.email || "",
        phone: detail.phone || "",
        status: detail.status || "active",
        avatarUrl: detail.avatarUrl || "",
        password: "",
        newPassword: "",
      });
      setModalOpen(true);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const save = async () => {
    setSubmitting(true);
    try {
      if (!form.fullName || !form.email) {
        throw new Error("Cần nhập họ tên và email.");
      }

      if (!form.id) {
        await apiFetch("/admin/users", {
          method: "POST",
          body: JSON.stringify({
            fullName: form.fullName,
            email: form.email,
            phone: form.phone || null,
            status: "active",
            avatarUrl: form.avatarUrl || null,
            password: form.password,
          }),
        });

        showToast("Đã thêm người dùng mới.", "success");
      } else {
        await apiFetch(`/admin/users/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            fullName: form.fullName,
            email: form.email,
            phone: form.phone || null,
            status: form.status,
            avatarUrl: form.avatarUrl || null,
            newPassword: form.newPassword || undefined,
          }),
        });

        showToast("Đã cập nhật tài khoản.", "success");
      }

      setModalOpen(false);
      setForm(initialForm);
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
          phone: item.phone || null,
          status: nextStatus,
          avatarUrl: item.avatarUrl || null,
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
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .modern-input {
            width: 100%;
            padding: 12px 16px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            color: #1f2937;
            font-size: 0.95rem;
            transition: all 0.2s ease;
            outline: none;
          }
          .modern-input:focus {
            background: #fff;
            border-color: #72b44b;
            box-shadow: 0 0 0 3px rgba(114, 180, 75, 0.15);
          }
          .admin-table-row {
            transition: background-color 0.2s;
          }
          .admin-table-row:hover {
            background-color: #f8fafc;
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

          /* --- RESPONSIVE TABLE & SCROLLBAR --- */
          .table-responsive-container {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            border-radius: 20px; /* Giữ bo góc cho mobile */
          }
          /* Custom thanh cuộn ngang cho mượt và đẹp */
          .table-responsive-container::-webkit-scrollbar {
            height: 8px;
          }
          .table-responsive-container::-webkit-scrollbar-track {
            background: #f8fafc; 
            border-radius: 0 0 20px 20px;
          }
          .table-responsive-container::-webkit-scrollbar-thumb {
            background: #cbd5e1; 
            border-radius: 8px;
          }
          .table-responsive-container::-webkit-scrollbar-thumb:hover {
            background: #94a3b8; 
          }
          
          .console-table {
            width: 100%;
            min-width: 900px; /* Bắt buộc bảng rộng tối thiểu để kích hoạt scroll ngang */
            border-collapse: collapse;
          }

          /* --- RESPONSIVE MODAL & TOOLBAR --- */
          @media (max-width: 768px) {
            .modal-responsive-grid {
              grid-template-columns: 1fr !important;
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
            .search-filter-row {
              flex-direction: column;
            }
          }
        `,
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* THANH CÔNG CỤ (TOOLBAR) */}
        <div
          className="admin-card"
          style={{
            background: "#fff",
            padding: "20px",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,23,42,0.03)",
            border: "1px solid #f1f5f9",
          }}
        >
          <div
            className="search-filter-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div
              className="search-filter-row"
              style={{
                display: "flex",
                gap: "12px",
                flex: 1,
                minWidth: "300px",
              }}
            >
              <div style={{ position: "relative", flex: 1 }}>
                <svg
                  width="18"
                  height="18"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  className="modern-input"
                  style={{ paddingLeft: "42px", background: "#fff" }}
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
              </div>
              <select
                className="modern-input"
                style={{ width: "auto", background: "#fff", cursor: "pointer" }}
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
            </div>

            <div
              className="toolbar-actions"
              style={{ display: "flex", gap: "12px" }}
            >
              <button
                type="button"
                className="btn btn-light"
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  fontWeight: 600,
                  color: "#1f2937",
                }}
                onClick={exportExcel}
                disabled={exporting}
              >
                {exporting ? "Đang xuất..." : "Xuất Excel"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                  border: "none",
                  color: "#fff",
                  fontWeight: 600,
                  boxShadow: "0 4px 12px rgba(114, 180, 75, 0.2)",
                }}
                onClick={openCreate}
              >
                + Thêm người dùng
              </button>
            </div>
          </div>
        </div>

        {/* BẢNG DỮ LIỆU ĐƯỢC BỌC TRONG DIV CÓ THANH CUỘN NGANG */}
        <div
          className="admin-card"
          style={{
            background: "#fff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,23,42,0.03)",
            border: "1px solid #f1f5f9",
          }}
        >
          <div className="table-responsive-container">
            <table className="console-table">
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <th
                    style={{
                      padding: "16px 24px",
                      textAlign: "left",
                      color: "#64748b",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Người dùng
                  </th>
                  <th
                    style={{
                      padding: "16px 24px",
                      textAlign: "left",
                      color: "#64748b",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Trạng thái
                  </th>
                  <th
                    style={{
                      padding: "16px 24px",
                      textAlign: "left",
                      color: "#64748b",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Hoạt động
                  </th>
                  <th
                    style={{
                      padding: "16px 24px",
                      textAlign: "left",
                      color: "#64748b",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Ngày tạo
                  </th>
                  <th style={{ padding: "16px 24px", textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan="5"
                      style={{
                        textAlign: "center",
                        padding: "60px 20px",
                        color: "#64748b",
                      }}
                    >
                      <svg
                        width="48"
                        height="48"
                        fill="none"
                        stroke="#cbd5e1"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ margin: "0 auto 12px", display: "block" }}
                      >
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      Không tìm thấy người dùng nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  data.items
                    .filter(
                      (item) =>
                        String(item.role || "").toLowerCase() !== "admin",
                    )
                    .map((item) => {
                      const avatarUrl = item.avatarUrl
                        ? mapImageUrl(item.avatarUrl, API_URL)
                        : "";
                      return (
                        <tr
                          key={item.id}
                          className="admin-table-row"
                          style={{ borderBottom: "1px solid #f1f5f9" }}
                        >
                          <td style={{ padding: "16px 24px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 16,
                              }}
                            >
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={item.fullName}
                                  style={{
                                    width: 46,
                                    height: 46,
                                    borderRadius: "50%",
                                    objectFit: "cover",
                                    border: "2px solid #e2e8f0",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 46,
                                    height: 46,
                                    borderRadius: "50%",
                                    background:
                                      "linear-gradient(135deg, #e2e8f0, #cbd5e1)",
                                    color: "#475569",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: "bold",
                                    fontSize: "1.2rem",
                                  }}
                                >
                                  {item.fullName?.charAt(0)?.toUpperCase() ||
                                    "U"}
                                </div>
                              )}
                              <div>
                                <strong
                                  style={{
                                    display: "block",
                                    color: "#0f172a",
                                    fontSize: "1.05rem",
                                    marginBottom: "2px",
                                  }}
                                >
                                  {item.fullName}
                                </strong>
                                <div
                                  style={{
                                    color: "#64748b",
                                    fontSize: "0.9rem",
                                  }}
                                >
                                  {item.email}
                                </div>
                                <div
                                  style={{
                                    color: "#94a3b8",
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  {item.phone || "—"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td
                            style={{
                              padding: "16px 24px",
                              verticalAlign: "middle",
                            }}
                          >
                            <UserStatusBadge status={item.status} />
                          </td>
                          <td
                            style={{
                              padding: "16px 24px",
                              verticalAlign: "middle",
                              maxWidth: "240px",
                            }}
                          >
                            <div style={{ display: "flex", flexWrap: "wrap" }}>
                              <span className="stat-pill">
                                <strong style={{ color: "#0f172a" }}>
                                  {formatNumber(item._count?.bookings || 0)}
                                </strong>
                                &nbsp;đơn đặt
                              </span>
                              <span className="stat-pill">
                                <strong style={{ color: "#0f172a" }}>
                                  {formatNumber(item._count?.reviews || 0)}
                                </strong>
                                &nbsp;đánh giá
                              </span>
                              <span className="stat-pill">
                                <strong style={{ color: "#0f172a" }}>
                                  {formatNumber(
                                    item._count?.favoriteTours || 0,
                                  )}
                                </strong>
                                &nbsp;yêu thích
                              </span>
                            </div>
                          </td>
                          <td
                            style={{
                              padding: "16px 24px",
                              verticalAlign: "middle",
                              color: "#475569",
                              fontSize: "0.95rem",
                            }}
                          >
                            {formatDate(item.createdAt)}
                          </td>
                          <td
                            style={{
                              padding: "16px 24px",
                              verticalAlign: "middle",
                              textAlign: "right",
                            }}
                          >
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
                                title="Chỉnh sửa"
                              >
                                <svg
                                  width="18"
                                  height="18"
                                  fill="none"
                                  stroke="#3b82f6"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>

                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                              </button>

                              {/* Nút Khóa/Mở khóa - Đổi màu theo trạng thái */}
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{
                                  padding: "8px",
                                  background:
                                    item.status === "blocked"
                                      ? "#f0fdf4"
                                      : "#fef2f2",
                                  border: "1px solid",
                                  borderColor:
                                    item.status === "blocked"
                                      ? "#dcfce7"
                                      : "#fecdd3",
                                  color:
                                    item.status === "blocked"
                                      ? "#16a34a"
                                      : "#e11d48",
                                }}
                                onClick={() => toggleLockUser(item)}
                                title={
                                  item.status === "blocked"
                                    ? "Mở khóa tài khoản"
                                    : "Khóa tài khoản"
                                }
                              >
                                {item.status === "blocked" ? (
                                  /* Icon Mở Khóa */
                                  <svg
                                    width="18"
                                    height="18"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect
                                      x="3"
                                      y="11"
                                      width="18"
                                      height="11"
                                      rx="2"
                                      ry="2"
                                    ></rect>
                                    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                                  </svg>
                                ) : (
                                  /* Icon Khóa */
                                  <svg
                                    width="18"
                                    height="18"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect
                                      x="3"
                                      y="11"
                                      width="18"
                                      height="11"
                                      rx="2"
                                      ry="2"
                                    ></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                  </svg>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PHÂN TRANG */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingBottom: "20px",
          }}
        >
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          />
        </div>
      </div>

      {/* MODAL FORM THÊM / SỬA USER */}
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
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontWeight: 600,
              }}
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={submitting}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                border: "none",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              {submitting ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </>
        }
      >
        <div
          className="modal-responsive-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
          }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 600,
                color: "#334155",
              }}
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
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 600,
                color: "#334155",
              }}
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
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 600,
                color: "#334155",
              }}
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

          <div style={{ gridColumn: "1 / -1" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              Avatar URL
            </label>
            <input
              className="modern-input"
              value={form.avatarUrl}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, avatarUrl: e.target.value }))
              }
              placeholder="https://..."
            />
          </div>

          {form.id && (
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                Trạng thái tài khoản
              </label>
              <select
                className="modern-input"
                style={{ cursor: "pointer" }}
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
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 600,
                color: "#334155",
              }}
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
