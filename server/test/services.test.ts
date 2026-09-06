import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Point the DB at a throwaway file BEFORE importing any module that opens it.
process.env.PLANNER_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "planner-test-")), "test.db");

const { db } = await import("../src/db.js");
const { regenerateForRule, computeReference } = await import("../src/services/regenerate.js");
const { syncOccurrenceToSiblings } = await import("../src/services/syncActions.js");
const { broadcaster } = await import("../src/services/broadcaster.js");
const { occurrenceDates } = await import("@planner/shared");

/** Insert a task + rule and return ids. */
function makeTask(name: string, duration = 60, ruleType: string | null = null): { taskId: number; ruleId: number | null } {
  const t = db.prepare("INSERT INTO tasks (name, duration_minutes) VALUES (?, ?)").run(name, duration);
  const taskId = Number(t.lastInsertRowid);
  let ruleId: number | null = null;
  if (ruleType) {
    const r = db
      .prepare("INSERT INTO recurrence_rules (task_id, rule_type, start_date) VALUES (?, ?, '2020-01-01')")
      .run(taskId, ruleType);
    ruleId = Number(r.lastInsertRowid);
  }
  return { taskId, ruleId };
}

describe("regenerate service", () => {
  it("generates occurrences at the reference time for the whole window", () => {
    const { taskId, ruleId } = makeTask("Dishes", 45, "weekly_days");
    db.prepare("UPDATE recurrence_rules SET rule_type = 'weekly_days', days_of_week = '[1,3,5]' WHERE id = ?").run(ruleId);

    const result = regenerateForRule(ruleId!, 540, 585);
    expect(result.inserted.length).toBeGreaterThanOrEqual(10); // ≥3/week × 30 days
    for (const e of result.inserted) {
      expect(e.taskId).toBe(taskId);
      expect(e.startMinute).toBe(540);
      expect(e.endMinute).toBe(585);
    }
    // idempotent: regenerating again replaces (no duplicates)
    const again = regenerateForRule(ruleId!, 540, 585);
    const total = db.prepare("SELECT COUNT(*) AS n FROM scheduled_events WHERE rule_id = ?").get(ruleId) as { n: number };
    expect(again.inserted.length).toBe(total.n);
  });

  it("never touches manual (rule_id NULL) events", () => {
    const { taskId, ruleId } = makeTask("Walk", 30, "weekly_days");
    db.prepare("UPDATE recurrence_rules SET rule_type = 'weekly_days', days_of_week = '[2]' WHERE id = ?").run(ruleId);
    const manual = db
      .prepare("INSERT INTO scheduled_events (task_id, rule_id, event_date, start_minute, end_minute) VALUES (?, NULL, '2026-09-08', 720, 750)")
      .run(taskId);
    regenerateForRule(ruleId!, 540, 570);
    const still = db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(manual.lastInsertRowid) as Record<string, unknown>;
    expect(still.start_minute).toBe(720);
    expect(still.rule_id).toBeNull();
  });

  it("computeReference prefers an existing occurrence, else 09:00", async () => {
    const { currentWindow } = await import("../src/services/rows.js");
    const win = currentWindow();
    const { taskId } = makeTask("Ref", 60, null);
    expect(computeReference(taskId)).toEqual({ start: 540, end: 600 });
    db.prepare("INSERT INTO scheduled_events (task_id, rule_id, event_date, start_minute, end_minute) VALUES (?, NULL, ?, 1020, 1080)").run(taskId, win.end);
    expect(computeReference(taskId)).toEqual({ start: 1020, end: 1080 });
    expect(computeReference(taskId, 300)).toEqual({ start: 300, end: 360 });
  });
});

describe("sync service (DATA_MODEL.md §5.5)", () => {
  it("sync-to-all updates every sibling; future only >= anchor date", async () => {
    const { addDaysISO } = await import("@planner/shared");
    const { todayISO } = await import("../src/services/rows.js");
    const today = todayISO();
    const { taskId } = makeTask("SyncMe", 30, null);
    const ins = db.prepare(
      "INSERT INTO scheduled_events (task_id, rule_id, event_date, start_minute, end_minute) VALUES (?, NULL, ?, ?, ?)",
    );
    const e1 = ins.run(taskId, addDaysISO(today, -1), 480, 510);
    const e2 = ins.run(taskId, addDaysISO(today, 0), 600, 630);
    const e3 = ins.run(taskId, addDaysISO(today, 5), 720, 750);

    const changed = syncOccurrenceToSiblings(Number(e1.lastInsertRowid), "future", broadcaster);
    expect(changed.map((c) => c.id).sort()).toEqual([Number(e2.lastInsertRowid), Number(e3.lastInsertRowid)].sort());
    for (const id of [Number(e2.lastInsertRowid), Number(e3.lastInsertRowid)]) {
      const row = db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(id) as Record<string, unknown>;
      expect(row.start_minute).toBe(480);
      expect(row.end_minute).toBe(510);
    }

    // Move the anchor, then sync-to-all propagates the new time everywhere.
    db.prepare("UPDATE scheduled_events SET start_minute = 900, end_minute = 930 WHERE id = ?").run(Number(e1.lastInsertRowid));
    const all = syncOccurrenceToSiblings(Number(e1.lastInsertRowid), "all", broadcaster);
    expect(all).toHaveLength(2);
    const row1 = db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(e1.lastInsertRowid) as Record<string, unknown>;
    expect(row1.start_minute).toBe(900);
    const row3 = db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(e3.lastInsertRowid) as Record<string, unknown>;
    expect(row3.start_minute).toBe(900);
  });

  it("skips siblings that would collide with the anchor slot on the same day", () => {
    const { taskId } = makeTask("Collider", 30, null);
    const ins = db.prepare(
      "INSERT INTO scheduled_events (task_id, rule_id, event_date, start_minute, end_minute) VALUES (?, NULL, ?, ?, ?)",
    );
    const a = ins.run(taskId, "2026-09-01", 480, 510);
    // Same day, different start — legal. Syncing all to 480 would collide
    // with the anchor itself → the sibling must be skipped, not thrown.
    const b = ins.run(taskId, "2026-09-01", 720, 750);
    const changed = syncOccurrenceToSiblings(Number(a.lastInsertRowid), "all", broadcaster);
    expect(changed).toHaveLength(0);
    const rowB = db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(b.lastInsertRowid) as Record<string, unknown>;
    expect(rowB.start_minute).toBe(720);
  });
});

describe("broadcaster", () => {
  it("emits deltas through socket.io when connected", async () => {
    const http = await import("node:http");
    const { createRealtimeServer } = await import("../src/realtime.js");
    const server = http.createServer();
    const io = createRealtimeServer(server);
    const seen: string[] = [];
    io.emit = ((ev: string, payload: unknown) => {
      seen.push(`${ev}:${JSON.stringify(payload)}`);
    }) as typeof io.emit;
    broadcaster.upsert("tasks", 1, { id: 1 });
    broadcaster.delete("events", 7);
    broadcaster.emitBatch([{ type: "upsert", collection: "events", id: 9, data: {} }]);
    expect(seen).toHaveLength(3);
    expect(seen[0]).toContain('"collection":"tasks"');
    io.close();
    server.close();
  });
});

describe("occurrenceDates sanity through services", () => {
  it("monthly_date skips missing days", () => {
    expect(occurrenceDates(
      { ruleType: "monthly_date", daysOfWeek: null, intervalDays: null, dayOfMonth: 30, monthWeek: null, monthDow: null, startDate: "2026-01-30" },
      "2026-02-01",
      "2026-03-31",
    )).toEqual(["2026-03-30"]);
  });
});
