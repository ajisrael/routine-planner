import { describe, expect, it } from "vitest";
import { addWeekday, removeWeekday, replaceWeekday } from "../src/lib/wizard/pattern";

describe("weekly pattern helpers", () => {
  it("adds a weekday to a rule (union, ordered, deduped)", () => {
    expect(addWeekday([1, 3, 5], 6)).toEqual([1, 3, 5, 6]);
    expect(addWeekday([1, 3, 5], 3)).toEqual([1, 3, 5]);
    expect(addWeekday([], 2)).toEqual([2]);
  });

  it("removes a weekday and never emits a duplicate", () => {
    expect(removeWeekday([1, 3, 5], 3)).toEqual([1, 5]);
    expect(removeWeekday([1, 3, 5], 4)).toEqual([1, 3, 5]);
    expect(removeWeekday([5], 5)).toEqual([]);
  });

  it("replaces one weekday with another (move to a different day)", () => {
    expect(replaceWeekday([1, 3, 5], 3, 6)).toEqual([1, 5, 6]);
    expect(replaceWeekday([3], 3, 2)).toEqual([2]);
    expect(replaceWeekday([1, 3, 5], 3, 5)).toEqual([1, 5]);
  });

  it("sorts the result ascending for a stable wire payload", () => {
    expect(addWeekday([7, 1], 3)).toEqual([1, 3, 7]);
    expect(replaceWeekday([5, 1], 5, 2)).toEqual([1, 2]);
  });
});