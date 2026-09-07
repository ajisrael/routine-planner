import { useState } from "react";
import { DndContext, PointerSensor, pointerWithin, useSensor } from "@dnd-kit/core";
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { usePlannerStore, ruleForTask, referenceStartMinute } from "../../store";
import { TimeGrid, type Ghost } from "../calendar/TimeGrid";
import { RoutineRail } from "./RoutineRail";
import { QuickAddTask } from "./QuickAddTask";
import { tasksOfCadence } from "../../lib/wizard/status";
import { addWeekday, removeWeekday, replaceWeekday, dowOfDate } from "../../lib/wizard/pattern";
import { weeklyPattern, pointerMinute } from "../../lib/wizard/arrange";
import { DEFAULT_HOUR_HEIGHT } from "../calendar/geometry";
import { computeConflicts } from "../../selectors/conflicts";
import { weekDays, weekLabel, fmtTime } from "../../lib/dates";
import { toast } from "../../store/toasts";

const DOW_LABEL: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/**
 * Setup step 3: the weekly routine. Week-1 grid (Mon-Sun) with daily events
 * carried over read-only. Placing/adding a weekday anchors the shared start
 * time (refStartMinute); dragging a block to a new time or day re-anchors or
 * replaces that weekday; dropping a block on its rail row removes the weekday.
 */
