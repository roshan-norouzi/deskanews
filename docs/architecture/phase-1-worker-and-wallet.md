# Phase 1 — API / worker split and shadow token ledger

## Process role

`DESKA_PROCESS_ROLE`:

| Value | HTTP | Background jobs and interval maintenance |
|-------|------|------------------------------------------|
| `all` (default, local `pnpm dev`) | full API | on |
| `api` | full API | off |
| `worker` | `/api/health*` only | on |

Compose sets `DESKA_BACKGROUND_JOBS_ENABLED=false` on `api` and `true` on `api-worker`. The API service has no Chromium. The worker has no published port and shares the uploads volume.

When the role is `api`, manual fetch, summarize, full translation, WordPress publish, social fetch, social prepare, send-to-social, and network publish are enqueued. The worker runs them. Local `all` still does the work inside the request. Probe, connection tests, and file uploads stay on the HTTP process.

Playwright cover screenshots run only in the `social.cover` job handler, not from an HTTP route.

## Shadow wallet

Priced automation jobs write `WalletLedger` rows (`reserve` → `commit` or `release`) and update `TenantWallet.reservedTokens` / `consumedTokens`.

- Fetch/poll jobs cost 0 tokens.
- `balanceTokens` is not debited and a shortfall never refuses work.
- `reservationId` is stored on the job payload when a reserve is written.

## Not in this phase

- Blocking when the wallet is empty
- Subscription periods and payment gateways
- Reading `UsageMetricDefinition.unitCost` (still a float counter price; wallet prices are the integer map in `billing.service.ts`)
- `retryAllDead` does not reopen a reservation per job
