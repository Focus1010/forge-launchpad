import type { Chain } from './chain.js';

/**
 * Launch Health Score summarizes how fair a token launch looks.
 *
 * For real tokens this is estimated from onchain holder data. For simulated
 * tokens it is generated. The frontend renders both identically.
 */
export interface LaunchHealthScore {
  /** Overall score from 0 (risky) to 100 (healthy). */
  score: number;
  /** Number of wallets that bought within the first few blocks. */
  sniperCount: number;
  /** Number of wallets flagged as automated by heuristics. */
  botCount: number;
  /** Percentage of total supply held by the top 5 wallets. */
  topHolderConcentration: number;
  /** Bucketed label derived from the score. */
  label: 'Healthy' | 'Moderate' | 'Risky';
}

/**
 * The canonical token shape returned by the API and rendered everywhere in the
 * UI. Prices are denominated in the token's native gas asset (ETH or SOL).
 */
export interface ForgeToken {
  /** EVM address or Solana mint address. */
  address: string;
  chain: Chain;
  name: string;
  symbol: string;
  description: string;
  /** IPFS URI for the token image. */
  imageURI: string;
  /** IPFS URI for the token metadata JSON. */
  metadataURI: string;
  /** Wallet that deployed the token. */
  creator: string;
  /** Display handle for the creator (ENS-style or generated). */
  creatorHandle: string;
  /** Unix timestamp in milliseconds. */
  launchedAt: number;
  /** Current price in ETH or SOL. */
  price: number;
  /** 24 hour price change as a percentage (can be negative). */
  priceChange24h: number;
  /** 24 hour trading volume in ETH or SOL. */
  volume24h: number;
  /** Market capitalization in ETH or SOL. */
  marketCap: number;
  /** Number of unique holders. */
  holderCount: number;
  /** Bonding curve fill from 0 to 100. */
  bondingCurveProgress: number;
  /** True once the bonding curve has reached its graduation target. */
  graduated: boolean;
  /**
   * Internal flag only. Used for logging and analytics. The frontend must not
   * use this to change how a token is displayed.
   */
  isSimulated: boolean;
  launchHealthScore: LaunchHealthScore;
}

/** A single holder entry in the token holders list. */
export interface TokenHolder {
  wallet: string;
  walletHandle: string;
  amount: number;
  /** Percentage of total supply held by this wallet. */
  percentage: number;
}

/** One OHLCV candle in the format TradingView Lightweight Charts expects. */
export interface Candle {
  /** Unix timestamp in seconds (TradingView convention). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
