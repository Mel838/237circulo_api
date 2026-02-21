import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>("DB_HOST");
        const port = config.get<number>("DB_PORT");
        const username = config.get<string>("DB_USER");
        const password = config.get<string>("DB_PASSWORD");
        const database = config.get<string>("DB_NAME");
        if (!host || !port || !username || !database || !password) {
          throw new Error("Missing required database environment variables");
        }

        return {
          type: "postgres",
          host,
          port: Number(port),
          username,
          password,
          database,
          autoLoadEntities: true,
          synchronize: config.get("NODE_ENV") !== "production",
        };
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
