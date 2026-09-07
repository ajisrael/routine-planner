import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ScheduledEvent, Task } from "@planner/shared";
import { SLOT_MINUTES } from "@planner/shared";
import { usePlannerStore, categoryById } from "../../store";
import { dayDowLabel, dayNumber, fmtTime } from "../../lib/dates";
import { useLongPress, syntheticContextEvent } from "../../lib/longPress";
import { AvatarStack } from "../Avatar";
import {
  DEFAULT_HOUR_HEIGHT,
  END_HOUR,
  MIN_HOUR_HEIGHT,
  START_HOUR,
  VISIBLE_HOURS,
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
  /** Reports the computed hour height (viewport / VISIBLE_HOURS) for drag math. */
  onHourHeight?: (hourHeight: number) => void;
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
    onHourHeight,
  } = props;
  const single = dates.length === 1;

  // Zoom: fit VISIBLE_HOURS into the scroll viewport, tracked on resize.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const recompute = (): void => {
      const hh = Math.max(MIN_HOUR_HEIGHT, Math.round(el.clientHeight / VISIBLE_HOURS));
      setHourHeight((cur) => (cur === hh ? cur : hh));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    onHourHeight?.(hourHeight);
  }, [hourHeight, onHourHeight]);

  // Keep the earliest occurrence of the visible days in view — generated
  // defaults (09:00) would otherwise sit below the fold of the 6-hour window.
  const datesKey = dates.join(",");
  const hasEvents = events.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const visible = events.filter((e) => dates.includes(e.eventDate));
    const earliest = visible.length > 0 ? Math.min(...visible.map((e) => e.startMinute)) : null;
    const targetMinute = earliest == null ? 7 * 60 : Math.max(0, earliest - 30);
    el.scrollTo({ top: minuteToY(targetMinute, hourHeight), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesKey, hasEvents, hourHeight]);

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduledEvent[]>();
    for (const date of dates) m.set(date, []);
    for (const e of events) m.get(e.eventDate)?.push(e);
    return m;
  }, [dates, events]);

  // Full 24h window; grows if an event somehow ends past midnight.
  const lastHour = Math.max(END_HOUR, ...events.map((e) => Math.ceil(e.endMinute / 60)));
  const gridHeight = (lastHour - START_HOUR) * hourHeight;
  const columns = `56px repeat(${dates.length}, minmax(var(--day-min), 1fr))`;

  return (
    // Fixed "window": the card constrains the height; this is the scroll
    // container. Day headers stay pinned on top, hour labels pinned left.
    // --hour-h drives the CSS hour grid; ~VISIBLE_HOURS are visible at once.
    <div
      ref={scrollRef}
      className="lib-scroll min-h-0 flex-1 overflow-auto rounded-xl border border-base-content/10"
      style={{ ["--hour-h" as string]: `${hourHeight}px` } as React.CSSProperties}
    >
      <div style={{ minWidth: single ? undefined : `calc(56px + ${dates.length} * var(--day-min))` }}>
        <div
          className="plan-grid sticky top-0 z-20 bg-base-100"
          style={{ gridTemplateColumns: columns }}
        >
          <div className="gutter-spacer sticky left-0 z-[1] border-r border-base-content/10 bg-base-100" />
          {dates.map((date) => (
            <div
              key={date}
              className="flex items-baseline gap-1 border-b border-base-content/10 px-2 py-1 text-xs opacity-70"
            >
              <span>{dayDowLabel(date)}</span>
              <span className="text-base leading-none">{dayNumber(date)}</span>
            </div>
          ))}
        </div>
        <div className="plan-grid" style={{ gridTemplateColumns: columns, height: gridHeight }}>
          {/* Hour gutter: pinned to the left edge while columns scroll under
              it (sticky). The grid item spans 1 / -1 for a wide constraint box
              but is itself only 56px wide - a full-width element would have no
              room to travel and would never stick. */}
          <div
            className="pointer-events-none sticky left-0 z-10 w-14 border-r border-base-content/10 bg-base-100"
            style={{ gridRow: 1, gridColumn: "1 / -1", height: gridHeight }}
          >
            {Array.from({ length: lastHour - START_HOUR }, (_, i) => (
              <div key={i} className="gutter-cell">
                {String(START_HOUR + i).padStart(2, "0")}:00
              </div>
            ))}
            {/* boundary label at the very bottom edge (e.g. "24:00") */}
            <div
              className="gutter-cell absolute left-0 right-0 bg-base-100"
              style={{
                top: gridHeight,
                marginTop: -12,
                height: 0,
                border: "none",
                padding: "0 6px 0 0",
                overflow: "visible",
              }}
            >
              {String(lastHour).padStart(2, "0")}:00
            </div>
          </div>
          {dates.map((date, i) => (
            <DayColumn
              key={date}
              date={date}
              column={i + 2}
              events={byDate.get(date) ?? []}
              conflicts={conflicts}
              interactive={interactive}
              ghost={ghost?.date === date ? ghost : null}
              onEventClick={onEventClick}
              onSlotClick={onSlotClick}
              onResize={onResize}
              onEventContextMenu={onEventContextMenu}
              armedTask={armedTask ?? null}
              hourHeight={hourHeight}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  date,
  column,
  events,
  conflicts,
  interactive,
  ghost,
  onEventClick,
  onSlotClick,
  onResize,
  onEventContextMenu,
  armedTask,
  hourHeight,
}: {
  date: string;
  column: number;
  events: ScheduledEvent[];
  conflicts: Map<number, number[]>;
  interactive: boolean;
  ghost: Ghost | null;
  onEventClick?: (event: ScheduledEvent) => void;
  onSlotClick?: (date: string, startMinute: number) => void;
  onResize?: (eventId: number, endMinute: number) => void;
  onEventContextMenu?: (event: ScheduledEvent, e: React.MouseEvent) => void;
  armedTask: Task | null;
  hourHeight: number;
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
    onSlotClick(date, yToMinute(e.clientY - rect.top, hourHeight));
  };

  return (
    <div
      ref={setNodeRef}
      className={`day-col ${isOver ? "drag-over" : ""}`}
      style={{ gridRow: 1, gridColumn: column }}
      onClick={clickSlot}
      role={armed ? "button" : undefined}
      aria-label={armed ? `Place ${armedTask.name} on Day ${dayNumber(date)}` : undefined}
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
          hourHeight={hourHeight}
        />
      ))}
      {ghost && (
        <div
          className="drop-ghost"
          style={{ top: minuteToY(ghost.startMinute, hourHeight), height: (ghost.durationMinutes / 60) * hourHeight }}
        >
          {fmtTime(ghost.startMinute)}
        </div>
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
  hourHeight,
}: {
  event: ScheduledEvent;
  pack: { col: number; cols: number } | undefined;
  conflicted: boolean;
  interactive: boolean;
  onClick?: (event: ScheduledEvent) => void;
  onResize?: (eventId: number, endMinute: number) => void;
  onContextMenu?: (event: ScheduledEvent, e: React.MouseEvent) => void;
  hourHeight: number;
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

  const height = ((event.endMinute - event.startMinute) / 60) * hourHeight;
  const compact = height < 40;
  const style: React.CSSProperties = {
    top: minuteToY(event.startMinute, hourHeight),
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
      const minute = yToMinute(pe.clientY - rect.top, hourHeight);
      onResize(event.id, Math.max(event.startMinute + SLOT_MINUTES, minute));
      window.setTimeout(() => {
        skipClick.current = false;
      }, 120);
    };
    window.addEventListener("pointerup", up);
  };

  // Long-press (touch) opens the occurrence menu - iOS never fires
  // contextmenu, so touch needs its own path to the same actions.
  const longPress = useLongPress((x, y) => onContextMenu?.(event, syntheticContextEvent(x, y)));

  const handleClick = (): void => {
    if (skipClick.current || longPress.suppressed()) return;
    onClick?.(event);
  };

  // dnd-kit's sensor listeners arrive as a spread; compose them with the
  // long-press handlers so both see the same pointer events.
  const dndListeners = listeners as Record<string, ((e: React.PointerEvent<HTMLDivElement>) => void) | undefined> | undefined;
  const withDnd =
    (key: string, mine: (e: React.PointerEvent<HTMLDivElement>) => void) =>
    (e: React.PointerEvent<HTMLDivElement>): void => {
      mine(e);
      dndListeners?.[key]?.(e);
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
      onPointerDown={withDnd("onPointerDown", longPress.onPointerDown)}
      onPointerMove={withDnd("onPointerMove", longPress.onPointerMove)}
      onPointerUp={withDnd("onPointerUp", longPress.onPointerUp)}
      onPointerCancel={withDnd("onPointerCancel", longPress.onPointerCancel)}
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
