import type { Chain } from './chain.js';
import type { ForgeToken } from './token.js';
import type { Trade } from './feed.js';

/** Portfolio holding shown on the profile Portfolio tab. */
export interface PortfolioHolding {
  token: ForgeToken;
  /** Amount of the token held by the wallet. */
  amount: number;
  /** Current value of the holding in ETH or SOL. */
  value: number;
  /** Profit and loss since first buy, in ETH or SOL. */
  pnl: number;
}

/** Creator reward claimable on a graduated token. */
export interface CreatorReward {
  token: ForgeToken;
  /** Claimable amount in ETH or SOL. */
  claimable: number;
  /** Whether the reward has already been claimed. */
  claimed: boolean;
}

/** Platform points tier progression. Purely visual, never onchain. */
export type PointsTier = 'Forger' | 'Veteran' | 'Legend';

/** Mock platform points summary shown on the profile Rewards tab. */
export interface PlatformPoints {
  balance: number;
  tier: PointsTier;
  /** Points required to reach the next tier. */
  nextTierAt: number;
}

/** Aggregated profile data returned by GET /profile/:wallet. */
export interface WalletProfile {
  wallet: string;
  handle: string;
  /** True when the address is a generated simulation wallet. */
  isSimulated: boolean;
  tokensLaunched: number;
  totalVolume: number;
  totalPnl: number;
  followers: number;
  following: number;
  portfolio: PortfolioHolding[];
  launched: ForgeToken[];
  activity: Trade[];
  rewards: CreatorReward[];
  points: PlatformPoints;
}

/** Connected wallet state tracked in the frontend store. */
export interface ConnectedWallet {
  chain: Chain;
  address: string;
}
