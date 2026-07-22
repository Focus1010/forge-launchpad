import { Redis } from '@upstash/redis';
import { config, hasRedis } from '../config.js';

/**
 * Redis access layer.
 *
 * In production this talks to Upstash over REST. When credentials are absent
 * (local UI work, CI) it falls back to an in-memory store implementing the same
 * subset of commands the app uses. The rest of the codebase depends only on the
 * `RedisLike` interface, so it never knows which backend is active.
 */
export interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  zadd(key: string, member: { score: number; member: string }): Promise<void>;
  zrange<T = string>(key: string, min: number, max: number, byScore: boolean): Promise<T[]>;
  zcard(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  incrByFloat(key: string, amount: number): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

/** Minimal in-memory implementation used when Upstash is not configured. */
class MemoryRedis implements RedisLike {
  private store = new Map<string, unknown>();
  private sortedSets = new Map<string, Array<{ score: number; member: string }>>();
  private sets = new Map<string, Set<string>>();

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.store.has(key) ? (this.store.get(key) as T) : null);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.sortedSets.delete(key);
    this.sets.delete(key);
  }

  async zadd(key: string, member: { score: number; member: string }): Promise<void> {
    const list = this.sortedSets.get(key) ?? [];
    const existing = list.findIndex((item) => item.member === member.member);
    if (existing >= 0) list.splice(existing, 1);
    list.push(member);
    list.sort((a, b) => a.score - b.score);
    this.sortedSets.set(key, list);
  }

  async zrange<T = string>(key: string, min: number, max: number, _byScore: boolean): Promise<T[]> {
    const list = this.sortedSets.get(key) ?? [];
    return list
      .filter((item) => item.score >= min && item.score <= max)
      .map((item) => item.member as unknown as T);
  }

  async zcard(key: string): Promise<number> {
    return (this.sortedSets.get(key) ?? []).length;
  }

  async sadd(key: string, member: string): Promise<void> {
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(member);
    this.sets.set(key, set);
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? []);
  }

  async incrByFloat(key: string, amount: number): Promise<number> {
    const current = Number(this.store.get(key) ?? 0);
    const next = current + amount;
    this.store.set(key, next);
    return next;
  }

  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace(/\*$/, '');
    const allKeys = new Set<string>([
      ...this.store.keys(),
      ...this.sortedSets.keys(),
      ...this.sets.keys(),
    ]);
    return Array.from(allKeys).filter((key) => key.startsWith(prefix));
  }
}

/** Adapter over the Upstash REST client matching RedisLike. */
class UpstashRedis implements RedisLike {
  constructor(private readonly client: Redis) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    return (await this.client.get<T>(key)) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async zadd(key: string, member: { score: number; member: string }): Promise<void> {
    await this.client.zadd(key, member);
  }

  async zrange<T = string>(key: string, min: number, max: number, byScore: boolean): Promise<T[]> {
    return this.client.zrange<T[]>(key, min, max, byScore ? { byScore: true } : {});
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async sadd(key: string, member: string): Promise<void> {
    await this.client.sadd(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async incrByFloat(key: string, amount: number): Promise<number> {
    return this.client.incrbyfloat(key, amount);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }
}

function createRedis(): RedisLike {
  if (hasRedis) {
    const client = new Redis({
      url: config.UPSTASH_REDIS_REST_URL!,
      token: config.UPSTASH_REDIS_REST_TOKEN!,
    });
    return new UpstashRedis(client);
  }
  // eslint-disable-next-line no-console
  console.warn('[redis] No Upstash credentials found. Using in-memory store (data is not persisted).');
  return new MemoryRedis();
}

export const redis = createRedis();

/** Centralized Redis key builders so key formats never drift across services. */
export const keys = {
  token: (address: string) => `token:${address}`,
  tokenSet: 'tokens:all',
  tokensByCreator: (creator: string) => `tokens:creator:${creator}`,
  candles: (address: string) => `candles:${address}`,
  trades: (address: string) => `trades:${address}`,
  feed: 'feed:events',
  symbolSet: 'symbols:all',
  volume24h: (address: string) => `volume:${address}`,
  follows: (wallet: string) => `follows:${wallet}`,
  followers: (wallet: string) => `followers:${wallet}`,
  bridgeEmails: 'bridge:emails',
};
