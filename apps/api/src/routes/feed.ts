import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { z } from 'zod';
import type { FeedEvent } from '@forge/shared';
import { feedBus } from '../services/events.js';
import { getFeedEvents } from '../services/store.js';

/**
 * WebSocket feed endpoint.
 *
 * Clients connect to /feed/live on the feed page. On connect we send a short
 * backlog of recent events so the feed is populated immediately, then subscribe
 * the socket to the feed bus and forward every new FeedEvent as it is produced
 * by the simulator or the onchain indexer. A periodic ping keeps the connection
 * alive through proxies that close idle sockets.
 */

const BACKLOG_COUNT = 20;
const PING_INTERVAL_MS = 30_000;

export async function feedWebsocketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/feed/live', { websocket: true }, (socket: WebSocket) => {
    let alive = true;

    const send = (payload: unknown) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    };

    // Send the recent backlog, oldest first so the client can prepend newest.
    void getFeedEvents(BACKLOG_COUNT)
      .then((events) => {
        send({ type: 'backlog', events: events.reverse() });
      })
      .catch((error) => {
        app.log.error({ err: error }, '[ws] failed to load backlog');
      });

    // Forward every new feed event to this socket.
    const unsubscribe = feedBus.onFeed((event) => {
      send({ type: 'event', event });
    });

    const pingTimer = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      if (socket.readyState === socket.OPEN) socket.ping();
    }, PING_INTERVAL_MS);

    socket.on('pong', () => {
      alive = true;
    });

    socket.on('close', () => {
      unsubscribe();
      clearInterval(pingTimer);
    });

    socket.on('error', (error: Error) => {
      app.log.warn({ err: error }, '[ws] socket error');
      unsubscribe();
      clearInterval(pingTimer);
    });
  });
}

const feedQuerySchema = z.object({
  filter: z.enum(['all', 'launches', 'buys', 'sells', 'following']).default('all'),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/** Apply a feed filter to a list of events. */
function applyFilter(events: FeedEvent[], filter: string): FeedEvent[] {
  switch (filter) {
    case 'launches':
      return events.filter((event) => event.type === 'launch' || event.type === 'graduation');
    case 'buys':
      return events.filter((event) => event.type === 'buy');
    case 'sells':
      return events.filter((event) => event.type === 'sell');
    case 'following':
      // Following is a client-scoped concept resolved on the frontend against
      // the viewer's follow list. Server returns all; client narrows.
      return events;
    case 'all':
    default:
      return events;
  }
}

/** HTTP feed route for initial load and infinite scroll. */
export async function feedHttpRoutes(app: FastifyInstance): Promise<void> {
  app.get('/feed', async (request, reply) => {
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }
    const { filter, limit, offset } = parsed.data;
    // Pull a generous window, filter, then paginate.
    const events = await getFeedEvents(500, 0);
    const filtered = applyFilter(events, filter);
    return {
      events: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset,
    };
  });
}
