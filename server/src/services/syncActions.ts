import type { ScheduledEvent } from "@planner/shared";
import { db } from "../db.js";
import type { Broadcaster } from "./broadcaster.js";
import { mapEvent } from "./rows.js";

export type SyncScope = "all" | "future";

const touch = db.prepare(
  "UPDATE scheduled_events SET start_minute = ?, end_minute = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
);

/**
 * "Sync to all" / "sync future" (DATA_MODEL.md §5.5) across the template.
 *
 * Propagates an anchor occurrence's time to its siblings under the same task.
 * `future` only touches template days >= the anchor's day (day strings are
 * zero-padded, so lexical comparison is correct).
 *
 * An explicit `durationMinutes` overrides the propagated length for the anchor
 * AND siblings: the task-form sync pushes the duration set in the dialog
 * rather than the block's current (possibly hand-resized) length.
 */
export function syncOccurrenceToSiblings(
  anchorEventId: number,
  scope: SyncScope,
  broadcast: Broadcaster,
  durationMinutes?: number,
): ScheduledEvent[] {
  const anchor = db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(anchorEventId) as
    | Record<string, unknown>
    | undefined;
  if (!anchor) return [];

  const refStart = anchor.start_minute as number;
  const refEnd = durationMinutes != null ? refStart + durationMinutes : (anchor.end_minute as number);

  const changed: ScheduledEvent[] = [];

  // The anchor itself picks up the explicit duration (its time is the source).
  if (anchor.end_minute !== refEnd) {
    touch.run(refStart, refEnd, anchorEventId);
    changed.push(mapEvent({ ...anchor, end_minute: refEnd }));
  }

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

    const updated: ScheduledEvent[] = [];
    for (const row of siblings) {
      if (row.start_minute === refStart && row.end_minute === refEnd) continue;
      try {
        touch.run(refStart, refEnd, row.id);
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
      updated.push(mapEvent(fresh));
    }
    return updated;
  });

  changed.push(...update());
  broadcast.emitBatch(
    changed.map((e) => ({ type: "upsert" as const, collection: "events" as const, id: e.id, data: e })),
  );
  return changed;
}
