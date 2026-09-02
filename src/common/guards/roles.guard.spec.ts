import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createContext = (rol: UserRole | null): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: rol ? { rol } : null,
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('permite el acceso si no hay @Roles definido', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);
    const context = createContext(UserRole.CONSULTA);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite el acceso si el usuario tiene el rol requerido', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    const context = createContext(UserRole.ADMIN);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('niega el acceso si el usuario no tiene el rol requerido', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    const context = createContext(UserRole.VENDEDOR);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('niega el acceso si no hay usuario', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue([UserRole.ADMIN]);
    const context = createContext(null);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
