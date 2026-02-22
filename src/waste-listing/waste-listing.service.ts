import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateWasteListingDto } from './dto/create-waste-listing.dto';
import { UpdateWasteListingDto } from './dto/update-waste-listing.dto';
import { WasteListing, WasteCategory, Status } from './entities/waste-listing.entity';
import { User } from '../user/entities/user.entity';
import { CloudinaryService } from './cloudinary.service';

export interface FilterWasteListingDto {
  category?: WasteCategory;
  status?: Status;
}

@Injectable()
export class WasteListingService {
  constructor(
    @InjectRepository(WasteListing)
    private wasteListingRepository: Repository<WasteListing>,
  ) {}

  async create(createWasteListingDto: CreateWasteListingDto, user: User): Promise<WasteListing> {
    const wasteListing = this.wasteListingRepository.create({
      ...createWasteListingDto,
      user,
    });
    return this.wasteListingRepository.save(wasteListing);
  }

  async createWithImage(
    createWasteListingDto: CreateWasteListingDto,
    user: User,
    file: Express.Multer.File,
    cloudinaryService: CloudinaryService,
  ): Promise<any> {
    const wasteListing = this.wasteListingRepository.create({
      ...createWasteListingDto,
      user,
    });
    const savedListing = await this.wasteListingRepository.save(wasteListing);
    
    // Upload image if provided
    if (file) {
      const result = await cloudinaryService.uploadImage(file);
      savedListing.imageUrl = result.secure_url;
      savedListing.imagePublicId = result.public_id;
      return this.wasteListingRepository.save(savedListing);
    }
    
    return savedListing;
  }

  async findAll(filters?: FilterWasteListingDto): Promise<any[]> {
    const query = this.wasteListingRepository.createQueryBuilder('wasteListing')
      .leftJoinAndSelect('wasteListing.user', 'user');

    if (filters?.category) {
      query.andWhere('wasteListing.category = :category', { category: filters.category });
    }

    if (filters?.status) {
      query.andWhere('wasteListing.status = :status', { status: filters.status });
    }

    const results = await query.getMany();
    
    // Exclude password from user objects
    return results.map(item => ({
      ...item,
      user: item.user ? this.excludePassword(item.user) : undefined,
    }));
  }

  async findByUser(userId: string): Promise<any[]> {
    const results = await this.wasteListingRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    return results.map(item => ({
      ...item,
      user: item.user ? this.excludePassword(item.user) : undefined,
    }));
  }

  async findOne(id: string): Promise<any> {
    const wasteListing = await this.wasteListingRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!wasteListing) {
      throw new NotFoundException(`WasteListing with ID ${id} not found`);
    }
    return {
      ...wasteListing,
      user: wasteListing.user ? this.excludePassword(wasteListing.user) : undefined,
    };
  }

  private excludePassword(user: User): Omit<User, 'password'> {
    const { password, ...result } = user;
    return result;
  }

  async update(id: string, updateWasteListingDto: UpdateWasteListingDto): Promise<WasteListing> {
    const wasteListing = await this.findOne(id);
    Object.assign(wasteListing, updateWasteListingDto);
    return this.wasteListingRepository.save(wasteListing);
  }

  async remove(id: string): Promise<void> {
    const wasteListing = await this.findOne(id);
    await this.wasteListingRepository.remove(wasteListing);
  }

  async uploadImage(
    id: string,
    file: Express.Multer.File,
    cloudinaryService: CloudinaryService,
  ): Promise<any> {
    const wasteListing = await this.findOne(id);
    
    // Delete old image if exists
    if (wasteListing.imagePublicId) {
      await cloudinaryService.deleteImage(wasteListing.imagePublicId);
    }
    
    // Upload new image
    const result = await cloudinaryService.uploadImage(file);
    
    wasteListing.imageUrl = result.secure_url;
    wasteListing.imagePublicId = result.public_id;
    
    return this.wasteListingRepository.save(wasteListing);
  }
}
