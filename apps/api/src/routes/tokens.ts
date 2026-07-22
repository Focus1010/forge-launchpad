import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ForgeToken, TokenHolder } from '@forge/shared';
import { CHAIN_TO_FILTER } from '@forge/shared';
import { getAllTokens, getToken, saveToken } from '../services/store.js';
import { getCandles } from '../services/chart.js';
import { randomWallet } from '../data/simulation.js';

/**
 * Token routes.
 *
 * GET /tokens        list with chain filter, sort, and pagination
 * GET /tokens/:addr  full token detail including candles and holders
 * POST /tokens/index internal, used by the indexer to register a real token
 */

const listQuerySchema = z.object({
  chain: z.enum(['base', 'solana', 'all']).default('all'),
  sort: z.enum(['new', 'trending', 'graduating']).default('new'),
  limit: z.coerce.number().min(1).max(100).default(30),
  offset: z.coerce.number().min(0).default(0),
});

function sortTokens(tokens: ForgeToken[], sort: 'new' | 'trending' | 'graduating'): ForgeToken[] {
  const copy = [...tokens];
  switch (sort) {
    case 'trending':
      return copy.sort((a, b) => b.volume24h - a.volume24h);
    case 'graduating':
      // Not yet graduated, closest to the target first.
      return copy
        .filter((token) => !token.graduated)
        .sort((a, b) => b.bondingCurveProgress - a.bondingCurveProgress);
    case 'new':
    default:
      return copy.sort((a, b) => b.launchedAt - a.launchedAt);
  }
}

/**
 * Build a plausible holders list. For simulated tokens this is generated; for
 * real tokens the indexer would replace this with onchain balances. Percentages
 * always sum to at most 100 with the creator holding the largest share.
 */
function buildHolders(token: ForgeToken): TokenHolder[] {
  const count = Math.min(20, Math.max(3, Math.floor(token.holderCount)));
  const shares: number[] = [];
  let remaining = 100;
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    // Decaying share so the top holder has the most.
    const share = isLast ? remaining : Math.min(remaining, (remaining / (count - index)) * (0.8 + Math.random() * 0.6));
    shares.push(share);
    remaining = Math.max(0, remaining - share);
  }

  return shares
    .sort((a, b) => b - a)
    .map((percentage, index) => {
      const wallet = index === 0
        ? { address: token.creator, handle: token.creatorHandle }
        : randomWallet(token.chain);
      return {
        wallet: wallet.address,
        walletHandle: wallet.handle,
        amount: Math.floor((percentage / 100) * 1_000_000_000),
        percentage: Math.round(percentage * 10) / 10,
      };
    });
}

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tokens', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }
    const { chain, sort, limit, offset } = parsed.data;

    let tokens = await getAllTokens();
    if (chain !== 'all') {
      tokens = tokens.filter((token) => CHAIN_TO_FILTER[token.chain] === chain);
    }
    tokens = sortTokens(tokens, sort);

    return {
      tokens: tokens.slice(offset, offset + limit),
      total: tokens.length,
      limit,
      offset,
    };
  });

  app.get<{ Params: { address: string } }>('/tokens/:address', async (request, reply) => {
    const token = await getToken(request.params.address);
    if (!token) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    const candles = await getCandles(token.address);
    const holders = buildHolders(token);
    return { token, candles, holders };
  });

  // Internal: register a real token discovered by the indexer.
  const indexSchema = z.object({
    token: z.custom<ForgeToken>(),
  });
  app.post('/tokens/index', async (request, reply) => {
    const parsed = indexSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body' });
    }
    await saveToken(parsed.data.token);
    return { ok: true };
  });

  // Aggregate platform stats for the landing page counters.
  app.get('/stats', async () => {
    const tokens = await getAllTokens();
    const totalVolume = tokens.reduce((sum, token) => sum + token.volume24h, 0);
    const graduated = tokens.filter((token) => token.graduated).length;
    return {
      tokensLaunched: tokens.length,
      totalVolume: Math.round(totalVolume * 100) / 100,
      graduated,
      chainsSupported: 2,
    };
  });
}
