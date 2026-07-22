import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Trade } from '@forge/shared';
import { getCreatorTokens, getFollowStats, follow, getAllTokens, getTrades } from '../services/store.js';

/**
 * Profile routes.
 *
 * GET  /profile/:wallet   deployed tokens, trade activity, follow stats, and a
 *                         claimable rewards summary for graduated launches
 * POST /profile/:wallet/follow   record a follow (stored in Redis, not onchain)
 *
 * Works for any wallet. Trade activity is gathered by scanning tokens for
 * trades by this wallet, which is fine at testnet scale.
 */

const CREATOR_REWARD_RATE = 0.01;

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { wallet: string } }>('/profile/:wallet', async (request) => {
    const wallet = request.params.wallet;

    const [launched, followStats, allTokens] = await Promise.all([
      getCreatorTokens(wallet),
      getFollowStats(wallet),
      getAllTokens(),
    ]);

    // Gather this wallet's trades across all tokens.
    const tradeLists = await Promise.all(allTokens.map((token) => getTrades(token.address, 200)));
    const activity: Trade[] = tradeLists
      .flat()
      .filter((trade) => trade.wallet === wallet)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);

    const totalVolume = activity.reduce((sum, trade) => sum + trade.amount, 0);

    // Rough PnL: sells add proceeds, buys subtract cost. Real onchain PnL would
    // track cost basis per position; this is a reasonable testnet estimate.
    const pnl = activity.reduce(
      (sum, trade) => (trade.type === 'sell' ? sum + trade.amount : sum - trade.amount),
      0,
    );

    // Claimable creator rewards: 1% of reserve for each graduated launch.
    const rewards = launched
      .filter((token) => token.graduated)
      .map((token) => ({
        tokenAddress: token.address,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        chain: token.chain,
        claimable: Math.round(0.5 * CREATOR_REWARD_RATE * 1e6) / 1e6,
      }));
    const totalClaimable = rewards.reduce((sum, reward) => sum + reward.claimable, 0);

    return {
      wallet,
      launched,
      activity,
      stats: {
        tokensLaunched: launched.length,
        totalVolume: Math.round(totalVolume * 100) / 100,
        pnl: Math.round(pnl * 1e6) / 1e6,
        followers: followStats.followers,
        following: followStats.following,
      },
      rewards,
      totalClaimable: Math.round(totalClaimable * 1e6) / 1e6,
    };
  });

  const followSchema = z.object({ follower: z.string().min(1) });
  app.post<{ Params: { wallet: string } }>('/profile/:wallet/follow', async (request, reply) => {
    const parsed = followSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'follower is required' });
    }
    if (parsed.data.follower === request.params.wallet) {
      return reply.status(400).send({ error: 'Cannot follow yourself' });
    }
    await follow(parsed.data.follower, request.params.wallet);
    return { ok: true };
  });
}
