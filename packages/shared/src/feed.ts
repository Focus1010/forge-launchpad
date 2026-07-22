import type { Chain } from './chain.js';

/** The kinds of events that can appear in the social feed. */
export type FeedEventType = 'launch' | 'buy' | 'sell' | 'comment' | 'graduation';

/** Trade direction for buy and sell actions. */
export type TradeType = 'buy' | 'sell';

/**
 * A single event in the social feed. This is the unit streamed over the
 * WebSocket and returned by the feed API. Real onchain events and simulated
 * events share this exact shape so the UI renders them identically.
 */
export interface FeedEvent {
  id: string;
  type: FeedEventType;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenImageURI: string;
  /** Wallet that performed the action. */
  wallet: string;
  /** Display handle for the wallet. */
  walletHandle: string;
  /** ETH or SOL amount for buy and sell events. */
  amount?: number;
  /** Token amount for buy and sell events. */
  tokensAmount?: number;
  /** Price at the time of the event, in ETH or SOL. */
  price?: number;
  /** Comment body for comment events. */
  comment?: string;
  chain: Chain;
  /** Unix timestamp in milliseconds. */
  timestamp: number;
  /**
   * Internal flag only. Used for logging. The frontend must not use this to
   * change how an event is displayed.
   */
  isSimulated: boolean;
  /** Transaction hash. Present only for real onchain events. */
  txHash?: string;
}

/** Filters available on the feed page tab bar. */
export type FeedFilter = 'all' | 'launches' | 'buys' | 'sells' | 'following';

/** A token-gated comment on a token page. */
export interface TokenComment {
  id: string;
  tokenAddress: string;
  wallet: string;
  walletHandle: string;
  /** Commenter's token balance, shown next to the comment. */
  balance: number;
  body: string;
  timestamp: number;
}

/** A single trade record in a token's trade history. */
export interface Trade {
  id: string;
  tokenAddress: string;
  wallet: string;
  walletHandle: string;
  type: TradeType;
  /** ETH or SOL amount. */
  amount: number;
  /** Token amount. */
  tokensAmount: number;
  /** Execution price in ETH or SOL. */
  price: number;
  chain: Chain;
  timestamp: number;
  isSimulated: boolean;
  txHash?: string;
}
