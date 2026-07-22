import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { saveBridgeEmail } from '../services/store.js';

/**
 * Bridge notification capture. The bridge feature is not live yet; this stores
 * emails from the "notify me" form so interested users can be contacted when it
 * ships.
 */
export async function bridgeRoutes(app: FastifyInstance): Promise<void> {
  const schema = z.object({ email: z.string().email() });

  app.post('/bridge/notify', async (request, reply) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'A valid email is required' });
    }
    await saveBridgeEmail(parsed.data.email);
    return { ok: true };
  });
}
