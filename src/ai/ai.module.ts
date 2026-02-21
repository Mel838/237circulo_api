import { Module } from "@nestjs/common";
import { AIController } from "./ai.controller";
import { AIService } from "./ai.service";
import { PromptService } from "./prompt.service";

/**
 * AIModule is self-contained.
 * It gets DatabaseService for free because DatabaseModule is @Global().
 *
 * To wire this into the app, add AIModule to AppModule.imports[].
 *
 * When AuthModule exports a working JwtModule (Phase 2), replace the
 * assertApiKey() helper in ai.controller.ts with:
 *   @UseGuards(JwtAuthGuard)
 * and import AuthModule here.
 */
@Module({
  controllers: [AIController],
  providers: [AIService, PromptService],
  exports: [AIService], // export so WasteModule can call classifyWaste() internally
})
export class AIModule {}
