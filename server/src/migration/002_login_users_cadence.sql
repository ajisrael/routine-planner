-- 002 Login users + task cadence (wizard foundation).
-- Removes personas: every user can log in by name, so username becomes
-- the account key (NOT NULL UNIQUE). Tasks gain a cadence label
-- (daily|weekly|monthly|custom) driving the guided setup wizard.

PRAGMA foreign_keys = OFF;

-- Label used by the guided setup stages; defaults to custom.
ALTER TABLE tasks ADD COLUMN cadence TEXT NOT NULL DEFAULT 'custom'
  CHECK (cadence IN ('daily','weekly','monthly','custom'));

-- Rebuild users without is_login_user. Legacy personas get a synthetic
-- username so they remain addressable accounts (greenfield: data is
-- throwaway, this backfill is just to keep the schema honest).
CREATE TABLE users_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO users_new (id, username, display_name, created_at)
  SELECT id,
         COALESCE(username, 'user_' || id),
         display_name,
         created_at
  FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;