import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, "../../data");

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db: Database.Database = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

// Apply migrations in order, tracked via PRAGMA user_version.
// TODO: read migration/*.sql, apply each only if user_version < N, then
// bump user_version to the highest applied. 001_init.sql ships the full
// schema from DATA_MODEL.md §8. When a migration is added, it should also
// be added to the Docker image build (migrations are compiled into dist/).