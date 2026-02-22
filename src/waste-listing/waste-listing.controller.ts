import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { WasteListingService } from './waste-listing.service';
import { CreateWasteListingDto } from './dto/create-waste-listing.dto';
import { UpdateWasteListingDto } from './dto/update-waste-listing.dto';
import { FilterWasteListingDto } from './dto/filter-waste-listing.dto';
import { JwtAuthGuard } from '../user/user-auth/jwt-auth.guard';
import { CloudinaryService } from './cloudinary.service';
import { WasteCategory, Status } from './entities/waste-listing.entity';

@Controller('waste-listing')
@UseGuards(JwtAuthGuard)
export class WasteListingController {
  constructor(
    private readonly wasteListingService: WasteListingService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const randomName = Array(32).fill(null).map(() => Math.round(Math.random() * 16).toString(16)).join('');
        cb(null, `${randomName}${extname(file.originalname)}`);
      },
    }),
  }))
  create(
    @Body() createWasteListingDto: CreateWasteListingDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.wasteListingService.createWithImage(
      createWasteListingDto,
      req.user,
      file,
      this.cloudinaryService,
    );
  }

  @Post('upload/:id')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const randomName = Array(32).fill(null).map(() => Math.round(Math.random() * 16).toString(16)).join('');
        cb(null, `${randomName}${extname(file.originalname)}`);
      },
    }),
  }))
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.wasteListingService.uploadImage(id, file, this.cloudinaryService);
  }

  @Get()
  findAll(@Query() filters: FilterWasteListingDto) {
    return this.wasteListingService.findAll(filters);
  }

  @Get('my-listings')
  findMyListings(@Req() req: any) {
    return this.wasteListingService.findByUser(req.user.id);
  }

  @Get('filter')
  findByFilters(
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    const filters: FilterWasteListingDto = {};
    
    if (category) {
      // Convert to enum - handle case insensitive
      const categoryKey = Object.keys(WasteCategory).find(
        key => WasteCategory[key as keyof typeof WasteCategory]?.valueOf() === category.toLowerCase() ||
               key.toLowerCase() === category.toLowerCase()
      );
      if (categoryKey) {
        filters.category = WasteCategory[categoryKey as keyof typeof WasteCategory];
      }
    }
    
    if (status) {
      const statusKey = Object.keys(Status).find(
        key => Status[key as keyof typeof Status]?.valueOf() === status.toLowerCase() ||
               key.toLowerCase() === status.toLowerCase()
      );
      if (statusKey) {
        filters.status = Status[statusKey as keyof typeof Status];
      }
    }
    
    return this.wasteListingService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.wasteListingService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWasteListingDto: UpdateWasteListingDto) {
    return this.wasteListingService.update(id, updateWasteListingDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.wasteListingService.remove(id);
  }
}
