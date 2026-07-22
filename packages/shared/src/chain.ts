/**
 * Chain identifiers used across the entire platform.
 *
 * Forge runs on two testnets. Every token, trade, and feed event carries one of
 * these values so the UI can render the correct chain badge and the backend can
 * route reads to the correct RPC. Keeping this as a single union type means the
 * frontend and backend can never disagree on what a valid chain is.
 */
export type Chain = 'base-sepolia' | 'solana-devnet';

/** Short chain label used for query params and compact selectors. */
export type ChainFilter = 'base' | 'solana' | 'all';

/** Maps a full chain identifier to its short filter label. */
export const CHAIN_TO_FILTER: Record<Chain, Exclude<ChainFilter, 'all'>> = {
  'base-sepolia': 'base',
  'solana-devnet': 'solana',
};

/** Human-readable chain names for display in the UI. */
export const CHAIN_LABELS: Record<Chain, string> = {
  'base-sepolia': 'Base Sepolia',
  'solana-devnet': 'Solana Devnet',
};

/** Short badge labels shown on feed cards and token headers. */
export const CHAIN_BADGES: Record<Chain, string> = {
  'base-sepolia': 'Base',
  'solana-devnet': 'SOL',
};
