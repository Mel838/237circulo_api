import { Module } from "@nestjs/common";
import { IncentivesController } from "./incentives.controller";
import { LeaderboardService } from "./leaderboard.service";
import { PointsService } from "./points.service";

@Module({
  providers: [PointsService, LeaderboardService],
  controllers: [IncentivesController],
  exports: [PointsService], // TransactionService needs it
})
export class IncentivesModule {}
