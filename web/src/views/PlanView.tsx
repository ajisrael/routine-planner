import { useMemo, useState } from "react";
import { DndContext, PointerSensor, pointerWithin, useSensor } from "@dnd-kit/core";
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import type { ScheduledEvent } from "@planner/shared";
import { TEMPLATE_DAYS, templateDay } from "@planner/shared";
import { LibraryRail } from "../components/library/TaskLibrary";
import { TimeGrid, type Ghost } from "../components/calendar/TimeGrid";
import { MonthGrid } from "../components/calendar/MonthGrid";
import { PersonFilterChips, ConflictBadge } from "../components/Chips";
import { TaskForm } from "../components/taskForm/TaskForm";
import { ContextMenu, type ContextMenuState } from "../components/calendar/ContextMenu";
import { usePlannerStore, referenceStartMinute, conflictToastIfAny } from "../store";
import { filterEventsByPerson, computeConflicts } from "../selectors/conflicts";
import {
  dayDowLabel,
  dayNumber,
  fmtTime,
  allTemplateDays,
  weekDays,
  weekLabel,
  weekOf,
} from "../lib/dates";
import { DEFAULT_HOUR_HEIGHT, yToMinute as yToMinuteOf } from "../components/calendar/geometry";
import { toast } from "../store/toasts";

type PlanMode = "day" | "week" | "month";

