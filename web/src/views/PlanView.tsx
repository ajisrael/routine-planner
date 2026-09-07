import { useMemo, useState } from "react";
import { DndContext, PointerSensor, pointerWithin, useSensor } from "@dnd-kit/core";
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import type { ScheduledEvent, TaskCadence } from "@planner/shared";
import { TEMPLATE_DAYS, templateDay } from "@planner/shared";
import { LibraryRail } from "../components/library/TaskLibrary";
import { TimeGrid, type Ghost } from "../components/calendar/TimeGrid";
import { MonthGrid } from "../components/calendar/MonthGrid";
import { PersonFilterChips, ConflictBadge } from "../components/Chips";
import { TaskForm } from "../components/taskForm/TaskForm";
import { ContextMenu, type ContextMenuState } from "../components/calendar/ContextMenu";
import { usePlannerStore, referenceStartMinute, conflictToastIfAny, ruleForTask } from "../store";
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
import { DEFAULT_HOUR_HEIGHT } from "../components/calendar/geometry";
import { dailyPattern, weeklyPattern, monthlyPattern, pointerMinute } from "../lib/wizard/arrange";
import { addWeekday, removeWeekday, replaceWeekday, dowOfDate } from "../lib/wizard/pattern";
import { toast } from "../store/toasts";

export type SetupCadence = Exclude<TaskCadence, "custom">;

type PlanMode = "day" | "week" | "month";

const DOW_LABEL: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const SETUP_RAIL: Record<SetupCadence, { title: string; caption: string }> = {
  daily: {
    title: "Daily tasks",
    caption: "Drag a task onto the timeline, or tap it then tap a slot. One placement repeats every day.",
  },
  weekly: {
    title: "Weekly tasks",
    caption: "Drag onto a day. Dragging a placed block to another day swaps that weekday; dropping it here removes it.",
  },
  monthly: {
    title: "Monthly tasks",
    caption: "Drag onto a date to open its day, or tap a task then a date.",
  },
};

/**
 * Plan tab: library rail + interactive template calendar (DESIGN.md §5.3).
 * With a `setup` cadence the same view is scoped to one routine scale: the
 * rail lists only that cadence (plus a quick-add form), the calendar opens on
 * the scale's range, and placements write whole patterns (every day / those
 * weekdays / that date) instead of single occurrences.
 */
