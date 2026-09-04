/**
 * Broadcast helpers for the real-time delta channel (ARCHITECTURE.md §6.2).
 *
 * The realtime server is instantiated at boot and registered here so that
 * service layers can emit without importing the socket singleton directly.
 */
export interface Broadcaster {
  /** Emit a single mutation to all connected clients. */
  upsert(collection: string, id: number, data: unknown): void;
  delete(collection: string, id: number): void;
  /** Coalesce bulk changes (e.g. rule regeneration) into one emit. */
  emitBatch(changes: BatchChange[]): void;
}

export interface BatchChange {
  type: "upsert" | "delete";
  collection: string;
  id: number;
  data?: unknown;
}

export function createBroadcaster(): Broadcaster {
  // TODO: wire to the Socket.IO server; keep this interface stable so
  // services can emit deltas once implemented.
  return {
    upsert() {},
    delete() {},
    emitBatch() {},
  };
}