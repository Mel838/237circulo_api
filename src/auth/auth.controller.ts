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
import type { User } from "src/user/entities/user.entity";
import type { CreateUserDto } from "../user/dto/user.dto";
import type { AuthService } from "./auth.service";
import type { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
