import { db } from "../db.js";
import type { Broadcaster } from "./broadcaster.js";

export type SyncScope = "all" | "future";

/**
 * "Sync to all" / "sync future" (DATA_MODEL.md §5.5).
 *
 * Propagates an anchor occurrence's start/end to its siblings under the
 * same task. `future` only touches events with event_date >= anchor date.
 */
export function syncOccurrenceToSiblings(
  _anchorEventId: number,
  _scope: SyncScope,
  _broadcast: Broadcaster,
): void {
  void db;
  // TODO: read anchor event, then UPDATE scheduled_events SET
  // start_minute/end_minute = anchor WHERE task_id = ? AND (scope = 'all'
  // OR event_date >= anchor.date); emitBatch() deltas.
  throw new Error("sync not implemented yet");
}