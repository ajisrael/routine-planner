import { addDaysISO } from "@planner/shared";
import type {
  Category,
  ScheduledEvent,
  Snapshot,
  Task,
  TaskAssignee,
  User,
  RecurrenceRule,
} from "@planner/shared";
import { db } from "../db.js";

/** Snake_case DB rows → shared camelCase entities. */
export function mapUser(r: Record<string, unknown>): User {
  return {
    id: r.id as number,
    username: (r.username as string | null) ?? null,
    displayName: r.display_name as string,
    isLoginUser: r.is_login_user === 1,
    createdAt: r.created_at as string,
  };
}

export function mapCategory(r: Record<string, unknown>): Category {
  return { id: r.id as number, name: r.name as string, color: (r.color as string | null) ?? null };
}

export function mapTask(r: Record<string, unknown>): Task {
  return {
    id: r.id as number,
    name: r.name as string,
    durationMinutes: r.duration_minutes as number,
    notes: (r.notes as string | null) ?? null,
    categoryId: (r.category_id as number | null) ?? null,
    active: r.active === 1,
  };
}

export function mapRule(r: Record<string, unknown>): RecurrenceRule {
  let days: number[] | null = null;
  if (r.days_of_week != null) {
    try {
      days = JSON.parse(r.days_of_week as string) as number[];
    } catch {
      days = null;
    }
  }
  return {
    id: r.id as number,
    taskId: r.task_id as number,
    ruleType: r.rule_type as RecurrenceRule["ruleType"],
    daysOfWeek: days,
    intervalDays: (r.interval_days as number | null) ?? null,
    dayOfMonth: (r.day_of_month as number | null) ?? null,
    monthWeek: (r.month_week as number | null) ?? null,
    monthDow: (r.month_dow as number | null) ?? null,
    startDate: r.start_date as string,
    updatedAt: r.updated_at as string,
  };
}

export function mapEvent(r: Record<string, unknown>): ScheduledEvent {
  return {
    id: r.id as number,
    taskId: r.task_id as number,
    ruleId: (r.rule_id as number | null) ?? null,
    eventDate: r.event_date as string,
    startMinute: r.start_minute as number,
    endMinute: r.end_minute as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function mapAssignee(r: Record<string, unknown>): TaskAssignee {
  return { taskId: r.task_id as number, userId: r.user_id as number };
}

/** Local "today" as an ISO date string (server-local timezone). */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Inclusive 30-day window [today, today + WINDOW_DAYS - 1]. */
export function currentWindow(): { start: string; end: string } {
  const start = todayISO();
  return { start, end: addDaysISO(start, 29) };
}

/** Full-dataset snapshot for initial load and reconnect (ARCHITECTURE.md §6.1). */
export function buildSnapshot(): Snapshot {
  const win = currentWindow();
  const rows = (sql: string, ...params: Array<string | number>): Record<string, unknown>[] =>
    db.prepare(sql).all(...params) as Record<string, unknown>[];

  return {
    users: rows("SELECT * FROM users ORDER BY id").map(mapUser),
    categories: rows("SELECT * FROM categories ORDER BY name").map(mapCategory),
    tasks: rows("SELECT * FROM tasks ORDER BY name COLLATE NOCASE").map(mapTask),
    assignees: rows("SELECT * FROM task_assignees").map(mapAssignee),
    recurrenceRules: rows("SELECT * FROM recurrence_rules").map(mapRule),
    events: rows(
      "SELECT * FROM scheduled_events WHERE event_date >= ? AND event_date <= ? ORDER BY event_date, start_minute",
      win.start,
      win.end,
    ).map(mapEvent),
  };
}
