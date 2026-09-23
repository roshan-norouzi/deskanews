# Phase 4 — security gate

Reviewed attack surface: source fetch SSRF, tenant guards, integration secrets, and public media routes.

Fixes in this phase:

- Redis caches publishing settings without API keys, passwords, or bot tokens. A cache hit reloads those secrets from Postgres.
- Image proxy stays behind JWT, tenant, and permission checks, allows only image content types, and sends `nosniff` with `private, no-store`.
- Font, cover-image, and social-media downloads require an HMAC signature when a signing key is configured.

CI:

- `.github/workflows/security.yml` runs a diff-scoped Strix scan on pull requests. Add repository secrets `STRIX_LLM` and `LLM_API_KEY` or that job cannot finish.
- The same workflow runs `pnpm --filter @deska/api test`, which includes the SSRF, tenant, signature, and secret-redaction tests, without those secrets.
