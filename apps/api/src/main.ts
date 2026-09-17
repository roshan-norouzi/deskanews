import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { config } from 'dotenv';
import { join } from 'path';
import helmet from 'helmet';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

// Load .env from monorepo root when running from apps/api
config({ path: join(process.cwd(), '.env') });
config({ path: join(process.cwd(), '..', '..', '.env') });

const WEAK_PRODUCTION_SECRETS = new Set([
  'dev-secret',
  'deska-development-secret',
  'change-this-in-production',
  'change-this-to-a-long-random-secret-in-production',
]);

function assertProductionConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  const jwtSecret = process.env.JWT_SECRET?.trim() ?? '';
  if (jwtSecret.length < 32 || WEAK_PRODUCTION_SECRETS.has(jwtSecret)) {
    throw new Error('JWT_SECRET must be a unique random value of at least 32 characters in production');
  }
  const encryptionKey = process.env.SETTINGS_ENCRYPTION_KEY?.trim() ?? '';
  if (encryptionKey.length < 32) {
    throw new Error('SETTINGS_ENCRYPTION_KEY must contain at least 32 characters in production');
  }
  if (WEAK_PRODUCTION_SECRETS.has(encryptionKey)) {
    throw new Error('SETTINGS_ENCRYPTION_KEY must not use a known placeholder value in production');
  }
  if (encryptionKey === jwtSecret) {
    throw new Error('SETTINGS_ENCRYPTION_KEY must not reuse JWT_SECRET in production');
  }
  const previousEncryptionKey = process.env.SETTINGS_ENCRYPTION_KEY_PREVIOUS?.trim();
  if (previousEncryptionKey === encryptionKey) {
    throw new Error('SETTINGS_ENCRYPTION_KEY_PREVIOUS must differ from SETTINGS_ENCRYPTION_KEY');
  }

  const corsOrigins = (process.env.CORS_ORIGIN ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!corsOrigins.length || corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN must contain explicit trusted origins in production');
  }
  for (const origin of corsOrigins) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error(`Invalid CORS origin: ${origin}`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
  }
}

async function bootstrap() {
  assertProductionConfiguration();
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((item) => item.trim().replace(/\/$/u, ''))
    .filter(Boolean);
  const trustedOrigins = new Set(corsOrigins);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const incoming = request.header('x-request-id')?.trim();
    const requestId = incoming && /^[a-zA-Z0-9._-]{1,100}$/.test(incoming) ? incoming : randomUUID();
    response.setHeader('X-Request-Id', requestId);
    (request as Request & { requestId?: string }).requestId = requestId;
    next();
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
    const cookieAuthenticated = /(?:^|;\s*)deska_(?:access|refresh)_token=/u.test(request.headers.cookie ?? '');
    const origin = request.header('origin')?.trim().replace(/\/$/u, '');
    const fetchSite = request.header('sec-fetch-site');
    if (
      unsafeMethod
      && cookieAuthenticated
      && ((origin && !trustedOrigins.has(origin)) || (!origin && fetchSite === 'cross-site'))
    ) {
      response.status(403).json({
        statusCode: 403,
        message: 'مبدأ درخواست مجاز نیست',
        timestamp: new Date().toISOString(),
        path: request.originalUrl,
        requestId: (request as Request & { requestId?: string }).requestId ?? null,
      });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10);
  if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 3) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 3');
  }
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`DESKA ERP API running on port ${port}`);
}

bootstrap();
