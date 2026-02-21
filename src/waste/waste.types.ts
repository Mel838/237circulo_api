// ── Enums (mirror the PostgreSQL enum values exactly) ─────────────────────────

export type ListingStatus = 'available' | 'matched' | 'collected' | 'cancelled';

export type WasteCategory =
  | 'plastic'
  | 'metal'
  | 'paper'
  | 'glass'
  | 'organic'
  | 'e-waste'
  | 'textile'
  | 'rubber'
  | 'hazardous'
  | 'other';

// ── DB row shapes (must extend Record<string,unknown> for DatabaseService) ─────

export interface ListingRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  waste_type: string;
  sub_category: string | null;
  quantity_kg: string; // pg returns DECIMAL as string
  latitude: string;
  longitude: string;
  zone_id: string | null;
  pickup_window_start: Date | null;
  pickup_window_end: Date;
  ai_price_suggested: string | null;
  ai_recyclability_score: number | null;
  final_price: string | null;
  status: ListingStatus;
  image_url: string | null;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  // JOIN columns (present on findAll / findById)
  seller_name?: string;
  seller_picture?: string | null;
  zone_name?: string | null;
}

export interface ZoneRow extends Record<string, unknown> {
  id: string;
  name: string;
  city: string;
  region: string;
}

// ── Request body shapes ────────────────────────────────────────────────────────

/**
 * Body for POST /waste  (create listing).
 * image is handled separately by Multer; all other fields come from
 * the multipart form fields or a JSON body.
 */
export interface CreateListingBody {
  waste_type: string;
  sub_category?: string;
  quantity_kg: string; // comes in as string from multipart form
  latitude: string;
  longitude: string;
  zone_id?: string;
  pickup_window_start?: string; // ISO-8601 string
  pickup_window_end: string; // ISO-8601 string
  description?: string;
  // AI-prefilled fields (sent back by the client after calling /ai/classify)
  ai_price_suggested?: string;
  ai_recyclability_score?: string;
  image_url?: string; // cloud URL if image already uploaded elsewhere
}

/**
 * Body for PATCH /waste/:id  (partial update).
 * Only these fields are editable after creation.
 */
export interface UpdateListingBody {
  quantity_kg?: string;
  pickup_window_start?: string;
  pickup_window_end?: string;
  final_price?: string;
  description?: string;
  status?: ListingStatus;
}

/**
 * Query-string filters for GET /waste.
 */
export interface ListingFilters {
  status?: string;
  waste_type?: string;
  zone_id?: string;
  min_qty?: string;
  max_qty?: string;
  page?: string;
  limit?: string;
}
