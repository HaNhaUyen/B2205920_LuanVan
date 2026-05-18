import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ChatbotController } from "./chatbot.controller";
import { ChatbotService } from "./chatbot.service";
import { RagService } from "./rag.service";
import { RagIndexService } from "./rag-index.service";
import { ChatbotNluService } from "./chatbot-nlu.service";
import { ChatbotConfidenceService } from "./chatbot-confidence.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { BookingsModule } from "../bookings/bookings.module";
import { PaymentsModule } from "../payments/payments.module";

@Module({
  imports: [PrismaModule, ConfigModule, BookingsModule, PaymentsModule],
  controllers: [ChatbotController],
  providers: [
    ChatbotService,
    RagService,
    RagIndexService,
    ChatbotNluService,
    ChatbotConfidenceService,
  ],
})
export class ChatbotModule {}
