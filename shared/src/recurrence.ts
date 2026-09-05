import type { RecurrenceRule, RecurrenceRuleType } from "./index.js";

/**
 * Pure recurrence engine (DATA_MODEL.md §7).
 *
 * Dates are local ISO strings ("YYYY-MM-DD"); all arithmetic uses UTC day
 * granularity so DST never shifts a date. Day-of-week numbers are Mon=1…Sun=7.
 */

export type RuleShape = Pick<
  RecurrenceRule,
  "ruleType" | "daysOfWeek" | "intervalDays" | "dayOfMonth" | "monthWeek" | "monthDow" | "startDate"
>;

interface YMD {
  y: number;
  m: number;
  d: number;
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function parseISODate(iso: string): YMD {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`invalid ISO date: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

const utcMs = ({ y, m, d }: YMD): number => Date.UTC(y, m - 1, d);

const ymdISO = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/** Day of week, Mon=1 … Sun=7. */
export function isoDow(iso: string): number {
  const js = new Date(utcMs(parseISODate(iso))).getUTCDay();
  return js === 0 ? 7 : js;
}

export function addDaysISO(iso: string, n: number): string {
  const dt = new Date(utcMs(parseISODate(iso)) + n * 86_400_000);
  return ymdISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole calendar days from a to b (negative when b is before a). */
export function daysBetweenISO(a: string, b: string): number {
  return Math.round((utcMs(parseISODate(b)) - utcMs(parseISODate(a))) / 86_400_000);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** True when `iso` is the `week`-th `dow` of its month (week = -1 → last). */
function isNthWeekday(iso: string, week: number, dow: number): boolean {
  const { y, m, d } = parseISODate(iso);
  const firstDow = isoDow(ymdISO(y, m, 1));
  const offset = (dow - firstDow + 7) % 7;
  if (week === -1) return d + 7 > daysInMonth(y, m);
  return Math.floor((d - 1 - offset) / 7) + 1 === week;
}

/**
 * Dates on which the rule recurs inside [windowStart, windowEnd], inclusive.
 * `startDate` acts as an inclusive lower bound (anchor for interval algebra).
 */
export function occurrenceDates(rule: RuleShape, windowStart: string, windowEnd: string): string[] {
  if (rule.ruleType === "none" || windowStart > windowEnd) return [];
  const from = rule.startDate > windowStart ? rule.startDate : windowStart;
  const out: string[] = [];
  const dows = new Set(rule.daysOfWeek ?? []);

  for (let cur = from; cur <= windowEnd; cur = addDaysISO(cur, 1)) {
    switch (rule.ruleType) {
      case "weekly_days":
        if (dows.has(isoDow(cur))) out.push(cur);
        break;
      case "interval_days": {
        const n = rule.intervalDays ?? 1;
        if (daysBetweenISO(rule.startDate, cur) % n === 0) out.push(cur);
        break;
      }
      case "monthly_date":
        if (rule.dayOfMonth != null && parseISODate(cur).d === rule.dayOfMonth) out.push(cur);
        break;
      case "monthly_weekday":
        if (
          rule.monthDow != null &&
          rule.monthWeek != null &&
          isoDow(cur) === rule.monthDow &&
          isNthWeekday(cur, rule.monthWeek, rule.monthDow)
        ) {
          out.push(cur);
        }
        break;
    }
  }
  return out;
}

const DOW_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ORDINALS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", [-1]: "Last" };

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Human label for a rule's date pattern, e.g. "Daily", "Weekdays", "Every 14d". */
export function describeRule(rule: RuleShape): string {
  switch (rule.ruleType) {
    case "none":
      return "One-off";
    case "weekly_days": {
      const days = [...(rule.daysOfWeek ?? [])].sort((a, b) => a - b);
      if (days.length === 7) return "Daily";
      if (days.join() === "1,2,3,4,5") return "Weekdays";
      if (days.length === 0) return "One-off";
      return days.map((d) => DOW_LABELS[d]).join(" ");
    }
    case "interval_days":
      return `Every ${rule.intervalDays ?? 1}d`;
    case "monthly_date":
      return `Monthly on the ${ordinal(rule.dayOfMonth ?? 1)}`;
    case "monthly_weekday": {
      const w = ORDINALS[rule.monthWeek ?? 1] ?? "1st";
      return `${w} ${DOW_LABELS[rule.monthDow ?? 1]} of month`;
    }
  }
}

/** Does `date` fall on an occurrence date of the rule? (cheap single-date check) */
export function ruleMatchesDate(rule: RuleShape, date: string): boolean {
  return occurrenceDates(rule, date, date).length > 0;
}

export type { RecurrenceRuleType };
