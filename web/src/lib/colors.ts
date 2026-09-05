/**
 * Person avatar colors (DESIGN.md §3.3). The schema has no color column, so
 * colors are derived deterministically from the user id. The first four
 * palette entries match the reviewed design (Mom, Dad, Aria, Levi).
 */
const PERSON_COLORS = [
  "#e11d48",
  "#0284c7",
  "#d97706",
  "#059669",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#ca8a04",
  "#2563eb",
  "#9333ea",
];

export const personColor = (userId: number): string =>
  PERSON_COLORS[(userId - 1 + PERSON_COLORS.length * 1000) % PERSON_COLORS.length];

export const initial = (name: string): string =>
  (name.trim()[0] ?? "?").toUpperCase();
