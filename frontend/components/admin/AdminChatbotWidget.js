import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const STORAGE_KEY = "travela_admin_ai_conversation_id";
const MESSAGE_STORAGE_KEY = "travela_admin_ai_messages";

const QUICK_PROMPTS = [
  "Hôm nay có gì cần xử lý?",
  "Có booking nào chưa có hướng dẫn viên không?",
  "Booking nào sắp hết hạn giữ chỗ?",
  "Có yêu cầu hoàn tiền nào đang chờ duyệt?",
  "Tour nào lượt xem cao nhưng ít người đặt?",
  "Doanh thu tháng này thế nào?",
];

const WELCOME_MESSAGE =
  "Xin chào Admin! Mình là Travela Admin AI. Mình có thể phân tích dữ liệu vận hành, booking, doanh thu, refund, hướng dẫn viên, lịch khởi hành và đưa ra gợi ý xử lý theo thứ tự ưu tiên.";

function nowText() {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function normalizeConversationId(value) {
  return value ? String(value) : "";
}

function normalizeMessage(item) {
  return {
    role: item?.role || "assistant",
    content: item?.content || "",
    time: item?.time || nowText(),
  };
}

function loadLocalMessages() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(MESSAGE_STORAGE_KEY) || "null",
    );
    return Array.isArray(parsed) && parsed.length
      ? parsed.map(normalizeMessage)
      : null;
  } catch {
    return null;
  }
}

export default function AdminChatbotWidget({ user }) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [conversationList, setConversationList] = useState([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: WELCOME_MESSAGE, time: nowText() },
  ]);

  const listRef = useRef(null);

  useEffect(() => {
    if (!user || user.role !== "admin") return;

    const saved = localStorage.getItem(STORAGE_KEY) || "";
    const localMessages = loadLocalMessages();

    if (localMessages) setMessages(localMessages);
    if (saved) {
      setConversationId(saved);
      loadConversation(saved, { silent: true });
    }

    refreshConversations();
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(MESSAGE_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, sending, open]);

  const canSend = useMemo(
    () => question.trim().length > 0 && !sending,
    [question, sending],
  );

  async function refreshConversations() {
    try {
      const list = await apiFetch("/chatbot/conversations?scope=admin");
      setConversationList(Array.isArray(list) ? list : []);
    } catch {
      setConversationList([]);
    }
  }

  async function loadConversation(id, options = {}) {
    if (!id) return;
    setLoadingHistory(true);
    try {
      const detail = await apiFetch(
        `/chatbot/conversations/${encodeURIComponent(id)}`,
      );
      const loadedMessages = Array.isArray(detail?.messages)
        ? detail.messages.map(normalizeMessage)
        : [];

      setConversationId(String(detail?.conversationId || detail?.id || id));
      setMessages(
        loadedMessages.length
          ? loadedMessages
          : [{ role: "assistant", content: WELCOME_MESSAGE, time: nowText() }],
      );
      localStorage.setItem(
        STORAGE_KEY,
        String(detail?.conversationId || detail?.id || id),
      );
    } catch (error) {
      if (!options.silent) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              error?.message ||
              "Mình chưa tải lại được hội thoại admin này. Admin thử chọn lại sau.",
            time: nowText(),
          },
        ]);
      }
    } finally {
      setLoadingHistory(false);
    }
  }

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
      const result = await apiFetch("/chatbot/message", {
        method: "POST",
        body: JSON.stringify({
          conversationId: conversationId || undefined,
          message: clean,
        }),
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
            "Mình chưa đủ dữ liệu để kết luận. Admin có thể hỏi cụ thể hơn theo booking, refund, doanh thu, lịch khởi hành hoặc hướng dẫn viên.",
          time: nowText(),
        },
      ]);

      setTimeout(refreshConversations, 200);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error?.message ||
            "Không kết nối được Admin AI. Admin kiểm tra backend và quyền đăng nhập admin giúp mình.",
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
    localStorage.removeItem(MESSAGE_STORAGE_KEY);
    setConversationId("");
    setMessages([
      {
        role: "assistant",
        content:
          "Mình đã tạo cuộc hội thoại admin mới. Admin muốn xem vấn đề vận hành nào trước: booking, refund, doanh thu, hướng dẫn viên hay tour sắp khởi hành?",
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
              <p style={styles.subtitle}>
                Phân tích nhanh dữ liệu vận hành hệ thống
              </p>
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

          {conversationList.length ? (
            <div style={styles.historyBox}>
              {conversationList.slice(0, 8).map((item) => {
                const active = String(item.id) === String(conversationId || "");
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadConversation(item.id)}
                    disabled={loadingHistory}
                    style={{
                      ...styles.historyItem,
                      ...(active ? styles.historyItemActive : {}),
                    }}
                  >
                    {item.title || "Hội thoại admin"}
                  </button>
                );
              })}
            </div>
          ) : null}

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
    width: "min(440px, calc(100vw - 32px))",
    height: "min(700px, calc(100vh - 120px))",
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
    padding: "6px 12px",
    fontWeight: 800,
  },
  closeBtn: {
    border: 0,
    background: "#0f172a",
    color: "#fff",
    width: 32,
    height: 32,
    borderRadius: "50%",
    fontSize: 20,
    lineHeight: "30px",
  },
  historyBox: {
    padding: "8px 12px",
    display: "flex",
    gap: 8,
    overflowX: "auto",
    borderBottom: "1px solid #e2e8f0",
    background: "#fff",
  },
  historyItem: {
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#475569",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    whiteSpace: "nowrap",
    maxWidth: 180,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  historyItemActive: {
    border: "1px solid #2563eb",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontWeight: 800,
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
  messageRow: { display: "flex", marginBottom: 10 },
  bubble: {
    maxWidth: "88%",
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
  userBubble: { background: "#2563eb", color: "#fff" },
  messageContent: { wordBreak: "break-word" },
  time: { marginTop: 6, fontSize: 11, opacity: 0.65, textAlign: "right" },
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
