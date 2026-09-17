import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isCoreModule } from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MODULE_KEY } from '../decorators/metadata.decorator';

@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleId = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!moduleId) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId = request.tenant?.tenantId;
    if (!tenantId) return false;

    if (isCoreModule(moduleId)) return true;

    const tenantModule = await this.prisma.tenantModule.findUnique({
      where: { tenantId_moduleId: { tenantId, moduleId } },
    });

    if (!tenantModule?.enabled) {
      throw new ForbiddenException(`ماژول ${moduleId} فعال نیست`);
    }
    return true;
  }
}
