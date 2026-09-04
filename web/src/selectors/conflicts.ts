import type { ScheduledEvent } from "@planner/shared";

/** Person ids this event conflicts with, per ARCHITECTURE.md §4.5. */
export function conflictsFor(event: ScheduledEvent, _events: ScheduledEvent[]): number[] {
  void event;
  void _events;
  // TODO: for each assignee of event's task, flag overlap on same date with
  // another event sharing that assignee. Pure function of store state → the
  // warning updates instantly as events move.
  throw new Error("conflict selector not implemented yet");
}