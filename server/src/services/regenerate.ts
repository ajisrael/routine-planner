import { DEFAULT_START_MINUTE, occurrenceDates } from "@planner/shared";
import type { ScheduledEvent } from "@planner/shared";
import { db } from "../db.js";
import type { Broadcaster } from "./broadcaster.js";
import { currentWindow, mapEvent } from "./rows.js";

/**
 * Rule regeneration (DATA_MODEL.md §5.3, §7).
 *
 * Deletes every scheduled_events row linked to the rule in the window and
 * re-inserts fresh occurrences at the reference time. Events with
 * rule_id IS NULL (manual/one-off) are never touched. Runs inside a single
 * transaction; broadcasts happen after commit.
 */

/**
 * Reference time for generation (DATA_MODEL.md §7): an explicit override
 * (form reference time) wins, then the task's earliest occurrence in the
 * window, then the library default 09:00 + duration.
 */
export function computeReference(taskId: number, explicitStartMinute?: number): {
  start: number;
  end: number;
} {
  const duration = (
    db.prepare("SELECT duration_minutes FROM tasks WHERE id = ?").get(taskId) as
      | { duration_minutes: number }
      | undefined
  )?.duration_minutes;
  if (explicitStartMinute != null) {
    const start = Math.max(0, Math.min(1439, Math.round(explicitStartMinute)));
    return { start, end: start + (duration ?? 60) };
  }
  const win = currentWindow();
  const first = db
    .prepare(
      "SELECT start_minute, end_minute FROM scheduled_events WHERE task_id = ? AND event_date >= ? ORDER BY event_date, start_minute LIMIT 1",
    )
    .get(taskId, win.start) as { start_minute: number; end_minute: number } | undefined;
  if (first) return { start: first.start_minute, end: first.end_minute };
  const start = DEFAULT_START_MINUTE;
  return { start, end: start + (duration ?? 60) };
}

const insertEvent = db.prepare(
  `INSERT OR IGNORE INTO scheduled_events (task_id, rule_id, event_date, start_minute, end_minute)
   VALUES (?, ?, ?, ?, ?)`,
);

const regenerateTx = db.transaction(
  (ruleId: number, taskId: number, refStart: number, refEnd: number) => {
    const win = currentWindow();
    const deleted = db
      .prepare(
        "SELECT id FROM scheduled_events WHERE rule_id = ? AND event_date >= ? AND event_date <= ?",
      )
      .all(ruleId, win.start, win.end) as Array<{ id: number }>;
    db.prepare(
      "DELETE FROM scheduled_events WHERE rule_id = ? AND event_date >= ? AND event_date <= ?",
    ).run(ruleId, win.start, win.end);

    const inserted: ScheduledEvent[] = [];
    const rule = db.prepare("SELECT * FROM recurrence_rules WHERE id = ?").get(ruleId) as
      | Record<string, unknown>
      | undefined;
    if (!rule) return { deletedIds: deleted.map((r) => r.id), inserted };

    const dates = occurrenceDates(
      {
        ruleType: rule.rule_type as never,
        daysOfWeek: rule.days_of_week ? (JSON.parse(rule.days_of_week as string) as number[]) : null,
        intervalDays: (rule.interval_days as number | null) ?? null,
        dayOfMonth: (rule.day_of_month as number | null) ?? null,
        monthWeek: (rule.month_week as number | null) ?? null,
        monthDow: (rule.month_dow as number | null) ?? null,
        startDate: rule.start_date as string,
      },
      win.start,
      win.end,
    );
    for (const date of dates) {
      const info = insertEvent.run(taskId, ruleId, date, refStart, refEnd);
      if (info.changes > 0) {
        inserted.push(
          mapEvent(
            db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(info.lastInsertRowid) as Record<
              string,
              unknown
            >,
          ),
        );
      }
    }
    return { deletedIds: deleted.map((r) => r.id), inserted };
  },
);

/** Delete + re-insert all rule-linked events in the window. */
export function regenerateForRule(
  ruleId: number,
  referenceStartMinute: number,
  referenceEndMinute: number,
): { deletedIds: number[]; inserted: ScheduledEvent[] } {
  const rule = db.prepare("SELECT task_id FROM recurrence_rules WHERE id = ?").get(ruleId) as
    | { task_id: number }
    | undefined;
  if (!rule) return { deletedIds: [], inserted: [] };
  return regenerateTx(ruleId, rule.task_id, referenceStartMinute, referenceEndMinute);
}

/** Broadcast helper: emit the deltas a regeneration produced. */
export function broadcastRegeneration(
  broadcast: Broadcaster,
  result: { deletedIds: number[]; inserted: ScheduledEvent[] },
): void {
  broadcast.emitBatch([
    ...result.deletedIds.map((id) => ({ type: "delete" as const, collection: "events" as const, id })),
    ...result.inserted.map((e) => ({
      type: "upsert" as const,
      collection: "events" as const,
      id: e.id,
      data: e,
    })),
  ]);
}
