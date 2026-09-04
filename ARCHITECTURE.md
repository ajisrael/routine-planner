# Routine Planner - Architecture & System Design

## 1. Overview & Goals

This document describes how the Routine Planner app is built: components, data flow, real-time sync, and deployment. It implements the requirements in `REQUIREMENTS.md` and the schema finalized in `DATA_MODEL.md`.

**Architecture goals**
1. **Single deployable unit** — one Docker image, one container, one Node process for API + WebSocket + static frontend.
2. **Persistent data** — SQLite file on a Docker volume; survives container rebuilds.
3. **Real-time collaboration** — changes propagate to the second device within ~2s with no manual refresh.
4. **Statement of scale** — exactly 2 active users, ~hundreds of events in a 30-day window. All simplicity decisions below assume this scale; nothing here is built for thousands of concurrent users.

---

## 2. Deployment Architecture

```
   Mom's laptop / phone          Dad's tablet / phone
         │  HTTP (LAN only)            │
         └────────────┬────────────────┘
                      ▼
         ┌─────────────────────────────────────────┐
         │  Proxmox LXC  (nesting feature: on)     │
         │  ┌───────────────────────────────────┐  │
         │  │  Docker container                 │  │
         │  │  ┌─────────────────────────────┐  │  │
         │  │  │ Node.js process             │  │  │
         │  │  │  ├─ Express  (REST API)     │  │  │
         │  │  │  ├─ Socket.IO (real-time)   │  │  │
         │  │  │  └─ Static web (built React)│  │  │
         │  │  └─────────────────────────────┘  │  │
         │  └──────────────────────┬────────────┘  │
         │                         │ /data volume  │
         │                   ┌─────┴─────┐         │
         │                   │ app.db    │         │
         │                   │ app.db-wal│         │
         │                   └───────────┘         │
         └─────────────────────────────────────────┘
```

- Everything for the app is one image. The LXC is just a container host.
- The only external state is the `/data` volume holding the SQLite database.

---

## 3. Runtime Components

### 3.1 The single Node.js process

A single `node` process serves all three concerns on one port:

| Concern | Library | Role |
|---------|---------|------|
| REST API | Express | All CRUD + generation endpoints |
| Real-time | Socket.IO (attached to same HTTP server) | Broadcast deltas to connected clients |
| Static frontend | Express `express.static` | Serves the built React bundle (SPA) with client-side routing fallback |

One process means: one port, one container, no reverse proxy or process manager needed inside the container.

### 3.2 SQLite persistence

- **Driver**: `better-sqlite3` (synchronous API — ideal at this scale; no connection pool, no async interleaving bugs).
- **WAL mode**: `PRAGMA journal_mode = WAL` — allows a reader and the single writer to proceed concurrently; important because Socket.IO writes and calendar reads can interleave.
- **Location**: `/data/app.db` inside the container, `/data` is a named Docker volume (`compose` file below). It is the **only** thing mounted.
- **Backup** = none required in v1. The DB is a single file; if ever wanted, copying `/data/app.db` after a WAL checkpoint suffices.

### 3.3 Container hardening

- Multi-stage build; final image runs as a **non-root user**.
- `HEALTHCHECK` hits `/api/health` (returns DB writeable status).
- No secrets in the image — authentication is a plain httpOnly cookie (§5.5); nothing to protect or rotate.

---

## 4. Frontend Architecture

### 4.1 Stack

| Concern | Choice | Why |
|---------|--------|-----|
| UI framework | React + TypeScript + Vite | Fast builds, typed props, all view logic testable as pure components |
| Styling | Tailwind CSS | Rapid iteration; consistent spacing/color tokens |
| Drag & drop | dnd-kit | Rich pointer/touch support, collision detection across the sidebar → grid and in-grid moves |
| State | Zustand | Tiny store; easy to feed from Socket.IO events; selector-based derived data |
| Date math | date-fns | Month/day arithmetic for recurrence generation previews and grid layout |
| Calendar grid | **Custom-built** | See §4.3 |

### 4.2 State management & the sync store

The client keeps a **full local mirror** of the small dataset in a Zustand store:

```
Store collections: users, categories, tasks, assignees, recurrence rules, events
```

