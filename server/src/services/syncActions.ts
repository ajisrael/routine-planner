import type { ScheduledEvent } from "@planner/shared";
import { db } from "../db.js";
import type { Broadcaster } from "./broadcaster.js";
import { mapEvent } from "./rows.js";

export type SyncScope = "all" | "future";

/**
 * "Sync to all" / "sync future" (DATA_MODEL.md §5.5) across the template.
 *
 * Propagates an anchor occurrence's start/end to its siblings under the same
 * task. `future` only touches template days >= the anchor's day (day strings
 * are zero-padded, so lexical comparison is correct).
 */
export function syncOccurrenceToSiblings(
  anchorEventId: number,
  scope: SyncScope,
  broadcast: Broadcaster,
): ScheduledEvent[] {
  const anchor = db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(anchorEventId) as
    | Record<string, unknown>
    | undefined;
  if (!anchor) return [];

  const update = db.transaction((): ScheduledEvent[] => {
    const siblings = (
      scope === "future"
        ? db
            .prepare(
              "SELECT * FROM scheduled_events WHERE task_id = ? AND id != ? AND event_date >= ?",
            )
            .all(anchor.task_id, anchorEventId, anchor.event_date)
        : db
            .prepare("SELECT * FROM scheduled_events WHERE task_id = ? AND id != ?")
            .all(anchor.task_id, anchorEventId)
    ) as Array<Record<string, unknown>>;

    const changed: ScheduledEvent[] = [];
    const stmt = db.prepare(
      "UPDATE scheduled_events SET start_minute = ?, end_minute = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    );
    for (const row of siblings) {
      if (row.start_minute === anchor.start_minute && row.end_minute === anchor.end_minute) continue;
      try {
        stmt.run(anchor.start_minute, anchor.end_minute, row.id);
      } catch (e) {
        // A sibling may already occupy (task, day, start) — skip it rather
        // than failing the whole sync (overlaps are warnings, not blocks).
        if (e instanceof Error && e.message.includes("UNIQUE constraint")) continue;
        throw e;
      }
      const fresh = db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(row.id) as Record<
        string,
        unknown
      >;
      changed.push(mapEvent(fresh));
    }
    return changed;
  });

  const changed = update();
  broadcast.emitBatch(
    changed.map((e) => ({ type: "upsert" as const, collection: "events" as const, id: e.id, data: e })),
  );
  return changed;
}
