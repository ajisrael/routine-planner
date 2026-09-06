# Routine Planner - Data Model Design

## 1. Design Principles

1. **Materialized occurrences**: Scheduled events are stored as individual rows (one per occurrence). The calendar reads directly from these rows. No virtual/derived expansion at read time.
2. **Rules are generators**: A recurrence rule only determines *which dates* an occurrence appears on. It does not change previously materialized occurrences when edited.
3. **Instance-first edits**: Moving/resizing/deleting an occurrence affects only that occurrence by default.
4. **Explicit sync**: Separately exposing "sync to all" (and future/past) actions propagates an occurrence's time/duration to sibling occurrences under the same rule.
5. **Effective assignment**: Every occurrence inherits its task's assignee set (`task_assignees`). Conflict detection and person-filters operate on that set.
6. **Time representation**: All times are stored as minutes from local midnight (`start_minute`, `end_minute`). No timezones or DST handling in v1.
7. **Theoretical template month**: The planner plans a *repeating 30-day routine template*, not real calendar dates. The template has 30 days with Monday as Day 1 (weeks: 1–7, 8–14, 15–21, 22–28, plus the 2-day tail 29–30). `event_date` stores a template day as a zero-padded string "01"…"30" (sorts lexically). There is no "today" and no date navigation — the template IS the schedule.

---

## 2. Entity Overview

```
users 1───* task_assignees *───1 tasks
categories 1───* tasks
tasks 1───1 recurrence_rules
tasks 1───* scheduled_events (one-off and generated)
recurrence_rules 1───* scheduled_events (generated only)
```

---

## 3. Tables

### 3.1 users

Represents a family member. Two kinds of users:

- **Login users**: log in by entering a name (no passwords). Mom and Dad.
- **Personas**: entities that can be assigned to tasks and filtered, but never log in (e.g., children assigned to "Playtime").

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PK, AUTOINCREMENT | |
| username | TEXT | NULL, UNIQUE | Login name; required only for `is_login_user=1` |
| display_name | TEXT | NOT NULL | e.g., "Mom", "Dad", "Aria" |
| is_login_user | INTEGER | NOT NULL, DEFAULT 0 | 1 = can log in; 0 = persona (assigned/filtered only) |
| created_at | TEXT | NOT NULL | ISO 8601 UTC |

**Login flow**: user types a name → find a matching `is_login_user=1` row (case-insensitive) → if none, create one. Personas are created via the normal user management UI, never via login.
---

### 3.2 categories

Optional grouping/colour for tasks, used for filtering in the task library and visual distinction on the calendar.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PK, AUTOINCREMENT | |
| name | TEXT | NOT NULL, UNIQUE | |
| color | TEXT | NULL | Hex string, e.g., `#4ade80` |

---

### 3.3 tasks

The reusable task definition. Exists in the library whether or not it is ever scheduled.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PK, AUTOINCREMENT | |
| name | TEXT | NOT NULL | |
| duration_minutes | INTEGER | NOT NULL, CHECK (duration_minutes > 0) | Expected multiple of 15 |
| notes | TEXT | NULL | |
| category_id | INTEGER | NULL, FK → categories.id, SET NULL on delete | |
| active | INTEGER | NOT NULL, DEFAULT 1 | Soft-delete flag; active=0 hides from library |

A task's responsible people live in `task_assignees` (below) — a task can have zero, one, or many assignees (e.g., "Playtime" assigned to both Mom and a child persona).

### 3.4 task_assignees

Many-to-many join assigning users (login users and personas alike) to a task. Every scheduled occurrence inherits its task's assignee set.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| task_id | INTEGER | NOT NULL, FK → tasks.id CASCADE | |
| user_id | INTEGER | NOT NULL, FK → users.id CASCADE | |

**Unique constraint**: `UNIQUE (task_id, user_id)`.

---

### 3.5 recurrence_rules

