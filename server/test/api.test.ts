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

  it("creates a user for assignment tests", async () => {
    const res = await call("POST", "/api/users", { username: "TestKid" });
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

  it("dropping a recurring task re-anchors every occurrence to the drop time", async () => {
    const snap = (await call("GET", "/api/snapshot")).json as {
      events: Array<{ id: number; eventDate: string; startMinute: number }>;
    };
    // daily task currently generated at 09:00 — drop on Day 1 at 15:00
    const ok = await call("POST", "/api/events", { taskId, eventDate: "01", startMinute: 900, endMinute: 945 });
    expect(ok.status).toBe(201);
    const after = ((await call("GET", "/api/snapshot")).json as { events: Array<{ startMinute: number }> }).events;
    expect(after.length).toBe(30); // regeneration covers the dropped day — no duplicate
    expect(after.every((e) => e.startMinute === 900)).toBe(true);
  });

  it("dropping at the same time on an occupied day is rejected with 409", async () => {
    const res = await call("POST", "/api/events", { taskId, eventDate: "02", startMinute: 900, endMinute: 945 });
    expect(res.status).toBe(409);
  });

  it("a weekly task accepts a detached extra on a non-rule day", async () => {
    const created = await call("POST", "/api/tasks", {
      name: "Weekly thing",
      durationMinutes: 30,
      recurrence: { ruleType: "weekly_days", daysOfWeek: [1, 3, 5], refStartMinute: 600 },
    });
    const weeklyId = (created.json as { task: { id: number } }).task.id;
    // days 01/03/05 generated at 10:00 — drop on Day 2 at the same time
    const ok = await call("POST", "/api/events", { taskId: weeklyId, eventDate: "02", startMinute: 600, endMinute: 630 });
    expect(ok.status).toBe(201);
    const snap = (await call("GET", "/api/snapshot")).json as {
      events: Array<{ taskId: number; eventDate: string; startMinute: number; ruleId: number | null }>;
    };
    const mine = snap.events.filter((e) => e.taskId === weeklyId);
    expect(mine).toHaveLength(14); // 13 rule days (Mon/Wed/Fri × 4 + Mon 29) + detached Day 2
    const extra = mine.find((e) => e.eventDate === "02")!;
    expect(extra.ruleId).toBeNull(); // detached — survives regeneration
    // clean up so later assertions see only the daily task's events
    await call("DELETE", `/api/tasks/${weeklyId}/events`);
  });

  it("rejects real dates and days outside the template", async () => {
    expect((await call("POST", "/api/events", { taskId, eventDate: "2026-09-05", startMinute: 600 })).status).toBe(400);
    expect((await call("POST", "/api/events", { taskId, eventDate: "31", startMinute: 600 })).status).toBe(400);
    expect((await call("POST", "/api/events", { taskId, eventDate: "00", startMinute: 600 })).status).toBe(400);
  });

  it("duplicate (task, date, start) is rejected with 409", async () => {
    const snap = (await call("GET", "/api/snapshot")).json as {
      events: Array<{ taskId: number; eventDate: string; startMinute: number }>;
    };
    const e = snap.events.find((ev) => ev.taskId === taskId)!;
    const res = await call("POST", "/api/events", { taskId, eventDate: e.eventDate, startMinute: e.startMinute });
    expect(res.status).toBe(409);
  });

  it("moves an occurrence (instance-first) and syncs to all", async () => {
    const snap = (await call("GET", "/api/snapshot")).json as {
      events: Array<{ id: number; startMinute: number; taskId: number }>;
    };
    const anchor = snap.events.find((e) => e.startMinute === 900 && e.taskId === taskId)!;
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
  it("creates a user with a username and renames it", async () => {
    const created = await call("POST", "/api/users", { username: "Kid" });
    expect(created.status).toBe(201);
    const u = created.json as { id: number; username: string; displayName: string };
    expect(u.username).toBe("Kid");
    expect(u.displayName).toBe("Kid"); // displayName defaults to username
    const renamed = await call("PUT", `/api/users/${u.id}`, { displayName: "Kid Jr." });
    expect((renamed.json as { displayName: string }).displayName).toBe("Kid Jr.");
  });

  it("accepts an explicit displayName and rejects a duplicate username", async () => {
    const created = await call("POST", "/api/users", { username: "Ana", displayName: "Grandma Ana" });
    expect(created.status).toBe(201);
    expect((created.json as { displayName: string }).displayName).toBe("Grandma Ana");
    expect((await call("POST", "/api/users", { username: "aNa" })).status).toBe(409);
  });

  it("a user created in People can log in directly", async () => {
    const created = await call("POST", "/api/users", { username: "Momo" });
    const id = (created.json as { id: number }).id;
    const login = await call("POST", "/api/auth/login", { username: "momo" });
    expect(login.status).toBe(200);
    expect((login.json as { id: number }).id).toBe(id); // same account, no duplicate
  });

  it("the logged-in user cannot delete themselves", async () => {
    await call("POST", "/api/auth/login", { username: "Mom" });
    const me = (await call("GET", "/api/auth/me")).json as { id: number };
    expect((await call("DELETE", `/api/users/${me.id}`)).status).toBe(400);
  });

  it("another user can be deleted (assignments cascade)", async () => {
    const created = await call("POST", "/api/users", { username: "Dup" });
    const other = (created.json as { id: number }).id;
    expect((await call("DELETE", `/api/users/${other}`)).status).toBe(200);
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

describe("task cadence", () => {
  it("round-trips cadence on create and update", async () => {
    const created = await call("POST", "/api/tasks", {
      name: "Morning run",
      durationMinutes: 30,
      cadence: "daily",
      recurrence: { ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], refStartMinute: 420 },
    });
    expect(created.status).toBe(201);
    const id = (created.json as { task: { id: number; cadence: string } }).task;
    expect(id.cadence).toBe("daily");
    const updated = await call("PUT", `/api/tasks/${id.id}`, { cadence: "monthly" });
    expect(((updated.json as { task: { cadence: string } }).task).cadence).toBe("monthly");
    await call("DELETE", `/api/tasks/${id.id}`);
  });

  it("defaults to custom and rejects invalid values", async () => {
    const created = await call("POST", "/api/tasks", { name: "Solo", durationMinutes: 30 });
    expect((created.json as { task: { cadence: string } }).task.cadence).toBe("custom");
    const id = (created.json as { task: { id: number } }).task.id;
    expect((await call("POST", "/api/tasks", { name: "Y", durationMinutes: 30, cadence: "bogus" })).status).toBe(400);
    expect((await call("PUT", `/api/tasks/${id}`, { cadence: "nope" })).status).toBe(400);
    await call("DELETE", `/api/tasks/${id}`);
  });
});
