import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const STORAGE_KEY = "travela_admin_ai_conversation_id";

const QUICK_PROMPTS = [
  "Hôm nay có gì cần xử lý?",
  "Có booking nào chưa có hướng dẫn viên không?",
  "Booking nào sắp hết hạn giữ chỗ?",
  "Doanh thu tháng này bao nhiêu?",
  "Có yêu cầu hoàn tiền nào đang chờ duyệt?",
  "Tour nào sắp khởi hành trong 7 ngày?",
];

function nowText() {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function normalizeConversationId(value) {
  if (!value) return "";
  return String(value);
}

export default function AdminChatbotWidget({ user }) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Xin chào Admin! Mình là Travela Admin AI. Mình có thể tóm tắt booking cần xử lý, doanh thu, tour sắp khởi hành, yêu cầu hoàn tiền và các vấn đề vận hành.",
      time: nowText(),
    },
  ]);

  const listRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setConversationId(saved);
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, sending, open]);

  const canSend = useMemo(
    () => question.trim().length > 0 && !sending,
    [question, sending],
  );

  const sendMessage = async (text) => {
    const clean = String(text || "").trim();
    if (!clean || sending) return;

    setOpen(true);
    setQuestion("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: clean, time: nowText() },
    ]);

    try {
      const payload = {
        conversationId: conversationId || undefined,
        message: clean,
      };

      const result = await apiFetch("/chatbot/message", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (result?.conversationId) {
        const nextId = normalizeConversationId(result.conversationId);
        setConversationId(nextId);
        localStorage.setItem(STORAGE_KEY, nextId);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            result?.answer ||
            "Mình chưa xử lý được câu này. Admin thử hỏi lại ngắn hơn nha.",
          time: nowText(),
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error?.message ||
            "Không kết nối được Admin AI. Kiểm tra backend đang chạy chưa nha.",
          time: nowText(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) sendMessage(question);
    }
  };

  const clearConversation = () => {
    localStorage.removeItem(STORAGE_KEY);
    setConversationId("");
    setMessages([
      {
        role: "assistant",
        content:
          "Mình đã tạo cuộc hội thoại admin mới. Admin muốn xem vấn đề vận hành nào trước?",
        time: nowText(),
      },
    ]);
  };

  if (!user || user.role !== "admin") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={styles.floatingButton}
        title="Travela Admin AI"
      >
        <span style={styles.floatingIcon}>AI</span>
        {!open && <span style={styles.floatingText}>Trợ lý Admin</span>}
      </button>

      {open && (
        <section style={styles.panel}>
          <header style={styles.header}>
            <div>
              <strong style={styles.title}>Travela Admin AI</strong>
              <p style={styles.subtitle}>Hỏi nhanh dữ liệu vận hành hệ thống</p>
            </div>
            <div style={styles.headerActions}>
              <button
                type="button"
                onClick={clearConversation}
                style={styles.iconBtn}
              >
                Mới
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={styles.closeBtn}
              >
                ×
              </button>
            </div>
          </header>

          <div style={styles.quickBox}>
            {QUICK_PROMPTS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => sendMessage(item)}
                disabled={sending}
                style={styles.quickBtn}
              >
                {item}
              </button>
            ))}
          </div>

          <div ref={listRef} style={styles.messages}>
            {messages.map((message, index) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={`${message.role}-${index}`}
                  style={{
                    ...styles.messageRow,
                    justifyContent: isUser ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      ...styles.bubble,
                      ...(isUser ? styles.userBubble : styles.aiBubble),
                    }}
                  >
                    <div style={styles.messageContent}>{message.content}</div>
                    <div style={styles.time}>{message.time}</div>
                  </div>
                </div>
              );
            })}
            {sending && (
              <div
                style={{ ...styles.messageRow, justifyContent: "flex-start" }}
              >
                <div style={{ ...styles.bubble, ...styles.aiBubble }}>
                  Đang phân tích dữ liệu quản trị...
                </div>
              </div>
            )}
          </div>

          <div style={styles.inputWrap}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Ví dụ: Hôm nay có booking nào cần xử lý?"
              style={styles.input}
            />
            <button
              type="button"
              onClick={() => sendMessage(question)}
              disabled={!canSend}
              style={{
                ...styles.sendBtn,
                opacity: canSend ? 1 : 0.55,
                cursor: canSend ? "pointer" : "not-allowed",
              }}
            >
              Gửi
            </button>
          </div>
        </section>
      )}
    </>
  );
}

const styles = {
  floatingButton: {
    position: "fixed",
    right: 24,
    bottom: 24,
    zIndex: 1000,
    border: 0,
    borderRadius: 999,
    padding: "12px 16px",
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    gap: 10,
    boxShadow: "0 18px 40px rgba(37, 99, 235, 0.28)",
    fontWeight: 800,
  },
  floatingIcon: {
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.3)",
  },
  floatingText: { whiteSpace: "nowrap" },
  panel: {
    position: "fixed",
    right: 24,
    bottom: 88,
    width: "min(420px, calc(100vw - 32px))",
    height: "min(680px, calc(100vh - 120px))",
    background: "#ffffff",
    border: "1px solid #dbeafe",
    borderRadius: 22,
    zIndex: 1000,
    overflow: "hidden",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.22)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: "16px 18px",
    background: "linear-gradient(135deg, #eff6ff, #f5f3ff)",
    borderBottom: "1px solid #e2e8f0",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { color: "#0f172a", fontSize: 16 },
  subtitle: { margin: "4px 0 0", color: "#64748b", fontSize: 12 },
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  iconBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#334155",
    borderRadius: 999,
    padding: "6px 10px",
    fontWeight: 700,
  },
  closeBtn: {
    border: 0,
    background: "#0f172a",
    color: "#fff",
    width: 30,
    height: 30,
    borderRadius: "50%",
    fontSize: 20,
    lineHeight: "30px",
  },
  quickBox: {
    padding: "10px 12px",
    display: "flex",
    gap: 8,
    overflowX: "auto",
    borderBottom: "1px solid #e2e8f0",
  },
  quickBtn: {
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 12,
    whiteSpace: "nowrap",
    fontWeight: 700,
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: 14,
    background: "#f8fafc",
  },
  messageRow: {
    display: "flex",
    marginBottom: 10,
  },
  bubble: {
    maxWidth: "86%",
    borderRadius: 16,
    padding: "10px 12px",
    fontSize: 14,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },
  aiBubble: {
    background: "#fff",
    color: "#0f172a",
    border: "1px solid #e2e8f0",
  },
  userBubble: {
    background: "#2563eb",
    color: "#fff",
  },
  messageContent: { wordBreak: "break-word" },
  time: {
    marginTop: 6,
    fontSize: 11,
    opacity: 0.65,
    textAlign: "right",
  },
  inputWrap: {
    padding: 12,
    borderTop: "1px solid #e2e8f0",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    background: "#fff",
  },
  input: {
    resize: "none",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
  },
  sendBtn: {
    border: 0,
    borderRadius: 14,
    padding: "0 16px",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 800,
  },
};
