import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Camera,
  IdCard,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { updateStoredUser } from "@/lib/storage";
import { mapImageUrl } from "@/lib/tour";

const ADMIN_ROLE_LABEL = "Quản trị viên hệ thống";
const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const inputStyle = {
  width: "100%",
  border: "1px solid #d7e0ea",
  borderRadius: 12,
  padding: "13px 14px",
  fontSize: 15,
  color: "#0f172a",
  background: "#fff",
  outline: "none",
};

const labelStyle = {
  color: "#334155",
  fontSize: 14,
  fontWeight: 700,
};

function LockedEmailField({ value }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>Email đăng nhập</label>
      <div style={{ position: "relative" }}>
        <ShieldCheck
          size={18}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#475569",
            pointerEvents: "none",
          }}
        />
        <input
          type="email"
          value={value}
          readOnly
          tabIndex={-1}
          aria-readonly="true"
          title="Email đăng nhập do hệ thống quản lý và không thể thay đổi tại hồ sơ."
          style={{
            ...inputStyle,
            paddingLeft: 44,
            background: "#f1f5f9",
            borderColor: "#cbd5e1",
            color: "#475569",
            cursor: "not-allowed",
          }}
        />
      </div>
    </div>
  );
}

export default function AdminProfilePage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [user, setUser] = useState(null);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    identityNumber: "",
    birthDate: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const avatarUrl = useMemo(
    () => (user?.avatarUrl ? mapImageUrl(user.avatarUrl, API_URL) : ""),
    [user],
  );

  const syncUser = (nextUser) => {
    setUser(nextUser);
    setProfileForm({
      fullName: nextUser.fullName || "",
      email: nextUser.email || "",
      phone: nextUser.phone || "",
      identityNumber: nextUser.identityNumber || "",
      birthDate: nextUser.birthDate
        ? String(nextUser.birthDate).slice(0, 10)
        : "",
    });
    updateStoredUser(nextUser);
  };

  useEffect(() => {
    apiFetch("/auth/me")
      .then((result) => syncUser(result))
      .catch((error) => showToast(error.message, "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const updateProfileField = (field) => (event) => {
    setProfileForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const nextUser = await apiFetch("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: profileForm.fullName,
          phone: profileForm.phone,
          identityNumber: profileForm.identityNumber,
          birthDate: profileForm.birthDate || null,
        }),
      });
      syncUser(nextUser);
      showToast("Đã cập nhật hồ sơ admin.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return showToast("Mật khẩu xác nhận chưa khớp.", "error");
    }
    setSavingPassword(true);
    try {
      await apiFetch("/auth/me/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      showToast("Đã đổi mật khẩu thành công.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSavingPassword(false);
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const nextUser = await apiFetch("/auth/me/avatar", {
        method: "POST",
        body: formData,
      });
      syncUser(nextUser);
      showToast("Đã cập nhật ảnh đại diện.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  };

  if (loading) return <Loading text="Đang tải hồ sơ admin..." />;
  if (!user) return null;

  return (
    <AdminLayout current="/admin/profile" title="Hồ sơ Admin">
      <div className="admin-profile-shell">
        <section className="admin-profile-hero">
          <div>
            <div className="admin-profile-eyebrow">
              <ShieldCheck size={18} />
              Tài khoản quản trị
            </div>
            <h1>{user.fullName || "Admin Travela"}</h1>
          </div>
          <div className="admin-profile-role">
            <BadgeCheck size={22} />
            <span>{ADMIN_ROLE_LABEL}</span>
          </div>
        </section>

        <div className="admin-profile-grid">
          <aside className="admin-profile-card admin-profile-sidebar">
            <div className="avatar-wrap">
              {avatarUrl ? (
                <img src={avatarUrl} alt={user.fullName} />
              ) : (
                <div className="avatar-fallback">
                  {user.fullName?.charAt(0)?.toUpperCase() || "A"}
                </div>
              )}
            </div>
            <label className="avatar-button">
              <Camera size={17} />
              {uploadingAvatar ? "Đang tải ảnh..." : "Thay đổi ảnh"}
              <input
                type="file"
                hidden
                accept="image/*"
                onChange={uploadAvatar}
              />
            </label>
            <div className="profile-summary">
              <h2>{user.fullName}</h2>
              <p>
                <Mail size={15} />
                {user.email}
              </p>
              <span>
                <ShieldCheck size={15} />
                {ADMIN_ROLE_LABEL}
              </span>
            </div>
          </aside>

          <div className="admin-profile-content">
            <article className="admin-profile-card">
              <div className="section-heading">
                <div>
                  <h2>Thông tin Admin</h2>
                </div>
                <User size={24} />
              </div>

              <form onSubmit={saveProfile} className="admin-profile-form">
                <div style={fieldStyle}>
                  <label style={labelStyle}>Họ và tên</label>
                  <input
                    style={inputStyle}
                    value={profileForm.fullName}
                    onChange={updateProfileField("fullName")}
                  />
                </div>

                <LockedEmailField value={profileForm.email} />

                <div style={fieldStyle}>
                  <label style={labelStyle}>
                    <Phone size={15} />
                    Số điện thoại
                  </label>
                  <input
                    style={inputStyle}
                    value={profileForm.phone}
                    onChange={updateProfileField("phone")}
                    placeholder="Ví dụ: 0901234567"
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>
                    <IdCard size={15} />
                    CCCD/CMND
                  </label>
                  <input
                    style={inputStyle}
                    value={profileForm.identityNumber}
                    onChange={updateProfileField("identityNumber")}
                    placeholder="Nhập số giấy tờ tùy thân"
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>
                    <CalendarDays size={15} />
                    Ngày sinh
                  </label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={profileForm.birthDate}
                    onChange={updateProfileField("birthDate")}
                  />
                </div>

                <div className="form-actions">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={savingProfile}
                  >
                    {savingProfile ? "Đang lưu..." : "Lưu thông tin"}
                  </button>
                </div>
              </form>
            </article>

            <article className="admin-profile-card">
              <div className="section-heading">
                <div>
                  <h2>Bảo mật tài khoản</h2>
                  <p>Cập nhật mật khẩu đăng nhập cho tài khoản quản trị.</p>
                </div>
                <LockKeyhole size={24} />
              </div>

              <form onSubmit={changePassword} className="admin-profile-form">
                <div className="span-2" style={fieldStyle}>
                  <label style={labelStyle}>Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        currentPassword: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Mật khẩu mới</label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        newPassword: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Xác nhận mật khẩu mới</label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        confirmPassword: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-actions">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={savingPassword}
                  >
                    {savingPassword ? "Đang cập nhật..." : "Đổi mật khẩu"}
                  </button>
                </div>
              </form>
            </article>
          </div>
        </div>
      </div>

      <style jsx>{`
        .admin-profile-shell {
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        .admin-profile-hero {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          padding: 30px;
          border-radius: 18px;
          color: #fff;
          background:
            radial-gradient(
              circle at 86% 10%,
              rgba(45, 212, 191, 0.32),
              transparent 26%
            ),
            linear-gradient(135deg, #0f3b70 0%, #14569a 52%, #0f766e 100%);
          box-shadow: 0 18px 45px rgba(15, 59, 112, 0.22);
        }

        .admin-profile-eyebrow,
        .admin-profile-role,
        .profile-summary span,
        .profile-summary p,
        label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .admin-profile-eyebrow {
          margin-bottom: 12px;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: #c7f9ff;
        }

        .admin-profile-hero h1 {
          margin: 0;
          font-size: 32px;
          line-height: 1.2;
          letter-spacing: 0;
        }

        .admin-profile-hero p {
          max-width: 760px;
          margin: 12px 0 0;
          color: #e0f2fe;
          line-height: 1.65;
          font-size: 15px;
        }

        .admin-profile-role {
          flex-shrink: 0;
          padding: 12px 16px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.28);
          font-weight: 800;
          white-space: nowrap;
        }

        .admin-profile-grid {
          display: grid;
          grid-template-columns: minmax(250px, 310px) minmax(0, 1fr);
          gap: 22px;
          align-items: start;
        }

        .admin-profile-card {
          background: #fff;
          border: 1px solid #e7edf5;
          border-radius: 16px;
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.07);
        }

        .admin-profile-sidebar {
          padding: 26px;
          text-align: center;
          position: sticky;
          top: 90px;
        }

        .avatar-wrap {
          width: 150px;
          height: 150px;
          margin: 0 auto 16px;
          border-radius: 50%;
          padding: 5px;
          background: linear-gradient(135deg, #1d4ed8, #0f766e);
        }

        .avatar-wrap img,
        .avatar-fallback {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          border: 4px solid #fff;
        }

        .avatar-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 44px;
          font-weight: 900;
        }

        .avatar-button {
          justify-content: center;
          width: 100%;
          min-height: 42px;
          margin-bottom: 20px;
          border-radius: 12px;
          background: #eef6ff;
          color: #14569a;
          border: 1px solid #cfe2ff;
          font-weight: 800;
          cursor: pointer;
        }

        .profile-summary {
          padding-top: 18px;
          border-top: 1px solid #e7edf5;
        }

        .profile-summary h2 {
          margin: 0 0 10px;
          color: #0f172a;
          font-size: 22px;
          line-height: 1.25;
        }

        .profile-summary p {
          margin: 0 0 12px;
          color: #64748b;
          word-break: break-word;
          justify-content: center;
        }

        .profile-summary span {
          padding: 7px 12px;
          border-radius: 999px;
          background: #e8fff8;
          color: #0f766e;
          font-size: 13px;
          font-weight: 800;
        }

        .admin-profile-content {
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        .admin-profile-content .admin-profile-card {
          padding: 26px;
        }

        .section-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 22px;
          color: #14569a;
        }

        .section-heading h2 {
          margin: 0;
          color: #0f172a;
          font-size: 22px;
        }

        .section-heading p {
          margin: 6px 0 0;
          color: #64748b;
          line-height: 1.55;
        }

        .admin-profile-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .span-2,
        .form-actions {
          grid-column: 1 / -1;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          padding-top: 6px;
        }

        .form-actions button {
          min-width: 170px;
          border-radius: 12px;
          font-weight: 800;
        }

        @media (max-width: 980px) {
          .admin-profile-hero {
            align-items: flex-start;
            flex-direction: column;
          }

          .admin-profile-grid {
            grid-template-columns: 1fr;
          }

          .admin-profile-sidebar {
            position: static;
          }
        }

        @media (max-width: 640px) {
          .admin-profile-hero,
          .admin-profile-content .admin-profile-card,
          .admin-profile-sidebar {
            padding: 20px;
            border-radius: 14px;
          }

          .admin-profile-hero h1 {
            font-size: 26px;
          }

          .admin-profile-form {
            grid-template-columns: 1fr;
          }

          .form-actions button {
            width: 100%;
          }
        }
      `}</style>
    </AdminLayout>
  );
}