Defines on which dates a task recurs. One row per task. Rules do **not** store time or duration — those live on each materialized occurrence. When a rule is created or edited, occurrences are (re)generated for the 30-day window.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PK, AUTOINCREMENT | |
| task_id | INTEGER | NOT NULL, UNIQUE, FK → tasks.id CASCADE | One rule per task |
| rule_type | TEXT | NOT NULL | `weekly_days` · `interval_days` · `monthly_date` · `monthly_weekday` · `none` |
| days_of_week | TEXT | NULL | JSON array of ints, Mon=1…Sun=7. For `weekly_days` |
| interval_days | INTEGER | NULL | Positive int. For `interval_days` (every N days; every 2 weeks = 14) |
| day_of_month | INTEGER | NULL | 1…31. For `monthly_date` (e.g., 15) |
| month_week | INTEGER | NULL | 1…4, or -1 for last. For `monthly_weekday` |
| month_dow | INTEGER | NULL | 1…7 (Mon=1). For `monthly_weekday` |
| start_date | TEXT | NOT NULL | Anchor date for interval/weekday algebra |
| updated_at | TEXT | NOT NULL | Bumped when frequency edited |

**rule_type semantics**
- `none`: no recurrence. Task only appears if individually scheduled.
- `weekly_days`: recurs on every listed day of week each week. "Daily" = `[1,2,3,4,5,6,7]`. "Weekdays" = `[1,2,3,4,5]`.
- `interval_days`: recurs every `interval_days`, counted from `start_date`.
- `monthly_date`: recurs on `day_of_month` each month. If the day doesn't exist (e.g., the 30th in February), that occurrence is skipped.
- `monthly_weekday`: recurs on the `month_week`-th `month_dow` of each month (e.g., 1st Monday = `month_week=1, month_dow=1`; last Friday = `month_week=-1, month_dow=5`).

---

### 3.6 scheduled_events

One row per materialized occurrence — the "planned routine". Written when dragging from the library, when a rule generates occurrences, and edited by dragging/resizing on the calendar.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PK, AUTOINCREMENT | |
| task_id | INTEGER | NOT NULL, FK → tasks.id CASCADE | |
| rule_id | INTEGER | NULL, FK → recurrence_rules.id | NULL for one-off (non-recurring) events |
| event_date | TEXT | NOT NULL | Template day, zero-padded "01"…"30" (Day 1 = Monday) |
| start_minute | INTEGER | NOT NULL, CHECK 0…1439 | Minutes from local midnight |
| end_minute | INTEGER | NOT NULL, CHECK (end_minute > start_minute) | |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |

Assignees are **not** stored per event in v1 — every occurrence inherits its task's `task_assignees`. (Per-event assignee overrides are a v2 candidate.)

**Unique constraint**: `UNIQUE (task_id, event_date, start_minute)` — prevents duplicate drop-in of the same task at the same time on the same day.

---

## 4. Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| scheduled_events | `(event_date)` | Calendar view queries by date range |
| scheduled_events | `(task_id, event_date)` | Fetch a task's occurrences; rule regeneration |
| scheduled_events | unique `(task_id, event_date, start_minute)` | Duplicate prevention |
| task_assignees | unique `(task_id, user_id)` | Assignment set membership |
| task_assignees | `(user_id)` | "X's routine" filter and conflict scan |
| recurrence_rules | `(task_id)` | Already UNIQUE via constraint |
| tasks | `(active)` | Library listing |

---

## 5. Behaviors & State Changes

### 5.1 Creating a task (library)
- INSERT into `tasks`. No `recurrence_rules` row → task appears only in library.
- If the task form includes a frequency and a reference time, create the rule and generate occurrences (see 5.3).

### 5.2 Dragging a task from library into a slot (daily view)
- INSERT into `scheduled_events`: `event_date` = slot date, `start_minute`/`end_minute` from the drop position and task duration.
- If the task has a rule but no occurrences materialized yet, first occurrence adopts this drop time.
- Result: for a one-off task, only this event exists. For a recurring task that already has other generated occurrences, **this event is simply added at the dragged time**; existing siblings are untouched (instance-first).

### 5.3 Changing a task's frequency (e.g., one-off → daily)
- UPDATE the task's `recurrence_rules` row (or INSERT if none existed).
- **Re-promote reference time**: the current first occurrence's start/end become the rule's reference so other occurrences match it.
- Regenerate: DELETE generated `scheduled_events` for `rule_id` in the window, then INSERT new events on each rule date using the reference time.
- Manually placed or manually moved occurrences of this task are **preserved**: only rows whose time equals the old reference and which the user hasn't explicitly edited are candidates for replacement. (v1 simplification below.)