export function WeeklyStage(): React.JSX.Element {
  const store = usePlannerStore();
  const [armedTaskId, setArmedTaskId] = useState<number | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });

  const weeklyTasks = tasksOfCadence(store.tasks, "weekly");
  const scaleIds = new Set(["daily", "weekly"]);
  const visible = store.events.filter((e) => {
    const t = store.tasks.find((x) => x.id === e.taskId);
    return t != null && scaleIds.has(t.cadence);
  });
  const lockIds = new Set(
    store.tasks.filter((t) => t.active && t.cadence !== "weekly").map((t) => t.id),
  );
  const conflictByEvent = computeConflicts(visible, store.tasks, store.assignees).byEvent;
  const armedTask = armedTaskId != null ? store.tasks.find((t) => t.id === armedTaskId) ?? null : null;

  const ruleDays = (taskId: number): number[] => {
    const rule = ruleForTask(taskId);
    return rule?.ruleType === "weekly_days" ? rule.daysOfWeek ?? [] : [];
  };

  const applyPattern = async (taskId: number, days: number[], refStartMinute: number): Promise<boolean> => {
    const res = days.length > 0 ? await store.setRecurrence(taskId, weeklyPattern(days, refStartMinute)) : await store.setRecurrence(taskId, { ruleType: "none" });
    return Boolean(res);
  };

  /** Add a weekday at the task's anchor time (first placement uses the drop). */
  const anchorAndToast = async (taskId: number, days: number[], ref: number): Promise<void> => {
    const t = store.tasks.find((x) => x.id === taskId);
    await applyPattern(taskId, days, ref);
    toast.success(`“${t?.name ?? ""}” every ${days.map((d) => DOW_LABEL[d][0] + DOW_LABEL[d].slice(1, 3)).join(", ")} · ${fmtTime(ref)}`);
  };

  const placeFromRail = async (taskId: number, date: string, startMinute: number): Promise<void> => {
    const existing = ruleDays(taskId);
    if (existing.length > 0) {
      await anchorAndToast(taskId, addWeekday(existing, dowOfDate(date)), referenceStartMinute(taskId));
    } else {
      await anchorAndToast(taskId, [dowOfDate(date)], startMinute);
    }
  };

  const ghostFor = (event: DragMoveEvent | DragEndEvent): Ghost | null => {
    const over = event.over;
    const active = event.active.data.current as { type: string; taskId?: number; eventId?: number } | undefined;
    if (!over || over.data.current?.type !== "day" || !active) return null;
    const task =
      active.type === "library-task"
        ? store.tasks.find((t) => t.id === active.taskId)
        : (() => {
            const ev = store.events.find((e) => e.id === active.eventId);
            return ev ? store.tasks.find((t) => t.id === ev.taskId) : undefined;
          })();
    if (!task) return null;
    return {
      date: over.data.current.date as string,
      startMinute: pointerMinute(event, hourHeight, over),
      durationMinutes: task.durationMinutes,
    };
  };

  const onDragStart = (_: DragStartEvent): void => setArmedTaskId(null);

  const onDragMove = (event: DragMoveEvent): void => setGhost(ghostFor(event));

  const onDragEnd = (event: DragEndEvent): void => {
    const g = ghostFor(event);
    const active = event.active.data.current as { type: string; taskId?: number; eventId?: number } | undefined;
    setGhost(null);
    if (!active) return;
    const over = event.over;
    if (!over) return;
    const overData = over.data.current as { type: string; date?: string; taskId?: number } | undefined;
    if (!overData) return;

    if (active.type === "library-task") {
      if (overData.type === "day" && g) void placeFromRail(active.taskId!, g.date, g.startMinute);
      return;
    }
    if (active.type !== "event" || !g) return;
    const ev = store.events.find((e) => e.id === active.eventId);
    if (!ev) return;
    const taskId = ev.taskId;
    const days = ruleDays(taskId);
    const sourceDow = dowOfDate(ev.eventDate);

    if (overData.type === "rail-task") {
      // Drop onto the task's own row → remove that weekday (→ rule "none" when empty).
      if (overData.taskId !== taskId) return;
      const next = removeWeekday(days, sourceDow);
      void (next.length > 0
        ? anchorAndToast(taskId, next, referenceStartMinute(taskId))
        : applyPattern(taskId, [], referenceStartMinute(taskId)).then((ok) => {
            if (ok) toast.success(`Removed last day - “${store.tasks.find((x) => x.id === taskId)?.name ?? ""}” is now unscheduled`);
          }));
      return;
    }
    if (overData.type !== "day" || !overData.date) return;
    const targetDow = dowOfDate(overData.date);
    if (targetDow === sourceDow) {
      // Same column: re-anchor the routine to the new drop time.
      void (async () => {
        await applyPattern(taskId, days.length > 0 ? days : [targetDow], g.startMinute);
        toast.success(`“${store.tasks.find((x) => x.id === taskId)?.name ?? ""}” moved to ${fmtTime(g.startMinute)}`);
      })();
    } else {
      // Different day: that weekday replaces the old one at the anchor time.
      const next = replaceWeekday(days, sourceDow, targetDow);
      void anchorAndToast(taskId, next, referenceStartMinute(taskId));
    }
  };

  const armedPlace = async (date: string, startMinute: number): Promise<void> => {
    if (armedTaskId == null) return;
    const taskId = armedTaskId;
    setArmedTaskId(null);
    void placeFromRail(taskId, date, startMinute);
  };

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <DndContext
        sensors={[sensor]}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => setGhost(null)}
      >
        <div className="flex min-h-0 flex-col gap-2">
          <QuickAddTask cadence="weekly" />
          <RoutineRail
            title="Weekly tasks"
            caption="Drag onto a day. Dragging a placed block to another day swaps that weekday; dropping it here removes it."
            tasks={store.tasks.filter((t) => t.active && t.cadence === "weekly")}
            armedTaskId={armedTaskId}
            onArm={setArmedTaskId}
            removeZone
            emptyHint="No weekly tasks yet - add one above, then drag it onto a weekday."
          />
        </div>
        <div className="card flex h-full min-h-0 flex-col overflow-hidden bg-base-100 border border-base-content/10">
          <div className="card-body flex min-h-0 flex-1 flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">Place each task on its days</h3>
                <p className="text-[11px] opacity-60">{weekLabel(1)} · daily tasks are shown for context and stay fixed.</p>
              </div>
              <span className="badge badge-sm badge-ghost">{weeklyTasks.length} tasks</span>
            </div>
            <TimeGrid
              dates={weekDays(1)}
              events={visible}
              conflicts={conflictByEvent}
              interactive
              armedTask={armedTask}
              ghost={ghost}
              lockTaskIds={lockIds}
              onHourHeight={setHourHeight}
              onSlotClick={(date, minute) => void armedPlace(date, minute)}
            />
          </div>
        </div>
      </DndContext>
    </section>
  );
}