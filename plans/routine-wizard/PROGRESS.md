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

- [x] **P1 - Foundation (data model + API + store)** - DONE (commits 3698a1d→831fd87)
  - Migration `002` (server/src/migration/): rebuild `users` (drop `is_login_user`, `username` NOT NULL UNIQUE + backfill), add `tasks.cadence` NOT NULL DEFAULT 'custom' CHECK.
  - Shared types: `TaskCadence` union + `Task.cadence`; `User` without `isLoginUser`, `username` required.
  - rows.ts: mapUser/mapTask bring cadence + drop isLoginUser.
  - users route: create *login* users `{username, displayName}`, delete self-guard, rename unchanged.
  - auth route: `currentUser()` no longer filters `is_login_user = 1`.
  - tasks route: accept/validate `cadence`; removed dead duplicate `case "monthly_weekday"`.
  - store + API client: cadence passthrough; createPersona→createUser/deletePersona→deleteUser.
  - Components updated: UserManager rewritten as People manager (self-delete guard via session), AssigneePickerDialog (no persona badges), Avatar, Welcome (no persona copy).
  - Tests: server 52 → green; migration.test.ts suites (users rebuild, backfill, cascade, cadence). Web 15 → green.
- [x] **P2 - TaskForm cadence-first + library segments** - DONE (commit 93a12ac)
  - TaskForm: cadence select first (Daily/Weekly/Monthly/Custom); Daily auto-rule 7 days; Weekly → M-Su toggles; Monthly → day-of-month; Custom keeps existing recurrence dropdown. Save cadence.
  - TasksView library: All/Daily/Weekly/Monthly/Other segment chips + cadence badges.
- [x] **P3 - Setup tab shell + hub + gating** - DONE (uncommitted)
  - Navbar Tab type + Setup tab. App first-run gate (no tasks → auto-open Setup; Skip → Tasks).
  - SetupHub: People → Daily → Weekly → Monthly → done checklist, resume by section + completions.
- [x] **P4 - People stage** - DONE (uncommitted) - inline People manager in Setup, rewired to create/delete/rename login users.
- [x] **P5 - Daily + Weekly stages** - DONE (uncommitted)
  - StyledTodo → arrangement placePattern via setRecurrence; done semantics; summary lines "2 placed / 1 unplaced".
- [x] **P6 - Monthly stage** - DONE (uncommitted)
  - Month grid + day drill (armed task tap → open day, place at a time); non-monthly pills locked; monthly pill re-anchor via drag.
- [ ] **P7 - Polish + E2E** - IN PROGRESS
  - Browser E2E largely verified (see session notes) via chrome-devtools-axi + production build; remaining: drag paths not automatable with synthetic pointer events (shared onDragEnd handlers + unit-tested helpers), pixel checks, truthfulness of first-run gating after data exists.

## Test discipline

- Project has no central test runner doc; root `npm test` runs vitest in `server` and `web`.
- `web/todo.md` convention exists (check it). Write failing test first (TDD), log first failure to `~/testlog.md`, then implement, then verify.
- Commit conventions in `~/.agents/instructions/COMMITS.md` + repo history: `<prefix><risk><risk> - message`.

## Session notes / gotchas (keep appending)

