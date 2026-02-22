import { IsString, IsEnum, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';
import { WasteCategory } from '../entities/waste-listing.entity';

export class CreateWasteListingDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(WasteCategory)
  @IsOptional()
  category?: WasteCategory;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsNumber()
  @IsOptional()
  weight?: number;

  @IsNumber()
  @IsOptional()
  price?: number;
}
