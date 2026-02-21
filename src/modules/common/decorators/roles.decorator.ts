import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Attach allowed roles to a route handler or controller.
 * Used together with RolesGuard.
 *
 * @example
 * @Roles('admin', 'ngo')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * getAdminData() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
