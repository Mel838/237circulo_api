import {
  Global,
  Logger,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Pool } from "pg";
import { DatabaseService } from "./database.service";

/**
 * @Global() — import once in AppModule and every module can use
 * DatabaseService without re-importing DatabaseModule.
 *
 * We avoid @Inject('PG_POOL') in the constructor of DatabaseService
 * because Biome flags parameter decorators as a parse error unless
 * `unsafeParameterDecoratorsEnabled` is set.
 *
 * Instead we use a factory provider that:
 *   1. Creates the Pool
 *   2. Creates a DatabaseService instance
 *   3. Sets service.pool directly (property injection)
 * This is 100% equivalent — NestJS DI resolves it the same way.
 */
@Global()
@Module({
  providers: [
    // Step 1 — create the raw Pool
    {
      provide: "PG_POOL",
      useFactory: (): Pool => {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 20,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 2_000,
        });

        pool.on("connect", () =>
          Logger.log("pg pool — new client connected", "DatabaseModule"),
        );
        pool.on("error", (err: Error) =>
          Logger.error(`pg pool error: ${err.message}`, "DatabaseModule"),
        );

        return pool;
      },
    },

    // Step 2 — create DatabaseService and inject the Pool via property assignment
    {
      provide: DatabaseService,
      useFactory: (pool: Pool): DatabaseService => {
        const service = new DatabaseService();
        service.pool = pool; // property injection — no @Inject needed
        return service;
      },
      inject: ["PG_POOL"],
    },
  ],
  exports: ["PG_POOL", DatabaseService],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(private readonly db: DatabaseService) {}

  /** Gracefully drain the pool when the app shuts down (Ctrl+C / SIGTERM). */
  async onApplicationShutdown() {
    await this.db.pool.end();
    Logger.log("pg pool closed", "DatabaseModule");
  }
}
