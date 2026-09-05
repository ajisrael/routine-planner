import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ScheduledEvent, Task } from "@planner/shared";
import { SLOT_MINUTES } from "@planner/shared";
import { usePlannerStore, categoryById } from "../../store";
import { fmtTime, nowMinutes, shortDayLabel, todayISO } from "../../lib/dates";
import { AvatarStack } from "../Avatar";
import {
  GRID_HEIGHT,
  START_HOUR,
  END_HOUR,
  HOUR_HEIGHT,
  layoutOverlaps,
  minuteToY,
  packedStyle,
  yToMinute,
} from "./geometry";

export interface Ghost {
  date: string;
  startMinute: number;
  durationMinutes: number;
}

export interface TimeGridProps {
  dates: string[];
  events: ScheduledEvent[];
  conflicts: Map<number, number[]>;
  interactive: boolean;
  armedTask?: Task | null;
  ghost?: Ghost | null;
  onEventClick?: (event: ScheduledEvent) => void;
  /** Armed tap-to-place: click a slot with a task armed. */
  onSlotClick?: (date: string, startMinute: number) => void;
  onResize?: (eventId: number, endMinute: number) => void;
  onEventContextMenu?: (event: ScheduledEvent, e: React.MouseEvent) => void;
}

/** Day/week grid: hour gutter + day columns sharing one 15-min geometry (§4.3). */
export function TimeGrid(props: TimeGridProps): React.JSX.Element {
  const {
    dates,
    events,
    conflicts,
    interactive,
    armedTask,
    ghost,
    onEventClick,
    onSlotClick,
    onResize,
    onEventContextMenu,
  } = props;
  const single = dates.length === 1;
  const today = todayISO();

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduledEvent[]>();
    for (const date of dates) m.set(date, []);
    for (const e of events) m.get(e.eventDate)?.push(e);
    return m;
  }, [dates, events]);

  const [now, setNow] = useState(nowMinutes());
  useEffect(() => {
    const t = window.setInterval(() => setNow(nowMinutes()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: single ? undefined : 900 }}>
        <div className={`plan-grid${single ? " single" : ""}`}>
          <div className="gutter-spacer" />
          {dates.map((date) => {
            const { dow, date: num } = shortDayLabel(date);
            const isToday = date === today;
            return (
              <div
                key={date}
                className={`flex items-baseline gap-1 px-2 py-1 text-xs border-b border-base-content/10 ${
                  isToday ? "font-bold text-primary" : "opacity-70"
                }`}
              >
                <span>{dow}</span>
                <span className="text-base leading-none">{num}</span>
                {isToday && <span className="text-[10px] text-primary">· today</span>}
              </div>
            );
          })}
        </div>
        <div className={`plan-grid${single ? " single" : ""}`} style={{ height: GRID_HEIGHT }}>
          <div>
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
              <div key={i} className="gutter-cell">
                {String(START_HOUR + i).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {dates.map((date) => (
            <DayColumn
              key={date}
              date={date}
              events={byDate.get(date) ?? []}
              conflicts={conflicts}
              interactive={interactive}
              ghost={ghost?.date === date ? ghost : null}
              nowMinute={date === today ? now : null}
              onEventClick={onEventClick}
              onSlotClick={onSlotClick}
              onResize={onResize}
              onEventContextMenu={onEventContextMenu}
              armedTask={armedTask ?? null}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  date,
  events,
  conflicts,
  interactive,
  ghost,
  nowMinute,
  onEventClick,
  onSlotClick,
  onResize,
  onEventContextMenu,
  armedTask,
}: {
  date: string;
  events: ScheduledEvent[];
  conflicts: Map<number, number[]>;
  interactive: boolean;
  ghost: Ghost | null;
  nowMinute: number | null;
  onEventClick?: (event: ScheduledEvent) => void;
  onSlotClick?: (date: string, startMinute: number) => void;
  onResize?: (eventId: number, endMinute: number) => void;
  onEventContextMenu?: (event: ScheduledEvent, e: React.MouseEvent) => void;
  armedTask: Task | null;
}): React.JSX.Element {
  const { isOver, setNodeRef } = useDroppable({
    id: `day-${date}`,
    data: { type: "day", date },
    disabled: !interactive,
  });
  const packed = useMemo(() => layoutOverlaps(events), [events]);
  const armed = armedTask != null && interactive;

  const clickSlot = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!armed || !onSlotClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSlotClick(date, yToMinute(e.clientY - rect.top));
  };

  return (
    <div
      ref={setNodeRef}
      className={`day-col ${date === todayISO() ? "col-today" : ""} ${isOver ? "drag-over" : ""}`}
      onClick={clickSlot}
      role={armed ? "button" : undefined}
      aria-label={armed ? `Place ${armedTask.name} on ${date}` : undefined}
    >
      {events.map((ev) => (
        <EventBlockView
          key={ev.id}
          event={ev}
          pack={packed.get(ev.id)}
          conflicted={conflicts.has(ev.id)}
          interactive={interactive}
          onClick={onEventClick}
          onResize={onResize}
          onContextMenu={onEventContextMenu}
        />
      ))}
      {ghost && (
        <div
          className="drop-ghost"
          style={{ top: minuteToY(ghost.startMinute), height: (ghost.durationMinutes / 60) * HOUR_HEIGHT }}
        >
          {fmtTime(ghost.startMinute)}
        </div>
      )}
      {nowMinute != null && START_HOUR * 60 <= nowMinute && nowMinute <= END_HOUR * 60 && (
        <div className="now-line" style={{ top: minuteToY(nowMinute) }} />
      )}
    </div>
  );
}

function EventBlockView({
  event,
  pack,
  conflicted,
  interactive,
  onClick,
  onResize,
  onContextMenu,
}: {
  event: ScheduledEvent;
  pack: { col: number; cols: number } | undefined;
  conflicted: boolean;
  interactive: boolean;
  onClick?: (event: ScheduledEvent) => void;
  onResize?: (eventId: number, endMinute: number) => void;
  onContextMenu?: (event: ScheduledEvent, e: React.MouseEvent) => void;
}): React.JSX.Element {
  const tasks = usePlannerStore((s) => s.tasks);
  const users = usePlannerStore((s) => s.users);
  const assignees = usePlannerStore((s) => s.assignees);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `event-${event.id}`,
    data: { type: "event", eventId: event.id },
    disabled: !interactive,
  });

  const task = tasks.find((t) => t.id === event.taskId);
  const category = categoryById(task?.categoryId ?? null);
  const assigneeUsers = users.filter((u) => assignees.some((a) => a.taskId === event.taskId && a.userId === u.id));

  const height = ((event.endMinute - event.startMinute) / 60) * HOUR_HEIGHT;
  const compact = height < 40;
  const style: React.CSSProperties = {
    top: minuteToY(event.startMinute),
    height: Math.max(height - 2, 14),
    ["--ev-cat" as string]: category?.color ?? "var(--color-base-content)",
    ...packedStyle(pack),
  };

  // Resize: pointer capture on the bottom-edge handle, 15-min snap on release
  // (DESIGN.md §6.3). stopPropagation keeps dnd-kit from starting a drag.
  const skipClick = useRef(false);
  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!interactive || !onResize) return;
    e.stopPropagation();
    e.preventDefault();
    const colEl = (e.currentTarget.parentElement as HTMLElement).parentElement as HTMLElement;
    const rect = colEl.getBoundingClientRect();
    const handleEl = e.currentTarget;
    handleEl.setPointerCapture(e.pointerId);
    skipClick.current = true;
    const up = (pe: PointerEvent): void => {
      window.removeEventListener("pointerup", up);
      try {
        handleEl.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const minute = yToMinute(pe.clientY - rect.top);
      onResize(event.id, Math.max(event.startMinute + SLOT_MINUTES, minute));
      window.setTimeout(() => {
        skipClick.current = false;
      }, 120);
    };
    window.addEventListener("pointerup", up);
  };

  const handleClick = (): void => {
    if (skipClick.current) return;
    onClick?.(event);
  };

  const content = compact ? (
    <span className="font-semibold truncate block" title={`${task?.name ?? ""} ${fmtTime(event.startMinute)}`}>
      {task?.name ?? "(deleted task)"}
      {conflicted ? " ⚠" : ""}
    </span>
  ) : (
    <>
      <div className="flex items-center gap-1 font-semibold">
        <span className="truncate" title={task?.name}>
          {task?.name ?? "(deleted task)"}
        </span>
        {conflicted && <span className="conflict-dot">⚠</span>}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="opacity-70">
          {fmtTime(event.startMinute)}–{fmtTime(event.endMinute)}
        </span>
        <AvatarStack users={assigneeUsers} max={3} />
      </div>
    </>
  );

  return (
    <div
      ref={setNodeRef}
      className={`event-block${conflicted ? " conflict" : ""}${isDragging ? " dragging" : ""}${
        interactive ? "" : " static"
      }${compact ? " compact" : ""}`}
      style={style}
      onClick={handleClick}
      onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(event, e); } : undefined}
      {...listeners}
      {...attributes}
      role="button"
      aria-label={`${task?.name ?? "Event"} ${fmtTime(event.startMinute)} to ${fmtTime(event.endMinute)}${
        conflicted ? ", conflict" : ""
      }`}
    >
      {content}
      {interactive && onResize && (
        <div className="ev-resize" onPointerDown={onResizePointerDown} aria-label={`Resize ${task?.name ?? "event"}`} />
      )}
    </div>
  );
}
