import type { ForgeToken, Trade, FeedEvent } from '@forge/shared';
import { redis, keys } from './redis.js';

/**
 * Persistence helpers for tokens, trades, and feed events. Both the simulator
 * and the onchain indexer write through these functions so the data structures
 * stay identical regardless of source.
 */

const FEED_MAX = 500;
const TRADES_MAX = 200;

/** Store or update a token record and register it in the global set. */
export async function saveToken(token: ForgeToken): Promise<void> {
  await redis.set(keys.token(token.address), token);
  await redis.sadd(keys.tokenSet, token.address);
  await redis.sadd(keys.tokensByCreator(token.creator), token.address);
  await redis.sadd(keys.symbolSet, token.symbol.toUpperCase());
}

/** Read a single token by address. */
export async function getToken(address: string): Promise<ForgeToken | null> {
  return redis.get<ForgeToken>(keys.token(address));
}

/** Read every token, newest first. */
export async function getAllTokens(): Promise<ForgeToken[]> {
  const addresses = await redis.smembers(keys.tokenSet);
  const tokens = await Promise.all(addresses.map((address) => getToken(address)));
  return tokens
    .filter((token): token is ForgeToken => token !== null)
    .sort((a, b) => b.launchedAt - a.launchedAt);
}

/** True if a ticker symbol is already taken. */
export async function symbolExists(symbol: string): Promise<boolean> {
  const symbols = await redis.smembers(keys.symbolSet);
  return symbols.includes(symbol.toUpperCase());
}

/** Append a trade to a token's history, capped at TRADES_MAX most recent. */
export async function saveTrade(trade: Trade): Promise<void> {
  await redis.zadd(keys.trades(trade.tokenAddress), {
    score: trade.timestamp,
    member: JSON.stringify(trade),
  });
  await redis.incrByFloat(keys.volume24h(trade.tokenAddress), trade.amount);
}

/** Read a token's trade history, newest first. */
export async function getTrades(tokenAddress: string, limit = TRADES_MAX): Promise<Trade[]> {
  const raw = await redis.zrange<string>(keys.trades(tokenAddress), 0, Number.MAX_SAFE_INTEGER, true);
  return raw
    .map((entry) => {
      try {
        return typeof entry === 'string' ? (JSON.parse(entry) as Trade) : (entry as Trade);
      } catch {
        return null;
      }
    })
    .filter((trade): trade is Trade => trade !== null)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/** Append a feed event to the global feed, capped at FEED_MAX most recent. */
export async function saveFeedEvent(event: FeedEvent): Promise<void> {
  await redis.zadd(keys.feed, { score: event.timestamp, member: JSON.stringify(event) });
}

/** Read feed events, newest first, with pagination. */
export async function getFeedEvents(limit = 50, offset = 0): Promise<FeedEvent[]> {
  const raw = await redis.zrange<string>(keys.feed, 0, Number.MAX_SAFE_INTEGER, true);
  return raw
    .map((entry) => {
      try {
        return typeof entry === 'string' ? (JSON.parse(entry) as FeedEvent) : (entry as FeedEvent);
      } catch {
        return null;
      }
    })
    .filter((event): event is FeedEvent => event !== null)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(offset, offset + limit);
}

/** Read the accumulated 24h volume for a token. */
export async function getVolume(tokenAddress: string): Promise<number> {
  const value = await redis.get<number>(keys.volume24h(tokenAddress));
  return typeof value === 'number' ? value : Number(value ?? 0);
}

/** Read every token address a creator has launched. */
export async function getCreatorTokens(creator: string): Promise<ForgeToken[]> {
  const addresses = await redis.smembers(keys.tokensByCreator(creator));
  const tokens = await Promise.all(addresses.map((address) => getToken(address)));
  return tokens
    .filter((token): token is ForgeToken => token !== null)
    .sort((a, b) => b.launchedAt - a.launchedAt);
}

/** Make `follower` follow `target`. Stored in Redis, not onchain. */
export async function follow(follower: string, target: string): Promise<void> {
  await redis.sadd(keys.follows(follower), target);
  await redis.sadd(keys.followers(target), follower);
}

/** Read follow counts for a wallet. */
export async function getFollowStats(wallet: string): Promise<{ following: number; followers: number }> {
  const [following, followers] = await Promise.all([
    redis.smembers(keys.follows(wallet)),
    redis.smembers(keys.followers(wallet)),
  ]);
  return { following: following.length, followers: followers.length };
}

/** Store a bridge notification email. */
export async function saveBridgeEmail(email: string): Promise<void> {
  await redis.sadd(keys.bridgeEmails, email.toLowerCase());
}

export const storeLimits = { FEED_MAX, TRADES_MAX };
