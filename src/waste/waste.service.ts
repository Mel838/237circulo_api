import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PoolClient } from "pg";
import { AIService, ClassificationResult } from "../ai/ai.service";
import { DatabaseService } from "../database/database.service";
import {
  CreateListingBody,
  ListingFilters,
  ListingRow,
  UpdateListingBody,
  ZoneRow,
} from "./waste.types";

// ── Narrow DB result rows ──────────────────────────────────────────────────────

interface CountRow extends Record<string, unknown> {
  count: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class WasteService {
  private readonly logger = new Logger(WasteService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly ai: AIService,
  ) {}

  // ── Zones (needed by create form) ─────────────────────────────────────────

  /**
   * Return all seeded zones ordered alphabetically.
   * Used by the frontend registration / listing creation dropdowns.
   */
  async getZones(): Promise<ZoneRow[]> {
    const res = await this.db.query<ZoneRow>(
      "SELECT id, name, city, region FROM zones ORDER BY name ASC",
    );
    return res.rows;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  /**
   * Create a new waste listing.
   *
   * Flow:
   *   1. Validate required fields
   *   2. If an image buffer is provided, call AIService.classifyWaste()
   *      and use the result to prefill category, score and price — the
   *      client-supplied values are used as fallback if AI is unavailable
   *   3. Insert into waste_listings
   *   4. Return the created row with seller and zone JOIN columns
   */
  async create(
    userId: string,
    body: CreateListingBody,
    imageBuffer?: Buffer,
  ): Promise<ListingRow> {
    // ── Validation ──────────────────────────────────────────────────────────
    const qty = Number.parseFloat(body.quantity_kg ?? "");
    if (Number.isNaN(qty) || qty <= 0) {
      throw new BadRequestException("quantity_kg must be a positive number.");
    }

    const lat = Number.parseFloat(body.latitude ?? "");
    const lng = Number.parseFloat(body.longitude ?? "");
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new BadRequestException(
        "latitude and longitude must be valid numbers.",
      );
    }

    if (!body.pickup_window_end) {
      throw new BadRequestException("pickup_window_end is required.");
    }

    if (!body.waste_type?.trim()) {
      throw new BadRequestException("waste_type is required.");
    }

    // ── Optional AI classification ──────────────────────────────────────────
    let aiResult: ClassificationResult | null = null;

    if (imageBuffer) {
      try {
        const imageBase64 = imageBuffer.toString("base64");
        aiResult = await this.ai.classifyWaste(imageBase64, body.description);
        this.logger.log(
          `AI classified listing for user ${userId}: ${aiResult.category} (${aiResult.confidence})`,
        );
      } catch {
        // AI failure is non-fatal — proceed with client-supplied values
        this.logger.warn(
          "AI classification failed during listing creation — using client values.",
        );
      }
    }

    // Merge: AI result wins over client-supplied values when available
    const wasteType = aiResult?.category ?? body.waste_type;
    const subCategory = aiResult?.sub_category ?? body.sub_category ?? null;
    const aiScore = aiResult?.recyclability_score ?? null;
    const aiPriceSuggested =
      aiResult?.price_range_fcfa?.min != null
        ? String(
            Math.round(
              (aiResult.price_range_fcfa.min + aiResult.price_range_fcfa.max) /
                2,
            ),
          )
        : (body.ai_price_suggested ?? null);

    // ── Insert ──────────────────────────────────────────────────────────────
    const res = await this.db.query<ListingRow>(
      `INSERT INTO waste_listings (
         user_id, waste_type, sub_category, quantity_kg,
         latitude, longitude, zone_id,
         pickup_window_start, pickup_window_end,
         ai_price_suggested, ai_recyclability_score,
         description, image_url
       ) VALUES (
         $1,  $2,  $3,  $4,
         $5,  $6,  $7,
         $8,  $9,
         $10, $11,
         $12, $13
       )
       RETURNING *`,
      [
        userId,
        wasteType,
        subCategory,
        qty,
        lat,
        lng,
        body.zone_id ?? null,
        body.pickup_window_start ?? null,
        body.pickup_window_end,
        aiPriceSuggested,
        aiScore,
        body.description ?? null,
        body.image_url ?? null,
      ],
    );

    return res.rows[0];
  }

  // ── Find all (with filters + pagination) ──────────────────────────────────

  /**
   * Return listings matching the given filters.
   * Defaults: status = 'available', limit = 20, page = 1.
   * Always joins seller name and zone name for the frontend card display.
   */
  async findAll(
    filters: ListingFilters,
  ): Promise<{ data: ListingRow[]; total: number; page: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // status filter (default: available)
    conditions.push(`wl.status = $${idx++}`);
    params.push(filters.status ?? "available");

    if (filters.waste_type?.trim()) {
      conditions.push(`wl.waste_type = $${idx++}`);
      params.push(filters.waste_type);
    }

    if (filters.zone_id?.trim()) {
      conditions.push(`wl.zone_id = $${idx++}`);
      params.push(filters.zone_id);
    }

    if (filters.min_qty) {
      const minQty = Number.parseFloat(filters.min_qty);
      if (!Number.isNaN(minQty)) {
        conditions.push(`wl.quantity_kg >= $${idx++}`);
        params.push(minQty);
      }
    }

    if (filters.max_qty) {
      const maxQty = Number.parseFloat(filters.max_qty);
      if (!Number.isNaN(maxQty)) {
        conditions.push(`wl.quantity_kg <= $${idx++}`);
        params.push(maxQty);
      }
    }

    const whereClause = conditions.join(" AND ");

    // Total count for pagination metadata
    const countRes = await this.db.query<CountRow>(
      `SELECT COUNT(*) AS count
       FROM   waste_listings wl
       WHERE  ${whereClause}`,
      params,
    );
    const total = Number.parseInt(countRes.rows[0]?.count ?? "0", 10);

    // Pagination
    const limit = Math.min(Number.parseInt(filters.limit ?? "20", 10), 100);
    const page = Math.max(Number.parseInt(filters.page ?? "1", 10), 1);
    const offset = (page - 1) * limit;

    params.push(limit, offset);

    const dataRes = await this.db.query<ListingRow>(
      `SELECT
         wl.*,
         u.name        AS seller_name,
         u.picture     AS seller_picture,
         z.name        AS zone_name
       FROM   waste_listings wl
       JOIN   users u ON u.id = wl.user_id
       LEFT   JOIN zones z ON z.id = wl.zone_id
       WHERE  ${whereClause}
       ORDER  BY wl.created_at DESC
       LIMIT  $${idx++} OFFSET $${idx++}`,
      params,
    );

    return { data: dataRes.rows, total, page };
  }

  // ── Find one ──────────────────────────────────────────────────────────────

  async findById(id: string): Promise<ListingRow> {
    const res = await this.db.query<ListingRow>(
      `SELECT
         wl.*,
         u.name        AS seller_name,
         u.picture     AS seller_picture,
         z.name        AS zone_name
       FROM   waste_listings wl
       JOIN   users u ON u.id = wl.user_id
       LEFT   JOIN zones z ON z.id = wl.zone_id
       WHERE  wl.id = $1`,
      [id],
    );

    if (!res.rows.length) {
      throw new NotFoundException(`Listing ${id} not found.`);
    }

    return res.rows[0];
  }

  // ── Update ────────────────────────────────────────────────────────────────

  /**
   * Partial update — only the fields present in the body are changed.
   * Only the owner can edit; admins can change status freely.
   *
   * Status transition rules enforced here:
   *   available  → matched | cancelled        (owner or system)
   *   matched    → collected | cancelled      (collector or system)
   *   collected  → (terminal — no changes)
   *   cancelled  → (terminal — no changes)
   */
  async update(
    id: string,
    userId: string,
    role: string,
    body: UpdateListingBody,
  ): Promise<ListingRow> {
    const listing = await this.findById(id);

    // Ownership check
    if (listing.user_id !== userId && role !== "admin") {
      throw new ForbiddenException("You do not own this listing.");
    }

    // Terminal status check
    if (listing.status === "collected" || listing.status === "cancelled") {
      throw new BadRequestException(
        `Listing is ${listing.status} and cannot be modified.`,
      );
    }

    // Status transition guard
    if (body.status) {
      const allowed: Record<string, string[]> = {
        available: ["matched", "cancelled"],
        matched: ["collected", "cancelled"],
      };
      if (!allowed[listing.status]?.includes(body.status)) {
        throw new BadRequestException(
          `Cannot transition from '${listing.status}' to '${body.status}'.`,
        );
      }
    }

    // Build SET clause dynamically — only include provided fields
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const allowed = [
      "quantity_kg",
      "pickup_window_start",
      "pickup_window_end",
      "final_price",
      "description",
      "status",
    ] as const;

    for (const key of allowed) {
      if (body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(body[key]);
      }
    }

    if (!fields.length) {
      // Nothing to update — return current state
      return listing;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const res = await this.db.query<ListingRow>(
      `UPDATE waste_listings
       SET    ${fields.join(", ")}
       WHERE  id = $${idx}
       RETURNING *`,
      values,
    );

    return res.rows[0];
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  /**
   * Soft-delete: sets status to 'cancelled'.
   * Only the owner or an admin can cancel.
   */
  async cancel(id: string, userId: string, role: string): Promise<void> {
    const listing = await this.findById(id);

    if (listing.user_id !== userId && role !== "admin") {
      throw new ForbiddenException("You do not own this listing.");
    }

    if (listing.status === "collected") {
      throw new BadRequestException("A completed listing cannot be cancelled.");
    }

    if (listing.status === "cancelled") {
      throw new BadRequestException("Listing is already cancelled.");
    }

    await this.db.query(
      `UPDATE waste_listings
       SET    status = 'cancelled', updated_at = NOW()
       WHERE  id = $1`,
      [id],
    );
  }

  // ── Status helpers (called by MarketplaceModule, IncentivesModule) ─────────

  /**
   * Advance a listing status inside an existing DB transaction.
   * Pass the PoolClient so this write stays inside the caller's transaction.
   */
  async setStatus(
    id: string,
    status: string,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `UPDATE waste_listings
       SET    status = $1, updated_at = NOW()
       WHERE  id = $2`,
      [status, id],
    );
  }

  /**
   * Return all listings assigned to a collector's zone.
   * Used by the collector portal (no auth guard yet — same API key pattern).
   */
  async findForCollector(zoneId: string): Promise<ListingRow[]> {
    const res = await this.db.query<ListingRow>(
      `SELECT
         wl.*,
         u.name    AS seller_name,
         u.picture AS seller_picture,
         z.name    AS zone_name
       FROM   waste_listings wl
       JOIN   users u ON u.id = wl.user_id
       LEFT   JOIN zones z ON z.id = wl.zone_id
       WHERE  wl.zone_id = $1
         AND  wl.status IN ('available', 'matched')
       ORDER  BY wl.pickup_window_end ASC
       LIMIT  50`,
      [zoneId],
    );

    return res.rows;
  }

  /**
   * Return the seller_id and zone_id for a listing.
   * Used by TransactionService (MarketplaceModule) to award points.
   */
  async getListingMeta(
    id: string,
  ): Promise<{ user_id: string; zone_id: string | null; waste_type: string }> {
    const res = await this.db.query<
      {
        user_id: string;
        zone_id: string | null;
        waste_type: string;
      } & Record<string, unknown>
    >("SELECT user_id, zone_id, waste_type FROM waste_listings WHERE id = $1", [
      id,
    ]);

    if (!res.rows.length) {
      throw new NotFoundException(`Listing ${id} not found.`);
    }

    return {
      user_id: res.rows[0].user_id,
      zone_id: res.rows[0].zone_id,
      waste_type: res.rows[0].waste_type,
    };
  }
}
