import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { UserAuthController } from './user-auth.controller';
import { UserAuthService } from './user-auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    JwtModule.register({
      secret: process.env.JWT_SECRET || 'default-secret',
      signOptions: {
        expiresIn: parseInt(process.env.JWT_EXPIRATION || '7d'),
      },
    }),
  ],
  controllers: [UserAuthController],
  providers: [UserAuthService, JwtStrategy],
  exports: [PassportModule, JwtModule],
})
export class UserAuthModule {}
