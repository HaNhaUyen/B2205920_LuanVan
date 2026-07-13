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
import SessionManager from "@/components/profile/SessionManager";
import { mapImageUrl } from "@/lib/tour";
import {
  User,
  Heart,
  ShoppingBag,
  RotateCcw,
  Ticket,
  Shield,
  Camera,
  X,
  ChevronRight,
  Info,
  UsersRound,
  Plus,
  Pencil,
  Trash2,
  Save,
} from "lucide-react";

const tabs = [
  { key: "info", label: "Thông tin cá nhân", icon: User },
  { key: "favorites", label: "Tour yêu thích", icon: Heart },
  { key: "bookings", label: "Tour đã đặt", icon: ShoppingBag },
  { key: "travelers", label: "Hành khách thường dùng", icon: UsersRound },
  { key: "refunds", label: "Hoàn tiền", icon: RotateCcw },
  { key: "vouchers", label: "Voucher của tôi", icon: Ticket },
  { key: "security", label: "Bảo mật", icon: Shield },
];

const tierLabel = {
  bronze: "Đồng",
  silver: "Bạc",
  gold: "Vàng",
  diamond: "Kim cương",
};

const FAVORITE_PAGE_SIZE = 4;
const BOOKING_PAGE_SIZE = 5;
const REFUND_PAGE_SIZE = 5;
const VOUCHER_PAGE_SIZE = 6;
const TRAVELER_PAGE_SIZE = 4;

function StatusPill({ children, tone = "default" }) {
  const colors = {
    success: ["#dcfce7", "#166534", "#bbf7d0"],
    warning: ["#fef3c7", "#92400e", "#fde68a"],
    danger: ["#fee2e2", "#991b1b", "#fecaca"],
    info: ["#eff6ff", "#1d4ed8", "#bfdbfe"],
    default: ["#f1f5f9", "#475569", "#e2e8f0"],
  };

  const [bg, color, border] = colors[tone] || colors.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 12px",
        borderRadius: "9999px",
        background: bg,
        color,
        border: `1px solid ${border}`,
        fontWeight: 600,
        fontSize: "13px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function bookingTone(status) {
  if (["confirmed", "completed"].includes(status)) return "success";
  if (["pending_payment", "waiting_confirmation"].includes(status)) {
    return "warning";
  }
  if (["cancelled", "expired"].includes(status)) return "danger";
  return "default";
}

