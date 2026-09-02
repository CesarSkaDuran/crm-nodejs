import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';

export const ROLES_KEY = 'roles';

/**
 * Decorador para restringir endpoints a uno o más roles.
 *
 * Ejemplo:
 *   @Roles(UserRole.ADMIN, UserRole.CONTADOR)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Post()
 *   create(...) { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
