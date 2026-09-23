import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveProcessRole, workerHttpAllowed } from '../process-role';

@Injectable()
export class WorkerHttpGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ path?: string; url?: string }>();
    const path = request.path || request.url || '';
    const role = resolveProcessRole(this.config.get<string>('DESKA_PROCESS_ROLE'));
    if (workerHttpAllowed(role, path)) return true;
    throw new NotFoundException();
  }
}
