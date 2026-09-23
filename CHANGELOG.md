# Changelog

All notable releases of Deska News follow [Semantic Versioning](https://semver.org/).

## 1.0.30 — 2026-09-23

- Fix deploy status polling (GitHub workflow API id + fallback listing)
- Production compose: read replica is opt-in (`COMPOSE_PROFILES=read-replica`); API no longer blocks on replica health by default

## 1.0.29 — 2026-09-23

- Fix invalid `deploy.yml` YAML (heredoc broke `workflow_dispatch`; deploy dispatch works again)
- Production deploy uploads and normalizes `deploy/postgres/*` bind-mount files on the server

## 1.0.28 — 2026-09-23

- Deploy pipeline uploads PostgreSQL support files; server script repairs mistaken Docker directory mounts

## 1.0.7 — 2026-09-20

- Destination category sync from WordPress with admin approve/reject workflow
- Newsroom articles auto-categorized to approved destination categories (AI with general fallback)
- Category filter and manual reassignment in newsroom UI
- Database migration: `DestinationCategory` model and article category fields

## 1.0.6 — 2026-09-20

- Fix Prisma migration chain drift so CI and production deploy stay in sync with `schema.prisma`

## 1.0.5 — 2026-09-20

- Bulk Excel import/export for platform catalog (super admin) and org custom news feeds
- Organization news sources page: card grid layout with enable/disable and edit icon actions
- Feed logos auto-extracted from source domain; super admin can override logo URL in default catalog
- Database migration: `logoUrl` on platform and tenant news feeds

## 1.0.0 — 2026-09-19

Initial production release of **Deska News** (SaaS B2B newsroom for Iranian newsrooms).

- Multi-tenant newsroom, platform feed catalog, and publishing automation
- WordPress / destination site publishing and social studio
- Platform admin: AI settings, usage metrics, source-fetch Worker
- Production URL: https://app.deska.ir
