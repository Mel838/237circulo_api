import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WasteListingService } from './waste-listing.service';
import { WasteListingController } from './waste-listing.controller';
import { WasteListing } from './entities/waste-listing.entity';
import { User } from '../user/entities/user.entity';
import { CloudinaryService } from './cloudinary.service';

@Module({
  imports: [TypeOrmModule.forFeature([WasteListing, User])],
  controllers: [WasteListingController],
  providers: [WasteListingService, CloudinaryService],
})
export class WasteListingModule {}