- This is practical because the total data is tiny (2 users, ~100–300 tasks/events in the 30-day window).
- The store is the **single source of truth for the UI**; components never fetch.
- Initial load and reconnect: `GET /api/snapshot` returns all collections at once.
- Live updates: Socket.IO events (see §6) mutate the store in place.

**Write path (optimistic):**
1. UI action calls a store action (e.g., `moveEvent(eventId, newStart)`).
2. Store applies the change immediately (instant drag feedback, requirement <100 ms).
3. Store fires the REST call; server persists and broadcasts the authoritative version.
4. If the REST call fails, the store refetches `/api/snapshot` and shows a subtle error — no rollback logic to maintain.

Because there is exactly one "truth" returned by the server broadcast (which carries `updated_at`), and the client mirrors it wholesale, **last-write-wins falls out naturally** — no merge logic anywhere.

### 4.3 Calendar views (custom grid)

Recommendation: **build the day/week/month grids ourselves rather than using `react-big-calendar`** because the required interactions are unusual:

- drop targets are exact 15-minute slots, not floating pixels;
- the sidebar → grid drag must preview the task duration block;
- a context menu ("delete this occurrence", "delete all", "sync to all", "sync future") hangs off each event.

The custom implementation is bounded and testable:

| View | Implementation |
|------|----------------|
| Day | One column; 96 slots × 15 min; events are absolutely positioned blocks by `start/end_minute` |
| Week | 7 columns; same 15-min slot geometry per column |
| Month | Simple grid where each day cell lists compact chips (non-tabular); drag-to-day positions at a default time |

All three derive geometry from the same `minutes → px/y` helpers, so drag/resize logic is shared.

### 4.4 Drag & drop interactions

- **Sidebar → grid**: draggable task cards (from library). On drop over a 15-min slot, compute `start_minute`, then `end_minute = start + duration_minutes`, snap, insert event.
- **In-grid move**: drag event block; live-updates its y-position; snap to 15-min on release; `PATCH /api/events/:id`.
- **Resize**: drag bottom edge; duration changes in 15-min steps; on release `PATCH` with new `end_minute`. Optional context action "sync this duration" mirrors §5.5 of DATA_MODEL.
- Touch: dnd-kit keyboard/pointer sensor covers pointer + touch; long-press drags.

### 4.5 Conflict detection (client side)

- The server returns raw events; the client derives conflicts with a **Zustand selector** over the store:

```
For an event E on date D:
  conflicts(E) = for each task-assignee u of E:
                   ∃ other event E' on D (E'≠E) such that
                   E'[start,end) overlaps E[start,end) AND u ∈ assignees(E')
```

- Rendering the warning is a pure function of store state → it updates **instantly** as events move, with no extra network round-trips, and naturally disappears the moment a user resolves the overlap.
- The selector also powers the person filter: "show only events whose task assigns to person P".

---

## 5. Backend Architecture

### 5.1 Stack

| Concern | Choice | Why |
|---------|--------|-----|
| Runtime | Node 22 (LTS) | modern, single executable host |
| HTTP/API | Express | mature, minimal |
| DB | better-sqlite3 | synchronous, fast at this scale |
| Real-time | Socket.IO on the same HTTP server | automatic reconnection, rooms, broadcasts |
| Language | TypeScript (strict) | shared types with the frontend |

### 5.2 Layering

```
routes (HTTP handlers, parse/validate)
   │
services (domain logic + SQL: recurrence, regenerate, sync-actions, snapshot)
   │
db.ts (better-sqlite3 instance, migrations, WAL)
```

- `db.ts` owns the single connection, applies migrations, enables WAL. Services query it directly — a repository layer is unnecessary at this scale.
- Every mutation runs inside a `BEGIN … COMMIT` transaction. Socket.IO broadcasts happen **after** commit so clients never observe partial states.

### 5.3 Recurrence engine

Pure module `recurrence.ts` implementing the generation algorithm in `DATA_MODEL.md §7`:

```
occurrenceDates(rule, windowStart, windowEnd): Date[]   // pure
generateForRule(rule, referenceTime, window)            // deletes + inserts rows
```

- Invoked on rule create/update (behavior 5.3) — regenerates all rule-linked events in the window using the reference time.
- Idempotent by rule: regeneration always starts by deleting `rule_id` events in the window, then inserting fresh ones.
- Events with `rule_id IS NULL` (manual/one-off) are never touched.

