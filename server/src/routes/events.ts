import { Router } from "express";
import type { Request, Response } from "express";
import { TEMPLATE_DAYS, templateDay, templateDayNumber } from "@planner/shared";
import { db } from "../db.js";
import { broadcaster } from "../services/broadcaster.js";
import { syncOccurrenceToSiblings, type SyncScope } from "../services/syncActions.js";
import { mapEvent } from "../services/rows.js";
import {
  broadcastRegeneration,
  currentReferenceStart,
  regenerateForRule,
  ruleCoversTemplateDay,
  ruleHasOccurrences,
} from "../services/regenerate.js";

export const eventsRouter = Router();

/** Template day storage strings are zero-padded ("01"…"30"). */
export function isValidTemplateDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{2}$/.test(v)) return false;
  const n = templateDayNumber(v);
  return n >= 1 && n <= TEMPLATE_DAYS;
}

function bad(res: Response, msg: string): void {
  res.status(400).json({ error: msg });
}

function getEvent(id: number): Record<string, unknown> | undefined {
  return db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
}

const clampStart = (n: number): number => Math.max(0, Math.min(1439, Math.round(n)));
const clampEnd = (n: number): number => Math.max(1, Math.min(1440, Math.round(n)));

// GET /api/events?from&to&person — events in a template-day range, optional person filter
eventsRouter.get("/", (req: Request, res: Response) => {
  const from = isValidTemplateDay(req.query.from) ? req.query.from : "01";
  const to = isValidTemplateDay(req.query.to) ? req.query.to : templateDay(TEMPLATE_DAYS);
  const person = req.query.person == null ? null : Number(req.query.person);

  let sql = "SELECT * FROM scheduled_events WHERE event_date >= ? AND event_date <= ?";
  const params: Array<string | number> = [from, to];
  if (person != null) {
    sql += " AND task_id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)";
    params.push(person);
  }
  sql += " ORDER BY event_date, start_minute";
  res.json((db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(mapEvent));
});

// POST /api/events — create one event (drag from library / one-off), §5.2
eventsRouter.post("/", (req: Request, res: Response) => {
  const body = req.body ?? {};
  const taskId = Number(body.taskId);
  const eventDate = body.eventDate;
  const startMinute = Number(body.startMinute);
  if (!Number.isInteger(taskId)) return bad(res, "taskId required");
  if (!isValidTemplateDay(eventDate)) return bad(res, `eventDate must be a template day (01–${TEMPLATE_DAYS})`);
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) {
    return bad(res, "startMinute must be 0–1439");
  }

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as
    | Record<string, unknown>
    | undefined;
  if (!task) return bad(res, "task not found");

  let endMinute =
    body.endMinute === undefined || body.endMinute === null
      ? startMinute + (task.duration_minutes as number)
      : Number(body.endMinute);
  endMinute = clampEnd(endMinute);
  if (endMinute <= startMinute) return bad(res, "endMinute must be greater than startMinute");

  // Recurring tasks: the placement DEFINES the rule's time. Dropping at a new
  // time re-anchors every generated occurrence to it; the dropped instance is
  // kept detached (rule-less) when it is not a rule day so it survives
  // regeneration (instance-first, §5.2/§5.3). Dropping at the current
  // reference time adds a plain instance, as before.
  const rule = db
    .prepare(
      "SELECT id FROM recurrence_rules WHERE task_id = ? AND rule_type != 'none'",
    )
    .get(taskId) as { id: number } | undefined;

  if (rule) {
    const reanchor =
      !ruleHasOccurrences(rule.id) || startMinute !== currentReferenceStart(taskId, rule.id);

    if (reanchor && ruleCoversTemplateDay(rule.id, templateDayNumber(eventDate))) {
      // The dropped day is a rule day — regeneration covers it entirely.
      broadcastRegeneration(broadcaster, regenerateForRule(rule.id, clampStart(startMinute), endMinute));
      const fresh = db
        .prepare(
          "SELECT * FROM scheduled_events WHERE task_id = ? AND event_date = ? AND start_minute = ?",
        )
        .get(taskId, eventDate, clampStart(startMinute)) as Record<string, unknown> | undefined;
      if (!fresh) {
        res.status(409).json({ error: "an occurrence of this task already starts at this time" });
        return;
      }
      res.status(201).json(mapEvent(fresh));
      return;
    }

    if (reanchor) {
      // Non-rule day at a new time: keep the drop detached, re-anchor the rest.
      const inserted = insertEvent(taskId, null, eventDate, clampStart(startMinute), endMinute);
      broadcastRegeneration(broadcaster, regenerateForRule(rule.id, clampStart(startMinute), endMinute));
      res.status(201).json(mapEvent(getEvent(Number(inserted.lastInsertRowid))!));
      return;
    }
  }

  try {
    // Attach the rule only when the day is a rule day — a same-time extra on
    // a non-rule day stays detached so regeneration never wipes it (§5.2).
    const attach = rule && ruleCoversTemplateDay(rule.id, templateDayNumber(eventDate));
    const info = insertEvent(taskId, attach ? rule!.id : null, eventDate, clampStart(startMinute), endMinute);
    const event = mapEvent(getEvent(Number(info.lastInsertRowid))!);
    broadcaster.upsert("events", event.id, event);
    res.status(201).json(event);
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint")) {
      res.status(409).json({ error: "an occurrence of this task already starts at this time" });
      return;
    }
    throw e;
  }
});

