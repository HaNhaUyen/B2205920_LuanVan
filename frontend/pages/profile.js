import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Loading from "@/components/Loading";
import { useToast } from "@/components/ToastContext";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import {
  getToken,
  getUser,
  clearSession,
  updateStoredUser,
} from "@/lib/storage";
import { mapImageUrl } from "@/lib/tour";

const tabs = [
  { key: "info", label: "Thông tin cá nhân" },
  { key: "favorites", label: "Tour yêu thích" },
  { key: "bookings", label: "Tour đã đặt" },
  { key: "refunds", label: "Hoàn tiền" },
  { key: "vouchers", label: "Voucher của tôi" },
  { key: "security", label: "Bảo mật" },
];

const tierLabel = {
  bronze: "Đồng",
  silver: "Bạc",
  gold: "Vàng",
  diamond: "Kim cương",
};

function StatusPill({ children, tone = "default" }) {
  const colors = {
    success: ["#dcfce7", "#166534"],
    warning: ["#fef3c7", "#92400e"],
    danger: ["#fee2e2", "#991b1b"],
    info: ["#dbeafe", "#1d4ed8"],
    default: ["#e2e8f0", "#334155"],
  };
  const [bg, color] = colors[tone] || colors.default;
  return (
    <span
      style={{
        padding: "5px 10px",
        borderRadius: 999,
        background: bg,
        color,
        fontWeight: 700,
        fontSize: 12,
      }}
    >
      {children}
    </span>
  );
}

function bookingTone(status) {
  if (["confirmed", "completed"].includes(status)) return "success";
  if (["pending_payment", "waiting_confirmation"].includes(status))
    return "warning";
  if (["cancelled", "expired"].includes(status)) return "danger";
  return "default";
}

const styles = {
  refundOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    background: "rgba(15,23,42,.65)",
    backdropFilter: "blur(6px)",
    display: "grid",
    placeItems: "center",
    padding: 18,
  },
  refundModal: {
    width: "min(620px, 100%)",
    background: "#fff",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 24px 80px rgba(15,23,42,.28)",
    position: "relative",
  },
  refundClose: {
    position: "absolute",
    right: 18,
    top: 18,
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: 0,
    background: "#e5e7eb",
    color: "#0f172a",
    fontSize: 24,
    cursor: "pointer",
  },
  refundBadge: {
    display: "inline-flex",
    padding: "7px 13px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    fontWeight: 800,
    fontSize: 13,
  },
  refundInfoBox: {
    display: "grid",
    gap: 10,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 18,
    margin: "20px 0",
  },
};

