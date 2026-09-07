import { useState } from "react";
import { DndContext, PointerSensor, pointerWithin, useSensor } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { usePlannerStore, referenceStartMinute } from "../../store";
import { MonthGrid } from "../calendar/MonthGrid";
import { TimeGrid } from "../calendar/TimeGrid";
import { RoutineRail } from "./RoutineRail";
import { QuickAddTask } from "./QuickAddTask";
import { tasksOfCadence } from "../../lib/wizard/status";
import { monthlyPattern } from "../../lib/wizard/arrange";
import { DEFAULT_HOUR_HEIGHT } from "../calendar/geometry";
import { computeConflicts } from "../../selectors/conflicts";
import { dayNumber, dayDowLabel, fmtTime } from "../../lib/dates";
import { toast } from "../../store/toasts";

/**
 * Setup step 4: the monthly routine. A 30-day month grid with everything
 * placed so far. Tap a monthly task, then a date → the day's timeline opens
 * with that task armed; dropping it pins the task to that date. Clicking a
 * placed block reopens its day for repositioning.
 */
export function MonthlyStage(): React.JSX.Element {
  const store = usePlannerStore();
  const [armedTaskId, setArmedTaskId] = useState<number | null>(null);
  const [drill, setDrill] = useState<string | null>(null);
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const armedTask = armedTaskId != null ? store.tasks.find((t) => t.id === armedTaskId) ?? null : null;
  const monthConflict = computeConflicts(store.events, store.tasks, store.assignees).byEvent;
  const monthlyTasks = tasksOfCadence(store.tasks, "monthly");
  const lockNonMonthly = new Set(
    store.tasks.filter((t) => t.active && t.cadence !== "monthly").map((t) => t.id),
  );

  const placeMonthly = async (taskId: number, date: string, startMinute: number): Promise<void> => {
    const t = store.tasks.find((x) => x.id === taskId);
    const res = await store.setRecurrence(taskId, monthlyPattern(Number(date), startMinute));
    if (res) {
      toast.success(`Monthly · “${t?.name ?? ""}” on ${dayDowLabel(date)} ${dayNumber(date)} · ${fmtTime(startMinute)}`);
    }
  };

  const openDay = (date: string, armedId: number | null): void => {
    setDrill(date);
    setArmedTaskId(armedId);
  };

  // ---- drag handling for both the month grid and the day drill ----------
  const dropMinute = (event: DragEndEvent, over: NonNullable<DragEndEvent["over"]>): number => {
    const rect = over.rect;
    const pointerY = (event.activatorEvent as PointerEvent).clientY + event.delta.y;
    return Math.min(24 * 60 - 15, Math.max(0, Math.round(((pointerY - rect.top) / hourHeight) * 60 / 15) * 15));
  };

  const onDragEnd = (event: DragEndEvent): void => {
    const active = event.active.data.current as { type: string; taskId?: number; eventId?: number } | undefined;
    const over = event.over;
    if (!active || !over) return;
    const overData = over.data.current as { type: string; date?: string } | undefined;
    if (!overData) return;

    if (drill != null) {
      if (active.type !== "event" || overData.type !== "day") return;
      const ev = store.events.find((e) => e.id === active.eventId);
      if (ev) void placeMonthly(ev.taskId, drill, dropMinute(event, over));
      return;
    }
    // month phase: dragging a monthly pill onto a day re-anchors that day
    const ev = active.type === "event" ? store.events.find((e) => e.id === active.eventId) : undefined;
    if (ev && overData.type === "month-day" && overData.date) {
      void placeMonthly(ev.taskId, overData.date, referenceStartMinute(ev.taskId));
    }
  };

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <DndContext sensors={[sensor]} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-col gap-2">
          <QuickAddTask cadence="monthly" />
          <RoutineRail
            title="Monthly tasks"
            caption="Tap a task, then a date - its day opens and you place it at a time."
            tasks={store.tasks.filter((t) => t.active && t.cadence === "monthly")}
            armedTaskId={armedTaskId}
            onArm={setArmedTaskId}
            emptyHint="No monthly tasks yet - add one above, then tap it and pick a date."
          />
        </div>

        {drill == null ? (
          <div className="card flex h-full min-h-0 flex-col overflow-hidden bg-base-100 border border-base-content/10">
            <div className="card-body flex min-h-0 flex-1 flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold">Pick the days that happen monthly</h3>
                  <p className="text-[11px] opacity-60">Everything placed so far is on the calendar; tap a date to place into its day.</p>
                </div>
                <span className="badge badge-sm badge-ghost">{monthlyTasks.length} tasks</span>
              </div>
              <MonthGrid
                events={store.events}
                conflicts={monthConflict}
                interactive
                armedTask={armedTask}
                lockTaskIds={lockNonMonthly}
                onEventClick={(ev) => openDay(ev.eventDate, null)}
                onDayClick={(date) => openDay(date, null)}
                onSlotClick={(date) => openDay(date, armedTaskId)}
              />
            </div>
          </div>
        ) : (
          <div className="card flex h-full min-h-0 flex-col overflow-hidden bg-base-100 border border-base-content/10">
            <div className="card-body flex min-h-0 flex-1 flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <button className="btn btn-ghost btn-xs" onClick={() => setDrill(null)} aria-label="Back to the month">
                  ← Month
                </button>
                <div>
                  <h3 className="text-sm font-bold">Day {dayNumber(drill)} · {dayDowLabel(drill)}</h3>
                  <p className="text-[11px] opacity-60">Place or drag a monthly task to its time on the {dayNumber(drill)}th.</p>
                </div>
                <span className="badge badge-sm badge-ghost">{monthlyTasks.length} tasks</span>
              </div>
              <TimeGrid
                dates={[drill]}
                events={store.events.filter((e) => e.eventDate === drill)}
                conflicts={computeConflicts(store.events.filter((e) => e.eventDate === drill), store.tasks, store.assignees).byEvent}
                interactive
                armedTask={armedTask}
                lockTaskIds={lockNonMonthly}
                onHourHeight={setHourHeight}
                onSlotClick={(_, minute) => {
                  if (armedTaskId != null) {
                    const taskId = armedTaskId;
                    setArmedTaskId(null);
                    void placeMonthly(taskId, drill, minute);
                  }
                }}
              />
            </div>
          </div>
        )}
      </DndContext>
    </section>
  );
}