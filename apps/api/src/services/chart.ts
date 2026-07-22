import type { Candle } from '@forge/shared';
import { LAUNCH_PRICE } from '@forge/shared';
import { redis, keys } from './redis.js';

/**
 * OHLCV chart storage and generation.
 *
 * Each token's candles live in a Redis hash keyed by the candle open time
 * (seconds), so updating the current candle overwrites its field rather than
 * appending a duplicate. On launch we seed 24 hours of 5-minute candles with a
 * random walk so charts look alive. Every real or simulated trade updates the
 * current open candle's high, low, close, and volume.
 */

const CANDLE_INTERVAL_SECONDS = 5 * 60;
const SEED_CANDLE_COUNT = (24 * 60) / 5; // 288 candles over 24 hours

/** Floor a millisecond timestamp to the start of its 5-minute candle (seconds). */
export function candleOpenTime(timestampMs: number): number {
  const seconds = Math.floor(timestampMs / 1000);
  return seconds - (seconds % CANDLE_INTERVAL_SECONDS);
}

function parseCandle(entry: unknown): Candle | null {
  try {
    return typeof entry === 'string' ? (JSON.parse(entry) as Candle) : (entry as Candle);
  } catch {
    return null;
  }
}

/**
 * Seed a fresh price history ending at `nowMs`. Uses a random walk with a slight
 * upward bias, a 5% chance of a 10x-style spike, and a 2% chance of a sharp dump
 * per candle. Returns the final close so the caller can record the live price.
 */
export async function seedCandles(tokenAddress: string, nowMs: number): Promise<number> {
  const startTime = candleOpenTime(nowMs) - (SEED_CANDLE_COUNT - 1) * CANDLE_INTERVAL_SECONDS;
  let price = LAUNCH_PRICE;

  for (let index = 0; index < SEED_CANDLE_COUNT; index += 1) {
    const open = price;

    // Base move between -2% and +2.5% (slight upward bias).
    let changeRatio = (Math.random() - 0.44) * 0.05;
    const roll = Math.random();
    if (roll < 0.05) {
      changeRatio += 0.1 + Math.random() * 0.05; // 10-15% spike
    } else if (roll > 0.98) {
      changeRatio -= 0.2 + Math.random() * 0.2; // 20-40% dump
    }

    const close = Math.max(LAUNCH_PRICE * 0.1, open * (1 + changeRatio));
    const high = Math.max(open, close) * (1 + Math.random() * 0.03);
    const low = Math.min(open, close) * (1 - Math.random() * 0.03);
    const volume = Math.random() * 2; // in ETH/SOL
    const time = startTime + index * CANDLE_INTERVAL_SECONDS;

    const candle: Candle = {
      time,
      open,
      high,
      low,
      close,
      volume: Math.round(volume * 1e6) / 1e6,
    };

    await redis.hset(keys.candles(tokenAddress), String(time), JSON.stringify(candle));
    price = close;
  }

  return price;
}

/** Read all candles for a token, oldest first. */
export async function getCandles(tokenAddress: string): Promise<Candle[]> {
  const map = await redis.hgetall<string>(keys.candles(tokenAddress));
  return Object.values(map)
    .map(parseCandle)
    .filter((candle): candle is Candle => candle !== null)
    .sort((a, b) => a.time - b.time);
}

/**
 * Apply a trade to the current candle. If the trade falls in a new 5-minute
 * bucket, open a new candle from the previous close.
 */
export async function applyTrade(
  tokenAddress: string,
  price: number,
  volume: number,
  timestampMs: number,
): Promise<void> {
  const openTime = candleOpenTime(timestampMs);
  const existingRaw = await redis.hgetall<string>(keys.candles(tokenAddress));
  const existing = parseCandle(existingRaw[String(openTime)]);

  if (existing) {
    const updated: Candle = {
      ...existing,
      high: Math.max(existing.high, price),
      low: Math.min(existing.low, price),
      close: price,
      volume: Math.round((existing.volume + volume) * 1e6) / 1e6,
    };
    await redis.hset(keys.candles(tokenAddress), String(openTime), JSON.stringify(updated));
    return;
  }

  // New candle: open from the most recent prior close if there is one.
  const prior = Object.values(existingRaw)
    .map(parseCandle)
    .filter((candle): candle is Candle => candle !== null)
    .filter((candle) => candle.time < openTime)
    .sort((a, b) => b.time - a.time)[0];

  const open = prior ? prior.close : price;
  const candle: Candle = {
    time: openTime,
    open,
    high: Math.max(open, price),
    low: Math.min(open, price),
    close: price,
    volume: Math.round(volume * 1e6) / 1e6,
  };
  await redis.hset(keys.candles(tokenAddress), String(openTime), JSON.stringify(candle));
}