### 5.4 API surface

All routes return `application/json`. Every mutation broadcasts (see §6) and returns the affected resources so the mutating client can reconcile with its optimistic state.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness + DB writable check |
| POST | `/api/auth/login` | Name-based login → session cookie + user |
| GET | `/api/snapshot` | Full dataset (initial load/reconnect) |
| GET/POST | `/api/users` | List / create users + personas |
| GET/POST/PUT/DELETE | `/api/categories` | Category CRUD |
| GET/POST | `/api/tasks` | List + create tasks |
| PUT/DELETE | `/api/tasks/:id` | Update / soft-delete task |
| PUT | `/api/tasks/:id/assignees` | Replace assignee set (task_assignees) |
| PUT | `/api/tasks/:id/recurrence` | Update rule → regenerate events in window |
| GET | `/api/events?from&to&person` | Events in date range, optional person filter |
| POST | `/api/events` | Create one event (drag from library / one-off) |
| PUT | `/api/events/:id` | Move / resize one occurrence |
| DELETE | `/api/events/:id` | Delete one occurrence |
| POST | `/api/events/:id/sync` | Body: `{scope: 'all'\|'future'}` → propagate time/duration to siblings |
| DELETE | `/api/tasks/:id/events` | Delete all occurrences (context menu) |

(`start_minute`/`end_minute` are integer minutes from local midnight — matching the schema; the frontend converts to/from clock times.)

### 5.5 Authn: name-based login (no passwords)

- `POST /api/auth/login {username}` — find `is_login_user=1` user by case-insensitive `username`; if absent, **create** it.
- Success sets an **httpOnly cookie** containing the user id. No session store, no signing key, nothing to invalidate on restart.
- Every API and Socket.IO connection reads that cookie to identify the user; there is no login wall beyond "enter a name".
- Personas are managed only via `POST /api/users` (flagged `is_login_user=0`) — never creatable via login.
- Trust boundary: this is LAN-only. The cookie is a convenience identity marker, not a security boundary.

---

## 6. Real-Time Sync Design

### 6.1 Principle: deltas + snapshot resync

The dataset is small, so the protocol is deliberately simple:

- **Initial connect / reconnect**: `GET /api/snapshot` → hydrate the store; then subscribe on the Socket.IO channel.
- **Then**: only small mutation events travel over the socket.

### 6.2 Broadcast taxonomy

After any committed write, the server emits one of:

| Event | Payload | Applied by client as |
|-------|---------|----------------------|
| `entity:upsert` | `{collection, id, data}` | `set(collection, id, data)` |
| `entity:delete` | `{collection, id}` | `delete(collection, id)` |

Examples:
- `PATCH /api/events/:id` → `entity:upsert {events, 12, {...}}`
- `DELETE /api/events/:id` → `entity:delete {events, 12}`
- A rule regeneration touching many events → one Socket.IO emit with an array of upserts/deletes (server coalesces).

### 6.3 Data racing & last-write-wins

- Every write persists and then broadcasts; both clients end at the same bytes.
- For truly simultaneous edits to the same row, the server is the final authority: SQLite serializes writes; the row's `updated_at` reflects the last accepted write; both clients converge on the broadcast.
- **No client-side merge logic anywhere** — the store is a mirror, and it always mirrors the newest broadcast.

### 6.4 Reconnection

- Socket.IO auto-reconnects; on a missed-window (stale timestamps), the client just re-hits `/api/snapshot`.
- Because state is small, "just resnapshot" is a valid and sufficient recovery story — no delta rewind or version negotiation.

---

## 7. Database & Migrations

- Schema lives in `migration/001_init.sql` (from `DATA_MODEL.md §8`), applied when `PRAGMA user_version = 0`.
- Future schema changes add numbered migration files, applied in order and tracked via `user_version`.
- All tables indexed per `DATA_MODEL.md §4`.
- WAL enabled; `synchronous=NORMAL` (safe with WAL) for write throughput; foreign keys enforced (`PRAGMA foreign_keys=ON`).

---

## 8. Build, Docker & Deployment

### 8.1 Multi-stage Dockerfile

```
Stage 1  build-web   : node:22-alpine · npm ci · vite build → /web/dist
Stage 2  build-server: npm ci · tsc → /server/dist          (copies shared/)
Stage 3  runtime     : node:22-alpine · copy both dists · non-root · CMD node server
```

