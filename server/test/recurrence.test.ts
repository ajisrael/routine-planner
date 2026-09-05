import { describe, expect, it } from "vitest";
import { addDaysISO, describeRule, isoDow, occurrenceDates } from "@planner/shared";
import type { RuleShape } from "@planner/shared";

const rule = (shape: Partial<RuleShape>): RuleShape => ({
  ruleType: "none",
  daysOfWeek: null,
  intervalDays: null,
  dayOfMonth: null,
  monthWeek: null,
  monthDow: null,
  startDate: "2026-09-01",
  ...shape,
});

// 2026-09-01 is a Tuesday; Sep 2026: Tue 1, Wed 2, … Mon 7.
const WIN = { start: "2026-09-01", end: "2026-09-30" };

describe("recurrence engine (DATA_MODEL.md §7)", () => {
  it("none → no occurrences", () => {
    expect(occurrenceDates(rule({ ruleType: "none" }), WIN.start, WIN.end)).toEqual([]);
  });

  it("weekly_days daily", () => {
    const dates = occurrenceDates(rule({ ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }), WIN.start, WIN.end);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2026-09-01");
    expect(dates[29]).toBe("2026-09-30");
  });

  it("weekly_days weekdays only", () => {
    const dates = occurrenceDates(rule({ ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5] }), "2026-09-07", "2026-09-13");
    expect(dates).toEqual(["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]);
  });

  it("weekly_days Mon Wed Fri", () => {
    const dates = occurrenceDates(rule({ ruleType: "weekly_days", daysOfWeek: [1, 3, 5] }), "2026-09-01", "2026-09-14");
    expect(dates).toEqual(["2026-09-02", "2026-09-04", "2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14"]);
  });

  it("weekly_days respects startDate anchor (inclusive lower bound)", () => {
    const dates = occurrenceDates(
      rule({ ruleType: "weekly_days", daysOfWeek: [1], startDate: "2026-09-10" }),
      "2026-09-01",
      "2026-09-30",
    );
    expect(dates).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("interval_days every 3 days from anchor", () => {
    const dates = occurrenceDates(rule({ ruleType: "interval_days", intervalDays: 3, startDate: "2026-09-01" }), WIN.start, WIN.end);
    expect(dates[0]).toBe("2026-09-01");
    expect(dates[1]).toBe("2026-09-04");
    expect(dates).toHaveLength(10); // 1,4,7,…,28
    expect(dates[9]).toBe("2026-09-28");
  });

  it("interval_days every 14 days (bi-weekly)", () => {
    const dates = occurrenceDates(rule({ ruleType: "interval_days", intervalDays: 14, startDate: "2026-09-02" }), WIN.start, WIN.end);
    expect(dates).toEqual(["2026-09-02", "2026-09-16", "2026-09-30"]);
  });

  it("interval_days skips dates before the anchor", () => {
    const dates = occurrenceDates(rule({ ruleType: "interval_days", intervalDays: 5, startDate: "2026-09-10" }), "2026-09-01", "2026-09-20");
    expect(dates).toEqual(["2026-09-10", "2026-09-15", "2026-09-20"]);
  });

  it("monthly_date day 15", () => {
    const dates = occurrenceDates(rule({ ruleType: "monthly_date", dayOfMonth: 15, startDate: "2026-08-01" }), WIN.start, WIN.end);
    expect(dates).toEqual(["2026-09-15"]);
  });

  it("monthly_date day 31 skips short months (Feb 30-style skip)", () => {
    const dates = occurrenceDates(rule({ ruleType: "monthly_date", dayOfMonth: 31, startDate: "2026-01-01" }), "2026-01-01", "2026-04-30");
    expect(dates).toEqual(["2026-01-31", "2026-03-31"]); // Feb/Apr have no 31st
  });

  it("monthly_weekday first Monday", () => {
    const dates = occurrenceDates(rule({ ruleType: "monthly_weekday", monthWeek: 1, monthDow: 1, startDate: "2026-08-01" }), WIN.start, WIN.end);
    expect(dates).toEqual(["2026-09-07"]);
  });

  it("monthly_weekday last Friday", () => {
    const dates = occurrenceDates(rule({ ruleType: "monthly_weekday", monthWeek: -1, monthDow: 5, startDate: "2026-08-01" }), WIN.start, WIN.end);
    expect(dates).toEqual(["2026-09-25"]);
  });

  it("monthly_weekday 3rd Tuesday across two months", () => {
    const dates = occurrenceDates(rule({ ruleType: "monthly_weekday", monthWeek: 3, monthDow: 2, startDate: "2026-08-01" }), "2026-09-01", "2026-10-31");
    expect(dates).toEqual(["2026-09-15", "2026-10-20"]);
  });

  it("empty / inverted window", () => {
    expect(occurrenceDates(rule({ ruleType: "weekly_days", daysOfWeek: [1] }), "2026-09-10", "2026-09-01")).toEqual([]);
  });

  it("30-day boundary is inclusive", () => {
    const dates = occurrenceDates(rule({ ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }), "2026-09-01", "2026-09-30");
    expect(dates).toHaveLength(30);
  });
});

describe("date helpers", () => {
  it("isoDow maps Mon=1 … Sun=7", () => {
    expect(isoDow("2026-08-31")).toBe(1); // Monday
    expect(isoDow("2026-09-06")).toBe(7); // Sunday
  });

  it("addDaysISO crosses month boundaries", () => {
    expect(addDaysISO("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysISO("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("describeRule labels", () => {
  it("labels each pattern", () => {
    expect(describeRule(rule({ ruleType: "none" }))).toBe("One-off");
    expect(describeRule(rule({ ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }))).toBe("Daily");
    expect(describeRule(rule({ ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5] }))).toBe("Weekdays");
    expect(describeRule(rule({ ruleType: "weekly_days", daysOfWeek: [1, 3, 5] }))).toBe("Mon Wed Fri");
    expect(describeRule(rule({ ruleType: "interval_days", intervalDays: 14 }))).toBe("Every 14d");
    expect(describeRule(rule({ ruleType: "monthly_date", dayOfMonth: 21 }))).toBe("Monthly on the 21st");
    expect(describeRule(rule({ ruleType: "monthly_date", dayOfMonth: 11 }))).toBe("Monthly on the 11th");
    expect(describeRule(rule({ ruleType: "monthly_date", dayOfMonth: 2 }))).toBe("Monthly on the 2nd");
    expect(describeRule(rule({ ruleType: "monthly_weekday", monthWeek: 1, monthDow: 1 }))).toBe("1st Mon of month");
    expect(describeRule(rule({ ruleType: "monthly_weekday", monthWeek: -1, monthDow: 5 }))).toBe("Last Fri of month");
  });
});
