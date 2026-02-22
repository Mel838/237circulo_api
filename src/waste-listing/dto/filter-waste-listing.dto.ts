import { IsEnum, IsOptional } from 'class-validator';
import { WasteCategory, Status } from '../entities/waste-listing.entity';

export class FilterWasteListingDto {
  @IsEnum(WasteCategory)
  @IsOptional()
  category?: WasteCategory;

  @IsEnum(Status)
  @IsOptional()
  status?: Status;
}
