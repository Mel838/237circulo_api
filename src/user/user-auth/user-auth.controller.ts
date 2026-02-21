import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import  { User } from "src/user/entities/user.entity";
import  { CreateUserDto } from "src/user/dto/create-user.dto";
import  { UserAuthService } from "./user-auth.service";
import  { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class UserAuthController {
  constructor(private readonly authService: UserAuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() createUserDto: CreateUserDto) {
    return {
      success: true,
      data: await this.authService.register(createUserDto),
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return {
      success: true,
      data: await this.authService.login(loginDto),
    };
  }

  @Get("all")
  @HttpCode(HttpStatus.OK)
  async getProfile(@Req() req: any) {
    return {
      success: true,
      data: await this.authService.getUser(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get("profile")
  @HttpCode(HttpStatus.OK)
  async getMe(@Req() req: any) {
    return {
      success: true,
      data: await this.authService.getUserById(req.user.id),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Put("update")
  @HttpCode(HttpStatus.OK)
  async updateUser(@Req() req: any, @Body() updateData: Partial<User>) {
    return {
      success: true,
      data: await this.authService.updateUser(req.user.id, updateData),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete("delete")
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Req() req: any) {
    return {
      success: true,
      data: await this.authService.deleteUser(req.user.id),
    };
  }
}