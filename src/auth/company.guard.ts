import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class CompanyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('No autenticado');
    }

    const resourceCompanyId =
      req.params.companyId || req.body.companyId || req.query.companyId;

    if (
      resourceCompanyId &&
      Number(resourceCompanyId) !== Number(user.companyId)
    ) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }

    return true;
  }
}
