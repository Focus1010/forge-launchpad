import { EventEmitter } from 'node:events';
import type { FeedEvent } from '@forge/shared';

/**
 * Process-wide event bus. The simulator and the onchain indexer both publish
 * FeedEvents here; the WebSocket layer (Stage 6) subscribes and fans them out
 * to connected clients. Decoupling producers from the transport means the
 * simulator does not need a reference to the WebSocket server.
 */
class FeedBus extends EventEmitter {
  publish(event: FeedEvent): void {
    this.emit('feed', event);
  }

  onFeed(listener: (event: FeedEvent) => void): () => void {
    this.on('feed', listener);
    return () => this.off('feed', listener);
  }
}

export const feedBus = new FeedBus();
// The feed can have many concurrent WebSocket subscribers.
feedBus.setMaxListeners(1000);
