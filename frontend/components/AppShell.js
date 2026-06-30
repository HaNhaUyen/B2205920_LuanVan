import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/api";
import { clearSession, getUser } from "@/lib/storage";
import { mapImageUrl } from "@/lib/tour";
import { useToast } from "./ToastContext";
import NotificationBell from "./NotificationBell";

function isActive(currentPath, href) {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export default function AppShell({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const { showToast } = useToast();

  const currentPath = router.asPath?.split("?")[0] || router.pathname || "/";
  const isAssistantEmbed =
    currentPath === "/assistant" && router.query?.embed === "1";

  useEffect(() => {
    const savedTheme =
      typeof window !== "undefined"
        ? localStorage.getItem("travela-theme")
        : "light";

    const enabled = savedTheme === "dark";
    setDarkMode(enabled);

    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark-mode", enabled);
    }
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);

    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark-mode", next);
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("travela-theme", next ? "dark" : "light");
    }
  };

  useEffect(() => {
    const sync = () => {
      setUser(getUser());
    };

    sync();

    // Mỗi lần tải lại trang, lấy lại /auth/me để tên/avatar sau khi cập nhật hồ sơ không bị quay về dữ liệu cũ trong localStorage.
    if (getUser()) {
      apiFetch("/auth/me")
        .then((payload) => {
          const freshUser = payload?.user || payload;
          if (freshUser && typeof window !== "undefined") {
            localStorage.setItem("tourai_user", JSON.stringify(freshUser));
            setUser(freshUser);
          }
        })
        .catch(() => null);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("tourai-session-changed", sync);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("tourai-session-changed", sync);
      }
    };
  }, []);

  const logout = () => {
    clearSession();
    showToast("Đã đăng xuất thành công", "success");

    setTimeout(() => {
      window.location.href = "/";
    }, 300);
  };

  const navItems = [
    { href: "/", label: "Trang Chủ" },
    { href: "/about", label: "Giới Thiệu" },
    { href: "/destinations", label: "Điểm Đến" },
    { href: "/tours", label: "Tour" },
    { href: "/contact", label: "Liên Hệ" },
    ...(user
      ? [
          { href: "/mytour", label: "Tour Của Tôi" },
          ...(user.role === "admin"
            ? [{ href: "/admin", label: "Quản Trị" }]
            : []),
          ...(user.role === "guide"
            ? [{ href: "/guide", label: "Lịch HDV" }]
            : []),
        ]
      : []),
  ];

  // Không render header/footer website trong admin và popup chatbot iframe.
  if (
    currentPath.startsWith("/admin") ||
    currentPath.startsWith("/guide") ||
    isAssistantEmbed
  ) {
    return <>{children}</>;
  }

  const avatarUrl = user?.avatarUrl ? mapImageUrl(user.avatarUrl, API_URL) : "";

  return (
    <div
      className="site-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
      }}
    >
      <header
        className="site-header travel-header app-header"
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #f1f5f9",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          className="container nav-shell nav-shell-travel"
          style={{
            display: "flex",
            alignItems: "center",
            minHeight: "80px",
            gap: "24px",
          }}
        >
          <Link
            className="brand brand-travel app-brand"
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #ff9f1a, #ffb547)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
              </svg>
            </div>

            <strong
              style={{
                fontSize: "1.2rem",
                color: "#1f2937",
                letterSpacing: "-0.5px",
              }}
            >
              Travela
            </strong>
          </Link>

          <nav
            className="main-nav app-main-nav"
            style={{
              display: "flex",
              gap: "4px",
              flexGrow: 1,
              justifyContent: "center",
              overflowX: "auto",
              padding: "10px 0",
            }}
          >
            {navItems.map((item) => {
              const active = isActive(currentPath, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`app-nav-link${active ? " active" : ""}`}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "999px",
                    color: active ? "#064e3b" : "#475569",
                    background: active
                      ? "linear-gradient(135deg, #ecfdf5, #dcfce7)"
                      : "transparent",
                    fontWeight: active ? 900 : 700,
                    textDecoration: "none",
                    fontSize: "0.96rem",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s ease",
                    border: active
                      ? "1px solid rgba(134, 239, 172, 0.9)"
                      : "1px solid transparent",
                    boxShadow: active
                      ? "0 10px 24px rgba(34, 197, 94, 0.14)"
                      : "none",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="theme-toggle-btn"
            aria-label="Bật/tắt chế độ tối"
            title={
              darkMode ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"
            }
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

          <div
            className="nav-auth"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexShrink: 0,
            }}
          >
            {user ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <NotificationBell user={user} />

                <Link
                  href="/profile"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "10px",
                    textDecoration: "none",
                    color: "#334155",
                    fontWeight: 600,
                  }}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={user.fullName || "Avatar"}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "2px solid #e2e8f0",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #cbd5e1, #94a3b8)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                      }}
                    >
                      {user.fullName?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                  )}

                  <span
                    style={{
                      fontSize: "0.88rem",
                      maxWidth: 140,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {user.fullName}
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={logout}
                  style={{
                    background: "#f1f5f9",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "999px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "#475569",
                    cursor: "pointer",
                  }}
                >
                  Đăng xuất
                </button>
              </div>
            ) : (
              <Link
                className="btn btn-primary"
                href="/login"
                style={{
                  padding: "8px 20px",
                  borderRadius: "999px",
                  fontSize: "0.9rem",
                  background: "linear-gradient(135deg, #72b44b, #5a9d34)",
                  border: "none",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </header>

      <main style={{ flex: 1 }}>{children}</main>

      <footer
        className="site-footer site-footer-travel app-footer"
        style={{
          background: "#fff",
          borderTop: "1px solid #f1f5f9",
          paddingTop: "40px",
          paddingBottom: "30px",
          marginTop: "60px",
        }}
      >
        <div className="container">
          <div
            className="footer-grid footer-grid-travel"
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              gap: "40px",
              paddingBottom: "30px",
            }}
          >
            <div>
              <strong
                style={{
                  fontSize: "1.2rem",
                  color: "#1f2937",
                  display: "block",
                  marginBottom: "12px",
                }}
              >
                Travela
              </strong>

              <p
                style={{
                  color: "#64748b",
                  fontSize: "0.9rem",
                  lineHeight: 1.6,
                }}
              >
                Nền tảng đặt tour thông minh tích hợp trợ lý ảo AI, giúp bạn tìm
                kiếm hành trình du lịch phù hợp nhất.
              </p>
            </div>

            <div>
              <h4 style={{ fontSize: "1rem", marginBottom: "15px" }}>
                Khám phá
              </h4>

              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  fontSize: "0.9rem",
                  color: "#64748b",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <li>
                  <Link href="/destinations">Điểm đến</Link>
                </li>
                <li>
                  <Link href="/tours">Danh sách Tour</Link>
                </li>
                <li>
                  <Link href="/assistant">Trợ lý AI</Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 style={{ fontSize: "1rem", marginBottom: "15px" }}>
                Tài khoản
              </h4>

              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  fontSize: "0.9rem",
                  color: "#64748b",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <li>
                  <Link href="/profile">Hồ sơ cá nhân</Link>
                </li>
                <li>
                  <Link href="/mytour">Tour của tôi</Link>
                </li>
                <li>
                  <Link href="/contact">Liên hệ hỗ trợ</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
