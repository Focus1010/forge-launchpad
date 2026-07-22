import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

/**
 * Environment schema for the API. Parsed once at startup so a misconfigured
 * deployment fails immediately with a clear message rather than at first use.
 *
 * Third party credentials (Redis, Pinata, Anthropic) are optional so the server
 * still boots for local UI work. Services that need a missing credential report
 * a clear error only when actually called.
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  PINATA_JWT: z.string().optional(),
  PINATA_API_KEY: z.string().optional(),
  PINATA_SECRET_API_KEY: z.string().optional(),
  PINATA_GATEWAY: z.string().default('https://gateway.pinata.cloud'),

  BASE_SEPOLIA_RPC: z.string().default('https://sepolia.base.org'),
  SOLANA_DEVNET_RPC: z.string().default('https://api.devnet.solana.com'),
  FORGE_FACTORY_ADDRESS: z.string().optional(),
  SOLANA_PROGRAM_ID: z.string().optional(),

  SIMULATION_INTERVAL_MS: z.coerce.number().default(25000),
  INDEXER_INTERVAL_MS: z.coerce.number().default(10000),

  ANTHROPIC_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

/** True when Upstash Redis credentials are present. */
export const hasRedis = Boolean(config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN);

/** True when Pinata credentials are present. */
export const hasPinata = Boolean(config.PINATA_JWT);

/** True when the Anthropic key is present for the launch assistant. */
export const hasAnthropic = Boolean(config.ANTHROPIC_API_KEY);
