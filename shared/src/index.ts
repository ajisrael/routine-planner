/**
 * Shared entity + API types (finalized in DATA_MODEL.md).
 *
 * Field names mirror the SQL schema exactly so repository code, route
 * handlers and the client store all speak the same shape.
 */

/** Family member. `is_login_user=1` for Mom/Dad; personas never log in. */
export interface User {
  id: number;
  /** Present only for login users; set by `/api/auth/login`. */
  username: string | null;
  displayName: string;
  isLoginUser: boolean;
  createdAt: string;
}

/** Optional grouping/colour for tasks. */
export interface Category {
  id: number;
  name: string;
  color: string | null;
}

/** Reusable task definition. Exists in the library whether or not scheduled. */
export interface Task {
  id: number;
  name: string;
  /** Expected duration, 15-min increments. */
  durationMinutes: number;
  notes: string | null;
  categoryId: number | null;
  /** Soft-delete flag; active=false hides from library + calendar. */
  active: boolean;
}

/** Many-to-many: people (login users and personas) responsible for a task. */
export interface TaskAssignee {
  taskId: number;
  userId: number;
}

export type RecurrenceRuleType =
  | "none"
  | "weekly_days"
  | "interval_days"
  | "monthly_date"
  | "monthly_weekday";

/** Defines on which dates a task recurs. One row per task. */
export interface RecurrenceRule {
  id: number;
  taskId: number;
  ruleType: RecurrenceRuleType;
  /** JSON array of ints, Mon=1…Sun=7. For `weekly_days`. */
  daysOfWeek: number[] | null;
  /** Every N days. For `interval_days` (every 2 weeks = 14). */
  intervalDays: number | null;
  /** Day of month 1…31. For `monthly_date`. */
  dayOfMonth: number | null;
  /** 1…4 or -1 for last. For `monthly_weekday`. */
  monthWeek: number | null;
  /** 1…7 (Mon=1). For `monthly_weekday`. */
  monthDow: number | null;
  /** Anchor date (ISO, local) for interval/weekday algebra. */
  startDate: string;
  updatedAt: string;
}

/** One materialized occurrence — the "planned routine". */
export interface ScheduledEvent {
  id: number;
  taskId: number;
  /** Null for one-off (non-recurring) events. */
  ruleId: number | null;
  /** ISO date, local. */
  eventDate: string;
  /** Minutes from local midnight. */
  startMinute: number;
  endMinute: number;
  createdAt: string;
  updatedAt: string;
}

/** Full dataset returned by `GET /api/snapshot`. */
export interface Snapshot {
  users: User[];
  categories: Category[];
  tasks: Task[];
  assignees: TaskAssignee[];
  recurrenceRules: RecurrenceRule[];
  events: ScheduledEvent[];
}

/** 30-day display/generation horizon — the theoretical template month. */
export { TEMPLATE_DAYS } from "./recurrence.js";

/** Snapped to the calendar's 15-minute granularity. */
export const SLOT_MINUTES = 15;

/** Default start time (09:00) when no reference time is recorded. */
export const DEFAULT_START_MINUTE = 540;

export * from "./recurrence.js";