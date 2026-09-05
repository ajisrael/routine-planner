import { Router } from "express";
import type { Request, Response } from "express";
import type { RecurrenceRuleType, ScheduledEvent } from "@planner/shared";
import { db } from "../db.js";
import { assigneeKey, broadcaster, type Broadcaster } from "../services/broadcaster.js";
import { broadcastRegeneration, computeReference, regenerateForRule } from "../services/regenerate.js";
import {
  currentWindow,
  mapEvent,
  mapRule,
  mapTask,
  todayISO,
} from "../services/rows.js";

export const tasksRouter = Router();

const RULE_TYPES: RecurrenceRuleType[] = [
  "none",
  "weekly_days",
  "interval_days",
  "monthly_date",
  "monthly_weekday",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface RuleBody {
  ruleType: RecurrenceRuleType;
  daysOfWeek?: number[] | null;
  intervalDays?: number | null;
  dayOfMonth?: number | null;
  monthWeek?: number | null;
  monthDow?: number | null;
  startDate?: string;
  refStartMinute?: number | null;
}

function bad(res: Response, msg: string): void {
  res.status(400).json({ error: msg });
}

function getTask(id: number): Record<string, unknown> | undefined {
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
}

function getRuleForTask(taskId: number): Record<string, unknown> | undefined {
  return db.prepare("SELECT * FROM recurrence_rules WHERE task_id = ?").get(taskId) as
    | Record<string, unknown>
    | undefined;
}

interface TaskResponse {
  task: ReturnType<typeof mapTask>;
  rule: ReturnType<typeof mapRule> | null;
  events: ScheduledEvent[];
}

function taskResponse(taskId: number): TaskResponse {
  const win = currentWindow();
  const ruleRow = getRuleForTask(taskId);
  return {
    task: mapTask(getTask(taskId)!),
    rule: ruleRow ? mapRule(ruleRow) : null,
    events: (
      db
        .prepare(
          "SELECT * FROM scheduled_events WHERE task_id = ? AND event_date >= ? AND event_date <= ?",
        )
        .all(taskId, win.start, win.end) as Array<Record<string, unknown>>
    ).map(mapEvent),
  };
}

/** Validate a recurrence payload; returns an error message or null. */
function validateRule(body: RuleBody): string | null {
  if (!RULE_TYPES.includes(body.ruleType)) return "invalid ruleType";
  switch (body.ruleType) {
    case "none":
      return null;
    case "weekly_days": {
      const days = body.daysOfWeek ?? [];
      if (
        !Array.isArray(days) ||
        days.length === 0 ||
        days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)
      ) {
        return "daysOfWeek must be a non-empty array of ints 1–7";
      }
      return null;
    }
    case "interval_days":
      return Number.isInteger(body.intervalDays) && (body.intervalDays as number) >= 1
        ? null
        : "intervalDays must be a positive integer";
    case "monthly_date":
      return Number.isInteger(body.dayOfMonth) &&
        (body.dayOfMonth as number) >= 1 &&
        (body.dayOfMonth as number) <= 31
        ? null
        : "dayOfMonth must be 1–31";
    case "monthly_weekday": {
      const { monthWeek, monthDow } = body;
      if (!Number.isInteger(monthWeek) || !((monthWeek as number) === -1 || ((monthWeek as number) >= 1 && (monthWeek as number) <= 4))) {
        return "monthWeek must be 1–4 or -1";
      }
      if (!Number.isInteger(monthDow) || (monthDow as number) < 1 || (monthDow as number) > 7) {
        return "monthDow must be 1–7";
      }
      return null;
    }
  }
}

