import type http from "node:http";
import { Server } from "socket.io";

/**
 * Real-time layer (ARCHITECTURE.md §6).
 *
 * Protocol:
 *   entity:upsert  {collection, id, data}
 *   entity:delete  {collection, id}
 *   entity:batch   {changes: Array<upsert|delete>}   — coalesced bulk changes
 *
 * Broadcasts happen AFTER the DB transaction commits. On reconnect the
 * client refetches /api/snapshot, so the socket is purely a delta channel.
 * The httpOnly login cookie identifies the connection (convenience only —
 * LAN trust boundary, ARCHITECTURE.md §5.5).
 */
export const COOKIE_NAME = "planner_uid";

let io: Server | null = null;

export function createRealtimeServer(server: http.Server): Server {
  io = new Server(server, {
    cors: { origin: true, credentials: true },
  });

  io.use((socket, next) => {
    const raw = socket.request.headers.cookie ?? "";
    const m = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=(\\d+)`).exec(raw);
    socket.data.userId = m ? Number(m[1]) : null;
    next();
  });

  io.on("connection", (socket) => {
    void socket.data.userId; // identity available for future per-user channels
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

export type RealtimeServer = Server;
