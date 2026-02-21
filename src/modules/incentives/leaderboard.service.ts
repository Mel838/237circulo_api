import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class LeaderboardService {
  constructor(private readonly db: DatabaseService) {}

  // Simple in-memory cache — refreshed every 60 minutes
  private cache: { data: any[]; expires: number } | null = null;

  async getMonthlyLeaderboard() {
    if (this.cache && Date.now() < this.cache.expires) {
      return this.cache.data;
    }

    const res = await this.db.query(
      `SELECT
         z.id,
         z.name,
         z.city,
         COALESCE(SUM(t.weight_verified), 0)::numeric(12,2)  AS total_kg,
         COUNT(DISTINCT t.id)                                 AS total_collections,
         COUNT(DISTINCT wl.user_id)                           AS active_members
       FROM   zones z
       LEFT   JOIN waste_listings wl ON wl.zone_id = z.id
       LEFT   JOIN transactions t    ON t.listing_id = wl.id
                                    AND t.completed_at >= DATE_TRUNC('month', NOW())
       GROUP  BY z.id, z.name, z.city
       ORDER  BY total_kg DESC`,
    );

    this.cache = { data: res.rows, expires: Date.now() + 60 * 60 * 1000 };
    return res.rows;
  }

  /** Historical leaderboard for a given month (YYYY-MM) */
  async getByMonth(month: string) {
    const res = await this.db.query(
      `SELECT
         z.id, z.name, z.city,
         COALESCE(SUM(t.weight_verified), 0)::numeric(12,2) AS total_kg,
         COUNT(DISTINCT t.id)                               AS total_collections
       FROM   zones z
       LEFT   JOIN waste_listings wl ON wl.zone_id = z.id
       LEFT   JOIN transactions t    ON t.listing_id = wl.id
                                    AND TO_CHAR(t.completed_at, 'YYYY-MM') = $1
       GROUP  BY z.id, z.name, z.city
       ORDER  BY total_kg DESC`,
      [month],
    );
    return res.rows;
  }
}
