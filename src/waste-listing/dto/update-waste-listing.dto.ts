import { PartialType } from '@nestjs/mapped-types';
import { CreateWasteListingDto } from './create-waste-listing.dto';

export class UpdateWasteListingDto extends PartialType(CreateWasteListingDto) {}
