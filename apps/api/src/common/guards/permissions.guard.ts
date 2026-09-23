import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/metadata.decorator';
import { memberHasPermission } from '@deska/shared';

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

    const permissions: string[] = user?.permissions ?? [];
    if (permissions.includes('*')) return true;

    const requiresPublishingSettings = required.some((permission) => permission === 'publishing.settings');
    if (requiresPublishingSettings && request.tenant?.memberRole !== 'owner') {
      if (!permissions.includes('publishing.settings') && !permissions.includes('*')) {
        throw new ForbiddenException('تنظیمات انتشار فقط برای مالک یا اعضایی که این دسترسی را دارند مجاز است');
      }
    }

    const hasAll = required.every((p) => this.hasPermission(permissions, p));

    if (!hasAll) {
      throw new ForbiddenException('دسترسی کافی ندارید');
    }

    return true;
  }

  private hasPermission(permissions: string[], required: string): boolean {
    return memberHasPermission(permissions, required);
  }
}
