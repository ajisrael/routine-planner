/** Pure weekly-pattern algebra for the setup arrange steps (P5).
 * A weekday set is an ascending, deduped array of ints 1–7 (Mon=1).
 */

const DOW_SET = [1, 2, 3, 4, 5, 6, 7];

function normalize(input: readonly number[]): number[] {
  const seen = new Set<number>();
  for (const d of input) {
    if (Number.isInteger(d) && d >= 1 && d <= 7) seen.add(d);
  }
  return DOW_SET.filter((d) => seen.has(d));
}

/** Union a weekday into the rule's day set. */
export function addWeekday(days: readonly number[], dow: number): number[] {
  return normalize([...days, dow]);
}

/** Drop a weekday from the rule's day set (may become empty → rule "none"). */
export function removeWeekday(days: readonly number[], dow: number): number[] {
  return normalize(days.filter((d) => d !== dow));
}

/** Move the pattern from one weekday to another (drop on a different day). */
export function replaceWeekday(days: readonly number[], sourceDow: number, targetDow: number): number[] {
  return normalize([...days.filter((d) => d !== sourceDow), targetDow]);
}

/** Weekday (Mon=1..Sun=7) of a template date "01".."30" (Day 1 is always Mon). */
export function dowOfDate(date: string): number {
  return ((Number(date) - 1) % 7) + 1;
}