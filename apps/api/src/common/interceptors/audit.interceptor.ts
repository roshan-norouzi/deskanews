import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { ActivityService, AuditService } from '../services/audit.service';

const SENSITIVE_KEY = /password|token|secret|authorization|cookie|api[-_]?key|private[-_]?key|national[-_]?id|birth|bank|iban|card|account|address|postal|phone|mobile|landline|father|mother|insurance/iu;
const SKIPPED_PATH = /^\/api\/(?:auth\/(?:login|refresh)|health)(?:\/|$)/u;
const AUDIT_VALUE_ALLOWLIST = new Set([
  'status', 'enabled', 'isActive', 'role', 'moduleId', 'type', 'purpose',
  'network', 'action', 'accepted', 'decision',
]);

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[TRUNCATED]';
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Buffer.isBuffer(value)) return `[BUFFER:${value.length}]`;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeAuditValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeAuditValue(item, depth + 1),
    ]));
  }
  return String(value);
}

export function summarizeAuditBody(value: unknown): { fields: string[]; safeValues: Record<string, unknown> } {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value)) {
    return { fields: [], safeValues: {} };
  }
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 50);
  const safeValues = Object.fromEntries(entries
    .filter(([key, item]) => AUDIT_VALUE_ALLOWLIST.has(key) && ['string', 'number', 'boolean'].includes(typeof item))
    .map(([key, item]) => [key, sanitizeAuditValue(item)]));
  return { fields: entries.map(([key]) => key), safeValues };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly activities: ActivityService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & {
      tenant?: { tenantId?: string };
      user?: { id?: string };
      requestId?: string;
    }>();
    const method = request.method.toUpperCase();
    const path = request.originalUrl.split('?')[0];
    if (['GET', 'HEAD', 'OPTIONS'].includes(method) || SKIPPED_PATH.test(path)) return next.handle();
    const startedAt = Date.now();
    const tenantId = request.tenant?.tenantId;
    const userId = request.user?.id;
    const entityId = String(request.params?.id || request.params?.articleId || request.params?.reportId || 'collection');
    const entityType = path.replace(/^\/api\//u, '').split('/').filter((part) => !/^[a-z0-9]{20,}$/iu.test(part)).slice(0, 4).join('.');
    const body = summarizeAuditBody(request.body);
    const write = (outcome: 'success' | 'failure', error?: unknown) => {
      const changes = {
        outcome,
        method,
        path,
        requestId: request.requestId,
        durationMs: Date.now() - startedAt,
        body,
        ...(error ? { error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000) } : {}),
      };
      void this.audit.log({ tenantId, userId, action: `${method.toLowerCase()}.${outcome}`, entityType, entityId, changes, ipAddress: request.ip }).catch(() => undefined);
      if (tenantId && outcome === 'success') {
        void this.activities.create({
          tenantId,
          userId,
          type: `http.${method.toLowerCase()}`,
          title: `${method} ${path.replace(/^\/api\//u, '')}`,
          entityType,
          entityId,
          metadata: { requestId: request.requestId, durationMs: Date.now() - startedAt },
        }).catch(() => undefined);
      }
    };
    return next.handle().pipe(tap({ next: () => write('success'), error: (error) => write('failure', error) }));
  }
}
