import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/metadata.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.role === 'super_admin') return true;

    const ownerOnly = required.some((permission) =>
      permission === 'modules.manage' || permission === 'publishing.settings',
    );
    if (ownerOnly && request.tenant?.memberRole !== 'owner') {
      throw new ForbiddenException('این تنظیمات فقط در اختیار مالک سازمان است');
    }

    const permissions: string[] = user?.permissions ?? [];
    if (permissions.includes('*')) return true;

    const hasAll = required.every((p) => this.hasPermission(permissions, p));

    if (!hasAll) {
      throw new ForbiddenException('دسترسی کافی ندارید');
    }

    return true;
  }

  private hasPermission(permissions: string[], required: string): boolean {
    return permissions.includes(required);
  }
}
