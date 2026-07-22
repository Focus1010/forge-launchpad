/**
 * Platform-wide constants shared by the frontend and backend.
 *
 * Contract addresses live in each app's environment configuration, not here,
 * because they differ per deployment. This file holds values that are fixed by
 * the protocol design and must never drift between the two apps.
 */

/** Base Sepolia chain id. */
export const BASE_SEPOLIA_CHAIN_ID = 84532;

/** Total supply minted for every token: 1 billion. */
export const TOTAL_SUPPLY = 1_000_000_000;

/** Decimals for EVM tokens. */
export const EVM_DECIMALS = 18;

/** Decimals for Solana tokens. */
export const SOLANA_DECIMALS = 6;

/** Graduation target in ETH on Base Sepolia. */
export const GRADUATION_TARGET_ETH = 0.5;

/** Graduation target in SOL on Solana Devnet. */
export const GRADUATION_TARGET_SOL = 0.5;

/** Starting price for a freshly launched token, in ETH or SOL. */
export const LAUNCH_PRICE = 0.000001;

/** Creator reward as a fraction of the graduation reserve. */
export const CREATOR_REWARD_RATE = 0.01;

/** Decimal places used when displaying prices. */
export const PRICE_DECIMALS = 6;

/** Decimal places used when displaying volumes before K/M suffixing. */
export const VOLUME_DECIMALS = 2;
