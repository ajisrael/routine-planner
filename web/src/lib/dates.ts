/**
 * The planner runs on a theoretical 30-day template month (Monday = Day 1),
 * not real dates. Days are stored/displayed as zero-padded strings "01"…"30";
 * times remain real minutes-from-midnight.
 */
import { TEMPLATE_DAYS, templateDowLabel } from "@planner/shared";

export { TEMPLATE_DAYS, templateDay, templateDayNumber, templateDow, templateWeek } from "@planner/shared";

/** Monday-first weekday labels; Day 1 is a Monday. */
export const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function dayNumber(day: string): number {
  return Number.parseInt(day, 10);
}

export function dayDowLabel(day: string): string {
  return templateDowLabel(dayNumber(day));
}

/** 1-based week index (week 5 = Days 29–30). */
export function weekOf(day: string): number {
  return Math.floor((dayNumber(day) - 1) / 7) + 1;
}

export function weekStartDay(week: number): number {
  return (week - 1) * 7 + 1;
}

/** Days in a template week: 7 for weeks 1–4, 2 for week 5. */
export function daysInWeek(week: number): number {
  return Math.min(7, TEMPLATE_DAYS - (week - 1) * 7);
}

/** Zero-padded day strings of a template week (week 5 → 2 days). */
export function weekDays(week: number): string[] {
  const start = weekStartDay(week);
  return Array.from({ length: daysInWeek(week) }, (_, i) => String(start + i).padStart(2, "0"));
}

/** All 30 template day strings, "01"…"30". */
export function allTemplateDays(): string[] {
  return Array.from({ length: TEMPLATE_DAYS }, (_, i) => String(i + 1).padStart(2, "0"));
}

/** "Day 12 · Fri" */
export function dayLabel(day: string): string {
  return `Day ${dayNumber(day)} · ${dayDowLabel(day)}`;
}

/** "Week 2 · Days 8–14" */
export function weekLabel(week: number): string {
  const start = weekStartDay(week);
  const end = start + daysInWeek(week) - 1;
  return `Week ${week} · Days ${start}–${end}`;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Minutes-from-midnight → "HH:MM". */
export const fmtTime = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(Math.round(minutes % 60))}`;

/** "HH:MM" → minutes-from-midnight. */
export function parseTime(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 9) * 60 + (m ?? 0);
}
