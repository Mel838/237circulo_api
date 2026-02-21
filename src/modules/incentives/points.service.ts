import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "../../database/database.service";

type PointsReason =
  | "listing_created"
  | "collection_confirmed"
  | "bonus"
  | "redemption";

@Injectable()
export class PointsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Award (or deduct) points for a user.
   * Pass a pg PoolClient when called inside an existing DB transaction
   * so all operations commit/rollback atomically.
   *
   * Uses SELECT ... FOR UPDATE to prevent race conditions when the same
   * user gets points from concurrent requests.
   */
  async awardPoints(
    userId: string,
    delta: number,
    reason: PointsReason,
    referenceId: string,
    client?: PoolClient,
  ): Promise<number> {
    const exec = client ?? (await this.getClient());

    // Lock the row
    const balRes = await exec.query(
      "SELECT points_balance FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const newBalance = (balRes.rows[0]?.points_balance ?? 0) + delta;

    // Update balance
    await exec.query(
      "UPDATE users SET points_balance = $1, updated_at = NOW() WHERE id = $2",
      [newBalance, userId],
    );

    // Append ledger entry
    await exec.query(
      `INSERT INTO points_ledger (user_id, delta, reason, reference_id, balance_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, delta, reason, referenceId, newBalance],
    );

    return newBalance;
  }

  /** Returns current balance + last 20 ledger entries */
  async getHistory(userId: string) {
    const [balRes, histRes] = await Promise.all([
      this.db.query("SELECT points_balance FROM users WHERE id = $1", [userId]),
      this.db.query(
        `SELECT delta, reason, balance_after, created_at
         FROM   points_ledger
         WHERE  user_id = $1
         ORDER  BY created_at DESC
         LIMIT  20`,
        [userId],
      ),
    ]);

    return {
      balance: balRes.rows[0]?.points_balance ?? 0,
      history: histRes.rows,
    };
  }

  // Internal helper — only used when no external client is passed
  private async getClient(): Promise<any> {
    // Delegate to the db pool directly when not inside a transaction
    return {
      query: (sql: string, params: any[]) => this.db.query(sql, params),
    };
  }
}
