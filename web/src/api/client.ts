import type {
  Category,
  RecurrenceRule,
  RecurrenceRuleType,
  ScheduledEvent,
  Snapshot,
  Task,
  User,
} from "@planner/shared";

/** Thin typed fetch wrapper around the REST API (ARCHITECTURE.md §5.4). */

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : `request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return json as T;
}

export interface TaskRulePayload {
  ruleType: RecurrenceRuleType;
  daysOfWeek?: number[] | null;
  intervalDays?: number | null;
  dayOfMonth?: number | null;
  monthWeek?: number | null;
  monthDow?: number | null;
  startDate?: string;
  refStartMinute?: number | null;
}

export interface TaskCreatePayload {
  name: string;
  durationMinutes: number;
  notes?: string | null;
  categoryId?: number | null;
  assigneeIds?: number[];
  recurrence?: TaskRulePayload;
}

export interface TaskUpdatePayload {
  name?: string;
  durationMinutes?: number;
  notes?: string | null;
  categoryId?: number | null;
  active?: boolean;
  assigneeIds?: number[];
}

export interface TaskResponse {
  task: Task;
  rule: RecurrenceRule | null;
  events: ScheduledEvent[];
}

export interface EventMovePayload {
  eventDate?: string;
  startMinute?: number;
  endMinute?: number;
}

export const api = {
  login: (username: string): Promise<User> => request("POST", "/api/auth/login", { username }),
  me: (): Promise<User> => request("GET", "/api/auth/me"),
  logout: (): Promise<{ ok: boolean }> => request("POST", "/api/auth/logout"),

  snapshot: (): Promise<Snapshot> => request("GET", "/api/snapshot"),

  users: (): Promise<User[]> => request("GET", "/api/users"),
  createPersona: (displayName: string): Promise<User> =>
    request("POST", "/api/users", { displayName }),
  renameUser: (id: number, displayName: string): Promise<User> =>
    request("PUT", `/api/users/${id}`, { displayName }),
  deleteUser: (id: number): Promise<{ ok: boolean }> => request("DELETE", `/api/users/${id}`),

  createCategory: (name: string, color?: string | null): Promise<Category> =>
    request("POST", "/api/categories", { name, color }),
  updateCategory: (id: number, name?: string, color?: string | null): Promise<Category> =>
    request("PUT", `/api/categories/${id}`, { name, color }),
  deleteCategory: (id: number): Promise<{ ok: boolean }> =>
    request("DELETE", `/api/categories/${id}`),

  createTask: (payload: TaskCreatePayload): Promise<TaskResponse> =>
    request("POST", "/api/tasks", payload),
  updateTask: (id: number, payload: TaskUpdatePayload): Promise<TaskResponse> =>
    request("PUT", `/api/tasks/${id}`, payload),
  deleteTask: (id: number): Promise<{ ok: boolean }> => request("DELETE", `/api/tasks/${id}`),
  setAssignees: (id: number, userIds: number[]): Promise<TaskResponse> =>
    request("PUT", `/api/tasks/${id}/assignees`, { userIds }),
  setRecurrence: (id: number, rule: TaskRulePayload): Promise<TaskResponse> =>
    request("PUT", `/api/tasks/${id}/recurrence`, rule),
  deleteTaskEvents: (id: number): Promise<{ ok: boolean; deleted: number }> =>
    request("DELETE", `/api/tasks/${id}/events`),

  events: (params?: { from?: string; to?: string; person?: number }): Promise<ScheduledEvent[]> => {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.person != null) q.set("person", String(params.person));
    const qs = q.toString();
    return request("GET", `/api/events${qs ? `?${qs}` : ""}`);
  },
  createEvent: (payload: {
    taskId: number;
    eventDate: string;
    startMinute: number;
    endMinute?: number;
  }): Promise<ScheduledEvent> => request("POST", "/api/events", payload),
  moveEvent: (id: number, payload: EventMovePayload): Promise<ScheduledEvent> =>
    request("PUT", `/api/events/${id}`, payload),
  deleteEvent: (id: number): Promise<{ ok: boolean }> => request("DELETE", `/api/events/${id}`),
  syncEvent: (id: number, scope: "all" | "future"): Promise<{ ok: boolean; updated: number }> =>
    request("POST", `/api/events/${id}/sync`, { scope }),
};

export { ApiError };
