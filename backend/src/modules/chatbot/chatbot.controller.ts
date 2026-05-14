import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ChatbotService } from "./chatbot.service";
import { RagIndexService } from "./rag-index.service";
import { ChatMessageDto } from "./dto/chat-message.dto";

@Controller("chatbot")
export class ChatbotController {
  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly ragIndexService: RagIndexService,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post("message")
  message(
    @Body() dto: ChatMessageDto,
    @CurrentUser()
    user?: {
      userId?: bigint;
      fullName?: string;
      email?: string;
      role?: string;
    } | null,
  ) {
    return this.chatbotService.message(dto, user ?? null);
  }

  // Dùng để build lại vector index sau khi seed database hoặc thêm/sửa nhiều tour/FAQ.
  // Gọi bằng Postman: POST http://localhost:3001/api/chatbot/rag/rebuild
  @UseGuards(JwtAuthGuard)
  @Post("rag/rebuild")
  rebuildRagIndex() {
    return this.ragIndexService.rebuildAll();
  }
}
