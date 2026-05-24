import Link from "next/link";
import { useEffect, useState } from "react";
import Loading from "@/components/Loading";
import { API_URL } from "@/lib/config";
import { clearSession, getUser } from "@/lib/storage";
import { mapImageUrl } from "@/lib/tour";
import AdminChatbotWidget from "@/components/admin/AdminChatbotWidget";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/tours", label: "Tours" },
  { href: "/admin/destinations", label: "Điểm đến" },
  { href: "/admin/bookings", label: "Booking" },
  { href: "/admin/reviews", label: "Đánh giá" },
  { href: "/admin/contacts", label: "Liên hệ" },
  { href: "/admin/notifications", label: "Thông báo" },
  { href: "/admin/users", label: "Người dùng" },
  { href: "/admin/refunds", label: "Hoàn tiền" },
  { href: "/admin/vouchers", label: "Voucher" },
  { href: "/admin/guides", label: "Hướng dẫn viên" },
  { href: "/admin/profile", label: "Hồ sơ cá nhân" },
];

export default function AdminLayout({
  current = "/admin",
  title,
  subtitle,
  children,
}) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const currentUser = getUser();
    if (!currentUser || currentUser.role !== "admin") {
      window.location.href = "/login";
      return;
    }
    setUser(currentUser);
    setLoading(false);
  }, []);

  if (loading) return <Loading text="Đang tải khu quản trị..." />;
  if (!user) return null;

  const avatarUrl = user.avatarUrl ? mapImageUrl(user.avatarUrl, API_URL) : "";

  return (
    <div className="admin-layout-wrapper">
      <aside className={`admin-sidebar ${isSidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-brand">
          <div className="brand-logo">T</div>
          {isSidebarOpen && (
            <div className="brand-text">
              <strong>Travela Admin</strong>
              <span>Hệ thống quản lý</span>
            </div>
          )}
        </div>

        <nav className="sidebar-menu">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`menu-item ${current === item.href ? "active" : ""}`}
            >
              <span className="menu-text">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="logout-btn"
            onClick={() => {
              clearSession();
              window.location.href = "/";
            }}
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="admin-main-content">
        <header className="admin-header">
          <div className="header-left">
            <button
              className="toggle-sidebar-btn"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title="Đóng/Mở Menu"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="header-title-box">
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>

          <div className="header-right">
            <div className="user-profile">
              <div className="user-info">
                <strong>{user.fullName}</strong>
                <span>{user.email}</span>
              </div>
              <div className="user-avatar">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={user.fullName} />
                ) : (
                  <span>
                    {user.fullName?.trim()?.charAt(0)?.toUpperCase() || "A"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="admin-page-content">{children}</div>
      </main>

      <AdminChatbotWidget user={user} />
    </div>
  );
}
