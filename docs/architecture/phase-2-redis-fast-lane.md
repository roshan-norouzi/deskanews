# Phase 2 — Redis fast lane

`REDIS_URL` turns on:

- BullMQ queue `deska-fast-lane` for `news.prepare` and `social.cover`
- Postgres `AutomationJob` remains the audit and dedupe record
- The 2-second poller skips those two types while Redis is configured
- A 15-second sweep re-pushes any queued fast-lane row the worker missed
- Cache: tenant publishing settings (60s), WordPress categories (10m), missing source icons (24h)

Without `REDIS_URL`, those jobs stay on the Postgres poller. Local `pnpm dev` does not require Redis.

Compose service `redis` is wired into `api` and `api-worker`. Only the worker process consumes the BullMQ queue.
