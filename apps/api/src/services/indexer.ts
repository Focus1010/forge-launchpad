import type { FastifyBaseLogger } from 'fastify';
import { createPublicClient, http, parseAbiItem, type Log } from 'viem';
import { baseSepolia } from 'viem/chains';
import { Connection, PublicKey } from '@solana/web3.js';
import { randomUUID } from 'node:crypto';
import type { ForgeToken, FeedEvent } from '@forge/shared';
import { LAUNCH_PRICE, TOTAL_SUPPLY } from '@forge/shared';
import { config } from '../config.js';
import { saveToken, saveFeedEvent } from './store.js';
import { seedCandles } from './chart.js';
import { scoreFromInputs } from './health.js';
import { feedBus } from './events.js';

/**
 * Onchain indexer.
 *
 * Polls Base Sepolia and Solana Devnet for new events from the Forge contracts
 * and mirrors them into the same Redis structures the simulator writes to. It
 * only runs for a chain when that chain's contract address is configured, so a
 * fresh clone without deployed contracts simply skips real indexing and shows
 * simulated data.
 *
 * TokenLaunched is the primary event we react to here. Buy and Sell events flow
 * through the /trades route when a user trades from the frontend, so the indexer
 * focuses on discovering new tokens. Extending it to decode Buy and Sell logs
 * follows the same getLogs pattern used below.
 */

const TOKEN_LAUNCHED = parseAbiItem(
  'event TokenLaunched(address indexed creator, address indexed tokenAddress, string name, string symbol, string metadataURI, uint256 timestamp)',
);

export class Indexer {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastEvmBlock: bigint | null = null;
  private lastSolanaSignature: string | null = null;

  constructor(private readonly log: FastifyBaseLogger) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    if (!config.FORGE_FACTORY_ADDRESS && !config.SOLANA_PROGRAM_ID) {
      this.log.info('[indexer] no contract addresses configured, skipping onchain indexing');
      return;
    }
    this.running = true;
    this.poll();
    this.log.info('[indexer] started');
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
  }

  private poll(): void {
    this.timer = setTimeout(() => {
      void Promise.all([this.pollEvm(), this.pollSolana()])
        .catch((error) => this.log.error({ err: error }, '[indexer] poll failed'))
        .finally(() => {
          if (this.running) this.poll();
        });
    }, config.INDEXER_INTERVAL_MS);
  }

  /** Poll Base Sepolia for new TokenLaunched events. */
  private async pollEvm(): Promise<void> {
    if (!config.FORGE_FACTORY_ADDRESS) return;

    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(config.BASE_SEPOLIA_RPC),
    });

    const latest = await client.getBlockNumber();
    const fromBlock = this.lastEvmBlock ? this.lastEvmBlock + 1n : latest - 500n;
    if (fromBlock > latest) return;

    const logs = await client.getLogs({
      address: config.FORGE_FACTORY_ADDRESS as `0x${string}`,
      event: TOKEN_LAUNCHED,
      fromBlock: fromBlock < 0n ? 0n : fromBlock,
      toBlock: latest,
    });

    for (const log of logs) {
      await this.handleEvmLaunch(log);
    }
    this.lastEvmBlock = latest;
  }

  private async handleEvmLaunch(
    log: Log<bigint, number, false, typeof TOKEN_LAUNCHED>,
  ): Promise<void> {
    const args = log.args;
    if (!args.tokenAddress || !args.creator) return;

    const now = Number(args.timestamp ?? BigInt(Date.now())) * 1000;
    const address = args.tokenAddress;
    const finalPrice = await seedCandles(address, Date.now());

    const token: ForgeToken = {
      address,
      chain: 'base-sepolia',
      name: args.name ?? 'Unknown',
      symbol: args.symbol ?? '???',
      description: '',
      imageURI: '',
      metadataURI: args.metadataURI ?? '',
      creator: args.creator,
      creatorHandle: shortAddress(args.creator),
      launchedAt: now,
      price: finalPrice,
      priceChange24h: 0,
      volume24h: 0,
      marketCap: LAUNCH_PRICE * TOTAL_SUPPLY,
      holderCount: 1,
      bondingCurveProgress: 0,
      graduated: false,
      isSimulated: false,
      launchHealthScore: scoreFromInputs({ sniperCount: 0, botCount: 0, topHolderConcentration: 100 }),
    };
    await saveToken(token);

    const event: FeedEvent = {
      id: randomUUID(),
      type: 'launch',
      tokenAddress: address,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      tokenImageURI: '',
      wallet: args.creator,
      walletHandle: token.creatorHandle,
      chain: 'base-sepolia',
      timestamp: now,
      isSimulated: false,
      txHash: log.transactionHash ?? undefined,
    };
    await saveFeedEvent(event);
    feedBus.publish(event);
    this.log.info({ token: token.symbol, tx: log.transactionHash }, '[indexer] real EVM launch');
  }

  /**
   * Poll Solana Devnet for new program signatures. Full decode of the launch
   * instruction requires the program IDL; here we detect new activity and log
   * it. The trade route handles user-initiated trades, and this can be extended
   * to parse anchor event logs from transaction meta.
   */
  private async pollSolana(): Promise<void> {
    if (!config.SOLANA_PROGRAM_ID) return;

    const connection = new Connection(config.SOLANA_DEVNET_RPC, 'confirmed');
    const programId = new PublicKey(config.SOLANA_PROGRAM_ID);

    const signatures = await connection.getSignaturesForAddress(
      programId,
      this.lastSolanaSignature ? { until: this.lastSolanaSignature, limit: 25 } : { limit: 25 },
    );
    if (signatures.length === 0) return;

    this.lastSolanaSignature = signatures[0]!.signature;
    this.log.info({ count: signatures.length }, '[indexer] new Solana program signatures');
    // TODO: decode anchor event logs from transaction meta to build FeedEvents.
  }
}

function shortAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

let indexerInstance: Indexer | null = null;

export function getIndexer(log: FastifyBaseLogger): Indexer {
  if (!indexerInstance) indexerInstance = new Indexer(log);
  return indexerInstance;
}

export function indexerRunning(): boolean {
  return indexerInstance?.isRunning ?? false;
}
