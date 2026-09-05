import { describe, expect, it } from "vitest";
import { computeConflicts, filterEventsByPerson } from "../src/selectors/conflicts";
import { layoutOverlaps } from "../src/components/calendar/geometry";
import type { ScheduledEvent, Task, TaskAssignee } from "@planner/shared";

const ev = (id: number, date: string, start: number, end: number, taskId = 1): ScheduledEvent => ({
  id,
  taskId,
  ruleId: null,
  eventDate: date,
  startMinute: start,
  endMinute: end,
  createdAt: "",
  updatedAt: "",
});

const task = (id: number): Task => ({
  id,
  name: `T${id}`,
  durationMinutes: 60,
  notes: null,
  categoryId: null,
  active: true,
});

const assignees: TaskAssignee[] = [
  { taskId: 1, userId: 10 },
  { taskId: 2, userId: 10 },
  { taskId: 3, userId: 20 },
];

describe("conflict detection (ARCHITECTURE.md §4.5, DATA_MODEL.md §6)", () => {
  it("flags overlapping events that share an assignee", () => {
    const events = [ev(1, "2026-09-01", 540, 600, 1), ev(2, "2026-09-01", 570, 630, 2)];
    const result = computeConflicts(events, [task(1), task(2)], assignees);
    expect(result.count).toBe(2);
    expect(result.byEvent.get(1)).toEqual([10]);
    expect(result.byEvent.get(2)).toEqual([10]);
  });

  it("does not flag overlaps without a shared assignee", () => {
    const events = [ev(1, "2026-09-01", 540, 600, 1), ev(3, "2026-09-01", 570, 630, 3)];
    const result = computeConflicts(events, [task(1), task(3)], assignees);
    expect(result.count).toBe(0);
  });

  it("does not flag non-overlapping or different-day events", () => {
    const events = [ev(1, "2026-09-01", 540, 600, 1), ev(2, "2026-09-01", 600, 660, 2), ev(2, "2026-09-02", 540, 660, 2)];
    const result = computeConflicts(events, [task(1), task(2)], assignees);
    expect(result.count).toBe(0);
  });

  it("tasks with no assignees never conflict", () => {
    const events = [ev(9, "2026-09-01", 540, 600, 9), ev(8, "2026-09-01", 540, 600, 8)];
    const result = computeConflicts(events, [task(9), task(8)], assignees);
    expect(result.count).toBe(0);
  });

  it("per-person conflicts: shared child flags only the child", () => {
    // Mom(10)+child(11) playtime vs Dad(20)+child(11) chore at the same time →
    // only the child is double-booked.
    const tasks = [task(1), task(4)];
    const asg: TaskAssignee[] = [
      { taskId: 1, userId: 10 },
      { taskId: 1, userId: 11 },
      { taskId: 4, userId: 20 },
      { taskId: 4, userId: 11 },
    ];
    const events = [ev(1, "2026-09-01", 540, 600, 1), ev(4, "2026-09-01", 540, 600, 4)];
    const result = computeConflicts(events, tasks, asg);
    expect(result.byEvent.get(1)).toEqual([11]);
    expect(result.byEvent.get(4)).toEqual([11]);
  });

  it("touching intervals do not overlap ([start,end) semantics)", () => {
    const events = [ev(1, "2026-09-01", 540, 600, 1), ev(2, "2026-09-01", 600, 660, 2)];
    expect(computeConflicts(events, [task(1), task(2)], assignees).count).toBe(0);
  });
});

describe("person filter (DATA_MODEL.md §5.9)", () => {
  it("keeps only events whose task assigns the person", () => {
    const events = [ev(1, "2026-09-01", 540, 600, 1), ev(3, "2026-09-01", 540, 600, 3)];
    const onlyMom = filterEventsByPerson(events, 10, assignees, [task(1), task(3)]);
    expect(onlyMom.map((e) => e.id)).toEqual([1]);
    const everyone = filterEventsByPerson(events, null, assignees, [task(1), task(3)]);
    expect(everyone).toHaveLength(2);
  });

  it("drops events of inactive tasks", () => {
    const events = [ev(1, "2026-09-01", 540, 600, 1)];
    const inactive = [{ ...task(1), active: false }];
    expect(filterEventsByPerson(events, null, assignees, inactive)).toHaveLength(0);
  });
});

describe("overlap packing (DESIGN.md §6.2)", () => {
  it("independent events are full width", () => {
    const packed = layoutOverlaps([ev(1, "d", 540, 600), ev(2, "d", 660, 720)]);
    expect(packed.get(1)).toEqual({ col: 0, cols: 1 });
    expect(packed.get(2)).toEqual({ col: 0, cols: 1 });
  });

  it("two overlapping events split the column", () => {
    const packed = layoutOverlaps([ev(1, "d", 540, 600), ev(2, "d", 570, 630)]);
    expect(packed.get(1)).toEqual({ col: 0, cols: 2 });
    expect(packed.get(2)).toEqual({ col: 1, cols: 2 });
  });

  it("chains cluster transitively and reuse freed columns", () => {
    // 1: 540–600, 2: 570–660, 3: 610–640 → cluster of 3, col reuse: 3 fits col0? 610 ≥ 600 → yes.
    const packed = layoutOverlaps([
      ev(1, "d", 540, 600),
      ev(2, "d", 570, 660),
      ev(3, "d", 610, 640),
    ]);
    expect(packed.get(1)).toEqual({ col: 0, cols: 2 });
    expect(packed.get(2)).toEqual({ col: 1, cols: 2 });
    expect(packed.get(3)).toEqual({ col: 0, cols: 2 });
  });
});
