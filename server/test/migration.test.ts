import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Fresh throwaway DB before importing app modules.
process.env.PLANNER_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "planner-mig-")), "test.db");

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

const { openDatabase } = await import("../src/db.js");
const { db: singleton } = await import("../src/db.js");

const MIGRATION_DIR = path.resolve(import.meta.dirname, "../src/migration");

function columns(table: Database.Database, name: string): Array<{ name: string; notnull: number }> {
  return table.pragma(`table_info(${name})`) as Array<{ name: string; notnull: number }>;
}

describe("migration 002 (login users + task cadence)", () => {
  const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "planner-migrate-")), "migrate.db");
  let migrated: Database.Database;

  // Build a 001-shaped database (persona world), set user_version=1, then let
  // openDatabase apply everything from 002 onward to it.
  beforeAll(() => {
    const legacy = new Database(dbPath);
    legacy.exec(fs.readFileSync(path.join(MIGRATION_DIR, "001_init.sql"), "utf8"));
    const mom = legacy.prepare("INSERT INTO users (username, display_name, is_login_user) VALUES (?, ?, 1)").run("Mom", "Mom");
    legacy.prepare("INSERT INTO users (username, display_name, is_login_user) VALUES (NULL, 'Kid', 0)").run();
    const task = legacy.prepare("INSERT INTO tasks (name, duration_minutes) VALUES (?, ?)").run("Chores", 30);
    legacy
      .prepare("INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)")
      .run(task.lastInsertRowid, mom.lastInsertRowid);
    legacy.pragma("user_version = 1");
    legacy.close();
    migrated = openDatabase(dbPath);
  });

  afterAll(() => {
    migrated.close();
    singleton.close();
  });

  it("users gain NOT NULL UNIQUE usernames and lose is_login_user", () => {
    const cols = columns(migrated, "users");
    const names = cols.map((c) => c.name);
    expect(names).toContain("username");
    expect(names).not.toContain("is_login_user");
    expect(cols.find((c) => c.name === "username")!.notnull).toBe(1);
  });

  it("personas are backfilled into usable usernames", () => {
    const rows = migrated.prepare("SELECT id, username, display_name FROM users ORDER BY id").all() as Array<{
      id: number;
      username: string;
      display_name: string;
    }>;
    expect(rows[0]).toMatchObject({ username: "Mom", display_name: "Mom" });
    expect(rows[1]!.username).toMatch(/^user_\d+$/);
  });

  it("assignees still cascade against the rebuilt users table", () => {
    const momId = (migrated.prepare("SELECT id FROM users WHERE username = 'Mom'").get() as { id: number }).id;
    const pair = migrated
      .prepare("SELECT user_id FROM task_assignees WHERE task_id = (SELECT id FROM tasks WHERE name = 'Chores')")
      .get() as { user_id: number };
    expect(pair.user_id).toBe(momId);
  });

  it("tasks gain a cadence column defaulting to custom", () => {
    expect(columns(migrated, "tasks").some((c) => c.name === "cadence")).toBe(true);
    const c = migrated.prepare("SELECT cadence FROM tasks").get() as { cadence: string };
    expect(c.cadence).toBe("custom");
  });
});