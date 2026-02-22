import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { IsEnum, IsString } from 'class-validator';

export enum WasteCategory {
    Other = 'Other',
    Recycling_materials = 'Recycling Materials',
    Metal_Recycling = 'Metal Recycling',
    Glass_Recycling = 'Glass Recycling',
    Organic_Recycling = 'Organic Products',
    E_Waste = 'E-Waste',
    Eco_Product= 'Eco-Products',
}

export enum Status {
    Pending = 'Pending',
    Collected = 'Collected',
    Cancelled = 'Cancelled',
    Available = 'Available',
}

@Entity("waste_listings")
export class WasteListing {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, (user) => user.wasteListings, { eager: false, nullable: true })
    user: User;

    @Column({nullable: true})
    @IsString()
    description: string;

    @Column({type: 'enum', enum: WasteCategory,default: WasteCategory.Other, nullable: true})
    @IsEnum(WasteCategory)
    category: WasteCategory;

    @Column({nullable: true})
    @IsString()
    location: string;

    @Column({type: 'enum', enum: Status,default: Status.Available, nullable: true})
    @IsEnum(Status)
    status: Status;

    @Column({ type: 'float', nullable: true })
    weight: number;

    @Column({ type: 'float', nullable: true })
    price: number;

    @Column({ nullable: true })
    imageUrl: string;

    @Column({ nullable: true })
    imagePublicId: string;

}
