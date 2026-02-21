import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";

// IPCC-based CO₂ emission factor per kg recycled (average across waste types)
const CO2_FACTOR = 1.5;

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  /** Public impact metrics for the /impact page */
  async getImpactMetrics() {
    const res = await this.db.query(
      `SELECT
         COALESCE(SUM(t.weight_verified), 0)::numeric(12,2) AS total_kg_diverted,
         COALESCE(SUM(t.price_paid),      0)::numeric(12,2) AS total_fcfa_generated,
         COUNT(DISTINCT wl.zone_id)                         AS active_zones,
         COUNT(DISTINCT t.id)                               AS total_transactions,
         COUNT(DISTINCT t.seller_id)                        AS unique_sellers
       FROM transactions t
       JOIN waste_listings wl ON wl.id = t.listing_id`,
    );

    const metrics = res.rows[0];
    metrics.co2_saved_kg = (
      parseFloat(metrics.total_kg_diverted) * CO2_FACTOR
    ).toFixed(2);
    return metrics;
  }

  /** Monthly trend — last 6 months, for the chart on /impact */
  async getMonthlyTrend() {
    const res = await this.db.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', t.completed_at), 'YYYY-MM') AS month,
         SUM(t.weight_verified)::numeric(12,2)                    AS total_kg,
         SUM(t.price_paid)::numeric(12,2)                         AS total_fcfa,
         COUNT(t.id)                                              AS transactions
       FROM transactions t
       WHERE t.completed_at >= NOW() - INTERVAL '6 months'
       GROUP  BY DATE_TRUNC('month', t.completed_at)
       ORDER  BY month ASC`,
    );
    return res.rows;
  }

  /** Per-zone breakdown for the admin dashboard */
  async getZoneAnalytics(from: string, to: string) {
    const res = await this.db.query(
      `SELECT
         z.id, z.name, z.city,
         COUNT(DISTINCT wl.id)            AS listings,
         COUNT(DISTINCT t.id)             AS collections,
         COALESCE(SUM(t.weight_verified),0)::numeric(12,2) AS total_kg,
         COALESCE(SUM(t.price_paid),     0)::numeric(12,2) AS total_fcfa,
         COUNT(DISTINCT wl.user_id)       AS active_users
       FROM   zones z
       LEFT   JOIN waste_listings wl ON wl.zone_id = z.id
       LEFT   JOIN transactions t    ON t.listing_id = wl.id
                                    AND t.completed_at BETWEEN $1 AND $2
       GROUP  BY z.id, z.name, z.city
       ORDER  BY total_kg DESC`,
      [from, to],
    );
    return res.rows;
  }

  /**
   * Hotspot detection — zones with > 20 uncollected listings older than 48h.
   * Admin-only.
   */
  async getHotspots() {
    const res = await this.db.query(
      `SELECT
         z.id, z.name, z.city,
         COUNT(wl.id) AS unresolved_count,
         MIN(wl.created_at) AS oldest_listing
       FROM   zones z
       JOIN   waste_listings wl ON wl.zone_id = z.id
       WHERE  wl.status = 'available'
         AND  wl.created_at < NOW() - INTERVAL '48 hours'
       GROUP  BY z.id, z.name, z.city
       HAVING COUNT(wl.id) > 20
       ORDER  BY unresolved_count DESC`,
    );
    return res.rows;
  }
}
