import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Shared Redis cache. No-ops when REDIS_URL is unset so local dev keeps working. */
@Injectable()
export class RedisCache {
  private readonly logger = new Logger(RedisCache.name);
  private client: Redis | null = null;

  constructor(@Optional() private readonly config?: ConfigService) {}

  url(): string {
    return (this.config?.get<string>('REDIS_URL') ?? process.env.REDIS_URL ?? '').trim();
  }

  enabled(): boolean {
    return this.url().length > 0;
  }

  async get(key: string): Promise<string | null> {
    const redis = this.redis();
    if (!redis) return null;
    try {
      return await redis.get(key);
    } catch (error) {
      this.logger.warn(`Redis get failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const redis = this.redis();
    if (!redis) return;
    try {
      await redis.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis set failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async del(key: string): Promise<void> {
    const redis = this.redis();
    if (!redis) return;
    try {
      await redis.del(key);
    } catch (error) {
      this.logger.warn(`Redis del failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private redis(): Redis | null {
    if (!this.enabled()) return null;
    if (!this.client) {
      this.client = new Redis(this.url(), { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    }
    return this.client;
  }
}
