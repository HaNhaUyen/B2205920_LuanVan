import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import Loading from "@/components/Loading";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { updateStoredUser } from "@/lib/storage";
import { mapImageUrl } from "@/lib/tour";

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
    });
    updateStoredUser(nextUser);
  };

  useEffect(() => {
    apiFetch("/auth/me")
      .then((result) => syncUser(result))
      .catch((error) => showToast(error.message, "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const nextUser = await apiFetch("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: profileForm.fullName,
          phone: profileForm.phone,
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
    if (passwordForm.newPassword !== passwordForm.confirmPassword)
      return showToast("Mật khẩu xác nhận chưa khớp.", "error");
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
    <AdminLayout current="/admin/profile" title="Hồ sơ cá nhân">
      <div className="detail-grid" style={{ alignItems: "start" }}>
        <article className="admin-card" style={{ textAlign: "center" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={user.fullName}
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "4px solid #e2e8f0",
                }}
              />
            ) : (
              <div
                className="console-avatar"
                style={{ width: 140, height: 140, fontSize: 42 }}
              >
                {user.fullName?.charAt(0)?.toUpperCase() || "A"}
              </div>
            )}
          </div>
          <h3>{user.fullName}</h3>
          <p className="muted">{user.email}</p>
          <label className="btn btn-light" style={{ cursor: "pointer" }}>
            {uploadingAvatar ? "Đang tải ảnh..." : "Chọn ảnh đại diện"}
            <input
              type="file"
              hidden
              accept="image/*"
              onChange={uploadAvatar}
            />
          </label>
        </article>

        <div className="section-stack">
          <article className="admin-card">
            <h2>Thông tin cơ bản</h2>
            <form onSubmit={saveProfile} className="modal-form-grid two-col">
              <div className="field">
                <label>Họ và tên</label>
                <input
                  value={profileForm.fullName}
                  onChange={(e) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      fullName: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={profileForm.email} readOnly />
              </div>
              <div className="field">
                <label>Số điện thoại</label>
                <input
                  value={profileForm.phone}
                  onChange={(e) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="field span-2">
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
          <article className="admin-card">
            <h2>Đổi mật khẩu</h2>
            <form onSubmit={changePassword} className="modal-form-grid two-col">
              <div className="field span-2">
                <label>Mật khẩu hiện tại</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      currentPassword: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>Mật khẩu mới</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      newPassword: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      confirmPassword: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="field span-2">
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
    </AdminLayout>
  );
}
