import { describe, expect, it } from "vitest";
import {
  describeRule,
  occurrenceDays,
  templateDay,
  templateDayNumber,
  templateDow,
  templateDowLabel,
  templateWeek,
} from "@planner/shared";
import type { RuleShape } from "@planner/shared";

const rule = (shape: Partial<RuleShape>): RuleShape => ({
  ruleType: "none",
  daysOfWeek: null,
  intervalDays: null,
  dayOfMonth: null,
  monthWeek: null,
  monthDow: null,
  startDate: "01",
  ...shape,
});

const FULL = { firstDay: 1, lastDay: 30 };

describe("template month structure", () => {
  it("Day 1 is Monday; cycle repeats every 7 days", () => {
    expect(templateDow(1)).toBe(1);
    expect(templateDowLabel(1)).toBe("Mon");
    expect(templateDowLabel(7)).toBe("Sun");
    expect(templateDowLabel(8)).toBe("Mon");
    expect(templateDow(30)).toBe(2); // Day 30 is a Tuesday
  });

  it("weeks: 4 full weeks + days 29–30", () => {
    expect(templateWeek(1)).toBe(1);
    expect(templateWeek(7)).toBe(1);
    expect(templateWeek(8)).toBe(2);
    expect(templateWeek(29)).toBe(5);
    expect(templateWeek(30)).toBe(5);
  });

  it("storage strings are zero-padded and sort lexically", () => {
    expect(templateDay(1)).toBe("01");
    expect(templateDay(30)).toBe("30");
    expect(["30", "02", "01"].sort()).toEqual(["01", "02", "30"]);
    expect(templateDayNumber("07")).toBe(7);
  });
});

describe("recurrence engine on the template (DATA_MODEL.md §7)", () => {
  it("none → no occurrences", () => {
    expect(occurrenceDays(rule({ ruleType: "none" }))).toEqual([]);
  });

  it("weekly_days daily → all 30 days", () => {
    const days = occurrenceDays(rule({ ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }));
    expect(days).toHaveLength(30);
    expect(days[0]).toBe(1);
    expect(days[29]).toBe(30);
  });

  it("weekly_days weekdays only", () => {
    const days = occurrenceDays(
      rule({ ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5] }),
      1,
      7,
    );
    expect(days).toEqual([1, 2, 3, 4, 5]);
  });

  it("weekly_days Mon Wed Fri", () => {
    const days = occurrenceDays(rule({ ruleType: "weekly_days", daysOfWeek: [1, 3, 5] }), 1, 14);
    expect(days).toEqual([1, 3, 5, 8, 10, 12]);
  });

  it("interval_days every 3 days from Day 1", () => {
    const days = occurrenceDays(rule({ ruleType: "interval_days", intervalDays: 3 }));
    expect(days).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28]);
  });

  it("interval_days every 14 days (bi-weekly)", () => {
    const days = occurrenceDays(rule({ ruleType: "interval_days", intervalDays: 14 }));
    expect(days).toEqual([1, 15, 29]);
  });

  it("monthly_date = a specific template day", () => {
    const days = occurrenceDays(rule({ ruleType: "monthly_date", dayOfMonth: 15 }));
    expect(days).toEqual([15]);
  });

  it("monthly_date beyond the template matches nothing", () => {
    expect(occurrenceDays(rule({ ruleType: "monthly_date", dayOfMonth: 31 }))).toEqual([]);
  });

  it("monthly_weekday is not representable → matches nothing", () => {
    expect(
      occurrenceDays(rule({ ruleType: "monthly_weekday", monthWeek: 1, monthDow: 1 })),
    ).toEqual([]);
  });

  it("partial windows", () => {
    const days = occurrenceDays(rule({ ruleType: "weekly_days", daysOfWeek: [1] }), 2, 9);
    expect(days).toEqual([8]); // Day 1 excluded, Day 8 is the next Monday
    expect(occurrenceDays(rule({ ruleType: "interval_days", intervalDays: 5 }), 12, 20)).toEqual([
      16,
    ]);
  });
});

describe("describeRule labels", () => {
  it("labels each pattern", () => {
    expect(describeRule(rule({ ruleType: "none" }))).toBe("One-off");
    expect(describeRule(rule({ ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }))).toBe("Daily");
    expect(describeRule(rule({ ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5] }))).toBe("Weekdays");
    expect(describeRule(rule({ ruleType: "weekly_days", daysOfWeek: [1, 3, 5] }))).toBe("Mon Wed Fri");
    expect(describeRule(rule({ ruleType: "interval_days", intervalDays: 14 }))).toBe("Every 14d");
    expect(describeRule(rule({ ruleType: "monthly_date", dayOfMonth: 15 }))).toBe("Day 15 of template");
    expect(describeRule(rule({ ruleType: "monthly_weekday", monthWeek: 1, monthDow: 1 }))).toBe(
      "Custom (not in template)",
    );
  });
});
