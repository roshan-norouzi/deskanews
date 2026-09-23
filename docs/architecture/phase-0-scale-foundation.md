# Phase 0 — Scale foundation (Deska News)

## Goals

- Run multiple API replicas without duplicate **interval maintenance** (feed poll enqueue, catalog health, queue prune).
- Keep **automation job workers** on every replica (Postgres claim is already safe).
- Decouple **platform tenant** from direct `PlatformFeedService` imports.
- Prepare for Phase 1 (dedicated worker tier, Redis, object storage).

## Scheduler lease

- Table: `SchedulerLease` (`global-interval` row seeded by migration).
- Service: `SchedulerLeaseService.tryAcquire(key, holder, ttlMs)`.
- Wrapper: `SchedulerRuntimeService.runIntervalMaintenance(task, fn)`.

Only the replica that holds the lease runs:

- `smart-publishing-newsroom-maintenance`
- `smart-publishing-social-maintenance`
- `platform-feed-maintenance`
- `platform-feed-health`
- `publishing-durable-job-maintenance`

`publishing-durable-job-worker` (every 2s) runs on **all** replicas when background jobs are enabled.

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `DESKA_BACKGROUND_JOBS_ENABLED` | `true` | Master switch for job worker loop |
| `DESKA_INTERVAL_MAINTENANCE_ENABLED` | `true` | Interval maintenance (requires lease) |

Phase 1 preview:

- API-only pods: `DESKA_INTERVAL_MAINTENANCE_ENABLED=false` (optional) and later `DESKA_BACKGROUND_JOBS_ENABLED=false`.
- Worker-only pods: HTTP disabled separately (not in Phase 0).

## Tenant ↔ publishing boundary

- Port: `TENANT_PUBLISHING_PORT` / `TenantPublishingPort` in `apps/api/src/contracts/tenant-publishing.port.ts`.
- Implementation: `TenantPublishingFacade` in smart-publishing module.
- `TenantModule` no longer imports `SmartPublishingModule`.

## Operations

After deploy, apply migration:

```bash
pnpm --filter @deska/api db:migrate:deploy
```

Verify lease row:

```sql
SELECT * FROM "SchedulerLease" WHERE key = 'global-interval';
```

## Next (Phase 1)

- Dedicated worker deployment (`DESKA_BACKGROUND_JOBS_ENABLED=true` only on workers).
- Redis + BullMQ for execution; Postgres `AutomationJob` as audit source of truth or migrate fully.
- S3-compatible media storage; read replica for list endpoints.
