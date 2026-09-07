import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/core";
import { yToMinute } from "../../components/calendar/geometry";
import type { TaskRulePayload } from "../../api/client";

/** Snapped start minute under the pointer for a drag event. */
export function pointerMinute(
  event: DragEndEvent | DragMoveEvent,
  hourHeight: number,
  over: { rect: { top: number } } | null,
): number {
  const rect = over?.rect;
  if (!rect) return 540;
  const pointerY = (event.activatorEvent as PointerEvent).clientY + event.delta.y;
  return yToMinute(pointerY - rect.top, hourHeight);
}

export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/** Daily pattern: every weekday starting at the given reference minute. */
export function dailyPattern(startMinute: number): TaskRulePayload {
  return { ruleType: "weekly_days", daysOfWeek: [...ALL_WEEKDAYS], refStartMinute: startMinute, startDate: "01" };
}

/** Weekly pattern anchored on specific weekdays. */
export function weeklyPattern(days: number[], refStartMinute: number): TaskRulePayload {
  return { ruleType: "weekly_days", daysOfWeek: days, refStartMinute, startDate: "01" };
}

/** Monthly pattern on one day of the month. */
export function monthlyPattern(dayOfMonth: number, refStartMinute: number): TaskRulePayload {
  return { ruleType: "monthly_date", dayOfMonth, refStartMinute, startDate: "01" };
}