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
      `connect-src 'self' https:${production ? '' : ' ws: wss:'}`,
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
  async rewrites() {
    // Next.js performs this rewrite from inside the web container, so Docker
    // must use the Compose service name instead of the host's localhost.
    // A prebuilt image always talks to the Compose service, never localhost.
    // This keeps Registry-based deployments independent from build-time cache.
    const apiUrl = process.env.DOCKER_BUILD === 'true'
      ? 'http://api:3001'
      : (process.env.API_URL ?? 'http://localhost:3001');
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
