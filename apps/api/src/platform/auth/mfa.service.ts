import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

const ENCRYPTION_PREFIX = 'enc:v1:';
const RECOVERY_CODE_COUNT = 8;

interface MfaTokenPayload {
  sub: string;
  purpose: 'mfa';
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  requiredRoles(): Set<string> {
    const configured = this.config.get<string>('MFA_REQUIRED_ROLES', 'super_admin,platform_admin')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return new Set(configured);
  }

  isSetupRequired(role: string, totpEnabled: boolean): boolean {
    return !totpEnabled && this.requiredRoles().has(role);
  }

  createMfaToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId, purpose: 'mfa' } satisfies MfaTokenPayload,
      { expiresIn: '5m' },
    );
  }

  verifyMfaToken(token: string): string {
    let payload: MfaTokenPayload;
    try {
      payload = this.jwtService.verify<MfaTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('نشست تأیید دو مرحله‌ای منقضی شده است');
    }
    if (payload.purpose !== 'mfa' || !payload.sub) {
      throw new UnauthorizedException('نشست تأیید دو مرحله‌ای نامعتبر است');
    }
    return payload.sub;
  }

  async beginSetup(userId: string) {
    const user = await this.requireUser(userId);
    if (user.totpEnabled) throw new BadRequestException('تأیید دو مرحله‌ای از قبل فعال است');
    const secret = authenticator.generateSecret();
    const recoveryCodes = this.generateRecoveryCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecretEnc: this.encrypt(secret),
        totpEnabled: false,
        totpVerifiedAt: null,
        mfaRecoveryHashes: recoveryCodes.map((code) => this.hashRecoveryCode(code)),
      },
    });
    return {
      secret,
      otpauthUrl: authenticator.keyuri(user.email, 'DESKA News', secret),
      recoveryCodes,
    };
  }

  async enable(userId: string, code: string) {
    const user = await this.requireUser(userId);
    const secret = this.decryptSecret(user.totpSecretEnc);
    if (!secret) throw new BadRequestException('ابتدا راه‌اندازی تأیید دو مرحله‌ای را شروع کنید');
    if (!this.verifyTotp(secret, code)) throw new BadRequestException('کد تأیید دو مرحله‌ای نادرست است');
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true, totpVerifiedAt: new Date() },
    });
    return { success: true };
  }

  async disable(userId: string, code: string, password: string) {
    const user = await this.requireUser(userId, true);
    const bcrypt = await import('bcrypt');
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) throw new UnauthorizedException('رمز عبور نادرست است');
    const secret = this.decryptSecret(user.totpSecretEnc);
    if (!secret || !this.verifyTotp(secret, code)) {
      throw new BadRequestException('کد تأیید دو مرحله‌ای نادرست است');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: false,
        totpSecretEnc: null,
        totpVerifiedAt: null,
        mfaRecoveryHashes: [],
      },
    });
    return { success: true };
  }

  async verifyChallenge(userId: string, code: string): Promise<'totp' | 'recovery'> {
    const user = await this.requireUser(userId);
    if (!user.totpEnabled) throw new BadRequestException('تأیید دو مرحله‌ای فعال نیست');
    const secret = this.decryptSecret(user.totpSecretEnc);
    if (secret && this.verifyTotp(secret, code)) return 'totp';

    const hashed = this.hashRecoveryCode(code.trim());
    const remaining = user.mfaRecoveryHashes.filter((item) => item !== hashed);
    if (remaining.length === user.mfaRecoveryHashes.length) {
      throw new UnauthorizedException('کد تأیید دو مرحله‌ای نادرست است');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaRecoveryHashes: remaining },
    });
    return 'recovery';
  }

  async status(userId: string) {
    const user = await this.requireUser(userId);
    return {
      enabled: user.totpEnabled,
      setupRequired: this.isSetupRequired(user.role, user.totpEnabled),
      pendingSetup: Boolean(user.totpSecretEnc && !user.totpEnabled),
      recoveryCodesRemaining: user.mfaRecoveryHashes.length,
    };
  }

  private verifyTotp(secret: string, code: string): boolean {
    return authenticator.verify({ token: code.trim(), secret });
  }

  private generateRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase());
  }

  private hashRecoveryCode(code: string): string {
    return createHash('sha256').update(code.trim().toUpperCase(), 'utf8').digest('hex');
  }

  private async requireUser(userId: string, withPassword = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        totpEnabled: true,
        totpSecretEnc: true,
        mfaRecoveryHashes: true,
        ...(withPassword ? { passwordHash: true } : {}),
      },
    });
    if (!user) throw new UnauthorizedException('کاربر یافت نشد');
    return user as typeof user & { passwordHash?: string };
  }

  private decryptSecret(value: string | null | undefined): string | null {
    if (!value) return null;
    return this.decrypt(value);
  }

  private encrypt(value: string): string {
    if (!value || value.startsWith(ENCRYPTION_PREFIX)) return value;
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTION_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decrypt(value: string): string {
    if (!value.startsWith(ENCRYPTION_PREFIX)) return value;
    const key = this.encryptionKey();
    const [ivValue, tagValue, encryptedValue] = value.slice(ENCRYPTION_PREFIX.length).split('.');
    if (!ivValue || !tagValue || !encryptedValue) return '';
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private encryptionKey(): Buffer {
    const configured = this.config.get<string>('SETTINGS_ENCRYPTION_KEY')?.trim()
      || this.config.get<string>('JWT_SECRET')
      || 'deska-development-secret';
    return createHash('sha256').update(configured).digest();
  }
}
