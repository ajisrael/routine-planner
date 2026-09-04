import { occurrenceDates } from "../recurrence.js";
import { db } from "../db.js";
import type { Broadcaster } from "./broadcaster.js";

/**
 * Rule regeneration (DATA_MODEL.md §5.3).
 *
 * Deletes every scheduled_events row linked to the rule in the window and
 * re-inserts fresh occurrences using the reference time. Events with
 * rule_id IS NULL (manual/one-off) are never touched.
 */
export function regenerateForRule(
  ruleId: number,
  _referenceStartMinute: number,
  _referenceEndMinute: number,
  _broadcast: Broadcaster,
): void {
  void occurrenceDates; // remove once implemented
  void db; // remove once implemented
  void ruleId;
  // TODO: transaction:
  //   DELETE FROM scheduled_events WHERE rule_id = ? AND event_date IN window
  //   for each date in occurrenceDates(): INSERT ... (start=reference, end=reference)
  //   emitBatch() deltas
  throw new Error("regenerate not implemented yet");
}