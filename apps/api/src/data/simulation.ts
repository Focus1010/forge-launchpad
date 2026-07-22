import { createHash } from 'node:crypto';
import type { Chain } from '@forge/shared';
import type { SimulatedWallet } from '../types/index.js';

/**
 * Static data pools for the simulator. These make the feed look like a live
 * community: a fixed roster of wallets with handles, plus large token name and
 * description pools so launches rarely repeat.
 *
 * Wallet addresses are derived deterministically from each handle so the same
 * handle always maps to the same address across restarts. This is equivalent to
 * pre-generating and hard-coding them, without a hundred literal hex strings.
 */

const HANDLE_ROOTS = [
  'cryptowolf', 'solana_maxi', 'basebuilder', 'tokenforge', 'midnight_trader',
  'fastchain', 'quietedge', 'coldwave', 'darkpool22', 'pulsetrader',
  'moonwalker', 'stonecold', 'chainsmith', 'edgelord', 'vaultkeeper',
  'shardholder', 'meshrunner', 'gridlock', 'noderunner', 'rootaccess',
  'sharpshooter', 'deepvalue', 'loudmouth', 'stillwater', 'brightside',
  'hardfork', 'longtail', 'heavyhitter', 'thinair', 'widelens',
  'palerider', 'rawdeal', 'cleanslate', 'dryrun', 'warmboot',
  'softlanding', 'ironhands', 'diamondgrip', 'papertrader', 'whalewatch',
  'degen_dan', 'apecapital', 'yieldfarm', 'liquidity_luke', 'slippage_sam',
  'gasfee_greg', 'blockspace', 'mempool_max', 'validator_vic', 'sequencer',
  'rolluprick', 'bridgetroll', 'oracle_olive', 'keeper_ken', 'flashloan',
  'arbking', 'snipergod', 'floorprice', 'ceiling_cat', 'bagholder',
  'earlybird', 'latecomer', 'topblast', 'bottomfeeder', 'trendline',
  'candlewick', 'redcandle', 'greencandle', 'wickhunter', 'volumespike',
  'breakout_bob', 'support_sue', 'resistance', 'fibonacci', 'goldenratio',
  'macd_mike', 'rsi_rita', 'bollinger', 'stochastic', 'momentum_mo',
  'hodler_hank', 'swingtrader', 'scalper_sid', 'daytrader_dan', 'positionpat',
  'coldstorage', 'hotwallet', 'seedphrase', 'privatekey', 'multisig_mary',
  'ledger_leo', 'trezor_tom', 'metamask_meg', 'phantom_phil', 'backpack_ben',
  'solflare', 'coinbase_cody', 'walletconnect', 'ens_emma', 'gasless_gary',
];

const HANDLE_SUFFIXES = ['.eth', '', '_42', '.sol', '', '_dao', '', '.base'];

/** Adjectives for generated token names. */
export const ADJECTIVES = [
  'Dark', 'Fast', 'Cold', 'Sharp', 'Deep', 'Loud', 'Still', 'Bright', 'Hard', 'Long',
  'Low', 'Heavy', 'Thin', 'Wide', 'Pale', 'Raw', 'Clean', 'Dry', 'Warm', 'Soft',
];

/** Nouns for generated token names. */
export const NOUNS = [
  'Wolf', 'Stone', 'Chain', 'Forge', 'Edge', 'Pulse', 'Wave', 'Gate', 'Peak', 'Drift',
  'Core', 'Vault', 'Shard', 'Mesh', 'Arc', 'Loop', 'Grid', 'Node', 'Path', 'Root',
];

/** Suffix patterns appended to some token names. */
export const SUFFIXES = ['Protocol', 'Fi', 'DAO', 'Labs', 'Network', '', '', ''];

/** Description fragments combined into token descriptions. */
const DESCRIPTION_OPENERS = [
  'A community token built on',
  'Token for people who care about',
  'Backed by a linear bonding curve on',
  'Fair launch focused on',
  'A social experiment in',
  'Grassroots token exploring',
];

const DESCRIPTION_TOPICS = [
  'onchain coordination', 'open trading', 'transparent launches', 'fair distribution',
  'testnet building', 'community ownership', 'liquid markets', 'permissionless finance',
];

/**
 * Deterministically derive a wallet address from a handle. EVM addresses are 20
 * bytes; Solana addresses are base58 of 32 bytes. We approximate a Solana style
 * address with a base58 string of the correct length so the UI treats it right.
 */
function deriveEvmAddress(seed: string): string {
  const hash = createHash('sha256').update(`evm:${seed}`).digest('hex');
  return `0x${hash.slice(0, 40)}`;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function deriveSolanaAddress(seed: string): string {
  const hash = createHash('sha256').update(`sol:${seed}`).digest();
  let output = '';
  for (let index = 0; index < 44; index += 1) {
    output += BASE58[hash[index % hash.length]! % BASE58.length];
  }
  return output;
}

/** The fixed roster of simulated wallets, keyed by chain. */
export const SIMULATED_WALLETS: Record<Chain, SimulatedWallet[]> = {
  'base-sepolia': HANDLE_ROOTS.map((root, index) => ({
    handle: `${root}${HANDLE_SUFFIXES[index % HANDLE_SUFFIXES.length]}`,
    address: deriveEvmAddress(root),
  })),
  'solana-devnet': HANDLE_ROOTS.map((root, index) => ({
    handle: `${root}${HANDLE_SUFFIXES[index % HANDLE_SUFFIXES.length]}`,
    address: deriveSolanaAddress(root),
  })),
};

/** Pick a uniformly random element of an array (array must be non-empty). */
export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Pick a random simulated wallet for a chain. */
export function randomWallet(chain: Chain): SimulatedWallet {
  return pick(SIMULATED_WALLETS[chain]);
}

/** Generate a token name from the adjective/noun/suffix pools. */
export function generateTokenName(): { name: string; symbol: string } {
  const adjective = pick(ADJECTIVES);
  const noun = pick(NOUNS);
  const suffix = pick(SUFFIXES);
  const name = suffix ? `${adjective} ${noun} ${suffix}` : `${adjective} ${noun}`;
  const symbol = `${adjective.slice(0, 2)}${noun.slice(0, 3)}`.toUpperCase();
  return { name, symbol };
}

/** Generate a plain, hype-free token description. */
export function generateDescription(topicNoun: string): string {
  return `${pick(DESCRIPTION_OPENERS)} ${pick(DESCRIPTION_TOPICS)}. Trading ${topicNoun} on a bonding curve.`;
}

/** Derive an address for a freshly launched simulated token. */
export function generateTokenAddress(chain: Chain, seed: string): string {
  return chain === 'base-sepolia' ? deriveEvmAddress(`token:${seed}`) : deriveSolanaAddress(`token:${seed}`);
}
