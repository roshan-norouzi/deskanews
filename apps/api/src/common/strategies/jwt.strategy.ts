import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

const ACCESS_COOKIE_NAME = 'deska_access_token';

function tokenFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== ACCESS_COOKIE_NAME) continue;
    const value = cookie.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      // Keep API clients using Bearer tokens compatible while preferring their
      // explicit credential over the browser-managed HttpOnly cookie.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        tokenFromCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string; iat?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        isActive: true,
        passwordChangedAt: true,
        sessionsInvalidatedAt: true,
      },
    });

    if (!user?.isActive || user.status !== 'active') return null;
    const invalidAfter = [user.passwordChangedAt, user.sessionsInvalidatedAt]
      .filter((value): value is Date => value instanceof Date)
      .reduce<Date | null>((latest, value) => !latest || value > latest ? value : latest, null);
    if (invalidAfter && (!payload.iat || payload.iat < Math.floor(invalidAfter.getTime() / 1000))) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      // Tenant-scoped permissions are resolved by TenantGuard only after the
      // active tenant membership has been verified.
      permissions: user.role === 'super_admin' ? ['*'] : [],
    };
  }
}