const insertEvent = (
  taskId: number,
  ruleId: number | null,
  eventDate: string,
  startMinute: number,
  endMinute: number,
) =>
  db
    .prepare(
      "INSERT INTO scheduled_events (task_id, rule_id, event_date, start_minute, end_minute) VALUES (?, ?, ?, ?, ?)",
    )
    .run(taskId, ruleId, eventDate, startMinute, endMinute);

// PUT /api/events/:id — move / resize one occurrence (§5.4)
eventsRouter.put("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const row = getEvent(id);
  if (!row) {
    res.status(404).json({ error: "event not found" });
    return;
  }
  const body = req.body ?? {};
  const eventDate =
    body.eventDate === undefined ? (row.event_date as string) : (body.eventDate as string);
  if (!isValidTemplateDay(eventDate)) return bad(res, `eventDate must be a template day (01–${TEMPLATE_DAYS})`);

  const startChanged = body.startMinute !== undefined;
  const endChanged = body.endMinute !== undefined;
  let startMinute = startChanged ? Number(body.startMinute) : (row.start_minute as number);
  let endMinute = endChanged ? Number(body.endMinute) : (row.end_minute as number);
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
    return bad(res, "startMinute/endMinute must be integers");
  }
  // Move without an explicit end keeps the duration.
  if (startChanged && !endChanged) endMinute = endMinute + (startMinute - (row.start_minute as number));
  startMinute = clampStart(startMinute);
  endMinute = clampEnd(endMinute);
  if (endMinute <= startMinute) return bad(res, "endMinute must be greater than startMinute");

  try {
    db.prepare(
      "UPDATE scheduled_events SET event_date = ?, start_minute = ?, end_minute = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(eventDate, startMinute, endMinute, id);
    const event = mapEvent(getEvent(id)!);
    broadcaster.upsert("events", event.id, event);
    res.json(event);
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint")) {
      res.status(409).json({ error: "another occurrence of this task already starts at this time" });
      return;
    }
    throw e;
  }
});

// DELETE /api/events/:id — delete one occurrence (§5.6)
eventsRouter.delete("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM scheduled_events WHERE id = ?").run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: "event not found" });
    return;
  }
  broadcaster.delete("events", id);
  res.json({ ok: true });
});

// POST /api/events/:id/sync {scope: 'all' | 'future', durationMinutes?} —
// propagate to siblings (§5.5). An explicit durationMinutes re-lengthens the
// anchor and siblings (task-form "Sync Tasks" pushes the dialog's duration).
eventsRouter.post("/:id/sync", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const scope: SyncScope = req.body?.scope === "future" ? "future" : "all";
  if (!getEvent(id)) {
    res.status(404).json({ error: "event not found" });
    return;
  }
  let duration: number | undefined;
  if (req.body?.durationMinutes !== undefined) {
    const n = Number(req.body.durationMinutes);
    if (!Number.isInteger(n) || n < 15 || n > 1440 || n % 15 !== 0) {
      res.status(400).json({ error: "durationMinutes must be a multiple of 15 (15–1440)" });
      return;
    }
    duration = n;
  }
  const updated = syncOccurrenceToSiblings(id, scope, broadcaster, duration);
  res.json({ ok: true, updated });
});