function PaginationBar({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "10px",
        marginTop: "28px",
        paddingTop: "20px",
        borderTop: "1px solid #e2e8f0",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        style={{
          padding: "10px 16px",
          borderRadius: "999px",
          border: "1px solid #dbeafe",
          background: page === 1 ? "#f8fafc" : "#fff",
          color: page === 1 ? "#94a3b8" : "#2563eb",
          fontWeight: 700,
          cursor: page === 1 ? "not-allowed" : "pointer",
        }}
      >
        Trước
      </button>

      {Array.from({ length: totalPages }).map((_, index) => {
        const current = index + 1;
        const active = current === page;

        return (
          <button
            key={current}
            type="button"
            onClick={() => onPageChange(current)}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "50%",
              border: active ? "1px solid #2563eb" : "1px solid #dbeafe",
              background: active ? "#2563eb" : "#fff",
              color: active ? "#fff" : "#2563eb",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {current}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        style={{
          padding: "10px 16px",
          borderRadius: "999px",
          border: "1px solid #dbeafe",
          background: page === totalPages ? "#f8fafc" : "#fff",
          color: page === totalPages ? "#94a3b8" : "#2563eb",
          fontWeight: 700,
          cursor: page === totalPages ? "not-allowed" : "pointer",
        }}
      >
        Sau
      </button>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "1200px",
    margin: "40px auto",
    padding: "0 20px",
    display: "grid",
    gridTemplateColumns: "280px minmax(0, 1fr)",
    gap: "32px",
    alignItems: "start",
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    padding: "28px",
    minWidth: 0,
    boxShadow:
      "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 10px 15px -3px rgba(0, 0, 0, 0.05)",
    border: "1px solid #f1f5f9",
  },
  menuButton: (isActive) => ({
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "14px 20px",
    borderRadius: "12px",
    border: "none",
    background: isActive ? "#eff6ff" : "transparent",
    color: isActive ? "#2563eb" : "#475569",
    fontWeight: isActive ? 600 : 500,
    fontSize: "15px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    textAlign: "left",
  }),
  input: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    fontSize: "15px",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    marginTop: "6px",
  },
  label: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#334155",
    marginBottom: "4px",
    display: "block",
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: "0",
    marginTop: "16px",
  },
  th: {
    background: "#f8fafc",
    padding: "16px",
    textAlign: "left",
    fontSize: "13px",
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "16px",
    fontSize: "14px",
    color: "#334155",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle",
  },
  emptyState: {
    textAlign: "center",
    padding: "48px 20px",
    color: "#64748b",
  },
  refundOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    background: "rgba(15, 23, 42, 0.45)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px",
    overflowY: "auto",
  },

  refundModal: {
    width: "min(640px, 100%)",
    maxHeight: "calc(100vh - 36px)",
    background: "#fff",
    borderRadius: "22px",
    boxShadow:
      "0 24px 70px rgba(15, 23, 42, 0.22), 0 8px 18px rgba(15, 23, 42, 0.08)",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  refundModalHeader: {
    padding: "28px 32px 18px",
    borderBottom: "1px solid #eef2f7",
    flexShrink: 0,
  },

  refundModalBody: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "22px 32px",
  },

  refundModalFooter: {
    padding: "16px 32px 24px",
    borderTop: "1px solid #eef2f7",
    background: "#fff",
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    flexShrink: 0,
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
  const [travelers, setTravelers] = useState([]);
  const [editingTravelerId, setEditingTravelerId] = useState(null);
  const [savingTraveler, setSavingTraveler] = useState(false);
  const emptyTravelerForm = {
    fullName: "",
    relationship: "",
    dateOfBirth: "",
    gender: "",
    guestType: "adult",
    idType: "cccd",
    idNumber: "",
    nationality: "Việt Nam",
    phone: "",
    dietaryNotes: "",
    healthNotes: "",
    isDefault: false,
  };
  const [travelerForm, setTravelerForm] = useState(emptyTravelerForm);

  const [favoritePage, setFavoritePage] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const [refundPage, setRefundPage] = useState(1);
  const [voucherPage, setVoucherPage] = useState(1);
  const [travelerPage, setTravelerPage] = useState(1);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [refundForm, setRefundForm] = useState({
    bookingId: "",
    reason: "",
    refundBankName: "",
    refundAccountNo: "",
    refundAccountName: "",
    refundQrUrl: "",
  });
  const [refundModalBooking, setRefundModalBooking] = useState(null);

  const [profileForm, setProfileForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    identityNumber: "",
    birthDate: "",
    dietaryNotes: "",
    healthNotes: "",
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

  const favoriteTotalPages = Math.max(
    1,
    Math.ceil(favorites.length / FAVORITE_PAGE_SIZE),
  );

  const bookingTotalPages = Math.max(
    1,
    Math.ceil(bookings.length / BOOKING_PAGE_SIZE),
  );

  const refundTotalPages = Math.max(
    1,
    Math.ceil(refunds.length / REFUND_PAGE_SIZE),
  );

  const voucherTotalPages = Math.max(
    1,
    Math.ceil(vouchers.length / VOUCHER_PAGE_SIZE),
  );

  const travelerTotalPages = Math.max(
    1,
    Math.ceil(travelers.length / TRAVELER_PAGE_SIZE),
  );

  const pagedFavorites = useMemo(() => {
    const start = (favoritePage - 1) * FAVORITE_PAGE_SIZE;
    return favorites.slice(start, start + FAVORITE_PAGE_SIZE);
  }, [favorites, favoritePage]);

  const pagedBookings = useMemo(() => {
    const start = (bookingPage - 1) * BOOKING_PAGE_SIZE;
    return bookings.slice(start, start + BOOKING_PAGE_SIZE);
  }, [bookings, bookingPage]);

  const pagedRefunds = useMemo(() => {
    const start = (refundPage - 1) * REFUND_PAGE_SIZE;
    return refunds.slice(start, start + REFUND_PAGE_SIZE);
  }, [refunds, refundPage]);

  const pagedVouchers = useMemo(() => {
    const start = (voucherPage - 1) * VOUCHER_PAGE_SIZE;
    return vouchers.slice(start, start + VOUCHER_PAGE_SIZE);
  }, [vouchers, voucherPage]);

  const pagedTravelers = useMemo(() => {
    const start = (travelerPage - 1) * TRAVELER_PAGE_SIZE;
    return travelers.slice(start, start + TRAVELER_PAGE_SIZE);
  }, [travelers, travelerPage]);

  useEffect(() => {
    if (favoritePage > favoriteTotalPages) setFavoritePage(favoriteTotalPages);
    if (bookingPage > bookingTotalPages) setBookingPage(bookingTotalPages);
    if (refundPage > refundTotalPages) setRefundPage(refundTotalPages);
    if (voucherPage > voucherTotalPages) setVoucherPage(voucherTotalPages);
    if (travelerPage > travelerTotalPages) setTravelerPage(travelerTotalPages);
  }, [
    favoritePage,
    favoriteTotalPages,
    bookingPage,
    bookingTotalPages,
    refundPage,
    refundTotalPages,
    voucherPage,
    voucherTotalPages,
    travelerPage,
    travelerTotalPages,
  ]);

  useEffect(() => {
    if (activeTab === "favorites") setFavoritePage(1);
    if (activeTab === "bookings") setBookingPage(1);
    if (activeTab === "refunds") setRefundPage(1);
    if (activeTab === "vouchers") setVoucherPage(1);
    if (activeTab === "travelers") setTravelerPage(1);
  }, [activeTab]);

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
      dietaryNotes: nextUser.dietaryNotes || "",
      healthNotes: nextUser.healthNotes || "",
    });
    updateStoredUser(nextUser);
  };

  const loadAll = async () => {
    const [me, fav, myBookings, myRefunds, myVouchers, myTravelers] =
      await Promise.all([
        apiFetch("/auth/me"),
        apiFetch("/favorites/me").catch(() => []),
        apiFetch("/bookings/me").catch(() => []),
        apiFetch("/refunds/me").catch(() => []),
        apiFetch("/vouchers/me").catch(() => []),
        apiFetch("/travel-companions").catch(() => []),
      ]);

    syncUser(me);
    setFavorites(fav || []);
    setBookings(myBookings || []);
    setRefunds(myRefunds || []);
    setVouchers(myVouchers || []);
    setTravelers(myTravelers || []);
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
          dietaryNotes: profileForm.dietaryNotes.trim() || null,
          healthNotes: profileForm.healthNotes.trim() || null,
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

  const emptyRefundForm = (bookingId = "") => ({
    bookingId,
    reason: "",
    refundBankName: "",
    refundAccountNo: "",
    refundAccountName: "",
    refundQrUrl: "",
  });

  const openRefundModal = (booking) => {
    setRefundModalBooking(booking);
    setRefundForm(emptyRefundForm(String(booking.id)));
  };

  const closeRefundModal = () => {
    setRefundModalBooking(null);
    setRefundForm(emptyRefundForm());
  };

  const submitRefund = async (event) => {
    event.preventDefault();

    if (!refundForm.bookingId || !refundForm.reason.trim()) {
      return showToast(
        "Vui lòng chọn booking và nhập lý do hoàn tiền.",
        "error",
      );
    }

    if (
      !refundForm.refundBankName.trim() ||
      !refundForm.refundAccountNo.trim() ||
      !refundForm.refundAccountName.trim()
    ) {
      return showToast(
        "Vui lòng nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản nhận hoàn tiền.",
        "error",
      );
    }

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

  const resetTravelerForm = () => {
    setEditingTravelerId(null);
    setTravelerForm(emptyTravelerForm);
  };

  const editTraveler = (traveler) => {
    setEditingTravelerId(traveler.id);
    setTravelerForm({
      fullName: traveler.fullName || "",
      relationship: traveler.relationship || "",
      dateOfBirth: traveler.dateOfBirth || "",
      gender: traveler.gender || "",
      guestType: traveler.guestType || "adult",
      idType: traveler.idType || "cccd",
      idNumber: traveler.idNumber || "",
      nationality: traveler.nationality || "Việt Nam",
      phone: traveler.phone || "",
      dietaryNotes: traveler.dietaryNotes || "",
      healthNotes: traveler.healthNotes || "",
      isDefault: Boolean(traveler.isDefault),
    });
    setActiveTab("travelers");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveTraveler = async (event) => {
    event.preventDefault();
    if (!travelerForm.fullName.trim()) {
      return showToast("Vui lòng nhập họ tên hành khách.", "error");
    }
    setSavingTraveler(true);
    try {
      await apiFetch(
        editingTravelerId
          ? `/travel-companions/${editingTravelerId}`
          : "/travel-companions",
        {
          method: editingTravelerId ? "PATCH" : "POST",
          body: JSON.stringify(travelerForm),
        },
      );
      const nextTravelers = await apiFetch("/travel-companions");
      setTravelers(nextTravelers || []);
      resetTravelerForm();
      showToast(
        editingTravelerId
          ? "Đã cập nhật hành khách thường dùng."
          : "Đã lưu hành khách thường dùng.",
        "success",
      );
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSavingTraveler(false);
    }
  };

  const removeTraveler = async (traveler) => {
    if (
      !window.confirm(`Xóa ${traveler.fullName} khỏi danh sách thường dùng?`)
    ) {
      return;
    }
    try {
      await apiFetch(`/travel-companions/${traveler.id}`, { method: "DELETE" });
      setTravelers((items) =>
        items.filter((item) => String(item.id) !== String(traveler.id)),
      );
      if (String(editingTravelerId) === String(traveler.id)) {
        resetTravelerForm();
      }
      showToast("Đã xóa hành khách thường dùng.", "success");
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
    <section
      style={{
        backgroundColor: "#f8fafc",
        minHeight: "100vh",
        padding: "40px 0",
      }}
    >
      <div style={styles.container}>
        <aside>
          <div
            style={{
              ...styles.card,
              textAlign: "center",
              position: "sticky",
              top: "100px",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "120px",
                height: "120px",
                margin: "0 auto 16px",
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={user.fullName}
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "4px solid #fff",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    background: "#e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "40px",
                    fontWeight: "bold",
                    color: "#64748b",
                  }}
                >
                  {user.fullName?.charAt(0)?.toUpperCase() || "U"}
                </div>
              )}

              <label
                style={{
                  position: "absolute",
                  bottom: 4,
                  right: 4,
                  background: "#2563eb",
                  color: "#fff",
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(37,99,235,0.4)",
                }}
                title="Thay đổi ảnh đại diện"
              >
                {uploadingAvatar ? <Loading size={16} /> : <Camera size={18} />}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={uploadAvatar}
                  disabled={uploadingAvatar}
                />
              </label>
            </div>

            <h2
              style={{
                fontSize: "20px",
                fontWeight: 700,
                margin: "0 0 4px",
                color: "#0f172a",
              }}
            >
              {user.fullName}
            </h2>

            <p
              style={{
                margin: "0 0 16px",
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              {user.email}
            </p>

            <div style={{ marginBottom: "24px" }}>
              <StatusPill tone="info">
                Hạng {tierLabel[user.memberTier] || user.memberTier} •{" "}
                {user.memberPoints || 0} điểm
              </StatusPill>
            </div>

            <nav
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;

                return (
                  <button
                    key={tab.key}
                    style={styles.menuButton(activeTab === tab.key)}
                    onClick={() => setActiveTab(tab.key)}
                    onMouseEnter={(e) => {
                      if (activeTab !== tab.key) {
                        e.currentTarget.style.background = "#f1f5f9";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeTab !== tab.key) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <Icon size={20} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <main style={{ minWidth: 0 }}>
          {activeTab === "info" && (
            <div style={styles.card}>
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  marginBottom: "24px",
                  color: "#0f172a",
                }}
              >
                Thông tin cá nhân
              </h2>

              <form
                onSubmit={saveProfile}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "24px",
                }}
              >
                <div>
                  <label style={styles.label}>Họ và tên</label>
                  <input
                    style={styles.input}
                    value={profileForm.fullName}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        fullName: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label style={styles.label}>Email (Chỉ xem)</label>
                  <input
                    style={{
                      ...styles.input,
                      background: "#f8fafc",
                      color: "#94a3b8",
                    }}
                    value={profileForm.email}
                    readOnly
                  />
                </div>

                <div>
                  <label style={styles.label}>Số điện thoại *</label>
                  <input
                    style={styles.input}
                    value={profileForm.phone}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, phone: e.target.value }))
                    }
                    placeholder="Ví dụ: 09xxxxxxxx"
                  />
                </div>

                <div>
                  <label style={styles.label}>Căn cước công dân *</label>
                  <input
                    style={styles.input}
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

                <div>
                  <label style={styles.label}>Ngày sinh (Không bắt buộc)</label>
                  <input
                    type="date"
                    style={styles.input}
                    value={profileForm.birthDate}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        birthDate: e.target.value,
                      }))
                    }
                  />
                </div>

                <div
                  style={{
                    gridColumn: "1 / -1",
                    marginTop: "4px",
                    padding: "20px",
                    borderRadius: "16px",
                    background: "#f8fbff",
                    border: "1px solid #dbeafe",
                  }}
                >
                  <div style={{ marginBottom: "16px" }}>
                    <h3
                      style={{
                        margin: "0 0 6px",
                        color: "#0f172a",
                        fontSize: "18px",
                        fontWeight: 800,
                      }}
                    >
                      Thông tin hỗ trợ trong chuyến đi
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        color: "#64748b",
                        fontSize: "14px",
                        lineHeight: 1.6,
                      }}
                    >
                      Các ghi chú này giúp Travela và hướng dẫn viên chuẩn bị
                      dịch vụ phù hợp hơn cho bạn. Đây là thông tin không bắt
                      buộc.
                    </p>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "18px",
                    }}
                  >
                    <div>
                      <label style={styles.label}>Ghi chú ăn uống</label>
                      <textarea
                        style={{
                          ...styles.input,
                          minHeight: "100px",
                          resize: "vertical",
                          lineHeight: 1.55,
                        }}
                        value={profileForm.dietaryNotes}
                        onChange={(e) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            dietaryNotes: e.target.value,
                          }))
                        }
                        placeholder="Ví dụ: ăn chay, dị ứng hải sản, không dùng sữa..."
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Ghi chú sức khỏe</label>
                      <textarea
                        style={{
                          ...styles.input,
                          minHeight: "100px",
                          resize: "vertical",
                          lineHeight: 1.55,
                        }}
                        value={profileForm.healthNotes}
                        onChange={(e) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            healthNotes: e.target.value,
                          }))
                        }
                        placeholder="Ví dụ: say xe, cao huyết áp, cần hỗ trợ di chuyển..."
                      />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    gridColumn: "1 / -1",
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: "12px",
                  }}
                >
                  <button
                    className="btn btn-primary"
                    style={{
                      padding: "12px 32px",
                      borderRadius: "10px",
                      fontWeight: 600,
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                    }}
                    disabled={savingProfile}
                  >
                    {savingProfile ? "Đang lưu..." : "Lưu thay đổi"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === "favorites" && (
            <div style={styles.card}>
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  marginBottom: "24px",
                  color: "#0f172a",
                }}
              >
                Tour yêu thích
              </h2>

              {!favorites.length ? (
                <div style={styles.emptyState}>
                  <Heart
                    size={48}
                    color="#cbd5e1"
                    style={{ margin: "0 auto 16px" }}
                  />
                  <p>Bạn chưa lưu tour yêu thích nào.</p>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: "20px",
                    }}
                  >
                    {pagedFavorites.map((item) => {
                      const tour = item.tour || item;
                      const tourId = tour.id || item.tourId;

                      return (
                        <div
                          key={String(item.id || tourId)}
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: "16px",
                            padding: "20px",
                            display: "flex",
                            flexDirection: "column",
                          }}
                        >
                          <h3
                            style={{
                              fontSize: "16px",
                              fontWeight: 700,
                              margin: "0 0 8px",
                              color: "#0f172a",
                              lineHeight: 1.4,
                            }}
                          >
                            {tour.name}
                          </h3>

                          <p
                            style={{
                              color: "#64748b",
                              fontSize: "14px",
                              flexGrow: 1,
                              margin: "0 0 20px",
                            }}
                          >
                            {tour.shortDescription || "Tour đã lưu để xem lại."}
                          </p>

                          <div style={{ display: "flex", gap: "12px" }}>
                            <Link
                              href={`/tour/${tour.slug || tourId}`}
                              style={{
                                flex: 1,
                                textAlign: "center",
                                background: "#f1f5f9",
                                color: "#0f172a",
                                padding: "10px",
                                borderRadius: "8px",
                                textDecoration: "none",
                                fontWeight: 600,
                                fontSize: "14px",
                              }}
                            >
                              Xem chi tiết
                            </Link>

                            <button
                              onClick={() => removeFavorite(tourId)}
                              style={{
                                padding: "10px",
                                background: "#fee2e2",
                                color: "#ef4444",
                                border: "none",
                                borderRadius: "8px",
                                cursor: "pointer",
                              }}
                              title="Bỏ yêu thích"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <PaginationBar
                    page={favoritePage}
                    totalPages={favoriteTotalPages}
                    onPageChange={setFavoritePage}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === "bookings" && (
            <div style={styles.card}>
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  marginBottom: "24px",
                  color: "#0f172a",
                }}
              >
                Lịch sử đặt tour
              </h2>

              {!bookings.length ? (
                <div style={styles.emptyState}>
                  <ShoppingBag
                    size={48}
                    color="#cbd5e1"
                    style={{ margin: "0 auto 16px" }}
                  />
                  <p>Bạn chưa có booking nào.</p>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      overflowX: "auto",
                      overflowY: "hidden",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th
                            style={{
                              ...styles.th,
                              borderTopLeftRadius: "12px",
                            }}
                          >
                            Mã đơn
                          </th>
                          <th style={styles.th}>Tour</th>
                          <th style={styles.th}>Ngày đi</th>
                          <th style={styles.th}>Số khách</th>
                          <th style={styles.th}>Tổng tiền</th>
                          <th style={styles.th}>Trạng thái</th>
                          <th
                            style={{
                              ...styles.th,
                              borderTopRightRadius: "12px",
                            }}
                          >
                            Thao tác
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {pagedBookings.map((b) => (
                          <tr key={String(b.id)}>
                            <td style={{ ...styles.td, fontWeight: 600 }}>
                              {b.bookingCode}
                            </td>

                            <td style={{ ...styles.td, maxWidth: "220px" }}>
                              <div
                                style={{
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                                title={b.tour?.name}
                              >
                                {b.tour?.name}
                              </div>
                            </td>

                            <td style={styles.td}>
                              {formatDate(b.departure?.departureDate)}
                            </td>

                            <td style={styles.td}>
                              {Number(b.adultCount || 0) +
                                Number(b.childCount || 0)}
                            </td>

                            <td
                              style={{
                                ...styles.td,
                                fontWeight: 600,
                                color: "#0f172a",
                              }}
                            >
                              {formatCurrency(b.finalAmount)}
                            </td>

                            <td style={styles.td}>
                              <StatusPill tone={bookingTone(b.bookingStatus)}>
                                {b.bookingStatus}
                              </StatusPill>
                            </td>

                            <td style={styles.td}>
                              {b.refundRequests?.[0] ? (
                                <StatusPill
                                  tone={
                                    b.refundRequests[0].status === "approved"
                                      ? "success"
                                      : b.refundRequests[0].status ===
                                          "rejected"
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
                                  onClick={() => openRefundModal(b)}
                                  style={{
                                    padding: "8px 12px",
                                    background: "#fff",
                                    border: "1px solid #cbd5e1",
                                    borderRadius: "8px",
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    color: "#334155",
                                    cursor: "pointer",
                                  }}
                                >
                                  Yêu cầu hoàn
                                </button>
                              ) : (
                                <span style={{ color: "#94a3b8" }}>--</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <PaginationBar
                    page={bookingPage}
                    totalPages={bookingTotalPages}
                    onPageChange={setBookingPage}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === "refunds" && (
            <div style={styles.card}>
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  marginBottom: "24px",
                  color: "#0f172a",
                }}
              >
                Lịch sử hoàn tiền
              </h2>

              {!refunds.length ? (
                <div style={styles.emptyState}>
                  <RotateCcw
                    size={48}
                    color="#cbd5e1"
                    style={{ margin: "0 auto 16px" }}
                  />
                  <p>Chưa có yêu cầu hoàn tiền nào được gửi.</p>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      overflowX: "auto",
                      overflowY: "hidden",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <table
                      style={{
                        ...styles.table,
                        width: "max-content",
                        minWidth: "1080px",
                        tableLayout: "auto",
                        marginTop: 0,
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              ...styles.th,
                              minWidth: "140px",
                              borderTopLeftRadius: "12px",
                            }}
                          >
                            Booking
                          </th>
                          <th style={{ ...styles.th, minWidth: "260px" }}>
                            Tour
                          </th>
                          <th style={{ ...styles.th, minWidth: "200px" }}>
                            Lý do
                          </th>
                          <th style={{ ...styles.th, minWidth: "130px" }}>
                            Trạng thái
                          </th>
                          <th style={{ ...styles.th, minWidth: "260px" }}>
                            Phản hồi Admin
                          </th>
                          <th
                            style={{
                              ...styles.th,
                              minWidth: "150px",
                              borderTopRightRadius: "12px",
                            }}
                          >
                            Ngày gửi
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {pagedRefunds.map((r) => (
                          <tr key={String(r.id)}>
                            <td style={{ ...styles.td, fontWeight: 600 }}>
                              {r.booking?.bookingCode || "--"}
                            </td>

                            <td style={styles.td}>
                              <div
                                style={{
                                  fontWeight: 700,
                                  color: "#0f172a",
                                  lineHeight: 1.45,
                                  whiteSpace: "normal",
                                  wordBreak: "break-word",
                                }}
                                title={r.booking?.tour?.name}
                              >
                                {r.booking?.tour?.name || "--"}
                              </div>
                            </td>

                            <td
                              style={{
                                ...styles.td,
                                color: "#64748b",
                              }}
                            >
                              <div
                                style={{
                                  lineHeight: 1.5,
                                  whiteSpace: "normal",
                                  wordBreak: "break-word",
                                }}
                                title={r.reason}
                              >
                                {r.reason || "--"}
                              </div>
                            </td>

                            <td style={styles.td}>
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

                            <td
                              style={{
                                ...styles.td,
                                color: r.adminNote ? "#334155" : "#94a3b8",
                                fontStyle: r.adminNote ? "normal" : "italic",
                              }}
                            >
                              <div
                                style={{
                                  lineHeight: 1.55,
                                  whiteSpace: "normal",
                                  wordBreak: "break-word",
                                  background: r.adminNote
                                    ? "#f8fafc"
                                    : "transparent",
                                  border: r.adminNote
                                    ? "1px solid #e2e8f0"
                                    : "none",
                                  borderRadius: "12px",
                                  padding: r.adminNote ? "12px 14px" : 0,
                                }}
                              >
                                {r.adminNote || "Đang chờ xử lý"}
                              </div>
                            </td>

                            <td style={styles.td}>
                              {formatDateTime(r.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <PaginationBar
                    page={refundPage}
                    totalPages={refundTotalPages}
                    onPageChange={setRefundPage}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === "vouchers" && (
            <div style={styles.card}>
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  marginBottom: "24px",
                  color: "#0f172a",
                }}
              >
                Voucher của tôi
              </h2>

              {!vouchers.length ? (
                <div style={styles.emptyState}>
                  <Ticket
                    size={48}
                    color="#cbd5e1"
                    style={{ margin: "0 auto 16px" }}
                  />
                  <p>
                    Bạn chưa có voucher nào. Hãy tích cực đặt tour để nhận thêm
                    ưu đãi nhé!
                  </p>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: "20px",
                    }}
                  >
                    {pagedVouchers.map((uv) => (
                      <div
                        key={String(uv.id)}
                        style={{
                          border: "1px dashed #cbd5e1",
                          borderRadius: "16px",
                          padding: "20px",
                          position: "relative",
                          background: "#f8fafc",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: -8,
                            right: 20,
                            background: "#2563eb",
                            color: "#fff",
                            padding: "4px 12px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: 700,
                            letterSpacing: "1px",
                          }}
                        >
                          {uv.voucher?.code}
                        </div>

                        <h3
                          style={{
                            fontSize: "16px",
                            fontWeight: 700,
                            margin: "12px 0 8px",
                            color: "#0f172a",
                          }}
                        >
                          {uv.voucher?.name}
                        </h3>

                        <p
                          style={{
                            color: "#64748b",
                            fontSize: "14px",
                            margin: "0 0 16px",
                          }}
                        >
                          {uv.voucher?.description}
                        </p>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            borderTop: "1px dashed #cbd5e1",
                            paddingTop: "16px",
                          }}
                        >
                          <div>
                            <p
                              style={{
                                margin: "0 0 4px",
                                fontSize: "13px",
                                color: "#64748b",
                              }}
                            >
                              Mức giảm
                            </p>

                            <strong
                              style={{ fontSize: "18px", color: "#ef4444" }}
                            >
                              {uv.voucher?.discountType === "percent"
                                ? `${uv.voucher?.discountValue}%`
                                : formatCurrency(uv.voucher?.discountValue)}
                            </strong>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <p
                              style={{
                                margin: "0 0 4px",
                                fontSize: "13px",
                                color: "#64748b",
                              }}
                            >
                              Hạn sử dụng
                            </p>

                            <strong
                              style={{ fontSize: "14px", color: "#0f172a" }}
                            >
                              {formatDate(uv.voucher?.endDate)}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <PaginationBar
                    page={voucherPage}
                    totalPages={voucherTotalPages}
                    onPageChange={setVoucherPage}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === "travelers" && (
            <div style={{ display: "grid", gap: "22px" }}>
              <div style={styles.card}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "18px",
                    marginBottom: "24px",
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: "0 0 6px",
                        color: "#2563eb",
                        fontSize: "12px",
                        fontWeight: 800,
                        letterSpacing: "0.7px",
                        textTransform: "uppercase",
                      }}
                    >
                      Hồ sơ hành khách
                    </p>
                    <h2
                      style={{
                        margin: "0 0 8px",
                        color: "#0f172a",
                        fontSize: "24px",
                        fontWeight: 800,
                      }}
                    >
                      {editingTravelerId
                        ? "Cập nhật hành khách"
                        : "Thêm hành khách thường dùng"}
                    </h2>
                    <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>
                      Lưu thông tin người thân để chọn nhanh khi đặt tour tiếp
                      theo.
                    </p>
                  </div>
                  {editingTravelerId && (
                    <button
                      type="button"
                      onClick={resetTravelerForm}
                      style={{
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        color: "#475569",
                        borderRadius: "10px",
                        padding: "10px 14px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Hủy chỉnh sửa
                    </button>
                  )}
                </div>

                <form
                  onSubmit={saveTraveler}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "18px",
                  }}
                >
                  <div>
                    <label style={styles.label}>Họ và tên *</label>
                    <input
                      style={styles.input}
                      value={travelerForm.fullName}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          fullName: e.target.value,
                        }))
                      }
                      placeholder="Nguyễn Văn A"
                      required
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Mối quan hệ</label>
                    <input
                      style={styles.input}
                      value={travelerForm.relationship}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          relationship: e.target.value,
                        }))
                      }
                      placeholder="Cha, mẹ, vợ/chồng, con..."
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Ngày sinh</label>
                    <input
                      type="date"
                      style={styles.input}
                      value={travelerForm.dateOfBirth}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          dateOfBirth: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Giới tính</label>
                    <select
                      style={styles.input}
                      value={travelerForm.gender}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          gender: e.target.value,
                        }))
                      }
                    >
                      <option value="">Chưa chọn</option>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                      <option value="other">Khác</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Loại hành khách</label>
                    <select
                      style={styles.input}
                      value={travelerForm.guestType}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          guestType: e.target.value,
                        }))
                      }
                    >
                      <option value="adult">Người lớn</option>
                      <option value="child">Trẻ em</option>
                      <option value="infant">Em bé</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Quốc tịch</label>
                    <input
                      style={styles.input}
                      value={travelerForm.nationality}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          nationality: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Loại giấy tờ</label>
                    <select
                      style={styles.input}
                      value={travelerForm.idType}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          idType: e.target.value,
                        }))
                      }
                    >
                      <option value="cccd">CCCD</option>
                      <option value="passport">Hộ chiếu</option>
                      <option value="birth_certificate">Giấy khai sinh</option>
                      <option value="other">Khác</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Số giấy tờ</label>
                    <input
                      style={styles.input}
                      value={travelerForm.idNumber}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          idNumber: e.target.value,
                        }))
                      }
                      placeholder="Số CCCD hoặc hộ chiếu"
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Số điện thoại</label>
                    <input
                      style={styles.input}
                      value={travelerForm.phone}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          phone: e.target.value,
                        }))
                      }
                      placeholder="09xxxxxxxx"
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      paddingBottom: "10px",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        color: "#334155",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={travelerForm.isDefault}
                        onChange={(e) =>
                          setTravelerForm((p) => ({
                            ...p,
                            isDefault: e.target.checked,
                          }))
                        }
                        style={{ width: "18px", height: "18px" }}
                      />
                      Đặt làm hành khách mặc định
                    </label>
                  </div>
                  <div>
                    <label style={styles.label}>Ghi chú ăn uống</label>
                    <textarea
                      style={{
                        ...styles.input,
                        minHeight: "95px",
                        resize: "vertical",
                      }}
                      value={travelerForm.dietaryNotes}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          dietaryNotes: e.target.value,
                        }))
                      }
                      placeholder="Ăn chay, dị ứng thực phẩm..."
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Ghi chú sức khỏe</label>
                    <textarea
                      style={{
                        ...styles.input,
                        minHeight: "95px",
                        resize: "vertical",
                      }}
                      value={travelerForm.healthNotes}
                      onChange={(e) =>
                        setTravelerForm((p) => ({
                          ...p,
                          healthNotes: e.target.value,
                        }))
                      }
                      placeholder="Say xe, bệnh nền, nhu cầu hỗ trợ..."
                    />
                  </div>
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      position: "sticky",
                      bottom: 0,
                      zIndex: 4,
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "12px",
                      padding: "16px 0 4px",
                      marginTop: "2px",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0), #fff 28%)",
                      borderTop: "1px solid #eef2f7",
                    }}
                  >
                    <button
                      type="submit"
                      disabled={savingTraveler}
                      style={{
                        minWidth: "190px",
                        padding: "13px 22px",
                        border: 0,
                        borderRadius: "12px",
                        background: "linear-gradient(135deg, #2563eb, #3b82f6)",
                        color: "#fff",
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        cursor: "pointer",
                        boxShadow: "0 12px 24px rgba(37,99,235,.22)",
                      }}
                    >
                      {editingTravelerId ? (
                        <Save size={18} />
                      ) : (
                        <Plus size={18} />
                      )}
                      {savingTraveler
                        ? "Đang lưu..."
                        : editingTravelerId
                          ? "Lưu thông tin hành khách"
                          : "Lưu hành khách"}
                    </button>
                  </div>
                </form>
              </div>

              <div style={styles.card}>
                <div style={{ marginBottom: "20px" }}>
                  <h2
                    style={{
                      margin: "0 0 7px",
                      fontSize: "22px",
                      color: "#0f172a",
                    }}
                  >
                    Danh sách đã lưu
                  </h2>
                  <p style={{ margin: 0, color: "#64748b" }}>
                    {travelers.length} hành khách thường dùng trong tài khoản.
                  </p>
                </div>

                {!travelers.length ? (
                  <div style={styles.emptyState}>
                    <UsersRound
                      size={48}
                      color="#cbd5e1"
                      style={{ margin: "0 auto 16px" }}
                    />
                    <p>Bạn chưa lưu hành khách thường dùng nào.</p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(290px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    {pagedTravelers.map((traveler) => (
                      <article
                        key={String(traveler.id)}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "16px",
                          padding: "18px",
                          background: traveler.isDefault ? "#f5f9ff" : "#fff",
                          boxShadow: traveler.isDefault
                            ? "0 10px 24px rgba(37,99,235,.08)"
                            : "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            alignItems: "flex-start",
                          }}
                        >
                          <div
                            style={{
                              width: "46px",
                              height: "46px",
                              borderRadius: "14px",
                              background: "#eaf2ff",
                              color: "#2563eb",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 900,
                              fontSize: "18px",
                            }}
                          >
                            {traveler.fullName?.charAt(0)?.toUpperCase() || "H"}
                          </div>
                          {traveler.isDefault ? (
                            <StatusPill tone="info">Mặc định</StatusPill>
                          ) : null}
                        </div>
                        <h3
                          style={{
                            margin: "14px 0 5px",
                            color: "#0f172a",
                            fontSize: "17px",
                          }}
                        >
                          {traveler.fullName}
                        </h3>
                        <p
                          style={{
                            margin: "0 0 12px",
                            color: "#64748b",
                            fontSize: "13px",
                          }}
                        >
                          {traveler.relationship || "Người đi cùng"} ·{" "}
                          {traveler.guestType === "child"
                            ? "Trẻ em"
                            : traveler.guestType === "infant"
                              ? "Em bé"
                              : "Người lớn"}
                        </p>
                        <div
                          style={{
                            display: "grid",
                            gap: "7px",
                            color: "#475569",
                            fontSize: "13px",
                          }}
                        >
                          <span>
                            Ngày sinh:{" "}
                            {traveler.dateOfBirth
                              ? formatDate(traveler.dateOfBirth)
                              : "--"}
                          </span>
                          <span>Giấy tờ: {traveler.idNumber || "--"}</span>
                          <span>Điện thoại: {traveler.phone || "--"}</span>
                        </div>
                        {(traveler.dietaryNotes || traveler.healthNotes) && (
                          <div
                            style={{
                              marginTop: "13px",
                              padding: "11px 12px",
                              borderRadius: "11px",
                              background: "#f8fafc",
                              color: "#64748b",
                              fontSize: "12px",
                              lineHeight: 1.55,
                            }}
                          >
                            {traveler.dietaryNotes && (
                              <div>Ăn uống: {traveler.dietaryNotes}</div>
                            )}
                            {traveler.healthNotes && (
                              <div>Sức khỏe: {traveler.healthNotes}</div>
                            )}
                          </div>
                        )}
                        <div
                          style={{
                            display: "flex",
                            gap: "9px",
                            marginTop: "16px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => editTraveler(traveler)}
                            style={{
                              flex: 1,
                              padding: "10px",
                              border: "1px solid #bfdbfe",
                              borderRadius: "10px",
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              fontWeight: 750,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "7px",
                              cursor: "pointer",
                            }}
                          >
                            <Pencil size={16} /> Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTraveler(traveler)}
                            style={{
                              padding: "10px 13px",
                              border: "1px solid #fecaca",
                              borderRadius: "10px",
                              background: "#fef2f2",
                              color: "#dc2626",
                              cursor: "pointer",
                            }}
                            title="Xóa hành khách"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                <PaginationBar
                  page={travelerPage}
                  totalPages={travelerTotalPages}
                  onPageChange={setTravelerPage}
                />
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div
              style={{
                ...styles.card,
                padding: 0,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "0.9fr 1.1fr",
                  minHeight: "430px",
                }}
              >
                <div
                  style={{
                    background:
                      "linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)",
                    padding: "36px",
                    color: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        width: "58px",
                        height: "58px",
                        borderRadius: "18px",
                        background: "rgba(255,255,255,0.16)",
                        border: "1px solid rgba(255,255,255,0.22)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: "22px",
                      }}
                    >
                      <Shield size={28} />
                    </div>

                    <h2
                      style={{
                        fontSize: "26px",
                        lineHeight: 1.25,
                        fontWeight: 800,
                        margin: "0 0 12px",
                      }}
                    >
                      Bảo mật tài khoản
                    </h2>

                    <p
                      style={{
                        margin: 0,
                        color: "rgba(255,255,255,0.78)",
                        lineHeight: 1.7,
                        fontSize: "15px",
                      }}
                    >
                      Cập nhật mật khẩu định kỳ giúp bảo vệ thông tin cá nhân,
                      lịch sử đặt tour và các voucher ưu đãi của bạn.
                    </p>
                  </div>

                  <div
                    style={{
                      marginTop: "28px",
                      display: "grid",
                      gap: "12px",
                    }}
                  >
                    {[
                      "Không chia sẻ mật khẩu cho người khác",
                      "Sử dụng mật khẩu tối thiểu 6 ký tự",
                      "Đăng xuất sau khi dùng máy tính công cộng",
                    ].map((text) => (
                      <div
                        key={text}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          color: "rgba(255,255,255,0.9)",
                          fontSize: "14px",
                        }}
                      >
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: "#86efac",
                            flexShrink: 0,
                          }}
                        />
                        {text}
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    padding: "36px",
                    background: "#fff",
                  }}
                >
                  <div style={{ marginBottom: "26px" }}>
                    <p
                      style={{
                        margin: "0 0 6px",
                        color: "#2563eb",
                        fontWeight: 800,
                        fontSize: "13px",
                        textTransform: "uppercase",
                        letterSpacing: "0.7px",
                      }}
                    >
                      Đổi mật khẩu
                    </p>

                    <h3
                      style={{
                        margin: 0,
                        color: "#0f172a",
                        fontSize: "22px",
                        fontWeight: 800,
                      }}
                    >
                      Thiết lập mật khẩu mới
                    </h3>
                  </div>

                  <form
                    onSubmit={changePassword}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "18px",
                    }}
                  >
                    <div>
                      <label style={styles.label}>Mật khẩu hiện tại</label>
                      <input
                        type="password"
                        style={{
                          ...styles.input,
                          height: "48px",
                          background: "#f8fafc",
                        }}
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          setPasswordForm((p) => ({
                            ...p,
                            currentPassword: e.target.value,
                          }))
                        }
                        placeholder="Nhập mật khẩu hiện tại"
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Mật khẩu mới</label>
                      <input
                        type="password"
                        style={{
                          ...styles.input,
                          height: "48px",
                          background: "#f8fafc",
                        }}
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm((p) => ({
                            ...p,
                            newPassword: e.target.value,
                          }))
                        }
                        placeholder="Nhập mật khẩu mới"
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Xác nhận mật khẩu mới</label>
                      <input
                        type="password"
                        style={{
                          ...styles.input,
                          height: "48px",
                          background: "#f8fafc",
                        }}
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm((p) => ({
                            ...p,
                            confirmPassword: e.target.value,
                          }))
                        }
                        placeholder="Nhập lại mật khẩu mới"
                      />
                    </div>

                    <button
                      className="btn btn-primary"
                      style={{
                        marginTop: "10px",
                        width: "100%",
                        padding: "15px 24px",
                        borderRadius: "14px",
                        fontWeight: 800,
                        background: "linear-gradient(135deg, #f59e0b, #fb923c)",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                        boxShadow: "0 14px 30px rgba(245, 158, 11, 0.25)",
                      }}
                      disabled={savingPassword}
                    >
                      {savingPassword ? "Đang đổi..." : "Cập nhật mật khẩu"}
                    </button>
                  </form>
                </div>
              </div>
              <SessionManager />
            </div>
          )}
        </main>
      </div>

      {refundModalBooking && (
        <div style={styles.refundOverlay} onClick={closeRefundModal}>
          <div
            style={styles.refundModal}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeRefundModal}
              style={{
                position: "absolute",
                top: "18px",
                right: "18px",
                background: "#f1f5f9",
                border: "none",
                width: "38px",
                height: "38px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#64748b",
                zIndex: 2,
              }}
              aria-label="Đóng form hoàn tiền"
            >
              <X size={20} />
            </button>

            <div style={styles.refundModalHeader}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#2563eb",
                  fontWeight: 800,
                  marginBottom: "10px",
                }}
              >
                <Info size={20} />
                <span
                  style={{
                    fontSize: "14px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Yêu cầu hoàn tiền
                </span>
              </div>

              <h2
                style={{
                  fontSize: "26px",
                  lineHeight: 1.25,
                  margin: "0 42px 12px 0",
                  color: "#0f172a",
                  fontWeight: 800,
                }}
              >
                Xác nhận hủy và hoàn tour
              </h2>

              <p
                style={{
                  color: "#64748b",
                  margin: 0,
                  fontSize: "15px",
                  lineHeight: 1.6,
                }}
              >
                Admin sẽ xem xét yêu cầu của bạn. Nếu được duyệt, hệ thống sẽ
                hoàn slot về tour và cập nhật trạng thái hoàn tiền tương ứng với
                chính sách của chúng tôi.
              </p>
            </div>

            <form
              onSubmit={submitRefund}
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                flex: 1,
              }}
            >
              <div style={styles.refundModalBody}>
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "20px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "16px",
                    marginBottom: "22px",
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: "13px",
                        color: "#64748b",
                      }}
                    >
                      Mã đơn
                    </p>
                    <strong style={{ color: "#0f172a" }}>
                      {refundModalBooking.bookingCode}
                    </strong>
                  </div>

                  <div>
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: "13px",
                        color: "#64748b",
                      }}
                    >
                      Ngày đi
                    </p>
                    <strong style={{ color: "#0f172a" }}>
                      {formatDate(refundModalBooking.departure?.departureDate)}
                    </strong>
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: "13px",
                        color: "#64748b",
                      }}
                    >
                      Tour
                    </p>
                    <strong style={{ color: "#0f172a" }}>
                      {refundModalBooking.tour?.name || "--"}
                    </strong>
                  </div>

                  <div
                    style={{
                      gridColumn: "1 / -1",
                      borderTop: "1px dashed #cbd5e1",
                      paddingTop: "14px",
                      marginTop: "4px",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: "13px",
                        color: "#64748b",
                      }}
                    >
                      Số tiền đã thanh toán
                    </p>
                    <strong style={{ color: "#ef4444", fontSize: "22px" }}>
                      {formatCurrency(refundModalBooking.finalAmount)}
                    </strong>
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={styles.label}>
                    Lý do hoàn tiền / Hủy chuyến{" "}
                    <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <textarea
                    style={{
                      ...styles.input,
                      resize: "vertical",
                      minHeight: "112px",
                      lineHeight: 1.5,
                      marginTop: "8px",
                    }}
                    value={refundForm.reason}
                    onChange={(e) =>
                      setRefundForm((p) => ({ ...p, reason: e.target.value }))
                    }
                    placeholder="Vui lòng cung cấp lý do cụ thể, ví dụ: sức khỏe, công việc đột xuất..."
                    required
                  />
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "20px",
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 10px",
                      fontSize: "18px",
                      color: "#0f172a",
                      fontWeight: 800,
                    }}
                  >
                    Tài khoản nhận hoàn tiền
                  </h3>

                  <p
                    style={{
                      margin: "0 0 18px",
                      color: "#64748b",
                      fontSize: "14px",
                      lineHeight: 1.6,
                    }}
                  >
                    Travela cần thông tin tài khoản ngân hàng để admin đối soát
                    và chuyển khoản hoàn tiền. Mã QR ngân hàng chỉ là tùy chọn.
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <label style={styles.label}>
                        Ngân hàng <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        style={styles.input}
                        value={refundForm.refundBankName}
                        onChange={(e) =>
                          setRefundForm((p) => ({
                            ...p,
                            refundBankName: e.target.value,
                          }))
                        }
                        placeholder="VD: MBBank, Vietcombank..."
                        required
                      />
                    </div>

                    <div>
                      <label style={styles.label}>
                        Số tài khoản <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        style={styles.input}
                        value={refundForm.refundAccountNo}
                        onChange={(e) =>
                          setRefundForm((p) => ({
                            ...p,
                            refundAccountNo: e.target.value,
                          }))
                        }
                        placeholder="Nhập số tài khoản nhận tiền"
                        required
                      />
                    </div>

                    <div>
                      <label style={styles.label}>
                        Tên chủ tài khoản{" "}
                        <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        style={styles.input}
                        value={refundForm.refundAccountName}
                        onChange={(e) =>
                          setRefundForm((p) => ({
                            ...p,
                            refundAccountName: e.target.value,
                          }))
                        }
                        placeholder="VD: NGUYEN VAN A"
                        required
                      />
                    </div>

                    <div>
                      <label style={styles.label}>
                        Link QR ngân hàng nếu có
                      </label>
                      <input
                        style={styles.input}
                        value={refundForm.refundQrUrl}
                        onChange={(e) =>
                          setRefundForm((p) => ({
                            ...p,
                            refundQrUrl: e.target.value,
                          }))
                        }
                        placeholder="Không bắt buộc"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div style={styles.refundModalFooter}>
                <button
                  type="button"
                  onClick={closeRefundModal}
                  style={{
                    minWidth: "120px",
                    padding: "12px 22px",
                    borderRadius: "12px",
                    background: "#f1f5f9",
                    color: "#334155",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Đóng lại
                </button>

                <button
                  type="submit"
                  style={{
                    minWidth: "140px",
                    padding: "12px 22px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #ef4444, #f97316)",
                    color: "#fff",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 12px 26px rgba(239, 68, 68, 0.25)",
                  }}
                >
                  Gửi yêu cầu <ChevronRight size={18} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <style jsx>{`
        @media (max-width: 768px) {
          :global(.refund-responsive-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
