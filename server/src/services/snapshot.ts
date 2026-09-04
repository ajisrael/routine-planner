import type { Snapshot } from "@planner/shared";
import { db } from "../db.js";

/**
 * Full-dataset snapshot for initial load and reconnect (ARCHITECTURE.md §6.1).
 */
export function buildSnapshot(): Snapshot {
  void db;
  // TODO: SELECT all six collections (users, categories, tasks, assignees,
  // recurrence_rules, scheduled_events within the 30-day window) and map
  // snake_case rows to the shared camelCase types.
  throw new Error("snapshot not implemented yet");
}