- Project deps need `npm install`; npm shields install scripts → run `npm install-scripts approve better-sqlite3@13.0.3 esbuild@0.28.2 esbuild@0.21.5` (recorded in root package.json allowScripts). `@planner/shared` must be built before server/web tests (`npm run build -w @planner/shared`).
- Commit status: P1 done (4 commits) + P2 done (1 commit). P3–P6 code written, E2E-verified, staging for incremental commits.
- E2E run (2026-09-06, production build on :3100): fresh data dir; login Levi → Setup auto-opens (gating works); added Nina (People); Coffee daily via armed-tap Day 1 at 08:00 (rule weekly_days [1..7], 30 events @480); Piano weekly via armed-tap Tue 17:00 then armed-tap Sat (add-day same ref; rule [2,6], 9 events @1020); Laundry monthly via arm → tap date 4 → day drill → tap 10:30 (rule monthly_date dom 4, 1 event @630 = correct: monthly_date = exact template day, per shared/src/recurrence.ts); Done → View tab shows read-only preview; Plan tab consistent, "no conflicts". Drag paths (music block to another column/time, rail drop-to-remove) NOT automatable via synthetic pointer events - Chrome/CDP events don't drive dnd-kit PointerSensor; logic shares verified onDragEnd handlers + unit-tested pattern helpers.
- chrome-devtools-axi quirks (repeat from prior run): uids go stale after any action → always re-snapshot; `fill` fails on React inputs → `click` then `type`; armed tap at precise time = eval dispatch `MouseEvent('click',{clientX,clientY})` on `.day-col` at `rect.top + hour*hourHeight`, `hourHeight` = first `.gutter-cell` height (102 here). Port :3000 is another working copy's dev server - do NOT run dev server for E2E; use production build + NODE_ENV=production on :3100 (web/dist served).
- Rail drag bug + fix (2026-09-06): in Daily/Weekly setup stages the `DndContext` wrapped only the calendar card, so `useDraggable` rail rows outside the provider could never start a drag (silently inert); Monthly wrapped both but its drop handler ignored `library-task`. Fix: DndContext now wraps rail + calendar in all three stages; Monthly handles `library-task` drops (month day → opens that day's drill armed; drill day → places at drop minute) and clears arm on drag start. Verified via CDP `drag` (trusted pointer events DO drive dnd-kit - earlier synthetic dispatchEvent failures were an automation artifact, not proof drags were broken in Plan tab, which always had the rail inside its DndContext). Post-fix E2E: weekly Piano [2,6]→[2,3,6] via rail drag onto Wed; daily workout re-anchored via rail drag; monthly Laundry rail drag onto day 12 opened drill, tap placed 09:00; Plan tab Coffee rail drag re-anchored 30 events.
- Stage consolidation (2026-09-06, user-directed): setup stages ARE the plan view now. PlanView takes `setup?: SetupCadence` - scoped rail (cadence filter + QuickAddTask embedded in LibraryRail, placed badges, weekly remove-zone), fixed open range (daily=Day 1 day view, weekly=Week 1 week view, monthly=month view with working day/week/month switcher + drill), pattern-placement semantics (dailyPattern/weeklyPattern add/replace/remove/monthlyPattern) replacing single-occurrence moves, lockTaskIds for other cadences. PlanView keeps full free-form behavior when `setup` is unset (arrows, resize, TaskForm, ContextMenu). Deleted DailyStage/WeeklyStage/MonthlyStage/RoutineRail (bundle 321→314 kB). Gotcha: key the per-stage PlanView by step (`<PlanView key={step}>`) or React reuses the instance and the calendar keeps the previous stage's mode (weekly opened on Day 1). E2E verified: daily rail drag re-anchors (Coffee→10:15 daily), weekly rail drag adds Fri (Piano [2,3,6]→[2,3,5,6]), monthly rail drag onto a date opens that day armed → tap places (Laundry dom 4 @ 09:00), plan tab unchanged. Note: CDP `drag` is ~50% flaky - on failure just re-snapshot and retry the same drag.
- Rebased feature branch onto master 4b98fd8 (gained 7 commits: native showModal dialogs, 44px touch targets, calendar touch/pointer-owned drags, dead view removal, LAN dev server, mobile audit). One conflict in TaskForm imports (master's useLayoutEffect/useRef + feature's TaskCadence) - resolved by keeping both. All tests/typecheck green after rebase.
- AGENTS.md: no em dashes; never run `tmux kill-server`; run lint+typecheck+test before finishing; avoid full system paths in files.
- Storyboard/artifacts: don't run lavishly in this phase; deliver updates in conversation.
- Migration naming: numeric prefix sort, next = `002`.