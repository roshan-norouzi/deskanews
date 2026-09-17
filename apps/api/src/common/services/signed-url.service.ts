import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

@Injectable()
export class SignedUrlService {
  constructor(private readonly config: ConfigService) {}

  sign(path: string, expiresInSeconds = 3600): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const exp = Math.floor(Date.now() / 1000) + Math.max(60, expiresInSeconds);
    const signature = this.digest(`${normalizedPath}:${exp}`);
    return `${normalizedPath}?exp=${exp}&sig=${signature}`;
  }

  assertValid(path: string, expRaw?: string, sigRaw?: string): void {
    const exp = Number.parseInt(String(expRaw ?? ''), 10);
    const sig = String(sigRaw ?? '').trim();
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000) || !/^[a-f0-9]{64}$/iu.test(sig)) {
      throw new UnauthorizedException('لینک رسانه منقضی یا نامعتبر است');
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const expected = this.digest(`${normalizedPath}:${exp}`);
    const provided = Buffer.from(sig, 'utf8');
    const reference = Buffer.from(expected, 'utf8');
    if (provided.length !== reference.length || !timingSafeEqual(provided, reference)) {
      throw new UnauthorizedException('لینک رسانه منقضی یا نامعتبر است');
    }
  }

  private digest(payload: string): string {
    return createHmac('sha256', this.signingSecret()).update(payload, 'utf8').digest('hex');
  }

  private signingSecret(): string {
    const dedicated = this.config.get<string>('ASSET_SIGNING_SECRET')?.trim();
    if (dedicated) return dedicated;
    const jwtSecret = this.config.get<string>('JWT_SECRET')?.trim();
    if (jwtSecret) return jwtSecret;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ASSET_SIGNING_SECRET or JWT_SECRET must be configured in production');
    }
    return 'deska-development-asset-signing-secret';
  }
}
