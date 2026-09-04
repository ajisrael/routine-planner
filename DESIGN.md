# Routine Planner — Design System & Prototype Reference

This document captures the design direction established in the interactive prototype and
serves as the reference for building the real React + Tailwind implementation.

## 1. Assets

| Asset | Path | Purpose |
|---|---|---|
| Interactive prototype (review session) | `.lavish/routine-planner-prototype.html` | Source artifact, reviewed/annotated in Lavish Editor |
| Portable prototype (standalone) | `design/routine-planner-prototype.html` | Self-contained export — opens directly in a browser with no Lavish server (CDN fonts/Tailwind need network) |
| Theme exploration board | `.lavish/theme-ideas.html` | 11 themes (8 stock DaisyUI + 3 custom) previewed against real app components; decision source |

> **Theme decision** (from the theme-ideas review): ship **Pastel** (light) +
> **Pastel Dusk** (dark, custom palette) with a light/dark toggle in the navbar.
> Caramel Latte was the earlier default and remains in the prototype history as an alternate.

The prototype is fully interactive: real drag-and-drop, resizing, conflict detection,
person filtering, task create/edit, and Day/Week/Month modes. Use it as the behavioral
spec alongside this document.

> Demo data: "today" is pinned to **Friday, Sep 4 2026**; seeded occurrences cover the
> current week through Sep 30 so all views have content.

## 2. Design Direction

- **Look & feel**: warm, friendly, family-first — *not* enterprise-calendar sterile.
- **Theme pair (decided)**: **Pastel** (light, stock DaisyUI) + **Pastel Dusk**
  (dark, custom DaisyUI v5 variable palette) with a navbar 🌙/☀️ toggle that swaps
  `data-theme` on `<html>`. Theme swap must work everywhere because all chrome uses
  semantic theme variables.
- **Evaluation history**: 11 themes were previewed on real components (event blocks,
  category colors, avatars, conflict states) in `.lavish/theme-ideas.html` — finalists
  were Tokyo Night, Pastel Dusk and Mist; Pastel + Pastel Dusk won for the family/
  kid-friendly mood and their light/dark pairing.
  **Implementation rule:** never hardcode Tailwind palette colors for text/surfaces —
  use semantic DaisyUI/Tailwind theme variables (`bg-base-100`, `text-base-content`,
  `bg-primary`, `var(--color-error)`, …) so theme switching works.
- **Design system**: Tailwind CSS v4 + DaisyUI v5 (matches the proposed stack in
  `REQUIREMENTS.md`). Icons: emoji (prototype) → replace with an icon set (e.g. Lucide)
  in production if desired.
- **Two accent systems, both data-driven** (not hardcoded):
  - **Category colors** — drive event-block backgrounds/borders on the calendar.
  - **Person colors** — drive avatar initials everywhere (assignee stacks, filters, login).

## 3. Design Tokens

### 3.1 Semantic theme (DaisyUI)

Light theme = stock **`pastel`**. Dark theme = custom **`pasteldusk`** palette
(see §3.5). Both applied via `data-theme` on `<html>`.

| Token | Use |
|---|---|
| `base-100` / `base-200` | Cards / page background |
| `primary` | Brand panel, primary actions, active tabs/chips, today highlights, drop ghost |
| `error` | Conflict rings, conflict badge, now-line, destructive actions |
| `warning` / `success` | "unscheduled" badges / "no conflicts", sync-live dot, toasts |
| `base-content` at 8–15% alpha | Grid lines, card borders (via `color-mix`) |

### 3.5 Pastel Dusk (custom dark palette)

Defined as a DaisyUI v5 `[data-theme="pasteldusk"]` variable block (see prototype
`<style>`); in production, register it via the Tailwind/DaisyUI plugin config.

| Var | Value | Var | Value |
|---|---|---|---|
| `base-100` | `#2b2b33` | `primary` | `#b7a6ea` lavender |
| `base-200` | `#24242b` | `primary-content` | `#2b2b33` |
| `base-300` | `#1d1d23` | `secondary` | `#93d6c6` mint |
| `base-content` | `#eae8f2` | `accent` | `#f4b6c5` pink |
| `neutral` | `#3d3d47` | `info` | `#9cc7e8` |
| `success` | `#a3d4ae` | `warning` | `#ecd3a0` |
| `error` | `#e89da8` | `error-content` | `#44232a` |

Radii: selector/field `0.5rem`, box `1rem`; border `1px`; depth `1`; noise `0`.
Category and person hex colors (§3.2–3.3) are unchanged in dark mode — the 16–18%
tint mix against the charcoal base keeps blocks legible.

### 3.2 Categories (id · label · hex)

| id | Label | Color |
|---|---|---|
| `chores` | Chores | `#f59e0b` amber |
| `school` | School | `#0ea5e9` sky |
| `family` | Family | `#f43f5e` rose |
| `meals` | Meals | `#84cc16` lime |
| `selfcare` | Self-care | `#a78bfa` violet |

