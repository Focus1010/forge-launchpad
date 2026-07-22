import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config, hasRedis } from './config.js';
import { getSimulator, simulatorRunning } from './services/simulator.js';
import { getIndexer, indexerRunning } from './services/indexer.js';
import { feedWebsocketRoutes, feedHttpRoutes } from './routes/feed.js';
import { tokenRoutes } from './routes/tokens.js';
import { launchRoutes } from './routes/launch.js';
import { tradeRoutes } from './routes/trades.js';
import { profileRoutes } from './routes/profile.js';
import { simulationRoutes } from './routes/simulation.js';
import { bridgeRoutes } from './routes/bridge.js';
import type { HealthReport } from './types/index.js';

/**
 * Fastify server entry point.
 *
 * Wires the instance, CORS, logging, the WebSocket plugin, all route modules,
 * the simulation service, the onchain indexer, health check, and graceful
 * shutdown.
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

  await app.register(websocket);

  // WebSocket and HTTP routes.
  await app.register(feedWebsocketRoutes);
  await app.register(feedHttpRoutes);
  await app.register(tokenRoutes);
  await app.register(launchRoutes);
  await app.register(tradeRoutes);
  await app.register(profileRoutes);
  await app.register(simulationRoutes);
  await app.register(bridgeRoutes);

  const startedAt = Date.now();

  app.get('/health', async (): Promise<HealthReport> => {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      redis: hasRedis ? 'connected' : 'in-memory',
      simulation: simulatorRunning() ? 'running' : 'stopped',
      indexer: indexerRunning() ? 'running' : 'stopped',
      timestamp: Date.now(),
    };
  });

  // Start the background services so the feed is always alive.
  getSimulator(app.log).start();
  getIndexer(app.log).start();

  return app;
}

async function main() {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down.`);
    getSimulator(app.log).stop();
    getIndexer(app.log).stop();
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
