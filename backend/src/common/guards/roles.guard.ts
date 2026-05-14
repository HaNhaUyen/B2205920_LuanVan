import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      Array<'admin' | 'user'>
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: string } | undefined;
    return !!user?.role && requiredRoles.includes(user.role as any);
  }
}
