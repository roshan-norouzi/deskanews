FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @deska/shared build
RUN pnpm --filter @deska/api db:generate
RUN pnpm --filter @deska/api build

# The production image must not contain the Nest CLI, TypeScript, test tools,
# or dependencies of other workspace packages. Prisma is deliberately a
# production dependency because the container runs `prisma migrate deploy` at
# startup.
FROM builder AS production-deps
RUN pnpm --filter @deska/api deploy --prod --legacy /production/api
RUN cd /production/api && ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

FROM node:24-alpine AS runner
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/roshan-norouzi/deska"
ENV NODE_ENV=production
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
# Chromium is used only as the final fallback for publishers whose article
# body requires JavaScript. It runs as the unprivileged DESKA user below.
RUN apk add --no-cache chromium font-noto-arabic
RUN addgroup --system --gid 1001 deska && adduser --system --uid 1001 --ingroup deska deska
COPY --from=builder --chown=deska:deska /app/apps/api/dist ./apps/api/dist
COPY --from=production-deps --chown=deska:deska /production/api/package.json ./apps/api/
COPY --from=production-deps --chown=deska:deska /production/api/prisma ./apps/api/prisma
COPY --from=production-deps --chown=deska:deska /production/api/node_modules ./node_modules
RUN mkdir -p /app/uploads && chown -R deska:deska /app/uploads
WORKDIR /app/apps/api
USER deska
EXPOSE 3001
CMD ["sh", "-c", "for attempt in $(seq 1 30); do /app/node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma && exec node dist/main.js; echo \"Database is not ready (attempt $attempt/30); retrying...\"; sleep 3; done; exit 1"]
