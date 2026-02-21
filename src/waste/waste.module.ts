import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { WasteController } from './waste.controller';
import { WasteService } from './waste.service';

/**
 * WasteModule owns the waste_listings table.
 *
 * Dependencies:
 *   - DatabaseModule  (@Global — no explicit import needed)
 *   - AIModule        (imported explicitly — provides AIService for auto-classification)
 *
 * Exports:
 *   - WasteService    so MarketplaceModule can call setStatus() and getListingMeta()
 *                     inside DB transactions without crossing module boundaries
 *                     through HTTP.
 *
 * When AuthModule exports JwtModule, add it to imports[] and replace
 * assertApiKey() in WasteController with @UseGuards(JwtAuthGuard).
 */
@Module({
  imports: [AIModule],
  controllers: [WasteController],
  providers: [WasteService],
  exports: [WasteService],
})
export class WasteModule {}
