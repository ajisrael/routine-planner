import { create } from "zustand";
import type { Snapshot } from "@planner/shared";

/**
 * Full local mirror of the dataset — the single source of truth for the UI
 * (ARCHITECTURE.md §4.2). Hydrated from GET /api/snapshot and kept fresh by
 * Socket.IO deltas.
 */
interface PlannerState extends Snapshot {
  hydrated: boolean;
  // TODO: socket subscriptions apply entity:upsert / entity:delete deltas;
  // optimistic store actions (moveEvent, deleteOccurrence, ...) then fire REST.
}

export const usePlannerStore = create<PlannerState>(() => ({
  users: [],
  categories: [],
  tasks: [],
  assignees: [],
  recurrenceRules: [],
  events: [],
  hydrated: false,
}));