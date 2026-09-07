import { useState } from "react";
import { DndContext, PointerSensor, pointerWithin, useSensor } from "@dnd-kit/core";
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { templateDay } from "@planner/shared";
import { usePlannerStore } from "../../store";
import { TimeGrid, type Ghost } from "../calendar/TimeGrid";
import { RoutineRail } from "./RoutineRail";
import { QuickAddTask } from "./QuickAddTask";
import { tasksOfCadence } from "../../lib/wizard/status";
import { dailyPattern, pointerMinute } from "../../lib/wizard/arrange";
import { DEFAULT_HOUR_HEIGHT } from "../calendar/geometry";
import { computeConflicts } from "../../selectors/conflicts";
import { dayNumber, fmtTime } from "../../lib/dates";
import { toast } from "../../store/toasts";

/**
 * Setup step 2: the daily routine. One representative day canvas; placing a
 * task pins it to every weekday at that time (weekly_days 1-7 anchored on the
 * drop minute). Dragging a placed block re-anchors the whole routine.
 */
export function DailyStage(): React.JSX.Element {
  const store = usePlannerStore();
  const [armedTaskId, setArmedTaskId] = useState<number | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });

  const dailyTasks = tasksOfCadence(store.tasks, "daily");
  const dailyIds = new Set(dailyTasks.map((t) => t.id));
  const events = store.events.filter((e) => dailyIds.has(e.taskId));
  const conflictByEvent = computeConflicts(events, store.tasks, store.assignees).byEvent;
  const armedTask = armedTaskId != null ? store.tasks.find((t) => t.id === armedTaskId) ?? null : null;

  const placeDaily = async (taskId: number, startMinute: number): Promise<void> => {
    const res = await store.setRecurrence(taskId, dailyPattern(startMinute));
    if (res) {
      const t = store.tasks.find((x) => x.id === taskId);
      toast.success(`Daily · “${t?.name ?? ""}” at ${fmtTime(startMinute)}`);
    }
  };

  const onDragMove = (event: DragMoveEvent): void => setGhost(ghostFor(event));

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

  const onDragEnd = (event: DragEndEvent): void => {
    const g = ghostFor(event);
    const active = event.active.data.current as { type: string; taskId?: number; eventId?: number } | undefined;
    setGhost(null);
    if (!active || !g) return;
    if (active.type === "library-task") {
      void placeDaily(active.taskId!, g.startMinute);
    } else if (active.type === "event") {
      const ev = store.events.find((e) => e.id === active.eventId);
      if (ev) {
        void placeDaily(ev.taskId, g.startMinute);
      }
    }
  };

  const armedPlace = async (startMinute: number): Promise<void> => {
    if (armedTaskId == null) return;
    const taskId = armedTaskId;
    setArmedTaskId(null);
    void placeDaily(taskId, startMinute);
  };

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-2">
        <QuickAddTask cadence="daily" />
        <RoutineRail
          title="Daily tasks"
          caption="Drag a task onto the timeline, or tap it then tap a slot."
          tasks={store.tasks.filter((t) => t.active && t.cadence === "daily")}
          armedTaskId={armedTaskId}
          onArm={setArmedTaskId}
          emptyHint="No daily tasks yet - add one above, then drag it onto the day."
        />
      </div>
      <DndContext
        sensors={[sensor]}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => setGhost(null)}
      >
        <div className="card flex h-full min-h-0 flex-col overflow-hidden bg-base-100 border border-base-content/10">
          <div className="card-body flex min-h-0 flex-1 flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">Place each task once</h3>
                <p className="text-[11px] opacity-60">Day {dayNumber(templateDay(1))} · it repeats every day at that time.</p>
              </div>
              <span className="badge badge-sm badge-ghost">{dailyTasks.length} tasks</span>
            </div>
            <TimeGrid
              dates={[templateDay(1)]}
              events={events}
              conflicts={conflictByEvent}
              interactive
              armedTask={armedTask}
              ghost={ghost}
              onHourHeight={setHourHeight}
              onSlotClick={(_date, minute) => void armedPlace(minute)}
            />
          </div>
        </div>
      </DndContext>
    </section>
  );
}