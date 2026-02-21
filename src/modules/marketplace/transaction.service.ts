import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PointsService } from '../incentives/points.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class TransactionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly points: PointsService,
    private readonly notifications: NotificationsGateway,
  ) {}

  /**
   * Confirm a pickup — runs entirely inside a DB transaction:
   *  1. Update listing status → 'collected'
   *  2. Insert transaction record
   *  3. Award green points to seller (10 pts/kg)
   *  4. Update zone total_kg
   *  5. Emit WebSocket events
   */
  async confirmCollection(
    listingId: string,
    collectorId: string,
    actualKg: number,
  ) {
    return this.db.transaction(async (client) => {
      // 1. Advance listing status — only matched listings can be confirmed
      const listingRes = await client.query(
        `UPDATE waste_listings
         SET status = 'collected', updated_at = NOW()
         WHERE id = $1 AND status IN ('available','matched')
         RETURNING user_id, zone_id, waste_type`,
        [listingId],
      );

      if (!listingRes.rows.length) {
        throw new BadRequestException(
          'Listing is not available for confirmation.',
        );
      }

      const { user_id: sellerId, zone_id: zoneId } = listingRes.rows[0];
      const pointsAwarded = Math.floor(actualKg * 10); // 10 pts/kg

      // 2. Insert transaction record
      const txnRes = await client.query(
        `INSERT INTO transactions
           (listing_id, seller_id, collector_id, weight_verified, points_awarded)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [listingId, sellerId, collectorId, actualKg, pointsAwarded],
      );
      const txnId = txnRes.rows[0].id;

      // 3. Award points to seller (pass client so we stay inside the same transaction)
      await this.points.awardPoints(
        sellerId,
        pointsAwarded,
        'collection_confirmed',
        txnId,
        client,
      );

      // 4. Update zone aggregate
      if (zoneId) {
        await client.query(
          `UPDATE zones SET total_kg = total_kg + $1 WHERE id = $2`,
          [actualKg, zoneId],
        );
      }

      // 5. Real-time notifications (outside transaction — non-critical)
      this.notifications.emitCollectionConfirmed(sellerId, {
        txnId,
        pointsAwarded,
        actualKg,
      });
      this.notifications.emitCollectionConfirmed(collectorId, {
        txnId,
        pointsAwarded,
        actualKg,
      });

      return { txnId, pointsAwarded, actualKg };
    });
  }

  /** Collector's pending pickup queue */
  async getCollectorQueue(collectorId: string) {
    // For now, return listings matched to the collector's zone
    const res = await this.db.query(
      `SELECT wl.id, wl.waste_type, wl.quantity_kg, wl.latitude, wl.longitude,
              wl.pickup_window_end, wl.description,
              u.name AS seller_name, u.phone AS seller_phone,
              z.name AS zone_name
       FROM   waste_listings wl
       JOIN   users u  ON u.id = wl.user_id
       LEFT   JOIN zones z ON z.id = wl.zone_id
       WHERE  wl.status IN ('available','matched')
       ORDER  BY wl.created_at ASC
       LIMIT  30`,
      [],
    );
    return res.rows;
  }
}
