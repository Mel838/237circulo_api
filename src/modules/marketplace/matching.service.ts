import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class MatchingService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Find up to 5 recyclers/collectors in the same zone
   * ordered by how recently they've collected the same waste type.
   * Called after a new listing is created.
   */
  async findMatches(listingId: string, zoneId: string, wasteType: string) {
    const res = await this.db.query(
      `SELECT
         u.id, u.name, u.phone, u.role,
         COUNT(t.id)  AS past_collections,
         MAX(t.completed_at) AS last_active
       FROM   users u
       LEFT   JOIN transactions t   ON t.collector_id = u.id   OR t.buyer_id = u.id
       LEFT   JOIN waste_listings wl ON wl.id = t.listing_id AND wl.waste_type = $1
       WHERE  u.role IN ('recycler','collector')
         AND  u.is_active = TRUE
         AND  u.zone_id = $2
       GROUP  BY u.id
       ORDER  BY past_collections DESC, last_active DESC NULLS LAST
       LIMIT  5`,
      [wasteType, zoneId],
    );

    const matches = res.rows;

    // Persist matches
    for (let i = 0; i < matches.length; i++) {
      const fitScore = Math.max(10, 100 - i * 15); // simple score: 100, 85, 70 ...
      await this.db.query(
        `INSERT INTO listing_matches (listing_id, buyer_id, fit_score)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [listingId, matches[i].id, fitScore],
      );
    }

    return matches;
  }

  /** Return pre-computed matches for a listing */
  async getMatches(listingId: string) {
    const res = await this.db.query(
      `SELECT u.id, u.name, u.phone, lm.fit_score
       FROM   listing_matches lm
       JOIN   users u ON u.id = lm.buyer_id
       WHERE  lm.listing_id = $1
       ORDER  BY lm.fit_score DESC`,
      [listingId],
    );
    return res.rows;
  }
}
