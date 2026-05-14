# Chatbot setup patch

## Mục tiêu của bản vá

- Chatbot gửi và nhận `conversationId`
- Bot nhớ ngữ cảnh ngắn hạn giữa các tin nhắn
- Bot đọc tour thật từ database thay vì catalog tĩnh
- Bot có thể đọc FAQ và booking gần nhất của user đã đăng nhập
- Frontend hiển thị tour cards và suggested replies
- Có fallback trả lời rule-based nếu chưa cấu hình API LLM

## Các file chính đã thêm/sửa

### Backend
- `src/modules/chatbot/chatbot.module.ts`
- `src/modules/chatbot/chatbot.controller.ts`
- `src/modules/chatbot/chatbot.service.ts`
- `src/modules/chatbot/dto/chat-message.dto.ts`
- `src/app.module.ts`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `src/modules/tours/tours.service.ts`

### Frontend
- `frontend/pages/assistant.js`

### SQL manual
- `sql/chatbot_schema_patch.sql`
- `sql/chatbot_seed_patch.sql`

## Chạy thủ công theo hướng Workbench + Prisma

1. Mở MySQL Workbench
2. Chạy `sql/chatbot_schema_patch.sql`
3. Chạy `sql/chatbot_seed_patch.sql`
4. Trong backend chạy:
   - `npx prisma generate`
   - `npm run build` hoặc `npm run start:dev`
5. Trong frontend chạy lại dev server

## Nếu muốn bot nói tự nhiên hơn bằng LLM

Bot vẫn chạy được khi chưa có API key, nhưng sẽ dùng fallback logic.

Thêm biến môi trường ở backend nếu bạn muốn gọi model ngoài:

- `CHATBOT_API_KEY=...`
- `CHATBOT_BASE_URL=https://api.openai.com/v1`
- `CHATBOT_MODEL=gpt-4o-mini`

Bạn cũng có thể đổi `CHATBOT_BASE_URL` sang endpoint OpenAI-compatible khác nếu bạn dùng nhà cung cấp khác.
