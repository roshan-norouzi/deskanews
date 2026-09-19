import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

@Injectable()
export class SecretProtectionService {
  private readonly key: Buffer;
  private readonly previousKey?: Buffer;

  constructor(config: ConfigService) {
    const explicitKey = config.get<string>('SETTINGS_ENCRYPTION_KEY')?.trim();
    const production = config.get<string>('NODE_ENV') === 'production' || process.env.NODE_ENV === 'production';
    if (production && !explicitKey) {
      throw new Error('SETTINGS_ENCRYPTION_KEY is required in production');
    }
    const configured = explicitKey
      || config.get<string>('JWT_SECRET')
      || 'deska-development-secret';
    if (!configured) {
      throw new Error('SETTINGS_ENCRYPTION_KEY is required');
    }
    this.key = createHash('sha256').update(configured).digest();

    // A previous key is accepted only for decryption. This lets production
    // deployments rotate an unsafe key without losing already-encrypted
    // integration credentials. New values are always encrypted with `key`.
    const previous = config.get<string>('SETTINGS_ENCRYPTION_KEY_PREVIOUS')?.trim();
    if (previous && previous !== configured) {
      this.previousKey = createHash('sha256').update(previous).digest();
    }
  }

  encrypt(value: string): string {
    if (!value || value.startsWith(PREFIX)) return value;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(value: string): string {
    if (!value.startsWith(PREFIX)) return value;
    return this.decryptWithKey(value, this.key) ?? (this.previousKey ? this.decryptWithKey(value, this.previousKey) ?? '' : '');
  }

  private decryptWithKey(value: string, key: Buffer): string | null {
    try {
      const [ivValue, tagValue, encryptedValue] = value.slice(PREFIX.length).split('.');
      if (!ivValue || !tagValue || !encryptedValue) return null;
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