function writeRule(body: RuleBody, taskId: number, existingId: number | null): number {
  const startDate =
    typeof body.startDate === "string" && ISO_DATE.test(body.startDate) ? body.startDate : todayISO();
  const daysJson = body.daysOfWeek ? JSON.stringify(body.daysOfWeek) : null;
  const params = [
    body.ruleType,
    daysJson,
    body.ruleType === "interval_days" ? body.intervalDays : null,
    body.ruleType === "monthly_date" ? body.dayOfMonth : null,
    body.ruleType === "monthly_weekday" ? body.monthWeek : null,
    body.ruleType === "monthly_weekday" ? body.monthDow : null,
    startDate,
  ] as const;
  if (existingId != null) {
    db.prepare(
      `UPDATE recurrence_rules SET rule_type = ?, days_of_week = ?, interval_days = ?, day_of_month = ?, month_week = ?, month_dow = ?, start_date = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(...params, existingId);
    return existingId;
  }
  const info = db
    .prepare(
      `INSERT INTO recurrence_rules (task_id, rule_type, days_of_week, interval_days, day_of_month, month_week, month_dow, start_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(taskId, ...params);
  return Number(info.lastInsertRowid);
}

function replaceAssignees(taskId: number, userIds: number[], broadcast: Broadcaster): void {
  const before = db.prepare("SELECT user_id FROM task_assignees WHERE task_id = ?").all(taskId) as Array<{
    user_id: number;
  }>;
  const beforeSet = new Set(before.map((r) => r.user_id));
  const afterSet = new Set(userIds);
  const del = db.prepare("DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?");
  const ins = db.prepare("INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)");
  for (const uid of beforeSet) {
    if (afterSet.has(uid)) continue;
    del.run(taskId, uid);
    broadcast.delete("assignees", assigneeKey(taskId, uid));
  }
  for (const uid of afterSet) {
    if (beforeSet.has(uid)) continue;
    if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(uid)) continue;
    ins.run(taskId, uid);
    broadcast.upsert("assignees", assigneeKey(taskId, uid), { taskId, userId: uid });
  }
}

const parseAssigneeIds = (v: unknown): number[] | null =>
  Array.isArray(v) ? (v as unknown[]).filter((n): n is number => Number.isInteger(n)) : null;

function parseDuration(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 15 && n <= 1440 && n % 15 === 0 ? n : null;
}

// GET /api/tasks — library list
tasksRouter.get("/", (_req: Request, res: Response) => {
  const rows = db
    .prepare("SELECT * FROM tasks ORDER BY active DESC, name COLLATE NOCASE")
    .all() as Array<Record<string, unknown>>;
  res.json(rows.map(mapTask));
});

// POST /api/tasks — create (optionally with assignees + first-time recurrence)
tasksRouter.post("/", (req: Request, res: Response) => {
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const duration = parseDuration(body.durationMinutes);
  if (!name || name.length > 80) return bad(res, "name required (1–80 chars)");
  if (duration == null) return bad(res, "durationMinutes must be a multiple of 15 (15–1440)");

  const recurrence = (body.recurrence ?? null) as RuleBody | null;
  if (recurrence) {
    const err = validateRule(recurrence);
    if (err) return bad(res, err);
  }
  const assignees = parseAssigneeIds(body.assigneeIds) ?? [];
  const categoryId =
    body.categoryId == null ? null : Number(body.categoryId);
  if (categoryId != null && !db.prepare("SELECT 1 FROM categories WHERE id = ?").get(categoryId)) {
    return bad(res, "unknown categoryId");
  }

  const taskId = db.transaction((): number => {
    const info = db
      .prepare("INSERT INTO tasks (name, duration_minutes, notes, category_id) VALUES (?, ?, ?, ?)")
      .run(name, duration, typeof body.notes === "string" && body.notes ? body.notes : null, categoryId);
    const newId = Number(info.lastInsertRowid);
    const insA = db.prepare("INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)");
    for (const uid of assignees) insA.run(newId, uid);
    if (recurrence && recurrence.ruleType !== "none") {
      const ref = computeReference(newId, recurrence.refStartMinute ?? undefined);
      const ruleId = writeRule(recurrence, newId, null);
      broadcastRegeneration(broadcaster, regenerateForRule(ruleId, ref.start, ref.end));
    }
    return newId;
  })();

  const task = mapTask(getTask(taskId)!);
  broadcaster.upsert("tasks", task.id, task);
  broadcaster.emitBatch(
    (db.prepare("SELECT user_id FROM task_assignees WHERE task_id = ?").all(taskId) as Array<{
      user_id: number;
    }>).map((r) => ({
      type: "upsert" as const,
      collection: "assignees" as const,
      id: assigneeKey(taskId, r.user_id),
      data: { taskId, userId: r.user_id },
    })),
  );
  res.status(201).json(taskResponse(taskId));
});

// PUT /api/tasks/:id — update fields + optional assignee replacement
tasksRouter.put("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const row = getTask(id);
  if (!row) {
    res.status(404).json({ error: "task not found" });
    return;
  }
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : (row.name as string);
  if (!name || name.length > 80) return bad(res, "name required (1–80 chars)");
  const duration =
    body.durationMinutes === undefined ? (row.duration_minutes as number) : parseDuration(body.durationMinutes);
  if (duration == null) return bad(res, "durationMinutes must be a multiple of 15 (15–1440)");
  const notes =
    body.notes === undefined ? row.notes : typeof body.notes === "string" && body.notes ? body.notes : null;
  const categoryId =
    body.categoryId === undefined
      ? row.category_id
      : body.categoryId == null
        ? null
        : Number(body.categoryId);
  if (categoryId != null && !db.prepare("SELECT 1 FROM categories WHERE id = ?").get(categoryId)) {
    return bad(res, "unknown categoryId");
  }
  const active = body.active === undefined ? row.active : body.active ? 1 : 0;

  db.prepare(
    "UPDATE tasks SET name = ?, duration_minutes = ?, notes = ?, category_id = ?, active = ? WHERE id = ?",
  ).run(name, duration, notes, categoryId, active, id);
  const task = mapTask(getTask(id)!);
  broadcaster.upsert("tasks", task.id, task);
  if (Array.isArray(body.assigneeIds)) {
    const ids = parseAssigneeIds(body.assigneeIds);
    if (ids != null) replaceAssignees(id, ids, broadcaster);
  }
  res.json(taskResponse(id));
});

// DELETE /api/tasks/:id — hard delete; cascades to rule + occurrences (§5.8)
tasksRouter.delete("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const row = getTask(id);
  if (!row) {
    res.status(404).json({ error: "task not found" });
    return;
  }
  const win = currentWindow();
  const eventIds = (
    db
      .prepare("SELECT id FROM scheduled_events WHERE task_id = ? AND event_date >= ? AND event_date <= ?")
      .all(id, win.start, win.end) as Array<{ id: number }>
  ).map((r) => r.id);
  const rule = getRuleForTask(id);
  const assignees = db.prepare("SELECT user_id FROM task_assignees WHERE task_id = ?").all(id) as Array<{
    user_id: number;
  }>;

  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  broadcaster.emitBatch([
    ...eventIds.map((eid) => ({ type: "delete" as const, collection: "events" as const, id: eid })),
    ...(rule ? [{ type: "delete" as const, collection: "recurrenceRules" as const, id: rule.id as number }] : []),
    ...assignees.map((a) => ({
      type: "delete" as const,
      collection: "assignees" as const,
      id: assigneeKey(id, a.user_id),
    })),
    { type: "delete" as const, collection: "tasks" as const, id },
  ]);
  res.json({ ok: true, deletedEvents: eventIds.length });
});

