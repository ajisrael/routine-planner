import { getIO } from "../realtime.js";

/**
 * Broadcast helpers for the real-time delta channel (ARCHITECTURE.md §6.2).
 * Collection names mirror the client store keys.
 */
export type Collection =
  | "users"
  | "categories"
  | "tasks"
  | "assignees"
  | "recurrenceRules"
  | "events";

export interface BatchChange {
  type: "upsert" | "delete";
  collection: Collection;
  /** Entity id; task_assignees uses the composite "taskId:userId". */
  id: number | string;
  data?: unknown;
}

export interface Broadcaster {
  upsert(collection: Collection, id: number | string, data: unknown): void;
  delete(collection: Collection, id: number | string): void;
  /** Coalesce bulk changes (e.g. rule regeneration) into one emit. */
  emitBatch(changes: BatchChange[]): void;
}

export const broadcaster: Broadcaster = {
  upsert(collection, id, data) {
    if (data === undefined) return;
    getIO()?.emit("entity:upsert", { collection, id, data });
  },
  delete(collection, id) {
    getIO()?.emit("entity:delete", { collection, id });
  },
  emitBatch(changes) {
    if (changes.length > 0) getIO()?.emit("entity:batch", { changes });
  },
};

export const assigneeKey = (taskId: number, userId: number): string => `${taskId}:${userId}`;
