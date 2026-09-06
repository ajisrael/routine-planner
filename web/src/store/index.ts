import { create } from "zustand";
import type {
  Category,
  RecurrenceRule,
  ScheduledEvent,
  Snapshot,
  Task,
  TaskAssignee,
  User,
} from "@planner/shared";
import { WINDOW_DAYS } from "@planner/shared";
import { addDaysISO, todayISO } from "../lib/dates";
import { api, type TaskCreatePayload, type TaskRulePayload, type TaskUpdatePayload, type EventMovePayload } from "../api/client";
import { conflictedPersonsFor } from "../selectors/conflicts";
import { toast } from "./toasts";
import { useSession } from "./session";

export type Collection = "users" | "categories" | "tasks" | "assignees" | "recurrenceRules" | "events";

export interface DeltaChange {
  type: "upsert" | "delete";
  collection: Collection;
  id: number | string;
  data?: unknown;
}

export const assigneeKey = (taskId: number, userId: number): string => `${taskId}:${userId}`;

/** Display/generation horizon: [today, today + 29]. */
export const windowStart = (): string => todayISO();
export const windowEnd = (): string => addDaysISO(todayISO(), WINDOW_DAYS - 1);

function upsertById<T extends { id: number }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

function upsertAssignee(list: TaskAssignee[], item: TaskAssignee): TaskAssignee[] {
  const i = list.findIndex((a) => a.taskId === item.taskId && a.userId === item.userId);
  if (i === -1) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

interface PlannerState {
  hydrated: boolean;
  users: User[];
  categories: Category[];
  tasks: Task[];
  assignees: TaskAssignee[];
  recurrenceRules: RecurrenceRule[];
  events: ScheduledEvent[];
  hydrate: (snap: Snapshot) => void;
  reset: () => void;
  refresh: () => Promise<void>;
  applyChange: (change: DeltaChange) => void;
  applyBatch: (changes: DeltaChange[]) => void;

  createTask: (payload: TaskCreatePayload) => Promise<boolean | null>;
  updateTask: (id: number, payload: TaskUpdatePayload) => Promise<boolean | null>;
  deleteTask: (id: number) => Promise<boolean | null>;
  setRecurrence: (id: number, rule: TaskRulePayload) => Promise<boolean | null>;
  deleteTaskEvents: (taskId: number) => Promise<boolean | null>;

  createEvent: (payload: { taskId: number; eventDate: string; startMinute: number; endMinute?: number }) => Promise<ScheduledEvent | null>;
  moveEvent: (id: number, payload: EventMovePayload) => Promise<ScheduledEvent | null>;
  deleteEvent: (id: number) => Promise<boolean | null>;
  syncEvent: (id: number, scope: "all" | "future") => Promise<boolean | null>;

  createPersona: (displayName: string) => Promise<User | null>;
  renameUser: (id: number, displayName: string) => Promise<boolean | null>;
  deletePersona: (id: number) => Promise<boolean | null>;
  createCategory: (name: string, color?: string | null) => Promise<Category | null>;
  updateCategory: (id: number, name?: string, color?: string | null) => Promise<boolean | null>;
  deleteCategory: (id: number) => Promise<boolean | null>;
}

const emptyState = {
  hydrated: false,
  users: [] as User[],
  categories: [] as Category[],
  tasks: [] as Task[],
  assignees: [] as TaskAssignee[],
  recurrenceRules: [] as RecurrenceRule[],
  events: [] as ScheduledEvent[],
};

/**
 * Full local mirror of the dataset — the single source of truth for the UI
 * (ARCHITECTURE.md §4.2). Hydrated from GET /api/snapshot and kept fresh by
 * Socket.IO deltas. Writes are optimistic: apply → REST → reconcile; any
 * failure refetches the snapshot wholesale (§6.4) and toasts.
 */
export const usePlannerStore = create<PlannerState>((set, get) => {
  function applyOne(s: PlannerState, change: DeltaChange): Partial<PlannerState> {
    const { type, collection, id, data } = change;
    switch (collection) {
      case "users": {
        if (type === "delete") return { users: s.users.filter((u) => u.id !== id) };
        return { users: upsertById(s.users, data as User) };
      }
      case "categories": {
        if (type === "delete") return { categories: s.categories.filter((c) => c.id !== id) };
        return { categories: upsertById(s.categories, data as Category) };
      }
      case "tasks": {
        if (type === "delete") return { tasks: s.tasks.filter((t) => t.id !== id) };
        return { tasks: upsertById(s.tasks, data as Task) };
      }
      case "assignees": {
        if (type === "delete") {
          const [tid, uid] = String(id).split(":").map(Number);
          return {
            assignees: s.assignees.filter((a) => !(a.taskId === tid && a.userId === uid)),
          };
        }
        return { assignees: upsertAssignee(s.assignees, data as TaskAssignee) };
      }
      case "recurrenceRules": {
        if (type === "delete") return { recurrenceRules: s.recurrenceRules.filter((r) => r.id !== id) };
        return { recurrenceRules: upsertById(s.recurrenceRules, data as RecurrenceRule) };
      }
      case "events": {
        if (type === "delete") return { events: s.events.filter((e) => e.id !== id) };
        return { events: upsertById(s.events, data as ScheduledEvent) };
      }
    }
  }

  async function withRecovery<T>(action: () => Promise<T>): Promise<T | null> {
    try {
      return await action();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong — resyncing");
      await get().refresh();
      return null;
    }
  }

  function applyTaskResponse(res: { task: Task; rule: RecurrenceRule | null; events: ScheduledEvent[] }): void {
    set((s) => {
      const tasks = upsertById(s.tasks, res.task);
      const rules = res.rule ? upsertById(s.recurrenceRules, res.rule) : s.recurrenceRules;
      // Soft-deleted tasks vanish from the calendar (DATA_MODEL §5.8); active
      // tasks get their (possibly regenerated) occurrences merged in.
      const events =
        res.task.active === false
          ? s.events.filter((e) => e.taskId !== res.task.id)
          : res.events.reduce((acc, ev) => upsertById(acc, ev), s.events);
      return { tasks, recurrenceRules: rules, events };
    });
  }

  return {
    ...emptyState,

    hydrate: (snap) =>
      set({
        ...snap,
        hydrated: true,
      }),

    reset: () => set({ ...emptyState }),

    refresh: async () => {
      try {
        const snap = await api.snapshot();
        get().hydrate(snap);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load data");
      }
    },

    applyChange: (change) => {
      set((s) => applyOne(s, change));
      useSession.getState().pulse();
    },

    applyBatch: (changes) => {
      set((s) => {
        let cur = s;
        for (const change of changes) cur = { ...cur, ...applyOne(cur, change) } as PlannerState;
        return cur;
      });
      useSession.getState().pulse();
    },

    // ---- tasks ---------------------------------------------------------
    createTask: (payload) =>
      withRecovery(async () => {
        const res = await api.createTask(payload);
        set((s) => ({
          tasks: upsertById(s.tasks, res.task),
          recurrenceRules: res.rule ? upsertById(s.recurrenceRules, res.rule) : s.recurrenceRules,
          events: res.events.reduce((acc, ev) => upsertById(acc, ev), s.events),
          assignees: (payload.assigneeIds ?? []).reduce(
            (acc, uid) => upsertAssignee(acc, { taskId: res.task.id, userId: uid }),
            s.assignees,
          ),
        }));
        useSession.getState().pulse();
        return true;
      }),

    updateTask: (id, payload) =>
      withRecovery(async () => {
        const res = await api.updateTask(id, payload);
        applyTaskResponse(res);
        useSession.getState().pulse();
        return true;
      }),

    deleteTask: (id) =>
      withRecovery(async () => {
        await api.deleteTask(id);
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          assignees: s.assignees.filter((a) => a.taskId !== id),
          recurrenceRules: s.recurrenceRules.filter((r) => r.taskId !== id),
          events: s.events.filter((e) => e.taskId !== id),
        }));
        useSession.getState().pulse();
        return true;
      }),

    setRecurrence: (id, rule) =>
      withRecovery(async () => {
        const res = await api.setRecurrence(id, rule);
        applyTaskResponse(res);
        useSession.getState().pulse();
        return true;
      }),

    deleteTaskEvents: (taskId) =>
      withRecovery(async () => {
        await api.deleteTaskEvents(taskId);
        set((s) => ({ events: s.events.filter((e) => e.taskId !== taskId) }));
        useSession.getState().pulse();
        return true;
      }),

    // ---- events --------------------------------------------------------
    createEvent: (payload) =>
      withRecovery(async () => {
        const ev = await api.createEvent(payload);
        set((s) => ({ events: upsertById(s.events, ev) }));
        useSession.getState().pulse();
        return ev;
      }),

    moveEvent: (id, payload) =>
      withRecovery(async () => {
        const ev = await api.moveEvent(id, payload);
        set((s) => ({ events: upsertById(s.events, ev) }));
        useSession.getState().pulse();
        return ev;
      }),

    deleteEvent: (id) =>
      withRecovery(async () => {
        await api.deleteEvent(id);
        set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
        useSession.getState().pulse();
        return true;
      }),

    syncEvent: (id, scope) =>
      withRecovery(async () => {
        const res = await api.syncEvent(id, scope);
        useSession.getState().pulse();
        return res.ok;
      }),

    // ---- users / categories ---------------------------------------------
    createPersona: (displayName) =>
      withRecovery(async () => {
        const u = await api.createPersona(displayName);
        set((s) => ({ users: upsertById(s.users, u) }));
        useSession.getState().pulse();
        return u;
      }),

    deletePersona: (id) =>
      withRecovery(async () => {
        await api.deleteUser(id);
        set((s) => ({
          users: s.users.filter((u) => u.id !== id),
          assignees: s.assignees.filter((a) => a.userId !== id),
        }));
        useSession.getState().pulse();
        return true;
      }),

    renameUser: (id, displayName) =>
      withRecovery(async () => {
        const u = await api.renameUser(id, displayName);
        set((s) => ({ users: upsertById(s.users, u) }));
        useSession.getState().pulse();
        return true;
      }),

    createCategory: (name, color) =>
      withRecovery(async () => {
        const c = await api.createCategory(name, color);
        set((s) => ({ categories: upsertById(s.categories, c) }));
        useSession.getState().pulse();
        return c;
      }),

    updateCategory: (id, name, color) =>
      withRecovery(async () => {
        const c = await api.updateCategory(id, name, color);
        set((s) => ({ categories: upsertById(s.categories, c) }));
        useSession.getState().pulse();
        return true;
      }),

    deleteCategory: (id) =>
      withRecovery(async () => {
        await api.deleteCategory(id);
        set((s) => ({ categories: s.categories.filter((c) => c.id !== id) }));
        useSession.getState().pulse();
        return true;
      }),
  };
});

