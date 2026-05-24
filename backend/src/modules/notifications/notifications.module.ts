import { Module } from "@nestjs/common";
import { EmailService } from "../../common/services/email.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService],
})
export class NotificationsModule {}
