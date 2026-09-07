-- Adds the weekly_interval rule type (every N weeks on selected weekdays)
-- and its weeks_interval column. SQLite cannot alter a CHECK constraint,
-- so the table is rebuilt; ids are preserved and foreign keys are disabled
-- for the duration because scheduled_events.rule_id references this table.
PRAGMA foreign_keys = OFF;

CREATE TABLE recurrence_rules_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id        INTEGER NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  rule_type      TEXT    NOT NULL CHECK (rule_type IN
                  ('none','weekly_days','interval_days','weekly_interval','monthly_date','monthly_weekday')),
  days_of_week   TEXT,
  interval_days  INTEGER CHECK (interval_days IS NULL OR interval_days > 0),
  weeks_interval INTEGER CHECK (weeks_interval IS NULL OR weeks_interval > 0),
  day_of_month   INTEGER CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  month_week     INTEGER CHECK (month_week IS NULL OR month_week IN (-1,1,2,3,4)),
  month_dow      INTEGER CHECK (month_dow IS NULL OR month_dow BETWEEN 1 AND 7),
  start_date     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO recurrence_rules_new
  (id, task_id, rule_type, days_of_week, interval_days, day_of_month, month_week, month_dow, start_date, updated_at)
SELECT
  id, task_id, rule_type, days_of_week, interval_days, day_of_month, month_week, month_dow, start_date, updated_at
FROM recurrence_rules;

DROP TABLE recurrence_rules;
ALTER TABLE recurrence_rules_new RENAME TO recurrence_rules;

PRAGMA foreign_keys = ON;