No node_modules in runtime; image is small; the DB is the only writable path besides `/tmp`.

### 8.2 docker-compose.yml (deployment shape)

```yaml
services:
  planner:
    build: .
    ports:
      - "8080:3000"
    environment:
      - PORT=3000
      - DATA_DIR=/data
    volumes:
      - planner-data:/data        # ← the persistent volume (app.db)
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  planner-data:
```

- `planner-data` is a **named Docker volume** → survives `docker compose up --build`, image rebuilds, and container recreation. This is the persistence guarantee the user asked for.
- Alternative: a bind mount `./data:/data` puts the `.db` file directly on the Proxmox filesystem (browsable, easy to copy). Named volume (default) is simpler; either works.

### 8.3 Proxmox LXC notes

- Enable **nesting** on the LXC: in Proxmox config `features: nesting=1` (or via the web UI → LXC → Options → Features → Nesting: ☑). Docker requires it to run inside LXC.
- Place the compose project on the LXC filesystem. Keep the compose named volume (simplest) or use a bind mount; if binding a host dir, give it to the container's non-root UID.
- Exposure: publish the port to the LAN directly; no reverse proxy needed for 2 local users.

---

## 9. Testing Strategy

| Layer | Approach |
|-------|----------|
| Recurrence engine | Unit tests (table-driven): weekly/interval/monthly cases, month-skip (Feb 30), 30-day boundary |
| Services | Unit tests against an in-memory `:memory:` SQLite |
| Conflict selector | Unit tests: overlap, shared vs non-shared assignee, multiple people |
| API | `supertest` against the Express app with an in-memory DB |
| Frontend components | Vitest + React Testing Library (drag math, views, store actions); verify touch/drag manually on device during dev |

---

## 10. Non-Functional Commitments

From `REQUIREMENTS.md §3`:

- Calendar render ≤ 1 s — guaranteed by small dataset + in-memory store (no network on view switch).
- Drag feedback < 100 ms — guaranteed by optimistic store writes.
- Real-time propagation ≤ 2 s — Socket.IO push is < 50 ms on a LAN; the 2 s budget covers worst-case reconnect.
- Responsive day/week/month layouts for desktop + mobile; touch-friendly dnd-kit sensors.

---

## 11. File Layout

```
schedule-planner/
├── REQUIREMENTS.md
├── DATA_MODEL.md
├── ARCHITECTURE.md
├── Dockerfile
├── docker-compose.yml
├── package.json                # npm workspaces
├── shared/                     # types shared web+server
│   ├── package.json
│   └── src/index.ts            # API + entity types (User, Task, Event, RecurrenceRule…)
├── server/
│   ├── package.json            # express, socket.io, better-sqlite3
│   ├── src/
│   │   ├── index.ts            # boot: static + API + socket.io
│   │   ├── db.ts               # connection, WAL, migrations
│   │   ├── migration/001_init.sql
│   │   ├── recurrence.ts       # pure occurrence-date engine
│   │   ├── services/           # regenerate, sync-actions, snapshot (SQL lives here)
│   │   ├── routes/             # auth, users, categories, tasks, events
│   │   └── realtime.ts         # socket.io setup + broadcast helpers
│   └── test/
└── web/
    ├── package.json            # react, zustand, dnd-kit, socket.io-client, date-fns
    ├── src/
    │   ├── main.tsx
    │   ├── store/              # zustand store + socket subscriptions
    │   ├── api/                # fetch wrappers
    │   ├── selectors/          # conflicts, person filter
    │   ├── components/
    │   │   ├── calendar/       # day / week / month grids + geometry helpers
    │   │   ├── library/        # task library tab, drag cards
    │   │   ├── taskForm/       # task editor incl. recurrence builder
    │   │   └── users/          # user/persona management
    │   └── views/              # tab shells (Tasks, Calendar)
    └── test/
```

---

## 12. Open Design Points (v2 candidates)

- Offline editing + queued sync (currently requires connectivity; a LAN app at 2 users does not need it).
- Rich text/photo task notes.
- Server-side conflict detection for a future "conflict feed" report.
- TLS termination (reverse proxy) if the app ever leaves the LAN.
- Multi-node scaling would require replacing SQLite with Postgres — only if the user base ever grows beyond a few people.
