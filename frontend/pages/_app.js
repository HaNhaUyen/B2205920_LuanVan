import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import "@/styles/globals.css";
import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/ToastContext";
import ChatWidget from "@/components/ChatWidget";
import RealtimeRefreshProvider from "@/components/realtime/RealtimeRefreshProvider";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/storage";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isAssistantEmbed =
    router.pathname === "/assistant" && pageProps?.embed === true;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const checkSession = async () => {
      if (!getToken()) return;

      try {
        await apiFetch("/auth/me", { cache: "no-store" });
      } catch {
        // apiFetch tự xóa session và chuyển về /login khi backend trả 401.
        // Lỗi mạng thông thường không làm người dùng bị đăng xuất.
      }
    };

    const intervalId = window.setInterval(checkSession, 5000);
    window.addEventListener("focus", checkSession);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkSession);
    };
  }, []);

  const pageContent = isAssistantEmbed ? (
    <Component {...pageProps} />
  ) : (
    <AppShell>
      <Component {...pageProps} />
    </AppShell>
  );

  return (
    <ToastProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Travela</title>
      </Head>
      <RealtimeRefreshProvider>{pageContent}</RealtimeRefreshProvider>
      {!isAssistantEmbed ? <ChatWidget /> : null}
    </ToastProvider>
  );
}
