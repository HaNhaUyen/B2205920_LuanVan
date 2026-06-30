import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DestinationsModule } from "./modules/destinations/destinations.module";
import { ToursModule } from "./modules/tours/tours.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { FaqsModule } from "./modules/faqs/faqs.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { AdminDashboardModule } from "./modules/admin-dashboard/admin-dashboard.module";
import { UsersModule } from "./modules/users/users.module";
import { FavoritesModule } from "./modules/favorites/favorites.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ChatbotModule } from "./modules/chatbot/chatbot.module";
import { RefundsModule } from "./modules/refunds/refunds.module";
import { VouchersModule } from "./modules/vouchers/vouchers.module";
import { GuidesModule } from "./modules/guides/guides.module";
import { RecommendationsModule } from "./modules/recommendations/recommendations.module";
import { RedisModule } from "./redis/redis.module";
import { GuidePortalModule } from "./modules/guide-portal/guide-portal.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    DestinationsModule,
    ToursModule,
    BookingsModule,
    PaymentsModule,
    FaqsModule,
    ContactsModule,
    ReviewsModule,
    AdminDashboardModule,
    UsersModule,
    FavoritesModule,
    NotificationsModule,
    ChatbotModule,
    RefundsModule,
    VouchersModule,
    GuidesModule,
    RecommendationsModule,
    RedisModule,
    GuidePortalModule,
  ],
})
export class AppModule {}
