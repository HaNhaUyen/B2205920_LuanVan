import Head from "next/head";
import { useRouter } from "next/router";
import "@/styles/globals.css";
import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/ToastContext";
import ChatWidget from "@/components/ChatWidget";
import RealtimeRefreshProvider from "@/components/realtime/RealtimeRefreshProvider";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isAssistantEmbed =
    router.pathname === "/assistant" && pageProps?.embed === true;

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
