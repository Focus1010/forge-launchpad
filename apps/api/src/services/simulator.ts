import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Chain, ForgeToken, FeedEvent, Trade } from '@forge/shared';
import { LAUNCH_PRICE, TOTAL_SUPPLY, GRADUATION_TARGET_ETH } from '@forge/shared';
import { config } from '../config.js';
import {
  generateTokenName,
  generateDescription,
  generateTokenAddress,
  randomWallet,
  pick,
} from '../data/simulation.js';
import { generateHealthScore } from './health.js';
import { feedBus } from './events.js';
import { seedCandles, applyTrade } from './chart.js';
import { saveToken, getAllTokens, saveTrade, saveFeedEvent } from './store.js';

/**
 * Simulation service.
 *
 * On each tick it picks a weighted random action (launch 10%, buy 60%,
 * sell 30%). Launches create a simulated token with a seeded chart. Trades pick
 * an existing token, move its price along the curve, update its candle, and
 * record volume. Every action produces a FeedEvent published on the feed bus so
 * the WebSocket layer can broadcast it. Real and simulated data share the same
 * storage, so the frontend cannot tell them apart.
 */

const CHAINS: Chain[] = ['base-sepolia', 'solana-devnet'];

/** Weighted action pick. */
function pickAction(): 'launch' | 'buy' | 'sell' {
  const roll = Math.random();
  if (roll < 0.1) return 'launch';
  if (roll < 0.7) return 'buy';
  return 'sell';
}

/** Move a price by a realistic random amount, matching the spec distribution. */
function nextPrice(current: number, direction: 'buy' | 'sell'): number {
  let changeRatio = 0.001 + Math.random() * 0.029; // 0.1% to 3%
  const roll = Math.random();
  if (roll < 0.05) changeRatio = 0.1 + Math.random() * 0.05; // 10-15% spike
  else if (roll < 0.07) changeRatio = 0.2 + Math.random() * 0.2; // 20-40% dump (as a drop)

  const signed = direction === 'buy' ? changeRatio : -changeRatio;
  return Math.max(LAUNCH_PRICE * 0.1, current * (1 + signed));
}

