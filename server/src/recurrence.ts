export {
  occurrenceDays,
  templateDay,
  templateDayNumber,
  templateDow,
  templateWeek,
  TEMPLATE_DAYS,
} from "@planner/shared";
import type { RecurrenceRule } from "@planner/shared";

/**
 * Server-side re-export of the pure template recurrence engine so the
 * documented `server/src/recurrence.ts` module exists (ARCHITECTURE.md §5.3).
 * The engine lives in @planner/shared so the web preview can share the exact
 * semantics. All semantics operate on the 30-day template month.
 */
export function ruleIsRecurring(rule: Pick<RecurrenceRule, "ruleType"> | null | undefined): boolean {
  return rule != null && rule.ruleType !== "none";
}
