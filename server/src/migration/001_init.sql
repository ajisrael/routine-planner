PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    UNIQUE,               -- login name, only for is_login_user=1
  display_name  TEXT    NOT NULL,
  is_login_user INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT    NOT NULL UNIQUE,
  color TEXT
);

CREATE TABLE tasks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  notes            TEXT,
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  active           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE task_assignees (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE recurrence_rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id        INTEGER NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  rule_type      TEXT    NOT NULL CHECK (rule_type IN
                  ('none','weekly_days','interval_days','monthly_date','monthly_weekday')),
  days_of_week   TEXT,           -- JSON e.g. '[1,3,5]'
  interval_days  INTEGER CHECK (interval_days IS NULL OR interval_days > 0),
  day_of_month   INTEGER CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  month_week     INTEGER CHECK (month_week IS NULL OR month_week IN (-1,1,2,3,4)),
  month_dow      INTEGER CHECK (month_dow IS NULL OR month_dow BETWEEN 1 AND 7),
  start_date     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE scheduled_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id        INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  rule_id        INTEGER REFERENCES recurrence_rules(id) ON DELETE SET NULL,
  event_date     TEXT    NOT NULL,             -- local date ISO
  start_minute   INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute     INTEGER NOT NULL CHECK (end_minute > start_minute),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (task_id, event_date, start_minute)
);

CREATE INDEX idx_scheduled_date     ON scheduled_events(event_date);
CREATE INDEX idx_scheduled_taskdate ON scheduled_events(task_id, event_date);
CREATE INDEX idx_assignees_user     ON task_assignees(user_id);
CREATE INDEX idx_tasks_active       ON tasks(active);