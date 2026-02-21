
import { IsEnum, IsOptional, IsString } from "class-validator";
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

export enum Language {
  English = "English",
  French = "French",
  Pigin = "Pigin",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  name?: string;

  @Column({ unique: true, nullable: true })
  @IsString()
  @IsOptional()
  email?: string;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  password?: string;

  @Column({ type: "int", default: 0 })
  point_balance: number;

  @Column({
    type: "enum",
    enum: Language,
    default: Language.English,
    nullable: true,
  })
  @IsEnum(Language)
  @IsOptional()
  pref_lang: Language;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  quartier?: string;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  town?: string;
}

