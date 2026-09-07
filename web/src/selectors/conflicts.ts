import type { ScheduledEvent, Task, TaskAssignee, User } from "@planner/shared";

/**
 * Conflict detection, computed at read time (ARCHITECTURE.md §4.5,
 * DATA_MODEL.md §6): two events on the same date conflict when their
 * [start, end) ranges overlap AND their tasks share at least one assignee.
 * Tasks with no assignees never conflict. Pure function of store state.
 */

function assigneeSets(tasks: Task[], assignees: TaskAssignee[]): Map<number, Set<number>> {
  const sets = new Map<number, Set<number>>();
  for (const t of tasks) sets.set(t.id, new Set());
  for (const a of assignees) sets.get(a.taskId)?.add(a.userId);
  return sets;
}

const overlaps = (a: ScheduledEvent, b: ScheduledEvent): boolean =>
  a.startMinute < b.endMinute && b.startMinute < a.endMinute;

export interface ConflictResult {
  /** eventId → user ids double-booked on that event. */
  byEvent: Map<number, number[]>;
  /** Total number of conflicted events. */
  count: number;
}

export function computeConflicts(
  events: ScheduledEvent[],
  tasks: Task[],
  assignees: TaskAssignee[],
): ConflictResult {
  const byEvent = new Map<number, number[]>();
  const sets = assigneeSets(tasks, assignees);
  const byDate = new Map<string, ScheduledEvent[]>();
  for (const e of events) {
    if (!sets.get(e.taskId)?.size) continue; // no assignees → never conflicts
    const list = byDate.get(e.eventDate);
    if (list) list.push(e);
    else byDate.set(e.eventDate, [e]);
  }

  for (const list of byDate.values()) {
    list.sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.startMinute >= b.endMinute) continue; // sorted → j onward can't overlap either
        if (!overlaps(a, b)) continue;
        const shared = [...sets.get(a.taskId)!].filter((u) => sets.get(b.taskId)!.has(u));
        if (shared.length === 0) continue;
        for (const [ev, person] of [
          [a, shared] as const,
          [b, shared] as const,
        ]) {
          const existing = byEvent.get(ev.id) ?? [];
          for (const p of person) if (!existing.includes(p)) existing.push(p);
          byEvent.set(ev.id, existing);
        }
      }
    }
  }
  return { byEvent, count: byEvent.size };
}

/** Conflicted persons for a single event (for toasts). */
export function conflictedPersonsFor(
  event: ScheduledEvent,
  events: ScheduledEvent[],
  tasks: Task[],
  assignees: TaskAssignee[],
): number[] {
  const result = computeConflicts(events, tasks, assignees);
  return result.byEvent.get(event.id) ?? [];
}

/** Keep only events whose task assigns to the given person (null = everyone). */
export function filterEventsByPerson(
  events: ScheduledEvent[],
  personId: number | null,
  assignees: TaskAssignee[],
  tasks: Task[],
): ScheduledEvent[] {
  const active = new Set(tasks.filter((t) => t.active).map((t) => t.id));
  if (personId == null) return events.filter((e) => active.has(e.taskId));
  const taskIds = new Set(
    assignees.filter((a) => a.userId === personId && active.has(a.taskId)).map((a) => a.taskId),
  );
  return events.filter((e) => taskIds.has(e.taskId));
}

/** Users usable as person filters (everyone, §5.9). */
export function filterableUsers(users: User[]): User[] {
  return users;
}
