import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** GET /api/analytics/impact — public, shown on /impact page */
  @Get("impact")
  getImpact() {
    return this.analytics.getImpactMetrics();
  }

  /** GET /api/analytics/trend — public, monthly chart data */
  @Get("trend")
  getTrend() {
    return this.analytics.getMonthlyTrend();
  }

  /** GET /api/analytics/zones?from=2026-01-01&to=2026-02-28 — admin only */
  @Get("zones")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "ngo")
  getZones(
    @Query("from") from: string = new Date(
      Date.now() - 30 * 864e5,
    ).toISOString(),
    @Query("to") to: string = new Date().toISOString(),
  ) {
    return this.analytics.getZoneAnalytics(from, to);
  }

  /** GET /api/analytics/hotspots — admin only */
  @Get("hotspots")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  getHotspots() {
    return this.analytics.getHotspots();
  }
}
