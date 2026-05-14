import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import Modal from "@/components/Modal";
import Loading from "@/components/Loading";
import Pagination from "@/components/Pagination";
import { apiFetch } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ToastContext";

const emptyPage = {
  items: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
};

// Component Badge hiển thị trạng thái hoàn tiền
function Badge({ value }) {
  const map = {
    approved: { bg: "#dcfce7", color: "#166534", label: "Đã duyệt" },
    rejected: { bg: "#fef2f2", color: "#e11d48", label: "Từ chối" },
    pending: { bg: "#fef3c7", color: "#92400e", label: "Chờ xử lý" },
  };

  const current = map[value] || {
    bg: "#f1f5f9",
    color: "#475569",
    label: value,
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
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {current.label}
    </span>
  );
}

export default function AdminRefundsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Quản lý dữ liệu phân trang
  const [data, setData] = useState(emptyPage);

  // State quản lý bộ lọc và phân trang
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 8,
    search: "",
    status: "all",
  });

  const [modal, setModal] = useState(null);
  const [adminNote, setAdminNote] = useState("");

  // Tạo chuỗi query string cho API
  const qs = useMemo(() => {
    const query = new URLSearchParams();
    query.set("page", filters.page);
    query.set("pageSize", filters.pageSize);
    if (filters.search) query.set("search", filters.search);
    if (filters.status && filters.status !== "all")
      query.set("status", filters.status);
    return query.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/refunds?${qs}`);

      // Fallback: Nếu API trả về mảng (Chưa có phân trang Server-side) -> Tự làm phân trang Client-side
      if (Array.isArray(res)) {
        let filtered = res;

        if (filters.status !== "all") {
          filtered = filtered.filter((r) => r.status === filters.status);
        }

        if (filters.search) {
          const kw = filters.search.toLowerCase();
          filtered = filtered.filter(
            (r) =>
              r.booking?.bookingCode?.toLowerCase().includes(kw) ||
              r.user?.fullName?.toLowerCase().includes(kw) ||
              r.booking?.contactName?.toLowerCase().includes(kw) ||
              r.user?.email?.toLowerCase().includes(kw) ||
              r.booking?.contactEmail?.toLowerCase().includes(kw),
          );
        }

        const total = filtered.length;
        const totalPages = Math.ceil(total / filters.pageSize) || 1;
        const safePage = Math.min(filters.page, totalPages);
        const start = (safePage - 1) * filters.pageSize;
        const items = filtered.slice(start, start + filters.pageSize);

        setData({
          items,
          pagination: {
            page: safePage,
            pageSize: filters.pageSize,
            total,
            totalPages,
          },
        });
      } else {
        // Trường hợp API đã hỗ trợ Server-side pagination
        setData(res || emptyPage);
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Load lại data khi query string (trang, bộ lọc) thay đổi
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  const review = async () => {
    if (!modal) return;
    if (modal.status === "rejected" && !adminNote.trim()) {
      return showToast(
        "Khi không duyệt cần nhập lý do phản hồi cho khách.",
        "error",
      );
    }
    try {
      await apiFetch(`/refunds/${modal.item.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status: modal.status, adminNote }),
      });
      setModal(null);
      setAdminNote("");
      await load(); // Tải lại danh sách sau khi duyệt
      showToast(
        "Đã xử lý hoàn tiền và gửi email phản hồi (nếu hệ thống SMTP hoạt động).",
        "success",
      );
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");

      const exportData = data.items.map((r) => ({
        "Mã Booking": r.booking?.bookingCode || "",
        "Khách hàng": r.user?.fullName || r.booking?.contactName || "",
        Email: r.user?.email || r.booking?.contactEmail || "",
        "Tên Tour": r.booking?.tour?.name || "",
        "Lý do hủy": r.reason || "",
        "Số tiền hoàn": r.refundAmount || r.booking?.finalAmount || 0,
        "Trạng thái":
          r.status === "approved"
            ? "Đã duyệt"
            : r.status === "rejected"
              ? "Từ chối"
              : "Chờ xử lý",
        "Ghi chú Admin": r.adminNote || "",
        "Ngày tạo yêu cầu": formatDateTime(r.createdAt),
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      XLSX.utils.book_append_sheet(wb, ws, "Refunds");
      XLSX.writeFile(wb, `DanhSachHoanTien_${Date.now()}.xlsx`);

      showToast("Đã xuất file Excel thành công.", "success");
    } catch (error) {
      showToast("Lỗi xuất Excel. Vui lòng kiểm tra lại hệ thống.", "error");
    } finally {
      setExporting(false);
    }
  };

  const filterTabs = [
    { id: "all", label: "Tất cả" },
    { id: "pending", label: "Chờ xử lý" },
    { id: "approved", label: "Đã duyệt" },
    { id: "rejected", label: "Bị từ chối" },
  ];

  if (loading && data.items.length === 0) {
    return <Loading text="Đang tải danh sách yêu cầu hoàn tiền..." />;
  }

  return (
    <AdminLayout
      current="/admin/refunds"
      title="Quản lý hoàn tiền"
      subtitle="Theo dõi, tìm kiếm và xuất dữ liệu các yêu cầu hoàn tiền từ khách hàng."
    >
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
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
          }
          .admin-table-row { transition: background-color 0.2s; }
          .admin-table-row:hover { background-color: #f8fafc; }
          .stat-text { color: #64748b; font-size: 0.85rem; margin-top: 4px; }
          
          /* --- TABS --- */
          .filter-tabs {
            display: inline-flex;
            background: #f1f5f9;
            padding: 6px;
            border-radius: 12px;
            gap: 6px;
            flex-wrap: wrap;
          }
          .filter-tab {
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            border: none;
            background: transparent;
            color: #64748b;
            transition: all 0.2s ease;
          }
          .filter-tab:hover { color: #0f172a; }
          .filter-tab.active {
            background: #ffffff;
            color: #0f172a;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }

          /* --- TABLE --- */
          .table-responsive-container {
            width: 100%;
            overflow-x: auto;
            border-radius: 20px;
            border: 1px solid #e2e8f0;
            background: #fff;
            box-shadow: 0 10px 30px rgba(15,23,42,0.03);
          }
          .table-responsive-container::-webkit-scrollbar { height: 8px; }
          .table-responsive-container::-webkit-scrollbar-track { background: #f8fafc; border-radius: 0 0 20px 20px; }
          .table-responsive-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
          .table-responsive-container::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
          
          .console-table {
            width: 100%;
            min-width: 1100px;
            border-collapse: collapse;
          }
          .console-table th {
            padding: 16px 24px;
            text-align: left;
            color: #64748b;
            font-weight: 600;
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
          }
          .console-table td {
            padding: 16px 24px;
            vertical-align: middle;
            border-bottom: 1px solid #f1f5f9;
            color: #1f2937;
          }
          .reason-cell {
            max-width: 260px;
            white-space: normal;
            line-height: 1.5;
            font-size: 0.9rem;
            color: #475569;
          }

          /* --- RESPONSIVE --- */
          @media (max-width: 768px) {
            .header-actions { flex-direction: column; align-items: stretch !important; }
            .toolbar-actions { width: 100%; justify-content: space-between; }
            .toolbar-actions button { flex: 1; justify-content: center; }
            .search-box { max-width: 100% !important; width: 100%; }
          }
        `,
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* HEADER LỌC DỮ LIỆU & TÌM KIẾM */}
        <div
          className="header-actions"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div className="filter-tabs">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                className={`filter-tab ${
                  filters.status === tab.id ? "active" : ""
                }`}
                onClick={() =>
                  setFilters((p) => ({ ...p, status: tab.id, page: 1 }))
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              flex: 1,
              justifyContent: "flex-end",
            }}
          >
            <div
              className="search-box"
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "300px",
                minWidth: "200px",
              }}
            >
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
                placeholder="Tìm mã booking, khách hàng, email..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, search: e.target.value, page: 1 }))
                }
              />
            </div>

            <div
              className="toolbar-actions"
              style={{ display: "flex", gap: "12px", alignItems: "center" }}
            >
              <div
                style={{
                  fontSize: "0.95rem",
                  color: "#64748b",
                  fontWeight: 500,
                  marginRight: "8px",
                  whiteSpace: "nowrap",
                }}
              >
                Tìm thấy{" "}
                <strong style={{ color: "#0f172a" }}>
                  {data.pagination.total}
                </strong>{" "}
                yêu cầu
              </div>
              <button
                type="button"
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  color: "#1f2937",
                  fontWeight: 600,
                  padding: "12px 20px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  whiteSpace: "nowrap",
                }}
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                {exporting ? "Đang xuất..." : "Xuất Excel"}
              </button>
            </div>
          </div>
        </div>

        {/* BẢNG DỮ LIỆU */}
        <div className="table-responsive-container">
          <table className="console-table">
            <thead>
              <tr>
                <th>Booking & Tour</th>
                <th>Khách hàng</th>
                <th>Lý do hủy</th>
                <th>Số tiền hoàn</th>
                <th>Trạng thái</th>
                <th>Phản hồi Admin</th>
                <th style={{ textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
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
                      <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    Không có dữ liệu hoàn tiền phù hợp với tìm kiếm.
                  </td>
                </tr>
              ) : (
                data.items.map((r) => (
                  <tr key={String(r.id)} className="admin-table-row">
                    <td>
                      <strong
                        style={{
                          color: "#2563eb",
                          background: "#eff6ff",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "0.95rem",
                          display: "inline-block",
                          marginBottom: "6px",
                        }}
                      >
                        {r.booking?.bookingCode || "NO-CODE"}
                      </strong>
                      <div
                        className="stat-text"
                        style={{
                          maxWidth: "200px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={r.booking?.tour?.name}
                      >
                        {r.booking?.tour?.name || "Tour không xác định"}
                      </div>
                    </td>

                    <td>
                      <strong style={{ display: "block", color: "#0f172a" }}>
                        {r.user?.fullName ||
                          r.booking?.contactName ||
                          "Khách ẩn danh"}
                      </strong>
                      <div className="stat-text">
                        {r.user?.email || r.booking?.contactEmail}
                      </div>
                    </td>

                    <td className="reason-cell">
                      {r.reason}
                      <div
                        className="stat-text"
                        style={{ marginTop: "6px", fontSize: "0.8rem" }}
                      >
                        Gửi: {formatDateTime(r.createdAt)}
                      </div>
                    </td>

                    <td>
                      <strong style={{ color: "#0f172a", fontSize: "1.05rem" }}>
                        {formatCurrency(
                          r.refundAmount || r.booking?.finalAmount,
                        )}
                      </strong>
                    </td>

                    <td>
                      <Badge value={r.status} />
                    </td>

                    <td
                      className="reason-cell"
                      style={{
                        fontStyle: r.adminNote ? "normal" : "italic",
                        color: r.adminNote ? "#1e293b" : "#94a3b8",
                      }}
                    >
                      {r.adminNote || "Chưa có phản hồi"}
                    </td>

                    <td style={{ textAlign: "right" }}>
                      {r.status === "pending" ? (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            className="btn btn-sm"
                            style={{
                              padding: "8px 14px",
                              background: "#f0fdf4",
                              color: "#16a34a",
                              border: "1px solid #dcfce7",
                              borderRadius: "8px",
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              setModal({ item: r, status: "approved" });
                              setAdminNote(
                                "Yêu cầu hoàn tiền đã được duyệt. Travela sẽ xử lý theo chính sách.",
                              );
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            Duyệt
                          </button>

                          <button
                            className="btn btn-sm"
                            style={{
                              padding: "8px 14px",
                              background: "#fef2f2",
                              color: "#e11d48",
                              border: "1px solid #fecdd3",
                              borderRadius: "8px",
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              setModal({ item: r, status: "rejected" });
                              setAdminNote("");
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                            Từ chối
                          </button>
                        </div>
                      ) : (
                        <span
                          style={{
                            color: "#94a3b8",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                          }}
                        >
                          Đã xử lý
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PHÂN TRANG (PAGINATION) */}
        {data.pagination && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: "12px",
              paddingBottom: "24px",
            }}
          >
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
            />
          </div>
        )}
      </div>

      {/* MODAL XỬ LÝ HOÀN TIỀN */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={
          modal?.status === "approved"
            ? "Xác nhận duyệt hoàn tiền"
            : "Từ chối yêu cầu hoàn tiền"
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Booking Summary Card */}
          <div
            style={{
              background: "#f8fafc",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span className="stat-text" style={{ margin: 0 }}>
                Mã Booking
              </span>
              <strong style={{ color: "#2563eb" }}>
                {modal?.item?.booking?.bookingCode}
              </strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span className="stat-text" style={{ margin: 0 }}>
                Khách hàng
              </span>
              <strong style={{ color: "#0f172a" }}>
                {modal?.item?.user?.fullName ||
                  modal?.item?.booking?.contactName}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="stat-text" style={{ margin: 0 }}>
                Số tiền hoàn
              </span>
              <strong style={{ color: "#ef4444" }}>
                {formatCurrency(
                  modal?.item?.refundAmount ||
                    modal?.item?.booking?.finalAmount,
                )}
              </strong>
            </div>
          </div>

          {/* Note Input */}
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              {modal?.status === "approved"
                ? "Ghi chú (Tùy chọn)"
                : "Lý do từ chối (Bắt buộc gửi cho khách)"}
              {modal?.status === "rejected" && (
                <span style={{ color: "#ef4444" }}> *</span>
              )}
            </label>
            <textarea
              className="modern-input"
              rows={4}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder={
                modal?.status === "approved"
                  ? "Ghi chú nội bộ hoặc lời nhắn cho khách..."
                  : "Vui lòng nhập rõ lý do không hỗ trợ hoàn tiền..."
              }
            />
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              paddingTop: "16px",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <button
              className="btn btn-light"
              onClick={() => setModal(null)}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontWeight: 600,
                background: "#fff",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Hủy bỏ
            </button>
            <button
              className="btn btn-primary"
              onClick={review}
              style={{
                background:
                  modal?.status === "approved"
                    ? "linear-gradient(135deg, #22c55e, #16a34a)"
                    : "linear-gradient(135deg, #ef4444, #dc2626)",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                padding: "12px 24px",
                borderRadius: "12px",
                boxShadow:
                  modal?.status === "approved"
                    ? "0 4px 12px rgba(34, 197, 94, 0.2)"
                    : "0 4px 12px rgba(239, 68, 68, 0.2)",
                cursor: "pointer",
              }}
            >
              {modal?.status === "approved"
                ? "Xác nhận duyệt"
                : "Xác nhận từ chối"}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
