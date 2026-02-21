import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  max,
} from "class-validator";

export enum Language {
  English = "English",
  French = "French",
  Pigin = "Pigin",
}
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsNumber()
  point_balance: number;

  @IsEnum(Language)
  pref_lang: Language;

  @IsString()
  quartier: string;

  @IsString()
  town: string;
}
