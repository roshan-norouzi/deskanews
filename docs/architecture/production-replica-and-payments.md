# Production wiring

## Read replica

Compose starts `postgres` as a primary (`wal_level=replica`) and `postgres-replica` from `pg_basebackup`. API and worker set `DATABASE_REPLICA_URL` to `postgres-replica`. Writes stay on `postgres`.

`REPLICATOR_PASSWORD` defaults to `replicator-secret`. Change it before any shared environment.

## Payment gateway

The gateway does not credit tokens itself. It sends:

`POST /api/payments/webhook`

Header `x-payment-signature` is HMAC-SHA256 of the `paymentId`, base64url, using `PAYMENT_WEBHOOK_SECRET`.

That route calls `BillingService.confirmPayment` and nothing else. Super admins configure the provider, webhook secret, and pending-payment approval under **Platform → Settings → Payment gateway**. Organization credits are under **Platform → Settings → Organization wallet**.

The environment variable `PAYMENT_WEBHOOK_SECRET` overrides the encrypted secret stored in `PlatformConfig` when set.

## Strix

Set GitHub Actions secrets `STRIX_LLM` and `LLM_API_KEY` when the live pull-request scan should run. If they are absent, that scan is skipped and the API test job still gates the pull request.
