import type { ScheduledEvent } from "@planner/shared";

/** Calendar metrics (DESIGN.md §3.4, extended to a full 24-hour window). */
export const START_HOUR = 0;
export const END_HOUR = 24;
export const GUTTER_WIDTH = 56;
export const SLOT = 15;

/** How many hours of the day the scroll window shows by default. */
export const VISIBLE_HOURS = 6;
export const MIN_HOUR_HEIGHT = 48;
/** Initial estimate before the scroll viewport is measured (~900px card). */
export const DEFAULT_HOUR_HEIGHT = 150;

/** Minutes from local midnight → y offset inside the grid. */
export function minuteToY(minute: number, hourHeight: number): number {
  return ((minute - START_HOUR * 60) / 60) * hourHeight;
}

/** y offset inside the grid → snapped start minute (§6.3). Last slot is 23:45. */
export function yToMinute(y: number, hourHeight: number): number {
  const m = (y / hourHeight) * 60 + START_HOUR * 60;
  const snapped = Math.round(m / SLOT) * SLOT;
  return Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - SLOT, snapped));
}

export interface Packed {
  col: number;
  cols: number;
}

/**
 * Overlap packing (DESIGN.md §6.2): cluster transitively-overlapping events,
 * greedily assign columns (first column whose last end ≤ event start, else a
 * new column); every event in a cluster gets width = 100/cols.
 */
export function layoutOverlaps(events: ScheduledEvent[]): Map<number, Packed> {
  const packed = new Map<number, Packed>();
  const sorted = [...events].sort(
    (a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute || a.id - b.id,
  );

  let cluster: ScheduledEvent[] = [];
  let clusterEnd = -1;

  const flush = (): void => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const placement = new Map<number, number>();
    for (const ev of cluster) {
      let col = columnEnds.findIndex((end) => end <= ev.startMinute);
      if (col === -1) {
        columnEnds.push(ev.endMinute);
        col = columnEnds.length - 1;
      } else {
        columnEnds[col] = ev.endMinute;
      }
      placement.set(ev.id, col);
    }
    const cols = columnEnds.length;
    for (const [id, col] of placement) packed.set(id, { col, cols });
    cluster = [];
  };

  for (const ev of sorted) {
    if (cluster.length > 0 && ev.startMinute >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endMinute);
  }
  flush();
  return packed;
}

/** Inline style for a packed event block (3px gutters, §6.2). */
export function packedStyle(p: Packed | undefined): React.CSSProperties {
  if (!p) return { left: 3, right: 3 };
  const pct = 100 / p.cols;
  return {
    left: `calc(${p.col * pct}% + 3px)`,
    right: `calc(${100 - (p.col + 1) * pct}% + 3px)`,
  };
}
