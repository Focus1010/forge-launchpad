import { PinataSDK } from 'pinata';
import { config, hasPinata } from '../config.js';

/**
 * IPFS upload service backed by Pinata.
 *
 * Uploads a token image and a metadata JSON document, returning gateway URIs.
 * When Pinata is not configured the service throws a clear error so the launch
 * route can respond with a helpful message rather than failing opaquely.
 */

let client: PinataSDK | null = null;

function getClient(): PinataSDK {
  if (!hasPinata) {
    throw new Error('Pinata is not configured. Set PINATA_JWT in the environment.');
  }
  if (!client) {
    client = new PinataSDK({
      pinataJwt: config.PINATA_JWT!,
      pinataGateway: config.PINATA_GATEWAY,
    });
  }
  return client;
}

/** Build a gateway URL for an IPFS CID. */
function gatewayUrl(cid: string): string {
  const base = config.PINATA_GATEWAY.replace(/\/$/, '');
  return `${base}/ipfs/${cid}`;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  socials: {
    website?: string;
    twitter?: string;
    telegram?: string;
  };
}

/** Upload a base64-encoded image and return its gateway URI. */
export async function uploadImage(base64: string, filename: string): Promise<string> {
  const pinata = getClient();
  // Strip a data URL prefix if present.
  const commaIndex = base64.indexOf(',');
  const payload = commaIndex >= 0 ? base64.slice(commaIndex + 1) : base64;
  const buffer = Buffer.from(payload, 'base64');
  const file = new File([buffer], filename, { type: inferMimeType(filename) });

  const result = await pinata.upload.file(file);
  return gatewayUrl(result.cid);
}

/** Upload the metadata JSON document and return its gateway URI. */
export async function uploadMetadata(metadata: TokenMetadata): Promise<string> {
  const pinata = getClient();
  const result = await pinata.upload.json(metadata as unknown as Record<string, unknown>);
  return gatewayUrl(result.cid);
}

function inferMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}
