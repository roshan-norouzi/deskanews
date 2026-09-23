# Strix API scan — `/api/publishing`

Run against a **staging or local** API you own. Do not commit tokens.

## Prerequisites

- [Strix CLI](https://docs.strix.ai) (`curl -sSL https://strix.ai/install | bash`)
- Docker (local runs)
- Repository secrets for CI: `STRIX_LLM`, `LLM_API_KEY`

## Targets

| Target | Purpose |
|--------|---------|
| `apps/api` | White-box authz and `SourceReaderService` SSRF |
| `http://127.0.0.1:3001/api` | Live BOLA / function-level authz (with stack running) |

Global prefix: `api`. Controller base: `publishing` → routes like `GET /api/publishing/feeds`.

## Credentials (fill in `strix-publishing-api-instruction.txt`)

1. **Tenant A** — JWT + `X-Tenant-Id`, sample feed/article IDs
2. **Tenant B** — different tenant, same permission level
3. **Low privilege** — e.g. `publishing.view` only (viewer)
4. **High privilege** — owner or `publishing.settings` + `publishing.operations`

## Example command

```bash
pnpm --filter @deska/api start   # port 3001

strix -n \
  -t ./apps/api \
  -t http://host.docker.internal:3001/api \
  --max-budget 20 \
  --instruction-file ./docs/security/strix-publishing-api-instruction.txt
```

## OWASP API focus for this module

- **API1 BOLA**: feeds, news articles, social articles, operations jobs — always use another tenant’s IDs
- **API5 function auth**: `publishing.settings`, `publishing.operations`, `publishing.publish` vs `publishing.view`
- **API3**: `PUT /publishing/settings`, PATCH article DTOs
- **API4**: `POST .../fetch`, bulk feed import, image proxy
- **SSRF**: `GET /publishing/proxy/image?url=`, `POST /publishing/feeds/probe` (server-side fetch)

Out of scope unless explicitly testing: destructive mass ops, live WordPress/social publish to production destinations.

## Results

See `strix_runs/<run>/penetration_test_report.md` and replay PoCs before ticketing.
