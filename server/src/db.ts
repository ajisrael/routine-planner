import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, "../../data");

/** Applied in order; tracked via PRAGMA user_version (ARCHITECTURE.md §7). */
function applyMigrations(db: Database.Database): void {
  const dir = path.resolve(import.meta.dirname, "migration");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let version = db.pragma("user_version", { simple: true }) as number;
  for (const file of files) {
    const n = Number.parseInt(file, 10);
    if (n <= version) continue;
    db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
    db.pragma(`user_version = ${n}`);
    version = n;
  }
}

export function openDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return db;
}

export const db: Database.Database = openDatabase(
  process.env.PLANNER_DB_PATH ?? path.join(DATA_DIR, "app.db"),
);
