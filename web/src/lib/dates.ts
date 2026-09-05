/** Local-date helpers (ISO strings "YYYY-MM-DD"; times as minutes from midnight). */

const pad = (n: number): string => String(n).padStart(2, "0");

export function dateFromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayISO = (): string => isoFromDate(new Date());

export function addDaysISO(iso: string, n: number): string {
  const d = dateFromISO(iso);
  d.setDate(d.getDate() + n);
  return isoFromDate(d);
}

export function addMonthsISO(iso: string, n: number): string {
  const d = dateFromISO(iso);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return isoFromDate(d);
}

export const clampISO = (iso: string, min: string, max: string): string =>
  iso < min ? min : iso > max ? max : iso;

/** Day of week, Mon=1 … Sun=7. */
export function isoDow(iso: string): number {
  const js = dateFromISO(iso).getDay();
  return js === 0 ? 7 : js;
}

export const fmtTime = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(Math.round(minutes % 60))}`;

export function parseTime(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 9) * 60 + (m ?? 0);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function dayLabel(iso: string): string {
  const d = dateFromISO(iso);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function weekRangeLabel(startISO: string, endISO: string): string {
  const a = dateFromISO(startISO);
  const b = dateFromISO(endISO);
  const left = `${MONTHS[a.getMonth()]} ${a.getDate()}`;
  const right =
    a.getMonth() === b.getMonth()
      ? `${b.getDate()}, ${b.getFullYear()}`
      : `${MONTHS[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
  return `${left} – ${right}`;
}

export function monthLabel(iso: string): string {
  const d = dateFromISO(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function shortDayLabel(iso: string): { dow: string; date: number } {
  const d = dateFromISO(iso);
  return { dow: WEEKDAYS[d.getDay()], date: d.getDate() };
}

/** Monday-first week containing `iso`. */
export function weekDates(anchorISO: string): string[] {
  const start = addDaysISO(anchorISO, -(isoDow(anchorISO) - 1));
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

/** 42 cells (6 weeks) covering the month of `iso`; leading/trailing days of adjacent months. */
export function monthCells(anchorISO: string): { date: string; inMonth: boolean }[] {
  const first = addDaysISO(anchorISO, 1 - dateFromISO(anchorISO).getDate());
  const gridStart = addDaysISO(first, -(isoDow(first) - 1));
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDaysISO(gridStart, i);
    return { date, inMonth: dateFromISO(date).getMonth() === dateFromISO(anchorISO).getMonth() };
  });
}

/** Current local time as minutes from midnight. */
export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
