import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";

const emptyPage = {
  items: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
};

const initialFilters = {
  page: 1,
  pageSize: 10,
  search: "",
  isPublished: "",
};

const initialForm = {
  id: "",
  title: "",
  message: "",
  content: "",
  isPublished: true,
};

function buildQuery(filters) {
  const qs = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      qs.set(key, String(value));
  });
  return qs.toString();
}

// Component Icon hiển thị trên Thẻ Thống kê
const StatIcon = ({ type }) => {
  const baseStyle = {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
  if (type === "total")
    return (
      <div style={{ ...baseStyle, background: "#f1f5f9", color: "#475569" }}>
        <svg
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
          <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
      </div>
    );
  if (type === "published")
    return (
      <div style={{ ...baseStyle, background: "#dcfce7", color: "#166534" }}>
        <svg
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      </div>
    );
  if (type === "hidden")
    return (
      <div style={{ ...baseStyle, background: "#fef3c7", color: "#92400e" }}>
        <svg
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      </div>
    );
  if (type === "reads")
    return (
      <div style={{ ...baseStyle, background: "#eff6ff", color: "#1d4ed8" }}>
        <svg
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </div>
    );
  return null;
};

export default function AdminNotificationsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(emptyPage);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(initialForm);

  const loadData = async (nextFilters = filters) => {
    setData(await apiFetch(`/admin/notifications?${buildQuery(nextFilters)}`));
  };

  useEffect(() => {
    loadData(initialFilters)
      .catch((error) => showToast(error.message, "error"))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading)
      loadData(filters).catch((error) => showToast(error.message, "error"));
  }, [filters.page, filters.search, filters.isPublished]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const items = data.items || [];
    return {
      total: data.pagination?.total || 0,
      published: items.filter((item) => item.isPublished).length,
      hidden: items.filter((item) => !item.isPublished).length,
      reads: items.reduce(
        (sum, item) => sum + Number(item?._count?.reads || 0),
        0,
      ),
    };
  }, [data]);

  const openCreate = () => {
    setForm(initialForm);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setForm({
      id: String(item.id),
      title: item.title || "",
      message: item.message || "",
      content: item.content || "",
      isPublished: Boolean(item.isPublished),
    });
    setModalOpen(true);
  };

  const openDetail = async (id) => {
    try {
      setDetail(await apiFetch(`/admin/notifications/${id}`));
      setDetailOpen(true);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const submitForm = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      showToast("Cần nhập tiêu đề và nội dung thông báo.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: form.title,
        message: form.message,
        content: form.content,
        isPublished: form.isPublished,
      };

      if (form.id) {
        await apiFetch(`/admin/notifications/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        showToast("Đã cập nhật thông báo.", "success");
      } else {
        await apiFetch(`/admin/notifications`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("Đã tạo thông báo mới.", "success");
      }
      setModalOpen(false);
      setForm(initialForm);
      await loadData();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const removeItem = async (id) => {
    if (!window.confirm("Xóa thông báo này?")) return;
    try {
      await apiFetch(`/admin/notifications/${id}`, { method: "DELETE" });
      showToast("Đã xóa thông báo.", "success");
      await loadData();
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  if (loading) return <Loading text="Đang tải quản lý thông báo..." />;

  return (
    <AdminLayout current="/admin/notifications" title="Quản lý thông báo">
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
          .admin-table-row { transition: background-color 0.2s; }
          .admin-table-row:hover { background-color: #f8fafc; }
          
          .table-responsive-container {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            border-radius: 20px; 
          }
          .table-responsive-container::-webkit-scrollbar { height: 8px; }
          .table-responsive-container::-webkit-scrollbar-track { background: #f8fafc; border-radius: 0 0 20px 20px; }
          .table-responsive-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
          
          .console-table {
            width: 100%;
            min-width: 800px;
            border-collapse: collapse;
          }

          @media (max-width: 768px) {
            .search-filter-row { flex-direction: column; }
            .toolbar-actions button { width: 100%; justify-content: center; }
          }
        `,
        }}
      />

      {/* KHỐI THỐNG KÊ */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
          marginBottom: 24,
        }}
      >
        {[
          {
            label: "Tổng thông báo",
            value: stats.total,
            tone: "#0f172a",
            iconType: "total",
          },
          {
            label: "Đang hiển thị",
            value: stats.published,
            tone: "#16a34a",
            iconType: "published",
          },
          {
            label: "Đang ẩn",
            value: stats.hidden,
            tone: "#d97706",
            iconType: "hidden",
          },
          {
            label: "Lượt đã xem",
            value: stats.reads,
            tone: "#2563eb",
            iconType: "reads",
          },
        ].map((item) => (
          <article
            key={item.label}
            className="admin-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              background: "#fff",
              padding: "24px",
              borderRadius: "20px",
              border: "1px solid #f1f5f9",
              boxShadow: "0 10px 30px rgba(15,23,42,0.03)",
            }}
          >
            <StatIcon type={item.iconType} />
            <div>
              <strong
                style={{
                  display: "block",
                  fontSize: "1.8rem",
                  color: item.tone,
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {formatNumber(item.value)}
              </strong>
              <span style={{ color: "#64748b", fontSize: "0.9rem" }}>
                {item.label}
              </span>
            </div>
          </article>
        ))}
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* THANH CÔNG CỤ (TOOLBAR) & BỘ LỌC */}
        <div
          className="admin-card"
          style={{
            background: "#fff",
            padding: "24px",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,23,42,0.03)",
            border: "1px solid #f1f5f9",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <h2 style={{ margin: 0, color: "#0f172a", fontSize: "1.4rem" }}>
              Danh sách thông báo
            </h2>
            <div className="toolbar-actions">
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
                + Thêm thông báo
              </button>
            </div>
          </div>

          <div
            className="search-filter-row"
            style={{
              display: "flex",
              gap: "16px",
            }}
          >
            <div style={{ position: "relative", flex: "3" }}>
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
                placeholder="Tìm theo tiêu đề hoặc nội dung..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    page: 1,
                    search: e.target.value,
                  }))
                }
              />
            </div>
            <div style={{ flex: 1, minWidth: "160px" }}>
              <select
                className="modern-input"
                style={{ cursor: "pointer", background: "#fff" }}
                value={filters.isPublished}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    page: 1,
                    isPublished: e.target.value,
                  }))
                }
              >
                <option value="">Tất cả trạng thái</option>
                <option value="true">Đang hiển thị</option>
                <option value="false">Đang ẩn</option>
              </select>
            </div>
          </div>
        </div>

        {/* BẢNG DỮ LIỆU */}
        <div
          className="admin-card table-wrap"
          style={{
            background: "#fff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(15,23,42,0.03)",
            border: "1px solid #f1f5f9",
            overflow: "hidden",
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
                    Tiêu đề & Nội dung
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
                    Lượt xem
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
                {data.items?.length ? (
                  data.items.map((item) => (
                    <tr
                      key={item.id}
                      className="admin-table-row"
                      style={{ borderBottom: "1px solid #f1f5f9" }}
                    >
                      <td style={{ padding: "16px 24px" }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <strong
                            style={{ color: "#0f172a", fontSize: "1.05rem" }}
                          >
                            {item.title}
                          </strong>
                          <span
                            style={{
                              color: "#64748b",
                              fontSize: "0.9rem",
                              display: "-webkit-box",
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              maxWidth: "400px",
                            }}
                          >
                            {item.message || item.content || "-"}
                          </span>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "16px 24px",
                          verticalAlign: "middle",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            color: item.isPublished ? "#16a34a" : "#d97706",
                            fontWeight: 600,
                            fontSize: "0.9rem",
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: item.isPublished
                                ? "#16a34a"
                                : "#d97706",
                            }}
                          ></span>
                          {item.isPublished ? "Đang hiển thị" : "Đang ẩn"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "16px 24px",
                          verticalAlign: "middle",
                          color: "#0f172a",
                          fontWeight: 600,
                        }}
                      >
                        {formatNumber(item?._count?.reads || 0)}
                      </td>
                      <td
                        style={{
                          padding: "16px 24px",
                          verticalAlign: "middle",
                          color: "#64748b",
                          fontSize: "0.9rem",
                        }}
                      >
                        {formatDateTime(item.createdAt)}
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
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={() => openDetail(item.id)}
                            title="Xem chi tiết"
                          >
                            <svg
                              width="18"
                              height="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={() => openEdit(item)}
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
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => removeItem(item.id)}
                            title="Xóa"
                          >
                            <svg
                              width="18"
                              height="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: "center",
                        padding: "60px 20px",
                        color: "#64748b",
                      }}
                    >
                      Chưa có thông báo phù hợp bộ lọc.
                    </td>
                  </tr>
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
            page={data.pagination?.page}
            totalPages={data.pagination?.totalPages}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
            compact
          />
        </div>
      </div>

      {/* MODAL THÊM / SỬA */}
      <Modal
        open={modalOpen}
        onClose={() => {
          if (!submitting) {
            setModalOpen(false);
            setForm(initialForm);
          }
        }}
        title={form.id ? "Sửa thông báo" : "Thêm thông báo"}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-light"
              onClick={() => {
                setModalOpen(false);
                setForm(initialForm);
              }}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
              }}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitForm}
              disabled={submitting}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                border: "none",
                color: "#fff",
              }}
            >
              {submitting ? "Đang lưu..." : "Lưu thông báo"}
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>
              Tiêu đề <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              className="modern-input"
              placeholder="VD: Khuyến mãi mùa hè..."
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>
              Mô tả ngắn
            </label>
            <input
              className="modern-input"
              placeholder="Tóm tắt hiển thị ngoài danh sách"
              value={form.message}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, message: e.target.value }))
              }
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>
              Nội dung chi tiết <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              className="modern-input"
              rows={8}
              placeholder="Viết đầy đủ nội dung thông báo vào đây..."
              style={{ resize: "vertical" }}
              value={form.content}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, content: e.target.value }))
              }
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>
              Trạng thái hiển thị
            </label>
            <select
              className="modern-input"
              style={{ cursor: "pointer" }}
              value={form.isPublished ? "true" : "false"}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  isPublished: e.target.value === "true",
                }))
              }
            >
              <option value="true">Đang hiển thị</option>
              <option value="false">Lưu nháp (Ẩn)</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* MODAL CHI TIẾT */}
      <Modal
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        title="Chi tiết thông báo"
        size="lg"
      >
        {detail ? (
          <div style={{ display: "grid", gap: 24 }}>
            <div
              style={{
                paddingBottom: "20px",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <h2
                style={{
                  fontSize: "1.6rem",
                  color: "#0f172a",
                  margin: "0 0 12px",
                }}
              >
                {detail.title}
              </h2>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  color: "#64748b",
                  fontSize: "0.85rem",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    background: detail.isPublished ? "#dcfce7" : "#fef3c7",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    color: detail.isPublished ? "#16a34a" : "#d97706",
                    fontWeight: 600,
                  }}
                >
                  {detail.isPublished ? "Đang hiển thị" : "Đang ẩn"}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  {formatDateTime(detail.createdAt)}
                </span>
              </div>
            </div>

            <div
              style={{
                padding: 24,
                borderRadius: 16,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                whiteSpace: "pre-wrap",
                lineHeight: 1.7,
                color: "#334155",
              }}
            >
              {detail.content}
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <h3 style={{ margin: 0, color: "#0f172a", fontSize: "1.2rem" }}>
                  Danh sách người dùng đã đọc
                </h3>
                <span
                  style={{
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    padding: "4px 12px",
                    borderRadius: "999px",
                    fontWeight: "bold",
                  }}
                >
                  {detail?._count?.reads || 0} lượt
                </span>
              </div>

              {detail.reads?.length ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 12,
                  }}
                >
                  {detail.reads.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: 16,
                        borderRadius: 16,
                        border: "1px solid #f1f5f9",
                        background: "#fff",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
                      }}
                    >
                      <strong
                        style={{
                          display: "block",
                          color: "#0f172a",
                          marginBottom: 4,
                        }}
                      >
                        {item.user?.fullName || "Khách hàng"}
                      </strong>
                      <div style={{ color: "#64748b", fontSize: "0.85rem" }}>
                        {item.user?.email}
                      </div>
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: "0.75rem",
                          marginTop: 4,
                        }}
                      >
                        Xem lúc: {formatDateTime(item.readAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: "32px",
                    textAlign: "center",
                    background: "#f8fafc",
                    borderRadius: "16px",
                    color: "#64748b",
                  }}
                >
                  Chưa có ai đọc thông báo này.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </AdminLayout>
  );
}
