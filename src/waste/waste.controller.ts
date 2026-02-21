import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { WasteService } from './waste.service';
import * as wasteTypes from './waste.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Lightweight API-key guard — mirrors the pattern used in AIController.
 * Replace with @UseGuards(JwtAuthGuard) once AuthModule exports JwtModule.
 */
function assertApiKey(req: Request): void {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return; // open in dev when key is not set

  const provided =
    (req.headers['x-api-key'] as string | undefined) ??
    req.headers.authorization?.replace('Bearer ', '') ??
    '';

  if (provided !== expected) {
    throw new BadRequestException('Unauthorized');
  }
}

/**
 * Extract :id from the URL path safely.
 * NestJS @Param() requires class-validator which is not yet installed,
 * so we read directly from req.params.
 */
function extractId(req: Request): string {
  const id = (req.params as Record<string, string>)['id'];
  if (!id?.trim()) {
    throw new BadRequestException('id param is required.');
  }
  return id;
}

/**
 * Derive a pseudo role from req until JwtAuthGuard is available.
 * GoogleUser does not carry a role — default to 'user'.
 * The role field will be populated properly once the DB-backed auth lands.
 */
function extractRole(req: Request): string {
  const user = req.user as Record<string, unknown> | undefined;
  return typeof user?.['role'] === 'string' ? user['role'] : 'user';
}

/**
 * Derive userId from req.user.
 * GoogleUser carries googleId, not a DB UUID — until auth is complete
 * we use googleId as a stand-in. Replace with user.id once auth stores DB rows.
 */
function extractUserId(req: Request): string {
  const user = req.user as Record<string, unknown> | undefined;
  // prefer DB uuid (id), fall back to googleId
  const id =
    typeof user?.['id'] === 'string'
      ? user['id']
      : typeof user?.['googleId'] === 'string'
        ? user['googleId']
        : null;

  if (!id) {
    throw new BadRequestException(
      'Unauthorized — no user identity on request.',
    );
  }
  return id;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('waste')
export class WasteController {
  private readonly logger = new Logger(WasteController.name);

  constructor(private readonly wasteService: WasteService) {}

  // ── GET /waste/zones ───────────────────────────────────────────────────────

  /**
   * Public — no auth required.
   * Returns all seeded zones for use in registration and listing creation forms.
   */
  @Get('zones')
  @HttpCode(HttpStatus.OK)
  async getZones(): Promise<wasteTypes.ZoneRow[]> {
    return this.wasteService.getZones();
  }

  // ── GET /waste ─────────────────────────────────────────────────────────────

  /**
   * Public marketplace browse — no auth required.
   *
   * Query params (all optional):
   *   status      — default: "available"
   *   waste_type  — filter by category
   *   zone_id     — filter by zone UUID
   *   min_qty     — minimum kg
   *   max_qty     — maximum kg
   *   page        — default: 1
   *   limit       — default: 20, max: 100
   *
   * Returns { data: ListingRow[], total: number, page: number }
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() filters: wasteTypes.ListingFilters,
  ): Promise<{ data: wasteTypes.ListingRow[]; total: number; page: number }> {
    return this.wasteService.findAll(filters);
  }

  // ── GET /waste/collector ───────────────────────────────────────────────────

  /**
   * Returns pending listings in the authenticated collector's zone.
   * Requires: x-api-key header + zone_id query param.
   *
   * Once auth is complete this will read zone_id from req.user.zone_id.
   */
  @Get('collector')
  @HttpCode(HttpStatus.OK)
  async getCollectorQueue(
    @Req() req: Request,
    @Query('zone_id') zoneId: string,
  ): Promise<wasteTypes.ListingRow[]> {
    assertApiKey(req);

    if (!zoneId?.trim()) {
      throw new BadRequestException('zone_id query param is required.');
    }

    return this.wasteService.findForCollector(zoneId);
  }

  // ── GET /waste/:id ─────────────────────────────────────────────────────────

  /**
   * Public — returns a single listing with seller and zone info.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Req() req: Request): Promise<wasteTypes.ListingRow> {
    const id = extractId(req);
    return this.wasteService.findById(id);
  }

  // ── POST /waste ────────────────────────────────────────────────────────────

  /**
   * Create a new waste listing.
   * Content-Type: multipart/form-data
   *
   * Form fields (all strings from multipart):
   *   waste_type*         — required fallback if no image
   *   quantity_kg*        — required, must be > 0
   *   latitude*           — required
   *   longitude*          — required
   *   pickup_window_end*  — required ISO-8601 string
   *   zone_id             — optional UUID
   *   pickup_window_start — optional ISO-8601 string
   *   description         — optional
   *   ai_price_suggested  — optional, prefilled from /ai/classify response
   *   ai_recyclability_score — optional, prefilled from /ai/classify response
   *   image_url           — optional, if image already hosted elsewhere
   *
   * File field:
   *   image — optional JPEG/PNG/WebP, max 5 MB
   *           when present, AIService.classifyWaste() is called automatically
   *
   * Returns the created ListingRow (201).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only JPEG, PNG, and WebP images are accepted.',
            ),
            false,
          );
        }
      },
    }),
  )
  async create(
    @Req() req: Request & { body: wasteTypes.CreateListingBody },
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<wasteTypes.ListingRow> {
    assertApiKey(req);
    const userId = extractUserId(req);

    this.logger.log(
      `create — user:${userId} type:${req.body.waste_type} image:${!!file}`,
    );

    return this.wasteService.create(userId, req.body, file?.buffer);
  }

  // ── PATCH /waste/:id ───────────────────────────────────────────────────────

  /**
   * Partial update of an existing listing.
   * Content-Type: application/json
   *
   * Body fields (all optional):
   *   quantity_kg, pickup_window_start, pickup_window_end,
   *   final_price, description, status
   *
   * Only the listing owner or an admin may update.
   * Terminal statuses (collected, cancelled) block all edits.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Req() req: Request & { body: wasteTypes.UpdateListingBody },
  ): Promise<wasteTypes.ListingRow> {
    assertApiKey(req);
    const id = extractId(req);
    const userId = extractUserId(req);
    const role = extractRole(req);

    this.logger.log(`update — id:${id} user:${userId} role:${role}`);

    return this.wasteService.update(id, userId, role, req.body);
  }

  // ── DELETE /waste/:id ──────────────────────────────────────────────────────

  /**
   * Cancel a listing (soft delete — sets status to 'cancelled').
   * Only the owner or an admin may cancel.
   * Collected listings cannot be cancelled.
   *
   * Returns 204 No Content on success.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@Req() req: Request): Promise<void> {
    assertApiKey(req);
    const id = extractId(req);
    const userId = extractUserId(req);
    const role = extractRole(req);

    this.logger.log(`cancel — id:${id} user:${userId} role:${role}`);

    await this.wasteService.cancel(id, userId, role);
  }
}
