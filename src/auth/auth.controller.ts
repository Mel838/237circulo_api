import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";
import type { AuthService } from "./auth.service";
import type { GoogleUser } from "./interfaces/google-user.interface";

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: GoogleUser;
    }
  }
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("google")
  @UseGuards(AuthGuard("google"))
  async googleAuth() {
    // Initiates Google OAuth flow - redirects to Google
  }

  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleAuthRedirect(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const user = req.user as GoogleUser;

    // Validate and process the user
    const validatedUser = await this.authService.validateGoogleUser(user);

    // Generate JWT token
    const token = this.authService.generateToken(validatedUser);

    // TODO: Redirect to frontend with token or set HttpOnly cookie
    // For now, we'll return JSON
    res.json({
      message: "Login successful",
      user: validatedUser,
      token,
    });
  }

  @Get("status")
  async getAuthStatus(
    @Req() req: Request,
  ): Promise<{ authenticated: boolean }> {
    return { authenticated: !!req.user };
  }
}
