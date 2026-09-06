import type { RecurrenceRule } from "./index.js";

/**
 * The planner works on a THEORETICAL 30-DAY TEMPLATE MONTH, not real dates:
 * Monday is Day 1, weeks are Days 1–7, 8–14, 15–21, 22–28, plus Days 29–30.
 * This is a repeating routine template — the whole point of the app — so all
 * "dates" are template day numbers stored as zero-padded strings ("01"…"30").
 */

/** Length of the template month. */
export const TEMPLATE_DAYS = 30;

/** Day number → zero-padded storage string ("01"…"30"); sorts lexically. */
export function templateDay(day: number): string {
  return String(day).padStart(2, "0");
}

/** Storage string → day number. */
export function templateDayNumber(day: string): number {
  return Number.parseInt(day, 10);
}

/** Day-of-week within the template, Mon=1 … Sun=7 (Day 1 is Monday). */
export function templateDow(day: number): number {
  return ((day - 1) % 7) + 1;
}

/** 1-based week index inside the template (week 5 has only Days 29–30). */
export function templateWeek(day: number): number {
  return Math.floor((day - 1) / 7) + 1;
}

export const TEMPLATE_WEEKS = 5;

export const TEMPLATE_DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function templateDowLabel(day: number): string {
  return TEMPLATE_DOW_LABELS[templateDow(day) - 1];
}

/** Days in a template week (7 for weeks 1–4; week 5 holds Days 29–30). */
export function daysInTemplateWeek(week: number): number {
  return TEMPLATE_DAYS - (week - 1) * 7 >= 7 ? 7 : TEMPLATE_DAYS - (week - 1) * 7;
}

/** First day number of a template week. */
export function templateWeekStart(week: number): number {
  return (week - 1) * 7 + 1;
}

export type RuleShape = Pick<
  RecurrenceRule,
  "ruleType" | "daysOfWeek" | "intervalDays" | "dayOfMonth" | "monthWeek" | "monthDow" | "startDate"
>;

/**
 * Template days (numbers) on which the rule recurs inside [firstDay, lastDay],
 * inclusive. Semantics (DATA_MODEL.md §7, template month):
 * - `weekly_days`: every template day whose weekday is listed.
 * - `interval_days`: every N days counted from Day 1.
 * - `monthly_date`: that exact template day ("Day 15 of the template").
 * - `monthly_weekday`: not representable in the template — matches nothing.
 */
export function occurrenceDays(
  rule: RuleShape,
  firstDay = 1,
  lastDay = TEMPLATE_DAYS,
): number[] {
  if (rule.ruleType === "none" || lastDay < firstDay) return [];
  const out: number[] = [];
  const dows = new Set(rule.daysOfWeek ?? []);

  for (let day = Math.max(1, firstDay); day <= Math.min(TEMPLATE_DAYS, lastDay); day++) {
    switch (rule.ruleType) {
      case "weekly_days":
        if (dows.has(templateDow(day))) out.push(day);
        break;
      case "interval_days":
        if ((day - 1) % (rule.intervalDays ?? 1) === 0) out.push(day);
        break;
      case "monthly_date":
        if (rule.dayOfMonth != null && day === rule.dayOfMonth) out.push(day);
        break;
      case "monthly_weekday":
        break;
    }
  }
  return out;
}

const DOW_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
      return `Day ${rule.dayOfMonth ?? 1} of template`;
    case "monthly_weekday":
      return "Custom (not in template)";
  }
}
