import type { ScheduledEvent } from "@planner/shared";
import { db } from "../db.js";
import type { Broadcaster } from "./broadcaster.js";
import { currentWindow, mapEvent } from "./rows.js";

export type SyncScope = "all" | "future";

/**
 * "Sync to all" / "sync future" (DATA_MODEL.md §5.5).
 *
 * Propagates an anchor occurrence's start/end to its siblings under the same
 * task. `future` only touches events with event_date >= anchor date. All
 * sibling rows are updated in the DB; only rows inside the display window
 * are broadcast (clients only hold the window).
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

  const win = currentWindow();
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
        // A sibling may already occupy (task, date, start) — skip it rather
        // than failing the whole sync (overlaps are warnings, not blocks).
        if (e instanceof Error && e.message.includes("UNIQUE constraint")) continue;
        throw e;
      }
      const fresh = db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(row.id) as Record<
        string,
        unknown
      >;
      if ((fresh.event_date as string) >= win.start && (fresh.event_date as string) <= win.end) {
        changed.push(mapEvent(fresh));
      }
    }
    return changed;
  });

  const changed = update();
  broadcast.emitBatch(
    changed.map((e) => ({ type: "upsert" as const, collection: "events" as const, id: e.id, data: e })),
  );
  return changed;
}
