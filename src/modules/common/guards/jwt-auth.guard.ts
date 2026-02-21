import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * JWT authentication guard.
 * Placeholder until @nestjs/jwt + JwtModule are wired up.
 * Currently falls back to the API-key pattern used elsewhere in the project.
 * Replace with AuthGuard('jwt') once JwtStrategy is implemented.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const expected = process.env.INTERNAL_API_KEY;

    // If no key is configured, allow all requests (dev mode)
    if (!expected) return true;

    const provided =
      (request.headers["x-api-key"] as string | undefined) ??
      request.headers.authorization?.replace("Bearer ", "") ??
      "";

    if (provided !== expected) {
      throw new UnauthorizedException("Invalid API key");
    }

    return true;
  }
}
