import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Trade, FeedEvent, Chain } from '@forge/shared';
import { getToken, saveToken, saveTrade, getTrades, saveFeedEvent } from '../services/store.js';
import { applyTrade } from '../services/chart.js';
import { feedBus } from '../services/events.js';

/**
 * Trade routes.
 *
 * POST /trades              record a real trade, update chart, feed, and price
 * GET  /trades/:tokenAddr   return a token's trade history, newest first
 *
 * Real trades write through the same store and chart functions the simulator
 * uses, so a real trade is indistinguishable from a simulated one downstream.
 */

const chains: [Chain, ...Chain[]] = ['base-sepolia', 'solana-devnet'];

const tradeSchema = z.object({
  tokenAddress: z.string().min(1),
  wallet: z.string().min(1),
  walletHandle: z.string().optional(),
  type: z.enum(['buy', 'sell']),
  amount: z.number().positive(),
  tokensAmount: z.number().positive(),
  price: z.number().positive(),
  chain: z.enum(chains),
  txHash: z.string().optional(),
});

export async function tradeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/trades', async (request, reply) => {
    const parsed = tradeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid trade', details: parsed.error.flatten() });
    }
    const body = parsed.data;

    const token = await getToken(body.tokenAddress);
    if (!token) {
      return reply.status(404).send({ error: 'Token not found' });
    }

    const now = Date.now();
    const walletHandle = body.walletHandle ?? shortAddress(body.wallet);

    // Update the chart candle and the token's live price and volume.
    await applyTrade(token.address, body.price, body.amount, now);
    await saveToken({
      ...token,
      price: body.price,
      volume24h: Math.round((token.volume24h + body.amount) * 100) / 100,
      marketCap: body.price * 1_000_000_000,
    });

    const trade: Trade = {
      id: randomUUID(),
      tokenAddress: token.address,
      wallet: body.wallet,
      walletHandle,
      type: body.type,
      amount: body.amount,
      tokensAmount: body.tokensAmount,
      price: body.price,
      chain: body.chain,
      timestamp: now,
      isSimulated: false,
      txHash: body.txHash,
    };
    await saveTrade(trade);

    const event: FeedEvent = {
      id: randomUUID(),
      type: body.type,
      tokenAddress: token.address,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      tokenImageURI: token.imageURI,
      wallet: body.wallet,
      walletHandle,
      amount: body.amount,
      tokensAmount: body.tokensAmount,
      price: body.price,
      chain: body.chain,
      timestamp: now,
      isSimulated: false,
      txHash: body.txHash,
    };
    await saveFeedEvent(event);
    feedBus.publish(event);

    return { ok: true, trade };
  });

  app.get<{ Params: { tokenAddress: string }; Querystring: { limit?: string } }>(
    '/trades/:tokenAddress',
    async (request) => {
      const limit = Math.min(200, Math.max(1, Number(request.query.limit ?? 100)));
      const trades = await getTrades(request.params.tokenAddress, limit);
      return { trades, total: trades.length };
    },
  );
}

/** Truncate an address to the 0x1a2b...3c4d display format. */
function shortAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
