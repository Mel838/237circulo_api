import { Test, TestingModule } from '@nestjs/testing';
import { WasteListingController } from './waste-listing.controller';
import { WasteListingService } from './waste-listing.service';

describe('WasteListingController', () => {
  let controller: WasteListingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WasteListingController],
      providers: [WasteListingService],
    }).compile();

    controller = module.get<WasteListingController>(WasteListingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
