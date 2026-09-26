import type { NextConfig } from 'next';

const development = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  // Keep `next dev` artifacts separate from production builds. Running a
  // production build while Hot Reload is active must never invalidate the
  // development webpack manifest in the browser.
  distDir: development ? '.next-dev' : '.next',
  ...(process.env.DOCKER_BUILD === 'true' ? { output: 'standalone' as const } : {}),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  transpilePackages: ['@deska/shared'],
  serverActions: {
    bodySizeLimit: '15mb',
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // Next.js may truncate proxied multipart bodies without this (Excel bulk import).
    proxyClientMaxBodySize: '15mb',
  } as NextConfig['experimental'],
  // /api/* is proxied by apps/web/src/app/api/[...path]/route.ts (retries + timeouts).
  // Do not add rewrites here; they bypass that handler and fail silently on API restarts.
  async headers() {
    const production = process.env.NODE_ENV === 'production';
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // The browser only talks to same-origin /api; data:/blob: cover image conversions use fetch().
      `connect-src 'self' data: blob:${production ? '' : ' ws: wss:'}`,
      ...(production ? ['upgrade-insecure-requests'] : []),
    ].join('; ');
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        {
          key: 'Content-Security-Policy',
          value: contentSecurityPolicy,
        },
        ...(production
          ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
          : []),
      ],
    }];
  },
};

export default nextConfig;
