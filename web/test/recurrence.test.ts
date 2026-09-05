import { describe, expect, it } from "vitest";
import {
  occurrenceDates,
  describeRule,
  addDaysISO,
  isoDow,
} from "@planner/shared";

/** The web previews use the exact same shared engine the server generates with. */
const rule = (shape: Partial<Parameters<typeof occurrenceDates>[0]>) => ({
  ruleType: "none" as const,
  daysOfWeek: null,
  intervalDays: null,
  dayOfMonth: null,
  monthWeek: null,
  monthDow: null,
  startDate: "2026-09-01",
  ...shape,
});

describe("shared recurrence engine (web preview parity)", () => {
  it("computes the same dates as documented examples", () => {
    expect(occurrenceDates(rule({ ruleType: "weekly_days", daysOfWeek: [1, 3, 5] }), "2026-09-01", "2026-09-14")).toEqual(
      ["2026-09-02", "2026-09-04", "2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14"],
    );
    expect(
      occurrenceDates(rule({ ruleType: "monthly_weekday", monthWeek: -1, monthDow: 5, startDate: "2026-08-01" }), "2026-09-01", "2026-09-30"),
    ).toEqual(["2026-09-25"]);
  });

  it("labels for the task form preview", () => {
    expect(describeRule(rule({ ruleType: "interval_days", intervalDays: 14 }))).toBe("Every 14d");
    expect(describeRule(rule({ ruleType: "monthly_date", dayOfMonth: 15 }))).toBe("Monthly on the 15th");
  });

  it("window clamp helpers behave", () => {
    expect(addDaysISO("2026-02-28", 1)).toBe("2026-03-01"); // 2026 not a leap year
    expect(isoDow("2026-09-05")).toBe(6); // Saturday
  });
});
