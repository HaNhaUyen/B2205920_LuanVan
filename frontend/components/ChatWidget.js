import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const HIDDEN_PATH_PREFIXES = ["/admin", "/assistant", "/guide"];

function shouldHideGlobalChatbot(path = "") {
  const normalizedPath = String(path || "")
    .split("?")[0]
    .split("#")[0]
    .toLowerCase()
    .trim();

  return HIDDEN_PATH_PREFIXES.some(
    (prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
}

export default function ChatWidget() {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleMessage = (event) => {
      const data = event?.data;

      const isCloseMessage =
        data === "TRAVELA_CHAT_CLOSE" ||
        data === "CLOSE_CHATBOT" ||
        data?.type === "TRAVELA_CHAT_CLOSE" ||
        data?.type === "CLOSE_CHATBOT";

      if (isCloseMessage) {
        setOpen(false);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const currentPath = router.asPath || router.pathname || "";

  const hidden = shouldHideGlobalChatbot(currentPath);

  useEffect(() => {
    // Khi chuyển từ trang khách hàng sang admin/guide,
    // đóng chatbot toàn hệ thống nếu nó đang mở.
    if (hidden) {
      setOpen(false);
    }
  }, [hidden]);

  if (!mounted || hidden) {
    return null;
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="travela-chat-open-button"
          aria-label="Mở Travela AI"
          title="Mở Travela AI"
        >
          ✈
        </button>
      ) : null}

      {open ? (
        <div
          className="travela-chat-frame"
          role="dialog"
          aria-label="Travela AI"
        >
          <iframe
            src="/assistant?embed=1&scope=user"
            title="Travela AI"
            className="travela-chat-iframe"
          />
        </div>
      ) : null}

      <style jsx>{`
        .travela-chat-open-button {
          position: fixed;
          right: 22px;
          bottom: 22px;
          width: 62px;
          height: 62px;
          border: none;
          border-radius: 999px;
          background: #16a34a;
          color: #ffffff;
          box-shadow: 0 18px 45px rgba(22, 163, 74, 0.35);
          cursor: pointer;
          z-index: 9999;

          display: grid;
          place-items: center;

          font-size: 28px;
          font-weight: 900;

          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            background 0.2s ease;
        }

        .travela-chat-open-button:hover {
          transform: translateY(-2px);
          background: #15803d;
          box-shadow: 0 22px 52px rgba(22, 163, 74, 0.42);
        }

        .travela-chat-open-button:focus-visible {
          outline: 3px solid rgba(34, 197, 94, 0.35);
          outline-offset: 4px;
        }

        .travela-chat-frame {
          position: fixed;
          right: 18px;
          bottom: 18px;

          width: 460px;
          height: 680px;

          max-width: calc(100vw - 24px);
          max-height: calc(100vh - 24px);

          border: 1px solid #dbe3ef;
          border-radius: 22px;
          overflow: hidden;

          background: #ffffff;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);

          z-index: 9999;
        }

        .travela-chat-iframe {
          width: 100%;
          height: 100%;
          border: none;
          display: block;
          background: #ffffff;
        }

        @media (max-width: 520px) {
          .travela-chat-frame {
            right: 8px;
            bottom: 8px;

            width: calc(100vw - 16px);
            height: calc(100vh - 16px);

            border-radius: 18px;
          }

          .travela-chat-open-button {
            right: 18px;
            bottom: 18px;
          }
        }
      `}</style>
    </>
  );
}
