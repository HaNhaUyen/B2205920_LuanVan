import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function ChatWidget() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleMessage(event) {
      const data = event?.data;

      if (
        data === "TRAVELA_CHAT_CLOSE" ||
        data === "CLOSE_CHATBOT" ||
        data?.type === "TRAVELA_CHAT_CLOSE" ||
        data?.type === "CLOSE_CHATBOT"
      ) {
        setOpen(false);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!mounted) return null;

  const currentPath = router.asPath || router.pathname || "";

  // Không hiện chatbot user trong admin
  if (currentPath.startsWith("/admin")) {
    return null;
  }

  // Quan trọng: không render ChatWidget bên trong chính trang assistant iframe
  // Nếu không sẽ bị iframe lồng iframe khi bấm icon máy bay.
  if (currentPath.startsWith("/assistant")) {
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
        <div className="travela-chat-frame">
          <iframe
            src="/assistant?embed=1"
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
          border-radius: 999px;
          border: none;
          background: #16a34a;
          color: #ffffff;
          box-shadow: 0 18px 45px rgba(22, 163, 74, 0.35);
          cursor: pointer;
          z-index: 9999;
          display: grid;
          place-items: center;
          font-size: 28px;
          font-weight: 900;
        }

        .travela-chat-frame {
          position: fixed;
          right: 18px;
          bottom: 18px;
          width: 460px;
          height: 680px;
          max-width: calc(100vw - 24px);
          max-height: calc(100vh - 24px);
          border-radius: 22px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
          z-index: 9999;
          border: 1px solid #dbe3ef;
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
