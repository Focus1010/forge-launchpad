import type { FastifyInstance } from 'fastify';
import { getSimulator, simulatorRunning } from '../services/simulator.js';

/**
 * Internal simulation control. Lets an operator force a tick, or start and stop
 * the loop, without restarting the server. Not exposed publicly in production.
 */
export async function simulationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/simulation/tick', async () => {
    const simulator = getSimulator(app.log);
    await simulator.tickOnce();
    return { ok: true };
  });

  app.post('/simulation/start', async () => {
    getSimulator(app.log).start();
    return { ok: true, running: simulatorRunning() };
  });

  app.post('/simulation/stop', async () => {
    getSimulator(app.log).stop();
    return { ok: true, running: simulatorRunning() };
  });
}
