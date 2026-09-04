import type { RecurrenceRule } from "@planner/shared";

/**
 * Pure recurrence engine — implements DATA_MODEL.md §7.
 *
 * occurrenceDates returns the dates (local, ISO strings) on which a rule
 * recurs inside [windowStart, windowEnd), both inclusive.
 */
export function occurrenceDates(
  rule: Pick<RecurrenceRule, "ruleType" | "daysOfWeek" | "intervalDays" | "dayOfMonth" | "monthWeek" | "monthDow" | "startDate">,
  windowStart: string,
  windowEnd: string,
): string[] {
  void rule;
  void windowStart;
  void windowEnd;
  // TODO: implement weekly_days / interval_days / monthly_date / monthly_weekday
  throw new Error("recurrence engine not implemented yet");
}