export default function ProfilePage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("info");
  const [user, setUser] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [refundForm, setRefundForm] = useState({ bookingId: "", reason: "" });
  const [refundModalBooking, setRefundModalBooking] = useState(null);
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
  const eligibleBookings = bookings.filter(
    (b) =>
      ["confirmed", "waiting_confirmation", "completed"].includes(
        b.bookingStatus,
      ) && !b.refundRequests?.some((r) => r.status === "pending"),
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

  const loadAll = async () => {
    const [me, fav, myBookings, myRefunds, myVouchers] = await Promise.all([
      apiFetch("/auth/me"),
      apiFetch("/favorites/me").catch(() => []),
      apiFetch("/bookings/me").catch(() => []),
      apiFetch("/refunds/me").catch(() => []),
      apiFetch("/vouchers/me").catch(() => []),
    ]);
    syncUser(me);
    setFavorites(fav || []);
    setBookings(myBookings || []);
    setRefunds(myRefunds || []);
    setVouchers(myVouchers || []);
  };

  useEffect(() => {
    if (!getToken() || !getUser()) {
      clearSession();
      window.location.href = "/login";
      return;
    }
    loadAll()
      .catch((error) => {
        showToast(error.message, "error");
        if (
          String(error.message || "")
            .toLowerCase()
            .includes("không tìm thấy") ||
          String(error.message || "")
            .toLowerCase()
            .includes("unauthorized")
        ) {
          clearSession();
          window.location.href = "/login";
        }
      })
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
          identityNumber: profileForm.identityNumber,
          birthDate: profileForm.birthDate || null,
        }),
      });
      syncUser(nextUser);
      showToast("Đã cập nhật hồ sơ cá nhân.", "success");
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

  const openRefundModal = (booking) => {
    setRefundModalBooking(booking);
    setRefundForm({ bookingId: String(booking.id), reason: "" });
  };

  const closeRefundModal = () => {
    setRefundModalBooking(null);
    setRefundForm({ bookingId: "", reason: "" });
  };

  const submitRefund = async (event) => {
    event.preventDefault();
    if (!refundForm.bookingId || !refundForm.reason.trim())
      return showToast(
        "Vui lòng chọn booking và nhập lý do hoàn tiền.",
        "error",
      );
    try {
      await apiFetch("/refunds", {
        method: "POST",
        body: JSON.stringify(refundForm),
      });
      closeRefundModal();
      await loadAll();
      setActiveTab("refunds");
      showToast("Đã gửi yêu cầu hoàn tiền đến admin.", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const removeFavorite = async (tourId) => {
    try {
      await apiFetch(`/favorites/${tourId}`, { method: "DELETE" });
      setFavorites((items) =>
        items.filter(
          (item) => String(item.tourId || item.tour?.id) !== String(tourId),
        ),
      );
      showToast("Đã bỏ tour khỏi yêu thích.", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  if (loading) return <Loading text="Đang tải hồ sơ cá nhân..." />;
  if (!user) return null;

  return (
    <section className="section section-light">
      <div
        className="container"
        style={{
          display: "grid",
          gap: 24,
          gridTemplateColumns: "320px 1fr",
          alignItems: "start",
        }}
      >
        <article
          className="section-card"
          style={{ textAlign: "center", position: "sticky", top: 100 }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={user.fullName}
              style={{
                width: 132,
                height: 132,
                borderRadius: "50%",
                objectFit: "cover",
                border: "4px solid #e2e8f0",
              }}
            />
          ) : (
            <div
              className="console-avatar"
              style={{
                width: 132,
                height: 132,
                fontSize: 42,
                margin: "0 auto",
              }}
            >
              {user.fullName?.charAt(0)?.toUpperCase() || "U"}
            </div>
          )}
          <h2 style={{ marginBottom: 4 }}>{user.fullName}</h2>
          <p className="muted">{user.email}</p>
          <StatusPill tone="info">
            Hạng {tierLabel[user.memberTier] || user.memberTier} ·{" "}
            {user.memberPoints || 0} điểm
          </StatusPill>
          <label
            className="btn btn-light"
            style={{ cursor: "pointer", marginTop: 16 }}
          >
            {uploadingAvatar ? "Đang tải ảnh..." : "Chọn ảnh đại diện"}
            <input
              type="file"
              hidden
              accept="image/*"
              onChange={uploadAvatar}
            />
          </label>
          <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={
                  activeTab === tab.key ? "btn btn-primary" : "btn btn-light"
                }
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </article>

        <div className="section-stack">
          {activeTab === "info" && (
            <article className="section-card">
              <h2>Thông tin cá nhân</h2>
              <p className="muted">
                Số điện thoại và CCCD là bắt buộc trước khi đặt tour. Ngày sinh
                có thể để trống.
              </p>
              <form onSubmit={saveProfile} className="modal-form-grid two-col">
                <div className="field">
                  <label>Họ và tên</label>
                  <input
                    value={profileForm.fullName}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
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
                  <label>Số điện thoại *</label>
                  <input
                    value={profileForm.phone}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, phone: e.target.value }))
                    }
                    placeholder="Ví dụ: 09xxxxxxxx"
                  />
                </div>
                <div className="field">
                  <label>CCCD *</label>
                  <input
                    value={profileForm.identityNumber}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        identityNumber: e.target.value,
                      }))
                    }
                    placeholder="12 số CCCD"
                  />
                </div>
                <div className="field">
                  <label>Ngày sinh, không bắt buộc</label>
                  <input
                    type="date"
                    value={profileForm.birthDate}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        birthDate: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
                  <button className="btn btn-primary" disabled={savingProfile}>
                    {savingProfile ? "Đang lưu..." : "Lưu thông tin"}
                  </button>
                </div>
              </form>
            </article>
          )}

          {activeTab === "favorites" && (
            <article className="section-card">
              <h2>Tour yêu thích</h2>
              {!favorites.length ? (
                <p className="muted">Bạn chưa lưu tour yêu thích.</p>
              ) : (
                <div className="tour-grid-next">
                  {favorites.map((item) => {
                    const tour = item.tour || item;
                    const tourId = tour.id || item.tourId;
                    return (
                      <div
                        key={String(item.id || tourId)}
                        className="section-card"
                      >
                        <h3>{tour.name}</h3>
                        <p className="muted">
                          {tour.shortDescription ||
                            "Tour bạn đã lưu để xem lại."}
                        </p>
                        <div className="form-actions">
                          <Link
                            className="btn btn-primary"
                            href={`/tour/${tour.slug || tourId}`}
                          >
                            Xem tour
                          </Link>
                          <button
                            className="btn btn-light"
                            onClick={() => removeFavorite(tourId)}
                          >
                            Bỏ yêu thích
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          )}

          {activeTab === "bookings" && (
            <article className="section-card">
              <h2>Tour đã đặt</h2>
              {!bookings.length ? (
                <p className="muted">Bạn chưa có booking nào.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Mã đơn</th>
                        <th>Tour</th>
                        <th>Ngày đi</th>
                        <th>HDV</th>
                        <th>Số khách</th>
                        <th>Tổng tiền</th>
                        <th>Trạng thái</th>
                        <th>Hoàn tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b) => (
                        <tr key={String(b.id)}>
                          <td>{b.bookingCode}</td>
                          <td>{b.tour?.name}</td>
                          <td>{formatDate(b.departure?.departureDate)}</td>
                          <td>
                            {b.guideAssignments?.[0]?.guide?.fullName ||
                              "Chưa chỉ định"}
                          </td>
                          <td>
                            {Number(b.adultCount || 0) +
                              Number(b.childCount || 0)}
                          </td>
                          <td>{formatCurrency(b.finalAmount)}</td>
                          <td>
                            <StatusPill tone={bookingTone(b.bookingStatus)}>
                              {b.bookingStatus}
                            </StatusPill>
                          </td>
                          <td>
                            {b.refundRequests?.[0] ? (
                              <StatusPill
                                tone={
                                  b.refundRequests[0].status === "approved"
                                    ? "success"
                                    : b.refundRequests[0].status === "rejected"
                                      ? "danger"
                                      : "warning"
                                }
                              >
                                {b.refundRequests[0].status}
                              </StatusPill>
                            ) : [
                                "confirmed",
                                "waiting_confirmation",
                                "completed",
                              ].includes(b.bookingStatus) ? (
                              <button
                                className="btn btn-light"
                                onClick={() => openRefundModal(b)}
                              >
                                Hoàn tiền
                              </button>
                            ) : (
                              "--"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          )}

          {activeTab === "refunds" && (
            <article className="section-card">
              <h2>Lịch sử hoàn tiền</h2>
              <p className="muted">
                Tab này hiển thị thời gian gửi yêu cầu, nội dung hoàn tour và
                trạng thái duyệt. Để gửi yêu cầu mới, vào tab{" "}
                <strong>Tour đã đặt</strong> và bấm nút{" "}
                <strong>Hoàn tiền</strong> kế bên đơn phù hợp.
              </p>
              <h3>Danh sách yêu cầu hoàn tiền</h3>
              {!refunds.length ? (
                <p className="muted">Chưa có yêu cầu hoàn tiền.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Booking</th>
                      <th>Tour</th>
                      <th>Lý do</th>
                      <th>Trạng thái</th>
                      <th>Phản hồi admin</th>
                      <th>Ngày gửi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.map((r) => (
                      <tr key={String(r.id)}>
                        <td>{r.booking?.bookingCode}</td>
                        <td>{r.booking?.tour?.name}</td>
                        <td>{r.reason}</td>
                        <td>
                          <StatusPill
                            tone={
                              r.status === "approved"
                                ? "success"
                                : r.status === "rejected"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {r.status}
                          </StatusPill>
                        </td>
                        <td>{r.adminNote || "--"}</td>
                        <td>{formatDateTime(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>
          )}

          {activeTab === "vouchers" && (
            <article className="section-card">
              <h2>Voucher của tôi</h2>
              {!vouchers.length ? (
                <p className="muted">
                  Bạn chưa có voucher nào. Khi tích điểm lên hạng, hệ thống có
                  thể cấp voucher phù hợp.
                </p>
              ) : (
                <div className="tour-grid-next">
                  {vouchers.map((uv) => (
                    <div key={String(uv.id)} className="section-card">
                      <h3>{uv.voucher?.code}</h3>
                      <p>
                        <strong>{uv.voucher?.name}</strong>
                      </p>
                      <p className="muted">{uv.voucher?.description}</p>
                      <p>
                        Giảm:{" "}
                        {uv.voucher?.discountType === "percent"
                          ? `${uv.voucher?.discountValue}%`
                          : formatCurrency(uv.voucher?.discountValue)}
                      </p>
                      <p>HSD: {formatDate(uv.voucher?.endDate)}</p>
                      <StatusPill
                        tone={uv.status === "available" ? "success" : "default"}
                      >
                        {uv.status}
                      </StatusPill>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )}

          {activeTab === "security" && (
            <article className="section-card">
              <h2>Bảo mật tài khoản</h2>
              <form onSubmit={changePassword} className="modal-form-grid">
                <div className="field">
                  <label>Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm((p) => ({
                        ...p,
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
                      setPasswordForm((p) => ({
                        ...p,
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
                      setPasswordForm((p) => ({
                        ...p,
                        confirmPassword: e.target.value,
                      }))
                    }
                  />
                </div>
                <button className="btn btn-primary" disabled={savingPassword}>
                  {savingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
                </button>
              </form>
            </article>
          )}
        </div>
      </div>

      {refundModalBooking && (
        <div style={styles.refundOverlay}>
          <div style={styles.refundModal}>
            <button
              type="button"
              onClick={closeRefundModal}
              style={styles.refundClose}
            >
              ×
            </button>
            <div style={styles.refundBadge}>Yêu cầu hoàn tiền</div>
            <h2 style={{ margin: "10px 0 8px", color: "#0f172a" }}>
              Gửi lý do hoàn tour
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Admin sẽ xem xét yêu cầu. Nếu được duyệt, hệ thống sẽ hoàn slot về
              tour và cập nhật trạng thái hoàn tiền.
            </p>

            <div style={styles.refundInfoBox}>
              <div>
                <span>Mã đơn</span>
                <strong>{refundModalBooking.bookingCode}</strong>
              </div>
              <div>
                <span>Tour</span>
                <strong>{refundModalBooking.tour?.name || "--"}</strong>
              </div>
              <div>
                <span>Ngày đi</span>
                <strong>
                  {formatDate(refundModalBooking.departure?.departureDate)}
                </strong>
              </div>
              <div>
                <span>Số tiền</span>
                <strong>
                  {formatCurrency(refundModalBooking.finalAmount)}
                </strong>
              </div>
            </div>

            <form onSubmit={submitRefund} style={{ display: "grid", gap: 14 }}>
              <div className="field">
                <label>Lý do hoàn tiền / lý do không đi</label>
                <textarea
                  rows={5}
                  value={refundForm.reason}
                  onChange={(e) =>
                    setRefundForm((p) => ({ ...p, reason: e.target.value }))
                  }
                  placeholder="Ví dụ: gia đình có việc đột xuất, lý do sức khỏe, muốn hủy chuyến..."
                  required
                />
              </div>
              <div
                style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
              >
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={closeRefundModal}
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary">
                  Gửi yêu cầu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
