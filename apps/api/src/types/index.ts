/**
 * API-internal types. Public data shapes (ForgeToken, FeedEvent, Candle, etc.)
 * come from @forge/shared so the frontend and backend never disagree. This file
 * only holds types that never leave the backend.
 */
import type { Chain } from '@forge/shared';

/** A pre-generated simulated wallet with a display handle. */
export interface SimulatedWallet {
  address: string;
  handle: string;
}

/** Input used by the simulator and trade route to record a trade. */
export interface TradeInput {
  tokenAddress: string;
  wallet: string;
  walletHandle: string;
  type: 'buy' | 'sell';
  amount: number;
  tokensAmount: number;
  price: number;
  chain: Chain;
  isSimulated: boolean;
  txHash?: string;
}

/** Health report returned by GET /health. */
export interface HealthReport {
  status: 'ok';
  uptimeSeconds: number;
  redis: 'connected' | 'in-memory';
  simulation: 'running' | 'stopped';
  timestamp: number;
}
