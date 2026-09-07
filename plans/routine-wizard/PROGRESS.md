# Guided Routine Setup Wizard - Implementation Progress

Branch: `feature/routine-wizard-guide` (fast-forwarded to master `b98d900`)

The approved design artifact is `.lavish/setup-wizard-plan.html` (pastel-daizy whiteboard). This file tracks execution state only - for design rationale, sequences, and API diff read the artifact.

## Locked decisions (user-approved)

1. Tasks get a dedicated `cadence` field (`daily | weekly | monthly | custom`); categories stay free-form.
2. Wizard is a resumable view over existing data - Setup tab always reachable, auto-opens on first run when no tasks exist.
3. Personas removed - all users can log in; any user can create other users via People manager.
4. Setup = 4th navbar tab (label "Setup", icon chosen), after View.
5. First-run auto-opens Setup when store has no tasks; "Skip for now" → Tasks tab.
6. Greenfield - no data migration/backfill of existing data needed. Schema migration file still required.
7. Incremental commits per phase, project commit convention (`<prefix><risk><risk> - msg`, dash at 5th char).

## Key implementation insight (post-master-merge)

Master now implements "placement defines the time":
- `POST /api/events` re-anchors a recurring task's occurrences when dropped at a new time (server/src/routes/events.ts, server/src/services/regenerate.ts).
- `PUT /api/tasks/:id/recurrence` still accepts `refStartMinute` (regenerate.ts: computeReference = explicit → earliest occurrence → DEFAULT_START_MINUTE).

Wizard arrange "place pattern" is therefore a thin helper - **one endpoint**:

```
placePattern(taskId, cadence, { dow | dom, startMinute }) =
  PUT /api/tasks/:id/recurrence
    daily   → { ruleType:"weekly_days", daysOfWeek:[1..7], refStartMinute: T }
    weekly  → { ruleType:"weekly_days", daysOfWeek:[...days], refStartMinute: T }   // union for add-day
    monthly → { ruleType:"monthly_date", daysOfMonth:[d], refStartMinute: T }
    remove weekday/day → recurrence with days minus d (or ruleType:"none" if empty)
```

No new endpoints needed. Existing `TaskForm` dropped the ref-time input (direct edit is done via placement in Plan tab); the API layer keeps it for the wizard.

Re-anchor POST path also still used by the free-form Plan tab for DnD.

## Phases

- [ ] **P1 - Foundation (data model + API + store)** - incremental commits
  - Migration `002` (server/src/migration/): rebuild `users` (drop `is_login_user`, `username` NOT NULL UNIQUE + backfill), add `tasks.cadence` NOT NULL DEFAULT 'custom' CHECK.
  - Shared types: `TaskCadence` union + `Task.cadence`; `User` without `isLoginUser`, `username` required.
  - rows.ts: mapUser/mapTask bring cadence + drop isLoginUser.
  - users route: create *login* users `{username, displayName}`, delete self-guard, rename unchanged.
  - auth route: `currentUser()` no longer filters `is_login_user = 1`.
  - tasks route: accept/validate `cadence`.
  - store + API client: cadence passthrough; users actions renamed (createUser/updateUser/deleteUser with self-guard UI), snapshot unchanged keys.
  - Tests: users CRUD as login users, self-delete 400, cadence round-trip, auth /me no persona filter, migration applied.
- [ ] **P2 - TaskForm cadence-first + library segments**
  - TaskForm: cadence select first (Daily/Weekly/Monthly/Custom); Daily auto-rule 7 days; Weekly → M-Su toggles; Monthly → day-of-month; Custom keeps existing recurrence dropdown. Save cadence.
  - TasksView library: All/Daily/Weekly/Monthly/Other segment chips + cadence badges.
- [ ] **P3 - Setup tab shell + hub + gating**
  - Navbar Tab type + Setup tab. App first-run gate (no tasks → auto-open Setup; Skip → Tasks).
  - SetupHub: People → Daily → Weekly → Monthly → done checklist, resume by section + completions.
- [ ] **P4 - People stage** (rewire UserManager → create/delete/rename login users)
- [ ] **P5 - Daily + Weekly stages** (StyledTodo → arrangement placePattern via setRecurrence; done semantics; summary lines "2 placed / 1 unplaced")
- [ ] **P6 - Monthly stage + passthrough sweep** (ReviewList etc. remove persona assumptions; completion)
- [ ] **P7 - Polish + E2E** (browser walkthrough via chrome-devtools-axi, pixel checks, truthful persistence check, lint/typecheck/tests green)

## Test discipline

- Project has no central test runner doc; root `npm test` runs vitest in `server` and `web`.
- `web/todo.md` convention exists (check it). Write failing test first (TDD), log first failure to `~/testlog.md`, then implement, then verify.
- Commit conventions in `~/.agents/instructions/COMMITS.md` + repo history: `<prefix><risk><risk> - message`.

## Session notes / gotchas (keep appending)

- `.lavish/` is tracked in git; `.lavish/setup-wizard-plan.html` untracked (commit at P1 end or when updating artifact).
- AGENTS.md: no em dashes; never run `tmux kill-server`; run lint+typecheck+test before finishing; avoid full system paths in files.
- Storyboard/artifacts: don't run lavishly in this phase; deliver updates in conversation.
- Migration naming: numeric prefix sort, next = `002`.