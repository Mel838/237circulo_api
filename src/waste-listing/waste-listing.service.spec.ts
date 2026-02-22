import { Test, TestingModule } from '@nestjs/testing';
import { WasteListingService } from './waste-listing.service';

describe('WasteListingService', () => {
  let service: WasteListingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WasteListingService],
    }).compile();

    service = module.get<WasteListingService>(WasteListingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
