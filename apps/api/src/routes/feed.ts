import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
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