/** Plan tab: library rail + interactive template calendar (DESIGN.md §5.3). */
export default function PlanView({ onOpenLibrary }: { onOpenLibrary: () => void }): React.JSX.Element {
  const store = usePlannerStore();
  const users = store.users;
  const [mode, setMode] = useState<PlanMode>("week");
  const [selDay, setSelDay] = useState(1); // day mode selection (1..30)
  const [selWeek, setSelWeek] = useState(1); // week mode selection (1..5)
  const [person, setPerson] = useState<number | null>(null);
  const [armedTaskId, setArmedTaskId] = useState<number | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  const [formTaskId, setFormTaskId] = useState<number | null>(null);
  const [formOccurrence, setFormOccurrence] = useState<ScheduledEvent | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const allDays = useMemo(allTemplateDays, []);

  const selectedDays = useMemo((): string[] => {
    if (mode === "day") return [templateDay(selDay)];
    if (mode === "week") return weekDays(selWeek);
    return allDays;
  }, [mode, selDay, selWeek, allDays]);

  const visibleEvents = useMemo(
    () => filterEventsByPerson(store.events, person, store.assignees, store.tasks),
    [store.events, person, store.assignees, store.tasks],
  );

  const conflicts = useMemo(
    () => computeConflicts(visibleEvents, store.tasks, store.assignees).byEvent,
    [visibleEvents, store.tasks, store.assignees],
  );

  const conflictCount = useMemo(
    () => visibleEvents.filter((e) => selectedDays.includes(e.eventDate) && conflicts.has(e.id)).length,
    [visibleEvents, selectedDays, conflicts],
  );

  const armedTask = armedTaskId != null ? store.tasks.find((t) => t.id === armedTaskId) ?? null : null;

  const stepDay = (dir: -1 | 1): void =>
    setSelDay((d) => Math.min(TEMPLATE_DAYS, Math.max(1, d + dir)));
  const stepWeek = (dir: -1 | 1): void => setSelWeek((w) => Math.min(5, Math.max(1, w + dir)));

  const rangeTitle =
    mode === "day"
      ? `Day ${selDay} · ${dayDowLabel(templateDay(selDay))}`
      : mode === "week"
        ? weekLabel(selWeek)
        : "Routine template · 30 days";

  // ---- dnd -------------------------------------------------------------
  const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });

  const ghostFor = (event: DragMoveEvent | DragEndEvent): Ghost | null => {
    const over = event.over;
    const active = event.active.data.current as { type: string; taskId?: number; eventId?: number } | undefined;
    if (!over || over.data.current?.type !== "day" || !active) return null;
    const date = over.data.current.date as string;
    const pointerY = (event.activatorEvent as PointerEvent).clientY + event.delta.y;
    const minute = yToMinuteOf(pointerY - over.rect.top, hourHeight);
    const duration =
      active.type === "library-task"
        ? store.tasks.find((t) => t.id === active.taskId)?.durationMinutes ?? 45
        : (() => {
            const ev = store.events.find((e) => e.id === active.eventId);
            return ev ? ev.endMinute - ev.startMinute : 45;
          })();
    return { date, startMinute: minute, durationMinutes: duration };
  };

  const onDragMove = (event: DragMoveEvent): void => setGhost(ghostFor(event));

  const onDragEnd = (event: DragEndEvent): void => {
    const g = ghostFor(event);
    const active = event.active.data.current as { type: string; taskId?: number; eventId?: number } | undefined;
    setGhost(null);
    if (!active) return;

    const over = event.over;
    if (!over) return;
    const overData = over.data.current as { type: string; date: string } | undefined;
    if (!overData) return;

    if (active.type === "library-task") {
      void scheduleTask(active.taskId!, overData.date, g?.startMinute ?? null);
    } else if (active.type === "event") {
      const ev = store.events.find((e) => e.id === active.eventId);
      if (!ev) return;
      if (overData.type === "month-day") {
        void moveAndToast(ev, { eventDate: overData.date }, "Moved");
      } else if (overData.type === "day" && g) {
        void moveAndToast(
          ev,
          { eventDate: g.date, startMinute: g.startMinute, endMinute: g.startMinute + (ev.endMinute - ev.startMinute) },
          "Moved",
        );
      }
    }
  };

  const onDragStart = (_event: DragStartEvent): void => setArmedTaskId(null);

  const scheduleTask = async (taskId: number, date: string, startMinute: number | null): Promise<void> => {
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const start = startMinute ?? referenceStartMinute(taskId);
    const ev = await store.createEvent({ taskId, eventDate: date, startMinute: start });
    if (ev) {
      toast.success(`Scheduled “${task.name}” · Day ${dayNumber(date)} ${fmtTime(start)}`);
      conflictToastIfAny(ev);
    }
  };

  const moveAndToast = async (
    ev: ScheduledEvent,
    patch: { eventDate?: string; startMinute?: number; endMinute?: number },
    label: string,
  ): Promise<void> => {
    const updated = await store.moveEvent(ev.id, patch);
    if (updated) {
      toast.success(
        `${label} · ${updated.eventDate === ev.eventDate ? fmtTime(updated.startMinute) : `Day ${dayNumber(updated.eventDate)}`}`,
      );
      conflictToastIfAny(updated);
    }
  };

  // Armed tap-to-place (touch-friendly fallback).
  const placeArmed = async (date: string, startMinute: number | null): Promise<void> => {
    if (armedTaskId == null) return;
    const taskId = armedTaskId;
    setArmedTaskId(null);
    await scheduleTask(taskId, date, startMinute);
  };

  const openOccurrenceForm = (ev: ScheduledEvent): void => {
    setFormTaskId(ev.taskId);
    setFormOccurrence(ev);
  };

  const formTask = formTaskId != null ? store.tasks.find((t) => t.id === formTaskId) ?? null : null;

  return (
    // Fills main exactly (the shell root is a fixed-height flex column);
    // the calendar card is the window, the grid scrolls inside it.
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <DndContext
        sensors={[sensor]}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => setGhost(null)}
      >
        <LibraryRail armedTaskId={armedTaskId} onArm={setArmedTaskId} onOpenLibrary={onOpenLibrary} />

        <div className="card flex h-full min-h-0 flex-col overflow-hidden bg-base-100 border border-base-content/10">
          <div className="card-body flex min-h-0 flex-1 flex-col gap-3 p-3 lg:p-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-1">
                {mode === "day" && (
                  <>
                    <button
                      className="btn btn-ghost btn-sm btn-square"
                      onClick={() => stepDay(-1)}
                      disabled={selDay <= 1}
                      aria-label="Previous day"
                    >
                      ‹
                    </button>
                    <button
                      className="btn btn-ghost btn-sm btn-square"
                      onClick={() => stepDay(1)}
                      disabled={selDay >= TEMPLATE_DAYS}
                      aria-label="Next day"
                    >
                      ›
                    </button>
                  </>
                )}
                {mode === "week" && (
                  <>
                    <button
                      className="btn btn-ghost btn-sm btn-square"
                      onClick={() => stepWeek(-1)}
                      disabled={selWeek <= 1}
                      aria-label="Previous week"
                    >
                      ‹
                    </button>
                    <button
                      className="btn btn-ghost btn-sm btn-square"
                      onClick={() => stepWeek(1)}
                      disabled={selWeek >= 5}
                      aria-label="Next week"
                    >
                      ›
                    </button>
                  </>
                )}
                <h3 className="font-bold ml-2 text-sm lg:text-base">{rangeTitle}</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div role="tablist" className="join">
                  {(["day", "week", "month"] as PlanMode[]).map((m) => (
                    <button
                      key={m}
                      className={`join-item btn btn-sm capitalize${mode === m ? " btn-primary" : ""}`}
                      onClick={() => setMode(m)}
                      aria-pressed={mode === m}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <ConflictBadge count={conflictCount} />
                <PersonFilterChips users={users} value={person} onChange={setPerson} />
              </div>
            </div>

            {mode === "month" ? (
              <MonthGrid
                events={visibleEvents}
                conflicts={conflicts}
                interactive
                armedTask={armedTask}
                onEventClick={openOccurrenceForm}
                onDayClick={(date) => {
                  setMode("day");
                  setSelDay(dayNumber(date));
                }}
                onSlotClick={(date) => void placeArmed(date, null)}
                onEventContextMenu={(ev, e) => setMenu({ event: ev, x: e.clientX, y: e.clientY })}
              />
            ) : (
              <TimeGrid
                dates={selectedDays}
                events={visibleEvents}
                conflicts={conflicts}
                interactive
                armedTask={armedTask}
                ghost={ghost}
                onHourHeight={setHourHeight}
                onEventClick={openOccurrenceForm}
                onSlotClick={(date, minute) => void placeArmed(date, minute)}
                onResize={(eventId, endMinute) => {
                  const ev = store.events.find((e) => e.id === eventId);
                  if (ev) void moveAndToast(ev, { endMinute }, "Resized");
                }}
                onEventContextMenu={(ev, e) => setMenu({ event: ev, x: e.clientX, y: e.clientY })}
              />
            )}

            <p className="text-[11px] opacity-50">
              Drag events to move · drag the bottom edge to resize (15-min snap) · long-press or right-click an
              event for sync/delete actions · overlapping tasks that <b>share a person</b> get a red warning —
              overlaps are allowed, you decide. Week {weekOf("29")} holds only Days 29–30.
            </p>
          </div>
        </div>
      </DndContext>

      <TaskForm
        open={formTask != null}
        task={formTask}
        occurrence={formOccurrence}
        onClose={() => {
          setFormTaskId(null);
          setFormOccurrence(null);
        }}
      />

      <ContextMenu
        state={menu}
        onClose={() => setMenu(null)}
        onEdit={(ev) => openOccurrenceForm(ev)}
        onSync={async (ev, scope) => {
          await store.syncEvent(ev.id, scope);
          toast.success(scope === "all" ? "Time synced to all occurrences" : "Time synced to future occurrences");
          setMenu(null);
        }}
        onDeleteOne={async (ev) => {
          await store.deleteEvent(ev.id);
          toast.info("Occurrence removed");
          setMenu(null);
        }}
        onDeleteAll={async (ev) => {
          const task = store.tasks.find((t) => t.id === ev.taskId);
          if (!task) return;
          if (!window.confirm(`Delete every occurrence of “${task.name}” in the template?`)) return;
          await store.deleteTaskEvents(task.id);
          toast.info("All occurrences removed");
          setMenu(null);
        }}
      />
    </section>
  );
}
