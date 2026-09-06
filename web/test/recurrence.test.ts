import { describe, expect, it } from "vitest";
import {
  occurrenceDays,
  describeRule,
  templateDay,
  templateDow,
  templateWeek,
} from "@planner/shared";

/** The web previews use the exact same shared engine the server generates with. */
const rule = (shape: Partial<Parameters<typeof occurrenceDays>[0]>) => ({
  ruleType: "none" as const,
  daysOfWeek: null,
  intervalDays: null,
  dayOfMonth: null,
  monthWeek: null,
  monthDow: null,
  startDate: "01",
  ...shape,
});

describe("template recurrence engine (web preview parity)", () => {
  it("computes template days for weekly patterns", () => {
    expect(occurrenceDays(rule({ ruleType: "weekly_days", daysOfWeek: [1, 3, 5] }), 1, 14)).toEqual([
      1, 3, 5, 8, 10, 12,
    ]);
  });

  it("interval + specific-template-day patterns", () => {
    expect(occurrenceDays(rule({ ruleType: "interval_days", intervalDays: 14 }))).toEqual([1, 15, 29]);
    expect(occurrenceDays(rule({ ruleType: "monthly_date", dayOfMonth: 15 }))).toEqual([15]);
  });

  it("labels for the task form preview", () => {
    expect(describeRule(rule({ ruleType: "interval_days", intervalDays: 14 }))).toBe("Every 14d");
    expect(describeRule(rule({ ruleType: "monthly_date", dayOfMonth: 21 }))).toBe("Day 21 of template");
  });

  it("template helpers behave", () => {
    expect(templateDay(7)).toBe("07");
    expect(templateDow(8)).toBe(1); // Day 8 is a Monday again
    expect(templateWeek(29)).toBe(5); // the 2-day tail week
  });
});
