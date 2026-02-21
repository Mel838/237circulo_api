import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserAuthModule } from './user-auth/user-auth.module';

@Module({
  controllers: [UserController],
  providers: [UserService],
  imports: [UserAuthModule],
})
export class UserModule {}
