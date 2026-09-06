import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Fresh throwaway DB before importing app modules (dynamic imports below run
// after this env assignment; vitest imports itself are safe to hoist).
process.env.PLANNER_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "planner-api-")), "test.db");

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const { createApp } = await import("../src/app.js");
const { db } = await import("../src/db.js");

let server: Server;
let base = "";

beforeAll(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(
  () =>
    new Promise<void>((ok) => {
      server.close(() => ok());
      db.close();
    }),
);

const cookieJar = { value: "" };

async function call(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookieJar.value) headers.cookie = cookieJar.value;
  const res = await fetch(`${base}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookieJar.value = setCookie.split(";")[0]!;
  return { status: res.status, json: await res.json().catch(() => null) };
}

describe("health + snapshot", () => {
  it("GET /api/health", async () => {
    const { status, json } = await call("GET", "/api/health");
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true });
  });

  it("GET /api/snapshot returns an empty fresh install (no pre-seeded data)", async () => {
    const snap = (await call("GET", "/api/snapshot")).json as Record<string, unknown[]>;
    expect(snap.users).toEqual([]);
    expect(snap.categories).toEqual([]);
    expect(snap.tasks).toEqual([]);
    expect(snap.events).toEqual([]);
  });
});

describe("auth (name-based login)", () => {
  it("creates a login user on first login and returns it on /me", async () => {
    const login = await call("POST", "/api/auth/login", { username: "Testy" });
    expect(login.status).toBe(200);
    const me = await call("GET", "/api/auth/me");
    expect(me.status).toBe(200);
    expect((me.json as Record<string, unknown>).displayName).toBe("Testy");
  });

  it("matches case-insensitively without creating duplicates", async () => {
    await call("POST", "/api/auth/login", { username: "tEsTy" });
    const snap = (await call("GET", "/api/snapshot")).json as { users: Array<{ displayName: string }> };
    expect(snap.users.filter((u) => u.displayName.toLowerCase() === "testy")).toHaveLength(1);
  });

  it("rejects empty names", async () => {
    const res = await call("POST", "/api/auth/login", { username: "  " });
    expect(res.status).toBe(400);
  });

  it("logout clears the session", async () => {
    await call("POST", "/api/auth/logout");
    expect((await call("GET", "/api/auth/me")).status).toBe(401);
  });
});

describe("task + recurrence + events lifecycle", () => {
  let taskId = 0;
  let personId = 0;

  it("creates a persona for assignment tests", async () => {
    const res = await call("POST", "/api/users", { displayName: "TestKid" });
    expect(res.status).toBe(201);
    personId = (res.json as { id: number }).id;
  });

  it("creates a daily task with reference time 16:00 → generates 30 template occurrences", async () => {
    const res = await call("POST", "/api/tasks", {
      name: "Homework",
      durationMinutes: 45,
      assigneeIds: [personId],
      recurrence: { ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], refStartMinute: 960 },
    });
    expect(res.status).toBe(201);
    const body = res.json as {
      task: { id: number };
      events: Array<{ startMinute: number; endMinute: number; eventDate: string }>;
    };
    taskId = body.task.id;
    expect(body.events.length).toBe(30);
    expect(body.events[0]!.startMinute).toBe(960);
    expect(body.events[0]!.endMinute).toBe(1005);
    expect(body.events[0]!.eventDate).toBe("01");
    expect(body.events[29]!.eventDate).toBe("30");
  });

  it("dragging a recurring task into a slot adds one occurrence", async () => {
    const snap = (await call("GET", "/api/snapshot")).json as {
      events: Array<{ id: number; eventDate: string }>;
    };
    const before = snap.events.length;
    const ok = await call("POST", "/api/events", { taskId, eventDate: snap.events[0]!.eventDate, startMinute: 60 });
    expect(ok.status).toBe(201);
    const after = ((await call("GET", "/api/snapshot")).json as { events: unknown[] }).events.length;
    expect(after).toBe(before + 1);
  });

  it("rejects real dates and days outside the template", async () => {
    expect((await call("POST", "/api/events", { taskId, eventDate: "2026-09-05", startMinute: 600 })).status).toBe(400);
    expect((await call("POST", "/api/events", { taskId, eventDate: "31", startMinute: 600 })).status).toBe(400);
    expect((await call("POST", "/api/events", { taskId, eventDate: "00", startMinute: 600 })).status).toBe(400);
  });

  it("duplicate (task, date, start) is rejected with 409", async () => {
    const snap = (await call("GET", "/api/snapshot")).json as {
      events: Array<{ eventDate: string; startMinute: number }>;
    };
    const e = snap.events[0]!;
    const res = await call("POST", "/api/events", { taskId, eventDate: e.eventDate, startMinute: e.startMinute });
    expect(res.status).toBe(409);
  });

  it("moves an occurrence (instance-first) and syncs to all", async () => {
    const snap = (await call("GET", "/api/snapshot")).json as {
      events: Array<{ id: number; startMinute: number }>;
    };
    const anchor = snap.events.find((e) => e.startMinute === 960)!;
    const moved = await call("PUT", `/api/events/${anchor.id}`, { startMinute: 1020, endMinute: 1065 });
    expect(moved.status).toBe(200);
    expect((moved.json as { startMinute: number }).startMinute).toBe(1020);

    const sync = await call("POST", `/api/events/${anchor.id}/sync`, { scope: "all" });
    expect(sync.status).toBe(200);
    const snap2 = (await call("GET", "/api/snapshot")).json as { events: Array<{ startMinute: number }> };
    expect(snap2.events.filter((e) => e.startMinute === 1020).length).toBeGreaterThanOrEqual(29);
  });

  it("person filter on GET /api/events", async () => {
    const res = await call("GET", `/api/events?person=${personId}`);
    expect((res.json as unknown[]).length).toBeGreaterThan(0);
    const none = await call("GET", "/api/events?person=999");
    expect((none.json as unknown[]).length).toBe(0);
  });

  it("setting recurrence to none detaches occurrences (kept)", async () => {
    const res = await call("PUT", `/api/tasks/${taskId}/recurrence`, { ruleType: "none" });
    expect(res.status).toBe(200);
    const body = res.json as { events: Array<{ ruleId: number | null }>; rule: { ruleType: string } };
    expect(body.rule.ruleType).toBe("none");
    expect(body.events.every((e) => e.ruleId === null)).toBe(true);
  });

  it("delete all occurrences", async () => {
    const res = await call("DELETE", `/api/tasks/${taskId}/events`);
    expect(res.status).toBe(200);
    const snap = (await call("GET", "/api/snapshot")).json as { events: unknown[] };
    expect(snap.events.length).toBe(0);
  });

  it("hard-deleting a task cascades rule + events", async () => {
    const created = await call("POST", "/api/tasks", {
      name: "Temp",
      durationMinutes: 30,
      recurrence: { ruleType: "weekly_days", daysOfWeek: [1], refStartMinute: 540 },
    });
    const id = (created.json as { task: { id: number } }).task.id;
    expect((await call("DELETE", `/api/tasks/${id}`)).status).toBe(200);
    const snap = (await call("GET", "/api/snapshot")).json as {
      tasks: Array<{ id: number }>;
      recurrenceRules: unknown[];
    };
    expect(snap.tasks.find((t) => t.id === id)).toBeUndefined();
    expect(snap.recurrenceRules.find((r) => (r as { taskId: number }).taskId === id)).toBeUndefined();
  });

  it("validates duration + rule payloads", async () => {
    expect((await call("POST", "/api/tasks", { name: "X", durationMinutes: 20 })).status).toBe(400);
    expect(
      (await call("POST", "/api/tasks", { name: "X", durationMinutes: 30, recurrence: { ruleType: "bogus" } })).status,
    ).toBe(400);
    expect(
      (await call("POST", "/api/tasks", {
        name: "X",
        durationMinutes: 30,
        recurrence: { ruleType: "weekly_days", daysOfWeek: [] },
      })).status,
    ).toBe(400);
  });
});

describe("users & categories", () => {
  it("creates a persona and renames it", async () => {
    const created = await call("POST", "/api/users", { displayName: "Kid" });
    expect(created.status).toBe(201);
    const id = (created.json as { id: number }).id;
    const renamed = await call("PUT", `/api/users/${id}`, { displayName: "Kid Jr." });
    expect((renamed.json as { displayName: string }).displayName).toBe("Kid Jr.");
  });

  it("category CRUD", async () => {
    const created = await call("POST", "/api/categories", { name: "Music", color: "#22d3ee" });
    expect(created.status).toBe(201);
    const id = (created.json as { id: number }).id;
    expect((await call("PUT", `/api/categories/${id}`, { color: "nope" })).status).toBe(400);
    expect((await call("DELETE", `/api/categories/${id}`)).status).toBe(200);
    expect((await call("DELETE", `/api/categories/${id}`)).status).toBe(404);
  });
});
