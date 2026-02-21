import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { GoogleUser } from "./interfaces/google-user.interface";

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

    // Get frontend URL from environment
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";

    // Redirect to frontend with token as query parameter
    // In production, you'd use HttpOnly cookies instead
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }

  @Get("status")
  async getAuthStatus(
    @Req() req: Request,
  ): Promise<{ authenticated: boolean }> {
    return { authenticated: !!req.user };
  }
}
