import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hasPinata } from '../config.js';
import { uploadImage, uploadMetadata } from '../services/ipfs.js';
import { symbolExists } from '../services/store.js';

/**
 * Launch support routes. The actual token deployment happens onchain from the
 * frontend; these routes handle the offchain steps: uploading image and
 * metadata to IPFS, and checking ticker uniqueness before deploy.
 */

const metadataSchema = z.object({
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10),
  description: z.string().max(280),
  image: z.string().min(1), // base64 data URL or raw base64
  socials: z
    .object({
      website: z.string().url().optional().or(z.literal('')),
      twitter: z.string().url().optional().or(z.literal('')),
      telegram: z.string().url().optional().or(z.literal('')),
    })
    .default({}),
});

export async function launchRoutes(app: FastifyInstance): Promise<void> {
  app.post('/launch/metadata', async (request, reply) => {
    const parsed = metadataSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid metadata', details: parsed.error.flatten() });
    }
    if (!hasPinata) {
      return reply.status(503).send({
        error: 'IPFS upload is not configured. Set PINATA_JWT on the API.',
      });
    }

    const { name, symbol, description, image, socials } = parsed.data;

    try {
      const imageURI = await uploadImage(image, `${symbol.toLowerCase()}.png`);
      const metadataURI = await uploadMetadata({
        name,
        symbol: symbol.toUpperCase(),
        description,
        image: imageURI,
        socials,
      });
      return { metadataURI, imageURI };
    } catch (error) {
      app.log.error({ err: error }, '[launch] IPFS upload failed');
      return reply.status(502).send({ error: 'IPFS upload failed' });
    }
  });

  // Ticker uniqueness check used by the launch form as the user types.
  app.get<{ Querystring: { symbol?: string } }>('/launch/symbol-available', async (request, reply) => {
    const symbol = request.query.symbol?.trim();
    if (!symbol) {
      return reply.status(400).send({ error: 'symbol query is required' });
    }
    const taken = await symbolExists(symbol);
    return { symbol: symbol.toUpperCase(), available: !taken };
  });
}