> **v1 simplification**: Regeneration replaces ALL generated events (`rule_id IS NOT NULL`) for the task in the window from the new rule. Events created by dragging into a slot before the task had a rule (`rule_id IS NULL`) are left untouched and become one-offs. There is no per-occurrence "was manually edited" flag in v1; if we need to preserve manual tweaks across frequency changes, add `user_edited`/`origin` column later.

### 5.4 Moving/resizing an occurrence (drag on calendar)
- UPDATE that `scheduled_events` row (new `start_minute`, `end_minute`). Siblings unchanged.

### 5.5 "Sync to all" / "sync future" from an occurrence
- UPDATE all `scheduled_events` with the same `task_id` (future: `event_date >= anchor → window end`) to the anchor event's start/end.
- Skipping past occurrences is an explicit option; default action covers the whole remaining window.

### 5.6 Deleting an occurrence
- DELETE the row. The task remains in the library. The date simply has no occurrence; no "exception markers" needed (materialized model).
- Deleting is exposed via the occurrence's context menu (e.g., right-click) with two options:
  - **Delete this occurrence** — removes only that row.
  - **Delete all occurrences** — removes every materialized occurrence of that task in the window. 

### 5.7 Removing a task's frequency (recurring → one-off)
- UPDATE `recurrence_rules.rule_type = 'none'` (or DELETE the rule). Existing materialized occurrences are kept; they are no longer linked to a rule (`rule_id = NULL`).

### 5.8 Deleting/archiving a task
- Soft-delete: `active = 0`. Task disappears from library and future-looking calendar. Existing scheduled events remain in the database but are filtered out of the calendar.
- Hard-delete cascades to its rule and events.

### 5.9 Assignee filtering
- Every occurrence inherits the assignee set of its task (`task_assignees`).
- Calendar filter by person: `JOIN task_assignees ta ON ta.task_id = e.task_id WHERE ta.user_id = ?` (optionally `AND e.event_date BETWEEN ? AND ?`).
- The same query powers per-person routine views; personas (e.g., a child) filter exactly like login users.

---

## 6. Conflict Detection

- Computed at read time over task assignee sets — no additional table required.
- Two events on the same `event_date` conflict if their `[start_minute, end_minute)` ranges overlap **and** their tasks share at least one assignee.
- For each person, a person-level overlap is flagged (e.g., red warning indicator) so "Mom + child" vs "Dad + child" for "Playtime" and a dad-only chore at the same time would only warn for the child.
- Conflicts are warnings only — never blocked.
- Tasks with no assignees never conflict.

---

## 7. Regeneration Algorithm (template month)

For a rule, compute occurrence DAYS of the 30-day template:

1. `weekly_days`: include day D if `templateDow(D) ∈ days_of_week`, where `templateDow(D) = ((D−1) mod 7) + 1` (Day 1 = Monday).
2. `interval_days`: include D if `(D − 1) % interval_days == 0` (anchored at Day 1).
3. `monthly_date`: include D if `D == day_of_month` — "Day N of the template" (N ≤ 30; higher values match nothing).
4. `monthly_weekday`: not representable in the template — matches nothing (kept in the schema for compatibility).

Generation writes one `scheduled_events` row per day using the reference time (an explicit reference time from the form, else the task's earliest occurrence, else `09:00` + duration).

---

## 8. Example SQL Schema

```sql
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
```

---

## 9. Open Design Notes (v2 candidates)

- `origin` / `user_edited` flag on `scheduled_events` to preserve manual tweaks across frequency regeneration.
- Per-event assignee overrides (different people on specific occurrences) — would require an `event_assignees` join table.
- Multiple rules per task (e.g., weekdays at 6am, weekends at 9am) — would require reading times from the rule.
- Same task twice in one day via a single rule (e.g., "walk dog" AM + PM) — currently requires scheduling the second occurrence manually or adding an occurrence-count field.
- Timezone/DST handling.
- `interval_days` combined with a `days_of_week` filter (e.g., every other Monday) — add `day_filter` to interval rules.
