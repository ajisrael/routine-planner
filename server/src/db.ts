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

/** First-boot defaults: the five design categories + the family (DESIGN.md §3.2–3.3). */
function seedIfEmpty(db: Database.Database): void {
  const seed = db.transaction((): void => {
    const count = (table: string): number =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    const cats: Array<[string, string]> = [
      ["Chores", "#f59e0b"],
      ["School", "#0ea5e9"],
      ["Family", "#f43f5e"],
      ["Meals", "#84cc16"],
      ["Self-care", "#a78bfa"],
    ];
    if (count("categories") === 0) {
      const insCat = db.prepare("INSERT INTO categories (name, color) VALUES (?, ?)");
      for (const [name, color] of cats) insCat.run(name, color);
    }
    if (count("users") === 0) {
      const insUser = db.prepare("INSERT INTO users (username, display_name, is_login_user) VALUES (?, ?, ?)");
      insUser.run("Mom", "Mom", 1);
      insUser.run("Dad", "Dad", 1);
      insUser.run(null, "Aria", 0);
      insUser.run(null, "Levi", 0);
    }
  });
  seed();
}

export function openDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  seedIfEmpty(db);
  return db;
}

export const db: Database.Database = openDatabase(
  process.env.PLANNER_DB_PATH ?? path.join(DATA_DIR, "app.db"),
);