export class Simulator {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly log: FastifyBaseLogger) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Start the tick loop with a small jittered interval. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.seedInitialTokens();
    this.scheduleNext();
    this.log.info('[simulator] started');
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
    this.log.info('[simulator] stopped');
  }

  /** Ensure the feed is not empty on first boot by launching a few tokens. */
  private async seedInitialTokens(): Promise<void> {
    const existing = await getAllTokens();
    if (existing.length >= 6) return;
    const toCreate = 6 - existing.length;
    for (let index = 0; index < toCreate; index += 1) {
      await this.launch();
    }
  }

  private scheduleNext(): void {
    // Base interval with +/- 40% jitter, and a 20% chance of a short "busy" gap.
    const base = config.SIMULATION_INTERVAL_MS;
    const jitter = base * (0.6 + Math.random() * 0.8);
    const busy = Math.random() < 0.2 ? 0.4 : 1;
    const delay = Math.max(3000, Math.floor(jitter * busy));

    this.timer = setTimeout(() => {
      void this.tick().finally(() => {
        if (this.running) this.scheduleNext();
      });
    }, delay);
  }

  private async tick(): Promise<void> {
    try {
      const action = pickAction();
      if (action === 'launch') {
        await this.launch();
      } else {
        await this.trade(action);
      }
    } catch (error) {
      this.log.error({ err: error }, '[simulator] tick failed');
    }
  }

  /** Create a simulated token, seed its chart, and emit a launch event. */
  private async launch(): Promise<void> {
    const chain = pick(CHAINS);
    const wallet = randomWallet(chain);
    const { name, symbol } = generateTokenName();
    const seed = `${name}-${randomUUID()}`;
    const address = generateTokenAddress(chain, seed);
    const now = Date.now();

    const finalPrice = await seedCandles(address, now);

    const token: ForgeToken = {
      address,
      chain,
      name,
      symbol,
      description: generateDescription(symbol),
      imageURI: '',
      metadataURI: '',
      creator: wallet.address,
      creatorHandle: wallet.handle,
      launchedAt: now,
      price: finalPrice,
      priceChange24h: Math.round((Math.random() * 200 - 50) * 10) / 10,
      volume24h: Math.round(Math.random() * 50 * 100) / 100,
      marketCap: finalPrice * TOTAL_SUPPLY,
      holderCount: Math.floor(Math.random() * 400) + 5,
      bondingCurveProgress: Math.round(Math.random() * 60),
      graduated: false,
      isSimulated: true,
      launchHealthScore: generateHealthScore(),
    };

    await saveToken(token);

    const event: FeedEvent = {
      id: randomUUID(),
      type: 'launch',
      tokenAddress: address,
      tokenName: name,
      tokenSymbol: symbol,
      tokenImageURI: '',
      wallet: wallet.address,
      walletHandle: wallet.handle,
      chain,
      timestamp: now,
      isSimulated: true,
    };

    await saveFeedEvent(event);
    feedBus.publish(event);
    this.log.info({ token: symbol, chain }, '[simulator] launch');
  }

  /** Trade an existing token, update its chart, and emit a trade event. */
  private async trade(type: 'buy' | 'sell'): Promise<void> {
    const tokens = await getAllTokens();
    const tradable = tokens.filter((token) => !token.graduated);
    if (tradable.length === 0) {
      await this.launch();
      return;
    }

    const token = pick(tradable);
    const wallet = randomWallet(token.chain);
    const now = Date.now();

    const price = nextPrice(token.price, type);
    const amount = Math.round((0.001 + Math.random() * 0.2) * 1e6) / 1e6; // ETH/SOL
    const tokensAmount = Math.floor(amount / price);

    await applyTrade(token.address, price, amount, now);

    // Advance bonding curve progress on buys, retreat slightly on sells.
    const progressDelta = type === 'buy' ? Math.random() * 4 : -Math.random() * 2;
    const bondingCurveProgress = Math.min(100, Math.max(0, token.bondingCurveProgress + progressDelta));
    const graduated = bondingCurveProgress >= 100;

    const updated: ForgeToken = {
      ...token,
      price,
      marketCap: price * TOTAL_SUPPLY,
      volume24h: Math.round((token.volume24h + amount) * 100) / 100,
      bondingCurveProgress: Math.round(bondingCurveProgress),
      graduated,
    };
    await saveToken(updated);

    const trade: Trade = {
      id: randomUUID(),
      tokenAddress: token.address,
      wallet: wallet.address,
      walletHandle: wallet.handle,
      type,
      amount,
      tokensAmount,
      price,
      chain: token.chain,
      timestamp: now,
      isSimulated: true,
    };
    await saveTrade(trade);

    const event: FeedEvent = {
      id: randomUUID(),
      type,
      tokenAddress: token.address,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      tokenImageURI: token.imageURI,
      wallet: wallet.address,
      walletHandle: wallet.handle,
      amount,
      tokensAmount,
      price,
      chain: token.chain,
      timestamp: now,
      isSimulated: true,
    };
    await saveFeedEvent(event);
    feedBus.publish(event);

    if (graduated) {
      const gradEvent: FeedEvent = {
        id: randomUUID(),
        type: 'graduation',
        tokenAddress: token.address,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        tokenImageURI: token.imageURI,
        wallet: token.creator,
        walletHandle: token.creatorHandle,
        chain: token.chain,
        timestamp: now,
        isSimulated: true,
      };
      await saveFeedEvent(gradEvent);
      feedBus.publish(gradEvent);
      this.log.info({ token: token.symbol }, '[simulator] graduation');
    }

    // Reference kept intentionally: graduation target documents the curve goal.
    void GRADUATION_TARGET_ETH;
  }
}

let simulatorInstance: Simulator | null = null;

/** Access the process simulator (created on first use). */
export function getSimulator(log: FastifyBaseLogger): Simulator {
  if (!simulatorInstance) simulatorInstance = new Simulator(log);
  return simulatorInstance;
}

/** Peek at whether the simulator is running, for the health check. */
export function simulatorRunning(): boolean {
  return simulatorInstance?.isRunning ?? false;
}
