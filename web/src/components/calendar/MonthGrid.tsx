import { useMemo } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ScheduledEvent, Task } from "@planner/shared";
import { TEMPLATE_DAYS } from "@planner/shared";
import { usePlannerStore, categoryById } from "../../store";
import { dayNumber, dayDowLabel, fmtTime, weekOf } from "../../lib/dates";

export interface MonthGridProps {
  events: ScheduledEvent[];
  conflicts: Map<number, number[]>;
  interactive: boolean;
  armedTask?: Task | null;
  onEventClick?: (event: ScheduledEvent) => void;
  onDayClick?: (date: string) => void;
  onSlotClick?: (date: string) => void;
  onEventContextMenu?: (event: ScheduledEvent, e: React.MouseEvent) => void;
}

const MAX_PILLS = 3;

/** Template month view: a 30-cell grid (Mon = Day 1) with compact pills. */
export function MonthGrid({
  events,
  conflicts,
  interactive,
  armedTask,
  onEventClick,
  onDayClick,
  onSlotClick,
  onEventContextMenu,
}: MonthGridProps): React.JSX.Element {
  const tasks = usePlannerStore((s) => s.tasks);
  const armed = armedTask != null && interactive;

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduledEvent[]>();
    for (const e of events) {
      const list = m.get(e.eventDate);
      if (list) list.push(e);
      else m.set(e.eventDate, [e]);
    }
    return m;
  }, [events]);

  const cells = useMemo(
    () => Array.from({ length: TEMPLATE_DAYS }, (_, i) => String(i + 1).padStart(2, "0")),
    [],
  );
  const blanks = (7 - (TEMPLATE_DAYS % 7)) % 7;

  return (
    <div className="lib-scroll min-h-0 flex-1 overflow-auto rounded-xl border border-base-content/10">
      <div className="sticky top-0 z-10 mb-1 grid grid-cols-7 border-b border-base-content/10 bg-base-100">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 text-[10px] opacity-60">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date) => (
          <MonthCell
            key={date}
            date={date}
            events={byDate.get(date) ?? []}
            conflicts={conflicts}
            interactive={interactive}
            armed={armed}
            armedTaskName={armedTask?.name ?? ""}
            tasks={tasks}
            onEventClick={onEventClick}
            onDayClick={onDayClick}
            onSlotClick={onSlotClick}
            onEventContextMenu={onEventContextMenu}
          />
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <div key={`blank-${i}`} className="month-cell" aria-hidden />
        ))}
      </div>
    </div>
  );
}

function MonthCell({
  date,
  events,
  conflicts,
  interactive,
  armed,
  armedTaskName,
  tasks,
  onEventClick,
  onDayClick,
  onSlotClick,
  onEventContextMenu,
}: {
  date: string;
  events: ScheduledEvent[];
  conflicts: Map<number, number[]>;
  interactive: boolean;
  armed: boolean;
  armedTaskName: string;
  tasks: Task[];
  onEventClick?: (event: ScheduledEvent) => void;
  onDayClick?: (date: string) => void;
  onSlotClick?: (date: string) => void;
  onEventContextMenu?: (event: ScheduledEvent, e: React.MouseEvent) => void;
}): React.JSX.Element {
  const { isOver, setNodeRef } = useDroppable({
    id: `month-${date}`,
    data: { type: "month-day", date },
    disabled: !interactive,
  });

  const sorted = useMemo(
    () => [...events].sort((a, b) => a.startMinute - b.startMinute || a.id - b.id),
    [events],
  );
  const shown = sorted.slice(0, MAX_PILLS);
  const extra = sorted.length - shown.length;

  const clickCell = (): void => {
    if (armed && onSlotClick) onSlotClick(date);
    else if (!armed && onDayClick) onDayClick(date);
  };

  return (
    <div
      ref={setNodeRef}
      className={`month-cell ${isOver ? "drag-over" : ""}`}
      onClick={clickCell}
      role={armed || onDayClick ? "button" : undefined}
      aria-label={
        armed ? `Place ${armedTaskName} on ${dayDowLabel(date)} ${dayNumber(date)}` : onDayClick ? `Open ${dayDowLabel(date)} ${dayNumber(date)}` : undefined
      }
    >
      <div className={`mb-0.5 flex items-baseline gap-1 ${armed || onDayClick ? "text-primary" : "opacity-70"}`}>
        <span className="font-bold">{dayNumber(date)}</span>
        <span className="text-[9px] opacity-60">{dayDowLabel(date)}</span>
        {weekOf(date) === 5 && <span className="text-[9px] opacity-40">tail</span>}
      </div>
      {shown.map((ev) => (
        <MonthPill
          key={ev.id}
          event={ev}
          conflicted={conflicts.has(ev.id)}
          interactive={interactive}
          task={tasks.find((t) => t.id === ev.taskId)}
          onEventClick={onEventClick}
          onContextMenu={onEventContextMenu}
        />
      ))}
      {extra > 0 && <div className="text-[10px] opacity-60 pl-1">+{extra} more</div>}
    </div>
  );
}

function MonthPill({
  event,
  conflicted,
  interactive,
  task,
  onEventClick,
  onContextMenu,
}: {
  event: ScheduledEvent;
  conflicted: boolean;
  interactive: boolean;
  task: Task | undefined;
  onEventClick?: (event: ScheduledEvent) => void;
  onContextMenu?: (event: ScheduledEvent, e: React.MouseEvent) => void;
}): React.JSX.Element {
  const category = categoryById(task?.categoryId ?? null);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `event-${event.id}`,
    data: { type: "event", eventId: event.id, fromMonth: true },
    disabled: !interactive,
  });

  return (
    <button
      ref={setNodeRef}
      className={`month-pill${conflicted ? " conflict" : ""}${isDragging ? " pill-dragging" : ""}`}
      style={{ ["--ev-cat" as string]: category?.color ?? "var(--color-base-content)" }}
      onClick={(e) => {
        e.stopPropagation();
        onEventClick?.(event);
      }}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(event, e);
            }
          : undefined
      }
      {...listeners}
      {...attributes}
      title={`${task?.name ?? "Event"} · ${fmtTime(event.startMinute)}`}
      aria-label={`${task?.name ?? "Event"} ${fmtTime(event.startMinute)}${conflicted ? ", conflict" : ""}`}
    >
      {fmtTime(event.startMinute)} {task?.name ?? "(deleted task)"}
      {conflicted ? " ⚠" : ""}
    </button>
  );
}
