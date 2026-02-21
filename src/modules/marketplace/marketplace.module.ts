import { Module } from "@nestjs/common";
import { IncentivesModule } from "../incentives/incentives.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MarketplaceController } from "./marketplace.controller";
import { MatchingService } from "./matching.service";
import { TransactionService } from "./transaction.service";

@Module({
  imports: [IncentivesModule, NotificationsModule],
  providers: [MatchingService, TransactionService],
  controllers: [MarketplaceController],
  exports: [TransactionService],
})
export class MarketplaceModule {}
