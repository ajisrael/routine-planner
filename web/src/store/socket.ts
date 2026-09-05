import { io, type Socket } from "socket.io-client";
import { useSession } from "./session";
import { usePlannerStore, type DeltaChange } from "./index";

/**
 * Socket.IO delta channel (ARCHITECTURE.md §6). The store is hydrated via
 * REST first; the socket then applies entity:upsert / entity:delete deltas.
 * On (re)connect the client resnapshots — that is the entire recovery story.
 */
let socket: Socket | null = null;

export function connectRealtime(): void {
  if (socket) return;
  const session = useSession.getState();

  socket = io({ withCredentials: true });

  socket.on("connect", () => {
    useSession.getState().setConnected(true);
    // Missed-window recovery (§6.4): if we already had data, resnapshot.
    if (usePlannerStore.getState().hydrated) {
      void usePlannerStore.getState().refresh();
    }
  });

  socket.on("disconnect", () => {
    useSession.getState().setConnected(false);
  });

  socket.on("entity:upsert", (payload: { collection: string; id: number | string; data: unknown }) => {
    if (!isCollection(payload.collection)) return;
    usePlannerStore.getState().applyChange({
      type: "upsert",
      collection: payload.collection,
      id: payload.id,
      data: payload.data,
    });
  });

  socket.on("entity:delete", (payload: { collection: string; id: number | string }) => {
    if (!isCollection(payload.collection)) return;
    usePlannerStore.getState().applyChange({
      type: "delete",
      collection: payload.collection,
      id: payload.id,
    });
  });

  socket.on("entity:batch", (payload: { changes: DeltaChange[] }) => {
    const changes = (payload.changes ?? []).filter((c) => isCollection(c.collection));
    if (changes.length > 0) usePlannerStore.getState().applyBatch(changes);
  });

  void session;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
  useSession.getState().setConnected(false);
}

const COLLECTIONS = ["users", "categories", "tasks", "assignees", "recurrenceRules", "events"] as const;

function isCollection(v: string): v is (typeof COLLECTIONS)[number] {
  return (COLLECTIONS as readonly string[]).includes(v);
}
