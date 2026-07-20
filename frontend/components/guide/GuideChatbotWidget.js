import { useEffect, useState } from "react";

export default function GuideChatbotWidget() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleMessage = (event) => {
      const data = event?.data;

      if (
        data === "TRAVELA_CHAT_CLOSE" ||
        data?.type === "TRAVELA_CHAT_CLOSE"
      ) {
        setOpen(false);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="guide-ai-btn"
          onClick={() => setOpen(true)}
          aria-label="Mở trợ lý hướng dẫn viên"
          title="Mở trợ lý hướng dẫn viên"
        >
          ✦
        </button>
      ) : null}

      {open ? (
        <div
          className="guide-ai-frame"
          role="dialog"
          aria-label="Trợ lý hướng dẫn viên Travela"
        >
          <iframe
            src="/assistant?embed=1&scope=guide"
            title="Trợ lý hướng dẫn viên Travela"
          />
        </div>
      ) : null}

      <style jsx>{`
        .guide-ai-btn {
          position: fixed;
          right: 22px;
          bottom: 22px;
          width: 62px;
          height: 62px;
          border: 0;
          border-radius: 50%;
          background: linear-gradient(135deg, #0f766e, #14b8a6);
          color: #ffffff;
          font-size: 28px;
          font-weight: 900;
          z-index: 9999;
          box-shadow: 0 18px 45px rgba(15, 118, 110, 0.34);
          cursor: pointer;
          display: grid;
          place-items: center;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        }

        .guide-ai-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 22px 52px rgba(15, 118, 110, 0.42);
        }

        .guide-ai-frame {
          position: fixed;
          right: 18px;
          bottom: 18px;
          width: 460px;
          height: 680px;
          max-width: calc(100vw - 24px);
          max-height: calc(100vh - 24px);
          background: #ffffff;
          border: 1px solid #dbe3ef;
          border-radius: 22px;
          overflow: hidden;
          z-index: 9999;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
        }

        .guide-ai-frame iframe {
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
        }

        @media (max-width: 520px) {
          .guide-ai-frame {
            right: 8px;
            bottom: 8px;
            width: calc(100vw - 16px);
            height: calc(100vh - 16px);
            border-radius: 18px;
          }

          .guide-ai-btn {
            right: 18px;
            bottom: 18px;
          }
        }
      `}</style>
    </>
  );
}
