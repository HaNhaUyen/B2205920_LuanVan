import { useEffect, useState } from "react";
import {
  Award,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Languages,
  MapPinned,
  Plus,
  ShieldCheck,
  Sparkles,
  Pencil,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { useToast } from "@/components/ToastContext";

const EMPTY_FORM = {
  competencyType: "language",
  name: "",
  level: "",
  certificateNo: "",
  issuedBy: "",
  issuedDate: "",
  expiryDate: "",
  documentUrl: "",
  note: "",
};

const TYPE_LABELS = {
  language: "Ngoại ngữ",
  route: "Tuyến điểm chuyên sâu",
  skill: "Kỹ năng đặc biệt",
  certificate: "Chứng chỉ ngành",
};

function buildEvidenceUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("blob:")) return raw;

  const backendOrigin = String(API_URL || "")
    .replace(/\/api\/?$/, "")
    .replace(/\/$/, "");
  const safePath = raw.startsWith("/") ? raw : `/${raw}`;
  return `${backendOrigin}${safePath}`;
}

const STATUS_LABELS = {
  pending: "Đang chờ duyệt",
  verified: "Đã xác minh",
  rejected: "Không được duyệt",
};

function normalizeItems(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

function getStatusTone(status) {
  if (status === "verified") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

function CompetencyIcon({ type }) {
  if (type === "language") return <Languages size={19} />;
  if (type === "route") return <MapPinned size={19} />;
  if (type === "certificate") return <Award size={19} />;
  return <Sparkles size={19} />;
}

export default function GuideCompetenciesPanel() {
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [existingEvidenceUrl, setExistingEvidenceUrl] = useState("");

  const loadCompetencies = async () => {
    try {
      const result = await apiFetch("/trip-operations/guides/me/competencies");
      setItems(normalizeItems(result));
    } catch (error) {
      setItems([]);
      showToast(error?.message || "Không tải được hồ sơ năng lực.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompetencies();
  }, []);

  useEffect(() => {
    if (!evidenceFile || !evidenceFile.type.startsWith("image/")) {
      setPreviewUrl("");
      return undefined;
    }

    const nextUrl = URL.createObjectURL(evidenceFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [evidenceFile]);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetCompetencyForm = () => {
    setForm(EMPTY_FORM);
    setEvidenceFile(null);
    setEditingId(null);
    setExistingEvidenceUrl("");
  };

  const editCompetency = (item) => {
    const currentEvidence = String(
      item.documentUrl || item.document_url || "",
    ).trim();

    setEditingId(item.id);
    setExistingEvidenceUrl(currentEvidence);
    setEvidenceFile(null);
    setForm({
      competencyType: item.competencyType || item.competency_type || "language",
      name: item.name || "",
      level: item.level || "",
      certificateNo: item.certificateNo || item.certificate_no || "",
      issuedBy: item.issuedBy || item.issued_by || "",
      issuedDate:
        item.issuedDate || item.issued_date
          ? String(item.issuedDate || item.issued_date).slice(0, 10)
          : "",
      expiryDate:
        item.expiryDate || item.expiry_date
          ? String(item.expiryDate || item.expiry_date).slice(0, 10)
          : "",
      documentUrl: /^https?:\/\//i.test(currentEvidence) ? currentEvidence : "",
      note: item.note || "",
    });
  };

  const deleteCompetency = async (item) => {
    if (!window.confirm(`Xóa khai báo "${item.name}" đang chờ Admin duyệt?`)) {
      return;
    }

    try {
      await apiFetch(`/trip-operations/guides/me/competencies/${item.id}`, {
        method: "DELETE",
      });
      if (String(editingId) === String(item.id)) {
        resetCompetencyForm();
      }
      await loadCompetencies();
      showToast("Đã xóa hồ sơ năng lực đang chờ duyệt.", "success");
    } catch (error) {
      showToast(error?.message || "Không thể xóa hồ sơ năng lực.", "error");
    }
  };

  const saveCompetency = async (event) => {
    event.preventDefault();

    const name = String(form.name || "").trim();
    const level = String(form.level || "").trim();
    const certificateNo = String(form.certificateNo || "").trim();
    const issuedBy = String(form.issuedBy || "").trim();
    const documentUrl = String(form.documentUrl || "").trim();
    const note = String(form.note || "").trim();
    if (
      !["language", "route", "skill", "certificate"].includes(
        form.competencyType,
      )
    )
      return showToast("Phân loại năng lực không hợp lệ.", "error");
    if (name.length < 2 || name.length > 180)
      return showToast(
        "Tên kỹ năng/chứng chỉ phải từ 2 đến 180 ký tự.",
        "error",
      );
    if (level.length > 100)
      return showToast("Mức độ/bậc tối đa 100 ký tự.", "error");
    if (certificateNo.length > 120)
      return showToast("Số hiệu chứng chỉ tối đa 120 ký tự.", "error");
    if (issuedBy.length > 180)
      return showToast("Đơn vị cấp tối đa 180 ký tự.", "error");
    if (documentUrl.length > 1000)
      return showToast("Đường dẫn minh chứng quá dài.", "error");
    if (note.length > 1000)
      return showToast("Ghi chú tối đa 1000 ký tự.", "error");
    if (form.issuedDate) {
      const issued = new Date(`${form.issuedDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(issued.getTime()) || issued > today)
        return showToast(
          "Ngày cấp không hợp lệ hoặc nằm trong tương lai.",
          "error",
        );
    }
    if (form.expiryDate) {
      const expiry = new Date(`${form.expiryDate}T00:00:00`);
      if (Number.isNaN(expiry.getTime()))
        return showToast("Ngày hết hạn không hợp lệ.", "error");
      if (form.issuedDate && expiry < new Date(`${form.issuedDate}T00:00:00`))
        return showToast("Ngày hết hạn phải bằng hoặc sau ngày cấp.", "error");
    }
    if (evidenceFile) {
      const allowed =
        evidenceFile.type === "application/pdf" ||
        evidenceFile.type?.startsWith("image/");
      if (!allowed)
        return showToast("Minh chứng chỉ nhận file ảnh hoặc PDF.", "error");
      if (evidenceFile.size > 5 * 1024 * 1024)
        return showToast("File minh chứng tối đa 5MB.", "error");
    }

    if (!documentUrl && !evidenceFile && !existingEvidenceUrl) {
      showToast(
        "Vui lòng tải ảnh/PDF minh chứng hoặc nhập URL minh chứng.",
        "error",
      );
      return;
    }

    try {
      setSaving(true);

      const payload = new FormData();
      payload.append("competencyType", form.competencyType);
      payload.append("name", name);
      payload.append("level", level);
      payload.append("certificateNo", certificateNo);
      payload.append("issuedBy", issuedBy);
      payload.append("issuedDate", form.issuedDate || "");
      payload.append("expiryDate", form.expiryDate || "");
      payload.append("documentUrl", documentUrl);
      payload.append("note", note);

      if (evidenceFile) {
        payload.append("evidenceFile", evidenceFile);
      }

      await apiFetch(
        editingId
          ? `/trip-operations/guides/me/competencies/${editingId}`
          : "/trip-operations/guides/me/competencies",
        {
          method: editingId ? "PATCH" : "POST",
          body: payload,
        },
      );

      const wasEditing = Boolean(editingId);
      resetCompetencyForm();
      await loadCompetencies();
      showToast(
        wasEditing
          ? "Đã cập nhật hồ sơ năng lực đang chờ duyệt."
          : "Đã gửi hồ sơ năng lực và minh chứng để Admin duyệt.",
        "success",
      );
    } catch (error) {
      showToast(error?.message || "Không thể lưu hồ sơ năng lực.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="competency-profile-section">
      <div className="competency-section-heading">
        <div>
          <span>Hồ sơ chuyên môn</span>
          <h2>Năng lực, ngoại ngữ và chứng chỉ</h2>
          <p>
            Khai báo đầy đủ để ban điều hành lựa chọn tour phù hợp với chuyên
            môn của bạn.
          </p>
        </div>

        <div className="competency-total">
          <ShieldCheck size={20} />
          <div>
            <strong>{items.length}</strong>
            <span>năng lực đã khai báo</span>
          </div>
        </div>
      </div>

      <div className="competency-profile-grid">
        <form className="competency-form-card" onSubmit={saveCompetency}>
          <div className="competency-card-title">
            <div className="competency-title-icon">
              <Plus size={20} />
            </div>
            <div>
              <h3>{editingId ? "Cập nhật năng lực" : "Thêm năng lực mới"}</h3>
              <p>Ngoại ngữ, tuyến chuyên sâu, kỹ năng hoặc chứng chỉ.</p>
            </div>
          </div>

          <div className="competency-form-grid">
            <label>
              <span>Phân loại</span>
              <select
                value={form.competencyType}
                onChange={(event) =>
                  updateField("competencyType", event.target.value)
                }
              >
                <option value="language">Ngoại ngữ</option>
                <option value="route">Tuyến điểm chuyên sâu</option>
                <option value="skill">Kỹ năng đặc biệt</option>
                <option value="certificate">Chứng chỉ ngành</option>
              </select>
            </label>

            <label>
              <span>Mức độ / Bậc</span>
              <input
                value={form.level}
                onChange={(event) => updateField("level", event.target.value)}
                placeholder="VD: C1, IELTS 6.5, Thành thạo"
              />
            </label>

            <label className="full">
              <span>Tên kỹ năng / Tên chứng chỉ</span>
              <input
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="VD: Tiếng Anh giao tiếp, Thẻ HDV quốc tế"
              />
            </label>

            <label>
              <span>Số hiệu chứng chỉ</span>
              <input
                value={form.certificateNo}
                onChange={(event) =>
                  updateField("certificateNo", event.target.value)
                }
                placeholder="Không bắt buộc"
              />
            </label>

            <label>
              <span>Đơn vị cấp</span>
              <input
                value={form.issuedBy}
                onChange={(event) =>
                  updateField("issuedBy", event.target.value)
                }
                placeholder="VD: Cục Du lịch Quốc gia"
              />
            </label>

            <label>
              <span>Ngày cấp</span>
              <input
                type="date"
                value={form.issuedDate}
                onChange={(event) =>
                  updateField("issuedDate", event.target.value)
                }
              />
            </label>

            <label>
              <span>Ngày hết hạn</span>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(event) =>
                  updateField("expiryDate", event.target.value)
                }
              />
            </label>

            <label className="full">
              <span>Ảnh/PDF minh chứng</span>
              <input
                className="competency-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) =>
                  setEvidenceFile(event.target.files?.[0] || null)
                }
              />
              {evidenceFile && (
                <div className="competency-file-selected">
                  <FileCheck2 size={16} />
                  <span>{evidenceFile.name}</span>
                  <button type="button" onClick={() => setEvidenceFile(null)}>
                    Xóa
                  </button>
                </div>
              )}
              {editingId && existingEvidenceUrl && !evidenceFile && (
                <small className="competency-help">
                  Minh chứng hiện tại sẽ được giữ nguyên nếu bạn không chọn file
                  hoặc URL mới.
                </small>
              )}
              {previewUrl && (
                <img
                  className="competency-file-preview"
                  src={previewUrl}
                  alt="Xem trước minh chứng"
                />
              )}
              <small className="competency-help">
                Chấp nhận JPG, PNG, WEBP hoặc PDF, tối đa 8 MB. Bắt buộc có
                ảnh/PDF minh chứng hoặc URL minh chứng.
              </small>
            </label>

            <label className="full">
              <span>Hoặc URL minh chứng</span>
              <input
                type="url"
                value={form.documentUrl}
                onChange={(event) =>
                  updateField("documentUrl", event.target.value)
                }
                placeholder="https://..."
              />
            </label>

            <label className="full">
              <span>Ghi chú</span>
              <textarea
                value={form.note}
                onChange={(event) => updateField("note", event.target.value)}
                placeholder="Mô tả kinh nghiệm thực tế hoặc phạm vi có thể phụ trách..."
              />
            </label>
          </div>

          <div className="competency-form-actions">
            {editingId && (
              <button
                type="button"
                className="competency-cancel-button"
                onClick={resetCompetencyForm}
                disabled={saving}
              >
                Hủy chỉnh sửa
              </button>
            )}
            <button type="submit" disabled={saving}>
              <ShieldCheck size={17} />
              {saving
                ? "Đang lưu..."
                : editingId
                  ? "Cập nhật hồ sơ năng lực"
                  : "Lưu hồ sơ năng lực"}
            </button>
          </div>
        </form>

        <div className="competency-list-card">
          <div className="competency-card-title">
            <div className="competency-title-icon secondary">
              <Award size={20} />
            </div>
            <div>
              <h3>Hồ sơ đã khai báo</h3>
              <p>
                Chỉ năng lực đã được Admin xác minh mới được dùng để hỗ trợ phân
                công tour và hiển thị trong hồ sơ chính.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="competency-empty">Đang tải hồ sơ năng lực...</div>
          ) : !items.length ? (
            <div className="competency-empty">
              <div>
                <ShieldCheck size={30} />
              </div>
              <strong>Chưa có năng lực nào</strong>
              <p>Hãy thêm ngoại ngữ, tuyến điểm hoặc chứng chỉ đầu tiên.</p>
            </div>
          ) : (
            <div className="competency-items">
              {items.map((item) => {
                const type = item.competencyType || item.competency_type;
                const status =
                  item.verificationStatus ||
                  item.verification_status ||
                  "pending";

                return (
                  <article className="competency-item" key={item.id}>
                    <div className={`competency-item-icon ${type || "skill"}`}>
                      <CompetencyIcon type={type} />
                    </div>

                    <div className="competency-item-content">
                      <div className="competency-item-head">
                        <div>
                          <span>{TYPE_LABELS[type] || "Năng lực khác"}</span>
                          <h4>{item.name}</h4>
                        </div>

                        <em className={getStatusTone(status)}>
                          {STATUS_LABELS[status] || status}
                        </em>
                      </div>

                      <div className="competency-meta">
                        <span>
                          <strong>Trình độ:</strong>{" "}
                          {item.level || "Chưa cập nhật"}
                        </span>
                        <span>
                          <strong>Đơn vị cấp:</strong>{" "}
                          {item.issuedBy || item.issued_by || "Chưa cập nhật"}
                        </span>
                        {(item.issuedDate || item.issued_date) && (
                          <span>
                            <CalendarDays size={14} />
                            Ngày cấp:{" "}
                            {new Date(
                              item.issuedDate || item.issued_date,
                            ).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </div>

                      {(item.documentUrl || item.document_url) && (
                        <a
                          className="competency-evidence"
                          href={buildEvidenceUrl(
                            item.documentUrl || item.document_url,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileCheck2 size={14} />
                          Xem minh chứng
                          <ExternalLink size={13} />
                        </a>
                      )}

                      {status === "pending" && (
                        <div className="competency-pending-actions">
                          <button
                            type="button"
                            onClick={() => editCompetency(item)}
                          >
                            <Pencil size={14} />
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => deleteCompetency(item)}
                          >
                            <Trash2 size={14} />
                            Xóa
                          </button>
                        </div>
                      )}

                      {status === "rejected" &&
                        (item.rejectionReason || item.rejection_reason) && (
                          <div className="competency-rejection">
                            Lý do từ chối:{" "}
                            {item.rejectionReason || item.rejection_reason}
                          </div>
                        )}

                      {(item.certificateNo || item.certificate_no) && (
                        <div className="competency-code">
                          Số hiệu: {item.certificateNo || item.certificate_no}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .competency-profile-section {
          grid-column: 1 / -1;
          margin-top: 24px;
          padding: 26px;
          border: 1px solid #e2e8f0;
          border-radius: 22px;
          background: #ffffff;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
        }

        .competency-section-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 22px;
        }

        .competency-section-heading > div:first-child > span {
          color: #2563eb;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .competency-section-heading h2 {
          margin: 6px 0;
          color: #0f172a;
          font-size: 24px;
        }

        .competency-section-heading p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
        }

        .competency-total {
          min-width: 190px;
          padding: 13px 15px;
          border: 1px solid #bfdbfe;
          border-radius: 14px;
          background: #eff6ff;
          color: #2563eb;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .competency-total div {
          display: grid;
        }

        .competency-total strong {
          color: #0f172a;
          font-size: 20px;
        }

        .competency-total span {
          color: #64748b;
          font-size: 11px;
        }

        .competency-profile-grid {
          display: grid;
          grid-template-columns: minmax(390px, 0.9fr) minmax(0, 1.1fr);
          gap: 20px;
          align-items: start;
        }

        .competency-form-card,
        .competency-list-card {
          padding: 20px;
          border: 1px solid #e2e8f0;
          border-radius: 17px;
          background: #f8fafc;
        }

        .competency-card-title {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .competency-title-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: #dbeafe;
          color: #2563eb;
          display: grid;
          place-items: center;
        }

        .competency-title-icon.secondary {
          background: #ecfdf5;
          color: #059669;
        }

        .competency-card-title h3 {
          margin: 0 0 3px;
          color: #0f172a;
          font-size: 17px;
        }

        .competency-card-title p {
          margin: 0;
          color: #64748b;
          font-size: 12px;
        }

        .competency-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .competency-form-grid label {
          display: grid;
          gap: 7px;
        }

        .competency-form-grid label.full {
          grid-column: 1 / -1;
        }

        .competency-form-grid label > span {
          color: #334155;
          font-size: 12px;
          font-weight: 700;
        }

        .competency-form-grid input,
        .competency-form-grid select,
        .competency-form-grid textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 11px 12px;
          background: #ffffff;
          color: #0f172a;
          outline: none;
        }

        .competency-help {
          color: #64748b;
          font-size: 11px;
          line-height: 1.45;
        }

        .competency-file-input {
          padding: 9px !important;
          cursor: pointer;
        }

        .competency-file-selected {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border: 1px solid #bfdbfe;
          border-radius: 10px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 12px;
        }

        .competency-file-selected span {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .competency-file-selected button {
          border: 0;
          background: transparent;
          color: #dc2626;
          font-weight: 700;
          cursor: pointer;
        }

        .competency-file-preview {
          width: 100%;
          max-height: 220px;
          object-fit: contain;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #fff;
        }

        .competency-form-grid textarea {
          min-height: 90px;
          resize: vertical;
        }

        .competency-form-grid input:focus,
        .competency-form-grid select:focus,
        .competency-form-grid textarea:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .competency-form-actions {
          margin-top: 17px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .competency-form-actions button {
          min-height: 42px;
          border: 0;
          border-radius: 10px;
          padding: 0 16px;
          background: #2563eb;
          color: #ffffff;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
        }

        .competency-form-actions .competency-cancel-button {
          background: #e2e8f0;
          color: #475569;
        }

        .competency-form-actions button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .competency-pending-actions {
          margin-top: 10px;
          display: flex;
          gap: 8px;
        }

        .competency-pending-actions button {
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          padding: 6px 9px;
          background: #eff6ff;
          color: #1d4ed8;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .competency-pending-actions button.danger {
          border-color: #fecaca;
          background: #fef2f2;
          color: #dc2626;
        }

        .competency-items {
          display: grid;
          gap: 11px;
          max-height: 510px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .competency-item {
          padding: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 13px;
          background: #ffffff;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          gap: 12px;
        }

        .competency-item-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: #f1f5f9;
          color: #475569;
          display: grid;
          place-items: center;
        }

        .competency-item-icon.language {
          background: #eff6ff;
          color: #2563eb;
        }

        .competency-item-icon.route {
          background: #ecfdf5;
          color: #059669;
        }

        .competency-item-icon.certificate {
          background: #fff7ed;
          color: #ea580c;
        }

        .competency-item-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }

        .competency-item-head span {
          color: #64748b;
          font-size: 11px;
        }

        .competency-item-head h4 {
          margin: 3px 0 0;
          color: #0f172a;
          font-size: 15px;
        }

        .competency-item-head em {
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 10px;
          font-style: normal;
          font-weight: 800;
          white-space: nowrap;
        }

        .competency-item-head em.success {
          background: #dcfce7;
          color: #166534;
        }

        .competency-item-head em.warning {
          background: #fef3c7;
          color: #92400e;
        }

        .competency-item-head em.danger {
          background: #fee2e2;
          color: #991b1b;
        }

        .competency-meta {
          display: grid;
          gap: 4px;
          margin-top: 10px;
          color: #64748b;
          font-size: 11px;
        }

        .competency-meta span {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .competency-evidence {
          width: fit-content;
          margin-top: 9px;
          border-radius: 8px;
          padding: 6px 9px;
          background: #eff6ff;
          color: #1d4ed8;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 800;
          text-decoration: none;
        }

        .competency-rejection {
          margin-top: 9px;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 8px 10px;
          background: #fef2f2;
          color: #991b1b;
          font-size: 11px;
          line-height: 1.45;
        }

        .competency-code {
          width: fit-content;
          margin-top: 9px;
          border-radius: 7px;
          padding: 5px 8px;
          background: #f1f5f9;
          color: #475569;
          font-family: monospace;
          font-size: 11px;
        }

        .competency-empty {
          min-height: 310px;
          color: #64748b;
          text-align: center;
          display: grid;
          place-content: center;
          justify-items: center;
          gap: 7px;
        }

        .competency-empty > div {
          width: 58px;
          height: 58px;
          border-radius: 16px;
          background: #eff6ff;
          color: #2563eb;
          display: grid;
          place-items: center;
        }

        .competency-empty strong {
          color: #0f172a;
        }

        .competency-empty p {
          margin: 0;
          font-size: 12px;
        }

        @media (max-width: 1050px) {
          .competency-profile-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 700px) {
          .competency-profile-section {
            padding: 18px;
          }

          .competency-section-heading {
            flex-direction: column;
          }

          .competency-total {
            width: 100%;
            box-sizing: border-box;
          }

          .competency-form-grid {
            grid-template-columns: 1fr;
          }

          .competency-form-grid label.full {
            grid-column: auto;
          }
        }
      `}</style>
    </section>
  );
}
