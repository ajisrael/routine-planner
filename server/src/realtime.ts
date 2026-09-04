import type http from "node:http";
import { Server } from "socket.io";

/**
 * Real-time layer (ARCHITECTURE.md §6).
 *
 * Protocol:
 *   entity:upsert  {collection, id, data}
 *   entity:delete  {collection, id}
 *
 * Broadcasts happen AFTER the DB transaction commits. On reconnect the
 * client refetches /api/snapshot, so the socket is purely a delta channel.
 */
export function createRealtimeServer(server: http.Server): Server {
  const io = new Server(server, {
    // TODO: authenticate connection from the httpOnly login cookie.
  });

  io.on("connection", (socket) => {
    socket.on("disconnect", () => {
      // no-op for now
    });
  });

  return io;
}

export type RealtimeServer = Server;