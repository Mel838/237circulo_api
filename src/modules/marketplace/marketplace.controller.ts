import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { MatchingService } from "./matching.service";
import { TransactionService } from "./transaction.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class MarketplaceController {
  constructor(
    private readonly transactions: TransactionService,
    private readonly matching: MatchingService,
  ) {}

  /**
   * POST /api/listings/:id/confirm
   * Collector confirms pickup with actual weight collected.
   */
  @Post("listings/:id/confirm")
  @UseGuards(RolesGuard)
  @Roles("collector", "admin")
  confirmCollection(
    @Param("id") listingId: string,
    @Body("actual_kg") actualKg: number,
    @Req() req: any,
  ) {
    return this.transactions.confirmCollection(
      listingId,
      req.user.userId,
      Number(actualKg),
    );
  }

  /**
   * GET /api/collector/queue
   * Pending pickups for the logged-in collector.
   */
  @Get("collector/queue")
  @UseGuards(RolesGuard)
  @Roles("collector", "admin")
  getQueue(@Req() req: any) {
    return this.transactions.getCollectorQueue(req.user.userId);
  }

  /**
   * GET /api/listings/:id/matches
   * AI-matched buyers for a specific listing.
   */
  @Get("listings/:id/matches")
  getMatches(@Param("id") listingId: string) {
    return this.matching.getMatches(listingId);
  }
}
