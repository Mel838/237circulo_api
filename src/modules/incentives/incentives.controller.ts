import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';
import { PointsService } from './points.service';

@Controller()
export class IncentivesController {
  constructor(
    private readonly points: PointsService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  /** GET /api/points/me — balance + history (auth required) */
  @Get('points/me')
  @UseGuards(JwtAuthGuard)
  getMyPoints(@Req() req: any) {
    return this.points.getHistory(req.user.userId);
  }

  /** GET /api/leaderboard — monthly, cached (public) */
  @Get('leaderboard')
  getLeaderboard() {
    return this.leaderboard.getMonthlyLeaderboard();
  }

  /** GET /api/leaderboard/history?month=2026-01 — historical (public) */
  @Get('leaderboard/history')
  getHistory(@Query('month') month: string) {
    return this.leaderboard.getByMonth(month);
  }
}
