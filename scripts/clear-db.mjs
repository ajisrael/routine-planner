#!/usr/bin/env node
/**
 * Clears all user data (events, tasks, rules, people, categories) from a
 * planner database while keeping the schema + applied migrations intact.
 *
 * Usage:
 *   npm run db:clear                     # DATA_DIR/app.db (default: ./data)
 *   npm run db:clear -- /path/to/app.db  # explicit database file
 *   npm run db:clear -- --force          # skip the confirmation prompt
 *   npm run db:clear:docker              # the docker-compose volume (/data)
 */
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const args = process.argv.slice(2);
const force = args.includes("--force");
const dbPath =
  args.find((a) => !a.startsWith("--")) ??
  path.resolve(process.env.DATA_DIR ?? path.resolve("data"), "app.db");

const db = new Database(dbPath);

const TABLES = [
  "scheduled_events",
  "task_assignees",
  "recurrence_rules",
  "tasks",
  "users",
  "categories",
];

const count = (table) => {
  try {
    return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() ?? { n: 0 }).n;
  } catch {
    return 0;
  }
};

const summary = TABLES.map((table) => ({ table, rows: count(table) }));
const total = summary.reduce((sum, s) => sum + s.rows, 0);

console.log(`Database: ${dbPath}`);
for (const { table, rows } of summary) console.log(`  ${table.padEnd(18)} ${rows}`);

if (total === 0) {
  console.log("Nothing to clear — database is already empty.");
  process.exit(0);
}

if (!force) {
  if (!process.stdin.isTTY) {
    console.error("Refusing to clear without confirmation — re-run with --force for non-interactive shells.");
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(`Clear ${total} row(s)? Type "clear" to confirm: `, resolve),
  );
  rl.close();
  if (answer.trim().toLowerCase() !== "clear") {
    console.log("Aborted — nothing was deleted.");
    process.exit(1);
  }
}

const wipe = db.transaction(() => {
  for (const table of TABLES) db.prepare(`DELETE FROM ${table}`).run();
  try {
    db.prepare("DELETE FROM sqlite_sequence").run(); // reset AUTOINCREMENT counters
  } catch {
    /* sqlite_sequence only exists after the first AUTOINCREMENT insert */
  }
});
wipe();
db.pragma("wal_checkpoint(TRUNCATE)");

console.log(`Cleared ${total} row(s). Schema and migrations are intact.`);