Colors come from the `categories` table (`color` hex column) — the UI must read them,
never hardcode.

### 3.3 People (avatars)

| id | Name | Color | Kind |
|---|---|---|---|
| `mom` | Mom | `#e11d48` | login user |
| `dad` | Dad | `#0284c7` | login user |
| `aria` | Aria | `#d97706` | persona |
| `levi` | Levi | `#059669` | persona |

Avatar = 20px circle, white 9px bold initial, `avatar-dot`; stacked avatars overlap
−6px with a 2px `base-100` ring. Person colors should also be user-editable data in v2.

### 3.4 Calendar metrics

| Token | Value |
|---|---|
| Hour height | 60px |
| Visible window | 06:00 – 22:00 |
| Snap granularity | 15 minutes (matches `duration_minutes` / minute storage) |
| Gutter width | 56px |
| Week column min width | 148px (`repeat(7, minmax(148px, 1fr))`, horizontal scroll < ~900px) |
| Event block | border-radius .45rem, 4px category color left border, 11px text, tint = `color-mix(cat 16%, base-100)` |
| Compact event | < 40px tall (≤ 30 min) or narrower than half column → name only, 10px text |
| Overlap packing | events sharing time split the column horizontally (see §6.2) |

## 4. App Shell & Navigation

- **Top navbar** (sticky, `base-100`, bottom border): brand glyph + name · center tabs ·
  right side = 🌙/☀️ **theme toggle** (Pastel ↔ Pastel Dusk) · live-sync indicator
  (pulsing green dot + "Live · synced just now") · user avatar dropdown (feedback, logout).
- **Tab order** (user decision from review): **Tasks → Plan → View** —
  create, then schedule, then review.
- Tabs use DaisyUI `tabs-box`; active tab gets `tab-active`.

## 5. Screen Specs

### 5.1 Welcome / Login (`screen-welcome`)

- **Split hero**: left = primary-colored brand panel (glyph, name, tagline
  "One plan for the whole family", value prop, 4 solid-white feature chips);
  right = centered login card.
- **Login model** (per REQUIREMENTS/DATA_MODEL): name only, no passwords. One large
  input + "Enter planner →"; **quick-login chips** for Mom/Dad. Typing an unknown name
  creates a new login account (matching case-insensitive `users.username` first).
- Footer microcopy states the model: adults log in; personas are assigned, never log in.
- Contrast rule (from review): chips on the primary panel are **solid `primary-content`
  background with `primary` text** — never low-alpha text-on-tint.

### 5.2 Tasks — Task Library (`tab-library`)

- Header: title + explainer, primary **➕ Add task** button.
- Category filter chip row (All + each category with color dot).
- **Card grid** `repeat(auto-fill, minmax(250px, 1fr))`. Each card:
  - name + category color dot, ✎ edit / 🗑 delete (top right);
  - badges: 🕒 duration · 🔁 frequency label ("Daily", "Weekdays", "Mon Wed Thu",
    "Every 14d", "One-off") · 📅 "N× this week" (or amber "unscheduled");
  - assignee avatar stack (or "no assignees"), truncated note.
- **Add/Edit modal** (`dialog.modal`):
  - Name (required), Duration stepper (−/+ in 15-min steps, 15–240), Category select
    (height-matched to the stepper — from review), Assignee picker (avatar chips,
    "persona" tag), Frequency select + reference time, Notes.
  - Frequency sub-forms for each rule type: day-of-week toggles (M T W T F S S),
    every-N-days, day-of-month, Nth-weekday (1st/2nd/3rd/4th/Last + weekday).
  - Live preview line: *"Occurs every Mon, Wed, Fri at 16:00 — occurrences generated
    for the 30-day window."*
  - When opened from a calendar occurrence, an occurrence-actions row appears:
    **⤒ Sync time to all · Delete occurrence · Delete all occurrences** (mirrors the
    materialized-events semantics in `DATA_MODEL.md` §5.4–5.6).
  - Footnote: "Instance-first: moving one occurrence never touches its siblings.
    Changing frequency regenerates occurrences for the 30-day window."
- Deleting a task cascades to its occurrences (hard delete in v1 terms).

### 5.3 Plan — drag-to-plan calendar (`tab-plan`)

- **Layout**: left sticky **library rail** (300px) + main calendar card.
- **Rail**: compact draggable task rows (grip ⠿, category dot, name, duration +
  frequency, avatar stack), category filter chips, and a touch-friendly fallback:
  *tap a task to arm it → tap a slot to place it* (armed state = dashed outline).
- **Calendar toolbar**: ‹ Today › nav + range title, **Day | Week | Month** join toggle
  (same modes as View — added per review), conflict badge
  (`⚠ N conflicts` / `no conflicts`), person filter chips (Everyone · Mom · Dad ·
  Aria · Levi with avatars).