// PUT /api/tasks/:id/assignees {userIds} — replace the set
tasksRouter.put("/:id/assignees", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!getTask(id)) {
    res.status(404).json({ error: "task not found" });
    return;
  }
  const userIds = parseAssigneeIds(req.body?.userIds);
  if (userIds == null) return bad(res, "userIds must be an array of user ids");
  for (const uid of userIds) {
    if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(uid)) return bad(res, `unknown user id ${uid}`);
  }
  replaceAssignees(id, userIds, broadcaster);
  res.json(taskResponse(id));
});

// PUT /api/tasks/:id/recurrence — set/replace the rule, regenerate the window
tasksRouter.put("/:id/recurrence", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: "task not found" });
    return;
  }
  const body = (req.body ?? {}) as RuleBody;
  const err = validateRule(body);
  if (err) return bad(res, err);

  const win = currentWindow();
  const existing = getRuleForTask(id);
  let detached: number[] = [];
  let changes: { deletedIds: number[]; inserted: ScheduledEvent[] } | null = null;

  db.transaction((): void => {
    if (existing) {
      const ruleId = existing.id as number;
      if (body.ruleType === "none") {
        // §5.7: occurrences are kept but detached from the rule.
        detached = (
          db
            .prepare(
              "SELECT id FROM scheduled_events WHERE rule_id = ? AND event_date >= ? AND event_date <= ?",
            )
            .all(ruleId, win.start, win.end) as Array<{ id: number }>
        ).map((r) => r.id);
        db.prepare("UPDATE scheduled_events SET rule_id = NULL WHERE rule_id = ?").run(ruleId);
        db.prepare(
          "UPDATE recurrence_rules SET rule_type = 'none', days_of_week = NULL, interval_days = NULL, day_of_month = NULL, month_week = NULL, month_dow = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        ).run(ruleId);
      } else {
        const ref = computeReference(id, body.refStartMinute ?? undefined);
        writeRule(body, id, ruleId);
        changes = regenerateForRule(ruleId, ref.start, ref.end);
      }
    } else if (body.ruleType !== "none") {
      const ref = computeReference(id, body.refStartMinute ?? undefined);
      const ruleId = writeRule(body, id, null);
      changes = regenerateForRule(ruleId, ref.start, ref.end);
    }
  })();

  if (detached.length > 0) {
    broadcaster.emitBatch(
      detached.map((eid) => ({
        type: "upsert" as const,
        collection: "events" as const,
        id: eid,
        data: mapEvent(
          db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(eid) as Record<string, unknown>,
        ),
      })),
    );
  } else if (changes) {
    broadcastRegeneration(broadcaster, changes);
  }
  const ruleRow = getRuleForTask(id);
  if (ruleRow) broadcaster.upsert("recurrenceRules", ruleRow.id as number, mapRule(ruleRow));
  res.json(taskResponse(id));
});

// DELETE /api/tasks/:id/events — delete all occurrences (context menu, §5.6)
tasksRouter.delete("/:id/events", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!getTask(id)) {
    res.status(404).json({ error: "task not found" });
    return;
  }
  const win = currentWindow();
  const eventIds = (
    db
      .prepare("SELECT id FROM scheduled_events WHERE task_id = ? AND event_date >= ? AND event_date <= ?")
      .all(id, win.start, win.end) as Array<{ id: number }>
  ).map((r) => r.id);
  db.prepare(
    "DELETE FROM scheduled_events WHERE task_id = ? AND event_date >= ? AND event_date <= ?",
  ).run(id, win.start, win.end);
  broadcaster.emitBatch(
    eventIds.map((eid) => ({ type: "delete" as const, collection: "events" as const, id: eid })),
  );
  res.json({ ok: true, deleted: eventIds.length });
});