/** Lookups used all over the UI. */
export const taskById = (id: number): Task | undefined => usePlannerStore.getState().tasks.find((t) => t.id === id);
export const categoryById = (id: number | null): Category | undefined =>
  id == null ? undefined : usePlannerStore.getState().categories.find((c) => c.id === id);
export const ruleForTask = (taskId: number): RecurrenceRule | undefined =>
  usePlannerStore.getState().recurrenceRules.find((r) => r.taskId === taskId);
export const assigneesOfTask = (taskId: number): User[] => {
  const s = usePlannerStore.getState();
  const ids = new Set(s.assignees.filter((a) => a.taskId === taskId).map((a) => a.userId));
  return s.users.filter((u) => ids.has(u.id));
};
export const eventsOfTask = (taskId: number): ScheduledEvent[] => {
  const s = usePlannerStore.getState();
  const task = s.tasks.find((t) => t.id === taskId);
  if (!task || !task.active) return [];
  return s.events.filter((e) => e.taskId === taskId);
};

/** A task's reference start minute (§7): earliest occurrence in window, else 09:00. */
export function referenceStartMinute(taskId: number): number {
  const evs = eventsOfTask(taskId).filter((e) => e.eventDate >= windowStart());
  if (evs.length === 0) return 540;
  return Math.min(...evs.map((e) => e.startMinute));
}

/** Warn text for conflicts created by a mutation (DESIGN.md §6.1). */
export function conflictToastIfAny(event: ScheduledEvent): void {
  const s = usePlannerStore.getState();
  const persons = conflictedPersonsFor(event, s.events, s.tasks, s.assignees);
  if (persons.length > 0) {
    const names = s.users.filter((u) => persons.includes(u.id)).map((u) => u.displayName);
    toast.warning(`⚠ Double-booked: ${names.join(", ")} at the same time`);
  }
}