- **Week mode**: 7 columns, hour gutter, 15-min slot lines, today column tinted +
  "· today" label, red now-line. Events: category-tinted blocks with time + avatar
  stack (compact under 40px).
- **Day mode**: single full-width column, same interactions, full date in the header.
- **Month mode**: 6-week grid of day cells (out-of-month dimmed, today ringed) with up
  to 3 event pills (`HH:MM Name`, conflict-ringed) + "+N more". **Drop schedules at the
  task's reference time** — fine-tune in Day/Week (hint line included). Click a pill to
  edit the occurrence. Armed-tap works on cells too.
- Drag affordances: library rows are `draggable`; drop shows a **dashed ghost block**
  with snapped time + duration; drop targets highlight. Events are draggable to move;
  a **bottom-edge resize handle** (ns-resize, pointer-capture) adjusts duration in
  15-min snaps.

### 5.4 View — read-only schedule (`tab-view`)

- Toolbar: **Day | Week | Month** join, ‹ Today ›, range title, person filter chips.
- Category legend chip row (color dot + name).
- **Day view**: hour timeline + single day column, event blocks with name, time range,
  category, avatar stack (or "no assignees"); now-line on today; friendly empty state.
- **Week view**: same week grid as Plan but non-interactive (no drag/resize).
- **Month view**: day cells with pills; clicking a day jumps to Day view for that date.
- Person filter dims nothing silently in Day/Week (events hidden) and filters pills in
  Month — filtering by persona works identically to login users (`DATA_MODEL.md` §5.9).
- Conflict warnings visible here too (⚠ + red ring), since conflicts are read-time data.

## 6. Interaction Rules

### 6.1 Conflicts
- Computed at read time: two events on the same date conflict when their
  `[start, end)` ranges overlap **and** their tasks share ≥1 assignee
  (tasks with no assignees never conflict) — `DATA_MODEL.md` §6.
- Visuals: red ring (`box-shadow 0 0 0 2px error`), ⚠ dot on the block, header badge
  `⚠ N conflicts`, and a toast naming the double-booked person(s).
- Overlaps are **allowed** — warnings only, never blocked.

### 6.2 Overlap packing (from review)
Overlapping events on the same day must **line up horizontally**, not stack:
cluster transitively-overlapping events, greedily assign columns
(first column whose last end ≤ event start, else new column), then every event in a
cluster gets `width = 100/cols`:
`left = calc(col·(100/cols)% + 3px)`, `right = calc(100 − (col+1)·(100/cols)% + 3px)`.
Implement as a `layoutOverlaps(sortedEvents)` helper (prototype §"Overlap packing").

### 6.3 Drag & drop
- HTML5 DnD for library→calendar and event move; data carried via `dataTransfer` +
  module-level payload. Drop minute = `clamp(round((y/hourHeight·60)/15)·15)`.
- Moving an occurrence updates only that `scheduled_events` row (instance-first).
- Month drops/moves change only the date (time stays = task reference time).

### 6.4 Feedback
- Toasts (DaisyUI `toast` + `alert`) for: login, scheduling, moves/resizes, task
  create/update/delete, frequency regeneration, conflict warnings.
- Sync indicator flashes "Live · synced just now" after any mutation (placeholder for
  the real Socket.IO acknowledgment).

## 7. Responsive & Accessibility

- Week grids live in `overflow-x-auto` with `min-width: 900px` content — horizontal
  scroll on mobile; rail stacks above the calendar (`lg:grid-cols-[300px_1fr]`).
- Welcome hero stacks vertically on small screens (`lg:grid-cols-2`).
- Tap-to-place fallback covers touch devices where HTML5 DnD is unreliable; production
  should use `dnd-kit` (per REQUIREMENTS) for proper touch support.
- Every custom interactive element should carry `data-lavish-action` in artifacts (or an
  appropriate `role`/`aria-label` in production): event blocks, resize handles, day
  columns, month cells/pills, library rows/cards.
- Overflow hygiene: `min-width: 0` on all grid/flex children, `overflow-wrap: anywhere`
  on text, truncation with `title` tooltips on event names.

## 8. Prototype → Production Mapping

| Prototype concept | Production target |
|---|---|
| In-memory `TASKS`/`EVENTS` arrays | SQLite `tasks`, `recurrence_rules`, `scheduled_events` via REST API |
| `ruleDates()` generation | Server-side occurrence generation (30-day window) |
| `computeConflicts()` | Read-time conflict query or shared util (shared-assignee overlap) |
| Toast "synced just now" | Socket.IO event acknowledgment |
| Tap-to-place fallback | dnd-kit touch sensors |
| Emoji icons | Icon set (Lucide/Heroicons) |
| DaisyUI CDN | Bundled Tailwind + DaisyUI; themes `pastel` (light) + custom `pasteldusk` (dark), toggle swaps `data-theme` on `<html>` |
