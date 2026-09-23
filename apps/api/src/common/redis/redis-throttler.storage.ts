import { Logger } from '@nestjs/common';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import { RedisCache } from './redis-cache';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl <= 0 and hits > tonumber(ARGV[3]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[2])
  blockTtl = tonumber(ARGV[2])
end
return {hits, ttl, blockTtl}
`;

/** Shares rate-limit counters across API replicas; uses process memory when Redis is unavailable. */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly memory = new ThrottlerStorageService();

  constructor(private readonly cache: RedisCache = new RedisCache()) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const redis = this.cache.redis();
    if (!redis) return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    try {
      const base = `deska:throttle:${throttlerName}:${key}`;
      const [hits, ttlMs, blockMs] = await redis.eval(
        INCREMENT_SCRIPT,
        2,
        `${base}:hits`,
        `${base}:block`,
        String(ttl),
        String(Math.max(1, blockDuration)),
        String(limit),
      ) as [number, number, number];
      return {
        totalHits: hits,
        timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
        isBlocked: blockMs > 0,
        timeToBlockExpire: Math.max(0, Math.ceil(blockMs / 1000)),
      };
    } catch (error) {
      this.logger.warn(`Redis rate limit unavailable, using process memory: ${error instanceof Error ? error.message : 'unknown error'}`);
      return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