export default function PlanView({
  setup,
  onOpenLibrary,
}: {
  setup?: SetupCadence | null;
  onOpenLibrary?: () => void;
}): React.JSX.Element {
  const store = usePlannerStore();
  const users = store.users;
  const cad = setup ?? null;
  const [mode, setMode] = useState<PlanMode>(cad === "weekly" ? "week" : cad === "monthly" ? "month" : "day");
  const [selDay, setSelDay] = useState(1); // day mode selection (1..30)
  const [selWeek, setSelWeek] = useState(1); // week mode selection (1..5)
  const [person, setPerson] = useState<number | null>(null);
  const [armedTaskId, setArmedTaskId] = useState<number | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  const [formTaskId, setFormTaskId] = useState<number | null>(null);
  const [formOccurrence, setFormOccurrence] = useState<ScheduledEvent | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const allDays = useMemo(allTemplateDays, []);

  const selectedDays = useMemo((): string[] => {
    if (mode === "day") return [templateDay(selDay)];
    if (mode === "week") return weekDays(selWeek);
    return allDays;
  }, [mode, selDay, selWeek, allDays]);

  const taskById = (id: number): (typeof store.tasks)[number] | undefined => store.tasks.find((t) => t.id === id);

  const scopedEvents = useMemo(() => {
    if (cad == null) return store.events;
    const show = cad === "weekly" ? new Set<TaskCadence>(["daily", "weekly"]) : new Set<TaskCadence>([cad]);
    return store.events.filter((e) => {
      const t = taskById(e.taskId);
      return t != null && show.has(t.cadence);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.events, store.tasks, cad]);

  const lockTaskIds = useMemo(() => {
    if (cad == null) return null;
    return new Set(store.tasks.filter((t) => t.active && t.cadence !== cad).map((t) => t.id));
  }, [store.tasks, cad]);

  const visibleEvents = useMemo(
    () => filterEventsByPerson(scopedEvents, person, store.assignees, store.tasks),
    [scopedEvents, person, store.assignees, store.tasks],
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

  // ---- pattern placement (setup scopes) ---------------------------------
  const ruleDays = (taskId: number): number[] => {
    const rule = ruleForTask(taskId);
    return rule?.ruleType === "weekly_days" ? rule.daysOfWeek ?? [] : [];
  };

  const placeDaily = async (taskId: number, startMinute: number): Promise<void> => {
    const res = await store.setRecurrence(taskId, dailyPattern(startMinute));
    if (res) {
      const t = taskById(taskId);
      toast.success(`Daily · “${t?.name ?? ""}” at ${fmtTime(startMinute)}`);
    }
  };

  const applyWeekly = async (taskId: number, days: number[], ref: number): Promise<void> => {
    if (days.length > 0) await store.setRecurrence(taskId, weeklyPattern(days, ref));
    else await store.setRecurrence(taskId, { ruleType: "none" });
  };

  const anchorAndToast = async (taskId: number, days: number[], ref: number): Promise<void> => {
    const t = taskById(taskId);
    await applyWeekly(taskId, days, ref);
    toast.success(
      `“${t?.name ?? ""}” every ${days.map((d) => DOW_LABEL[d]?.slice(0, 2) ?? String(d)).join(", ")} · ${fmtTime(ref)}`,
    );
  };

  const placeWeekly = async (taskId: number, date: string, startMinute: number): Promise<void> => {
    const existing = ruleDays(taskId);
    if (existing.length > 0) {
      await anchorAndToast(taskId, addWeekday(existing, dowOfDate(date)), referenceStartMinute(taskId));
    } else {
      await anchorAndToast(taskId, [dowOfDate(date)], startMinute);
    }
  };

  const placeMonthly = async (taskId: number, date: string, startMinute: number): Promise<void> => {
    const t = taskById(taskId);
    const res = await store.setRecurrence(taskId, monthlyPattern(Number(date), startMinute));
    if (res) {
      toast.success(`Monthly · “${t?.name ?? ""}” on ${dayDowLabel(date)} ${dayNumber(date)} · ${fmtTime(startMinute)}`);
    }
  };

  const removeWeeklyDay = (ev: ScheduledEvent): void => {
    const days = ruleDays(ev.taskId);
    const next = removeWeekday(days, dowOfDate(ev.eventDate));
    const t = taskById(ev.taskId);
    if (next.length > 0) {
      void anchorAndToast(ev.taskId, next, referenceStartMinute(ev.taskId));
    } else {
      void applyWeekly(ev.taskId, [], referenceStartMinute(ev.taskId)).then(() => {
        toast.success(`Removed last day - “${t?.name ?? ""}” is now unscheduled`);
      });
    }
  };

  // ---- dnd -------------------------------------------------------------
  const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });

  const ghostFor = (event: DragMoveEvent | DragEndEvent): Ghost | null => {
    const over = event.over;
    const active = event.active.data.current as { type: string; taskId?: number; eventId?: number } | undefined;
    if (!over || over.data.current?.type !== "day" || !active) return null;
    const duration =
      active.type === "library-task"
        ? store.tasks.find((t) => t.id === active.taskId)?.durationMinutes ?? 45
        : (() => {
            const ev = store.events.find((e) => e.id === active.eventId);
            return ev ? ev.endMinute - ev.startMinute : 45;
          })();
    return {
      date: over.data.current.date as string,
      startMinute: pointerMinute(event, hourHeight, over),
      durationMinutes: duration,
    };
  };

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
      const taskId = active.taskId!;
      if (overData.type === "month-day" && overData.date) {
        if (cad === "monthly") {
          // Open that date's day with the task armed; the time is chosen there.
          setMode("day");
          setSelDay(dayNumber(overData.date));
          setArmedTaskId(taskId);
        } else if (cad == null) {
          void scheduleTask(taskId, overData.date, null);
        }
        return;
      }
      if (overData.type === "day" && g) {
        if (cad == null) void scheduleTask(taskId, g.date, g.startMinute);
        else if (cad === "daily") void placeDaily(taskId, g.startMinute);
        else if (cad === "weekly") void placeWeekly(taskId, g.date, g.startMinute);
        else void placeMonthly(taskId, g.date, g.startMinute);
      }
      return;
    }

    if (active.type !== "event") return;
    const ev = store.events.find((e) => e.id === active.eventId);
    if (!ev) return;

    if (cad == null) {
      if (overData.type === "month-day" && overData.date) {
        void moveAndToast(ev, { eventDate: overData.date }, "Moved");
      } else if (overData.type === "day" && g) {
        void moveAndToast(
          ev,
          { eventDate: g.date, startMinute: g.startMinute, endMinute: g.startMinute + (ev.endMinute - ev.startMinute) },
          "Moved",
        );
      }
      return;
    }

    if (cad === "daily") {
      if (overData.type === "day" && g) void placeDaily(ev.taskId, g.startMinute);
      return;
    }

    if (cad === "weekly") {
      if (overData.type === "rail-task") {
        if (overData.taskId === ev.taskId) removeWeeklyDay(ev);
        return;
      }
      if (overData.type === "day" && g) {
        const days = ruleDays(ev.taskId);
        const src = dowOfDate(ev.eventDate);
        const dst = dowOfDate(g.date);
        if (src === dst) {
          void (async () => {
            await applyWeekly(ev.taskId, days.length > 0 ? days : [dst], g.startMinute);
            toast.success(`“${taskById(ev.taskId)?.name ?? ""}” moved to ${fmtTime(g.startMinute)}`);
          })();
        } else {
          void anchorAndToast(ev.taskId, replaceWeekday(days, src, dst), referenceStartMinute(ev.taskId));
        }
      }
      return;
    }

    // monthly
    if (overData.type === "day" && g) {
      void placeMonthly(ev.taskId, g.date, g.startMinute);
    } else if (overData.type === "month-day" && overData.date) {
      void placeMonthly(ev.taskId, overData.date, referenceStartMinute(ev.taskId));
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
  const placeArmed = (date: string, startMinute: number | null): void => {
    if (armedTaskId == null) return;
    const taskId = armedTaskId;
    setArmedTaskId(null);
    if (cad == null) {
      void scheduleTask(taskId, date, startMinute);
    } else if (startMinute != null) {
      if (cad === "daily") void placeDaily(taskId, startMinute);
      else if (cad === "weekly") void placeWeekly(taskId, date, startMinute);
      else void placeMonthly(taskId, date, startMinute);
    }
  };

  const openDay = (date: string): void => {
    setMode("day");
    setSelDay(dayNumber(date));
  };

  const openOccurrenceForm = (ev: ScheduledEvent): void => {
    setFormTaskId(ev.taskId);
    setFormOccurrence(ev);
  };

  const formTask = formTaskId != null ? store.tasks.find((t) => t.id === formTaskId) ?? null : null;
  const rail = cad != null ? SETUP_RAIL[cad] : null;

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
        <LibraryRail
          armedTaskId={armedTaskId}
          onArm={setArmedTaskId}
          onOpenLibrary={cad == null ? onOpenLibrary : undefined}
          onAdd={cad != null ? () => setAddOpen(true) : undefined}
          cadenceFilter={cad}
          removeZone={cad === "weekly"}
          placedBadge={cad != null}
          title={rail?.title}
          caption={rail?.caption}
        />

        <div className="card flex h-full min-h-0 flex-col overflow-hidden bg-base-100 border border-base-content/10">
          <div className="card-body flex min-h-0 flex-1 flex-col gap-3 p-3 lg:p-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-1">
                {cad == null && mode === "day" && (
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
                {cad == null && mode === "week" && (
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
                {(cad == null || (cad === "monthly" && mode !== "month")) && (
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
                )}
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
                lockTaskIds={lockTaskIds}
                onEventClick={cad == null ? openOccurrenceForm : (ev) => openDay(ev.eventDate)}
                onDayClick={openDay}
                onSlotClick={cad == null ? (date) => placeArmed(date, null) : openDay}
                onEventContextMenu={cad == null ? (ev, e) => setMenu({ event: ev, x: e.clientX, y: e.clientY }) : undefined}
              />
            ) : (
              <TimeGrid
                dates={selectedDays}
                events={visibleEvents}
                conflicts={conflicts}
                interactive
                armedTask={armedTask}
                ghost={ghost}
                lockTaskIds={lockTaskIds}
                onHourHeight={setHourHeight}
                onEventClick={cad == null ? openOccurrenceForm : undefined}
                onSlotClick={(date, minute) => placeArmed(date, minute)}
                onResize={
                  cad == null
                    ? (eventId, endMinute) => {
                        const ev = store.events.find((e) => e.id === eventId);
                        if (ev) void moveAndToast(ev, { endMinute }, "Resized");
                      }
                    : undefined
                }
                onEventContextMenu={cad == null ? (ev, e) => setMenu({ event: ev, x: e.clientX, y: e.clientY }) : undefined}
              />
            )}

            <p className="text-[11px] opacity-70">
              {cad == null ? (
                <>
                  Drag events to move · drag the bottom edge to resize (15-min snap) · long-press or right-click an
                  event for sync/delete actions · overlapping tasks that <b>share a person</b> get a red warning —
                  overlaps are allowed, you decide. Week {weekOf("29")} holds only Days 29–30.
                </>
              ) : cad === "daily" ? (
                "Drop or tap a task onto the timeline - it repeats every day at that time. Drag a placed block to re-anchor the routine."
              ) : cad === "weekly" ? (
                "Drop a task on a day to add that weekday at the shared time. Same-day drags re-anchor it; other-day drags swap the weekday; drop a block on its rail row to remove the weekday."
              ) : (
                "Tap a date to open its day and pick a time - the task pins to that date every month. Monthly pills drag to another date to re-anchor."
              )}
            </p>
          </div>
        </div>
      </DndContext>

      {cad == null && (
        <>
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
        </>
      )}
      {cad != null && (
        <TaskForm open={addOpen} task={null} presetCadence={cad} onClose={() => setAddOpen(false)} />
      )}
    </section>
  );
}
