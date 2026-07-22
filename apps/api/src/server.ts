import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config, hasRedis } from './config.js';
import type { HealthReport } from './types/index.js';

/**
 * Fastify server entry point.
 *
 * Stage 4 wires up the instance, CORS, logging, a health check, and graceful
 * shutdown. Later stages register the WebSocket plugin, the simulation service,
 * the indexer, and the route modules.
 */
export async function buildServer() {
  const app = Fastify({
    logger: {
      level: 'info',
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(',').map((entry) => entry.trim()),
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  const startedAt = Date.now();

  app.get('/health', async (): Promise<HealthReport> => {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      redis: hasRedis ? 'connected' : 'in-memory',
      // Wired to the real simulation service in Stage 5.
      simulation: 'stopped',
      timestamp: Date.now(),
    };
  });

  return app;
}

async function main() {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down.`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

// Only start the server when run directly, not when imported by tests.
const isDirectRun = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isDirectRun) {
  void main();
}
