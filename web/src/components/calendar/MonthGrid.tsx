import { useMemo } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ScheduledEvent, Task } from "@planner/shared";
import { usePlannerStore, categoryById } from "../../store";
import { fmtTime, monthCells, shortDayLabel, todayISO } from "../../lib/dates";

export interface MonthGridProps {
  anchor: string;
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

/** Month view: 6-week grid of day cells with compact pills (DESIGN.md §5.3/§5.4). */
export function MonthGrid({
  anchor,
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
  const cells = useMemo(() => monthCells(anchor), [anchor]);
  const today = todayISO();
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

  return (
    <div>
      <div className="grid grid-cols-7 text-[10px] opacity-60 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ date, inMonth }) => (
          <MonthCell
            key={date}
            date={date}
            inMonth={inMonth}
            isToday={date === today}
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
      </div>
    </div>
  );
}

function MonthCell({
  date,
  inMonth,
  isToday,
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
  inMonth: boolean;
  isToday: boolean;
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

  const { dow, date: num } = shortDayLabel(date);

  return (
    <div
      ref={setNodeRef}
      className={`month-cell ${isToday ? "cell-today" : ""} ${isOver ? "drag-over" : ""}`}
      onClick={clickCell}
      role={armed || onDayClick ? "button" : undefined}
      aria-label={
        armed ? `Place ${armedTaskName} on ${dow} ${date}` : onDayClick ? `Open ${dow} ${date}` : undefined
      }
    >
      <div className={`mb-0.5 ${isToday ? "font-bold text-primary" : inMonth ? "opacity-70" : "opacity-40"}`}>
        {num}
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
