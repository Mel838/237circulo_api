import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { UserAuthModule } from './user/user-auth/user-auth.module';
import { WasteModule } from './waste/waste.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { IncentivesModule } from './modules/incentives/incentives.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    UserAuthModule,
    AuthModule,
    AIModule,
    WasteModule,
    AnalyticsModule,
    MarketplaceModule,
    IncentivesModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('DB_HOST');
        const port = config.get<string>('DB_PORT') || '5432';
        const username = config.get<string>('DB_USER');
        const password = config.get<string>('DB_PASSWORD');
        const database = config.get<string>('DB_NAME');
        if (
          !host ||
          Number.isNaN(Number(port)) ||
          !username ||
          !database ||
          !password
        ) {
          throw new Error('Missing required database environment variables');
        }

        return {
          type: 'postgres',
          host,
          port: Number(port),
          username,
          password,
          database,
          autoLoadEntities: true,
          synchronize: config.get('NODE_ENV') !== 'production',
        };
      },
    }),
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
