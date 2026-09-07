# Mobile UX Findings - routine-planner

Audited on a 390x844 iPhone-class viewport (DPR 3, touch, mobile UA), with a
320x568 spot check at the end. All findings reproduced against this work tree
running the API on port 3001 and the web app on port 5174. Screenshots referenced
below were saved to `/tmp/opencode/m01-*.png` through `m11-*.png` during the
session.

## Status: fixed on 2026-09-06 (rebased onto the template-month rework first)

All findings were re-verified against the rebased code, then fixed. Finding 8
became obsolete (the template month has no "now"), the rest were addressed:

| # | Fix |
|---|-----|
| 1 | Tabs show labels at all widths (icon-only below 360px), 44px tall targets - `Navbar.tsx` |
| 2 | Toasts: fixed upstream (`b98d900` moved the stack bottom-right on all viewports); my mobile CSS override removed as redundant |
| 3 | Task form uses native `showModal()` so the `::backdrop` dims and Escape closes - `TaskForm.tsx` |
| 4 | Hour labels pinned in a 56px sticky strip; day columns scroll under it - `TimeGrid.tsx` |
| 5 | `--day-min` shrinks to 120px under 640px so a third day peeks past the edge (scroll affordance) - `styles.css` |
| 6 | 450ms long-press opens the occurrence menu on touch (iOS has no contextmenu); copy updated - `lib/longPress.ts`, `TimeGrid.tsx`, `MonthGrid.tsx` |
| 7 | `touch-action: none` on event blocks and month pills so touch drags reach dnd-kit; resize handle 9 -> 18px |
| 8 | Fixed upstream (`c682eeb`): the calendar window now zooms to ~6 visible hours (dynamic `--hour-h`) and auto-scrolls to the earliest occurrence; my simpler scroll effect was dropped in favor of it during the second rebase |
| 9 | Edit/Delete and occurrence action buttons are 44px targets; filter chips 44px - `TasksView.tsx`, `TaskForm.tsx`, `TaskLibrary.tsx` |
| 10 | User menu is a controlled popover: closes on outside pointer press and Escape; trigger is a real button with aria-expanded - `Navbar.tsx` |
| 11 | Duration/Frequency stack on phones, select gets full width - `TaskForm.tsx` |
| 12 | Form fields carry id/name (task-name, task-frequency, task-interval-days, task-day-of-month, task-notes); the ref-time field was since removed upstream (placement defines the time) |

Also done: the library rail is capped at 45vh on phones (it could push the
calendar off-screen with many tasks); dead DayView/WeekView/MonthView files
(orphans of the template rework) were deleted. Verified after the fact at 390px
and 320px (including a navbar overflow at 320px, now fixed with icon-only tabs),
desktop 1440px unchanged. Note: daisyUI's `.btn` inside a `.flex` loses
`min-w-*` to the unlayered `:where(.grid,.flex) > *` reset in `styles.css`, so
explicit `h-11`/`w-11` utilities are used instead.

## Summary

| # | Finding | Severity | Component |
|---|---------|----------|-----------|
| 1 | Bottom nav tabs crushed to ~41px, labels clipped to emoji only | High | Navbar |
| 2 | Toasts render top-center and cover the navbar | High | Toaster |
| 3 | Add-task dialog has no dimmed backdrop | Medium | TaskForm |
| 4 | Hour labels invisible on mobile (off right edge of scrollable grid) | High | TimeGrid / styles.css |
| 5 | Week grid scrolls horizontally with zero affordance, ~2.5 days visible | High | styles.css |
| 6 | Context menu is right-click only, unreachable on touch | High | TimeGrid / ContextMenu |
| 7 | Event drag-to-move likely broken on touch (scroll steals the gesture) | High* | PlanView / styles.css |
| 8 | Day view opens at midnight, no scroll-to-now | Medium | TimeGrid / DayView |
| 9 | Task card Edit/Delete buttons 29x24 / 32x24 px | Medium | TasksView |
| 10 | User dropdown never closes on outside tap or Escape | Medium | Navbar |
| 11 | Frequency select clips its text ("One-off (no repe...") | Low | TaskForm |
| 12 | Form fields missing id/name attributes (a11y, 5 fields) | Low | TaskForm |
| 13 | Menu items 32px tall; other sub-44px touch targets | Low | Navbar and others |
| 14 | Console 401s on load before auth resolves | Info | web |

\* Inferred from CSS/config; needs a real touch device to confirm.

## Detailed findings

### 1. Bottom nav tabs crushed (High)

`web/src/components/Navbar.tsx` renders three tabs ("🗂️ Tasks", "📅 Plan",
"👁️ View") in a flex row next to the connection status pill, theme toggle, and
user button. On a 390px viewport each tab gets ~41px of width, so the text
labels are clipped and only the emoji shows. Touch targets measure 41x40px,
below the 44px minimum.

Fix direction: on small screens move the tabs to a dedicated bottom tab bar
(full width, three equal segments) or a collapsed icon-only row with explicit
min-width.

### 2. Toasts overlap the navbar (High)

`web/src/components/Toaster.tsx:9` uses `toast toast-top toast-center`, which
floats directly over the top navbar (observed covering the sync status and user
button). Dismissal requires tapping the toast itself, which sits on top of the
controls a user is likely trying to reach.

Fix direction: bottom-center on mobile, or top-right on desktop only. Note the
toast container is `pointer-events-none` with `pointer-events-auto` children,
so the empty stack does not block input - good.

### 3. Add-task dialog lacks a backdrop (Medium)

`web/src/components/taskForm/TaskForm.tsx:238` renders
`<dialog className="modal modal-open">`. Because it never calls `showModal()`,
the native `::backdrop` never renders and daisyUI's `modal-open` variant does
not add a dim layer. Page content visibly peeks around the dialog edges, which
reads as a broken layout rather than a modal.

Fix direction: call `showModal()`/`close()` on the native dialog, or add an
explicit backdrop element behind `modal-box`.

### 4. Hour labels invisible on mobile (High)

`.plan-grid` (`web/src/styles.css:73`) is `56px repeat(7, minmax(148px, 1fr))`,
totaling 1092px. On a 390px viewport the grid scrolls horizontally inside a
`overflow-auto` container. The sticky gutter overlay
(`web/src/components/calendar/TimeGrid.tsx`, `gridColumn: 1 / -1`) spans the
full 1092px and `.gutter-cell` (`web/src/styles.css:81`) is `text-align:
right`, so the labels paint at x ~= 1100 - off-screen. On mobile the calendar
has no visible time labels at all until you scroll right (where they also float
over day columns).

Fix direction: give the gutter its own left column that stays pinned
(position sticky left), or render labels as small ticks inside each day column.

### 5. Horizontal scroll with no affordance (High)

Same root as #4: `scrollWidth` 1092 vs `clientWidth` 338 at 390px (900 vs 320
at the small check). The container scrolls but nothing hints at it - no edge
fade, no peek of the next day, no scrollbar visible on touch. Users see ~2.5
days and likely assume that is all there is. The read-only View tab has the
identical issue.

Fix direction: responsive column widths (e.g. `minmax(0, 1fr)` under a
breakpoint), day-per-page paging on mobile, or at minimum a gradient/peek to
signal scrollability.

### 6. Context menu unreachable on touch (High)

Event context actions (edit, delete occurrence, colors) are bound to
`onContextMenu` in `web/src/components/calendar/TimeGrid.tsx`, opening
`ContextMenu.tsx`. iOS long-press does not dispatch `contextmenu`, so on touch
there is no way to open the menu at all. The helper copy even says "right-click
an event".

Fix direction: long-press handler via pointer events (with a press timer), or
tap-to-select + action sheet, and adjust the copy.

### 7. Drag-to-move likely broken on touch (High, verify on device)

`.event-block` (`web/src/styles.css:111`) leaves `touch-action: auto`, and
`PlanView.tsx:91` configures `PointerSensor` with `distance: 6`. On touch, a
drag on an event inside the scrollable week grid starts native scrolling;
`pointercancel` fires and dnd-kit aborts. Resize handles (`.ev-resize`,
`styles.css:148`) do set `touch-action: none` but are 9px tall - far too small
for a finger.

Fix direction: set `touch-action: none` on event blocks (and keep grid scrolling
on the container, not the block), enlarge the resize handle to ~20px, and use a
long-press activation constraint for touch pointers. Re-verify on a real device.

### 8. Day view opens at midnight (Medium)

`START_HOUR = 0` in `web/src/components/calendar/geometry.ts` and there is no
scroll-to-now logic anywhere (grep-verified). A user opening "today" sees
00:00 and must scroll to find the current time; the `.now-line` exists but is
below the fold. On desktop this is mildly annoying; on mobile it is worse
because the visible window is short.

Fix direction: scroll the day container to `now` (minus a small offset) on
mount and when switching to day view.

### 9. Edit/Delete touch targets too small (Medium)

`web/src/views/TasksView.tsx:135` and `:138` use `btn btn-ghost btn-xs` for
Edit/Delete on task cards: measured 29x24 and 32x24 CSS px. Violates the 44px
guideline and invites mis-taps on destructive actions.

Fix direction: bump to `btn-sm` on touch, or pad the hit area while keeping
visual size.

### 10. User dropdown never dismisses (Medium)

`web/src/components/Navbar.tsx:91-113` uses daisyUI's CSS-only dropdown
(`tabIndex={0}` focus pattern). Verified behavior: Escape does not close it,
clicking other controls (theme toggle, page heading) does not close it. On
touch, focus-based dismissal is unreliable, so the menu lingers over content.
Also not keyboard-dismissible, an a11y issue.

Fix direction: controlled open state with outside-pointerdown and Escape
handlers (or the popover API).

### 11. Frequency select clips text (Low)

The "Repeat" select in the add-task form shows "One-off (no repe..." with the
native caret overlapping the text at 390px.

Fix direction: widen the control or shorten the option labels on small screens.

### 12. Form fields missing id/name (Low, a11y)

Chrome issue reported 5 times: form field elements should have an id or name
attribute (add-task form inputs). Label association / autofill / a11y suffer.
Add matching `htmlFor`/`id` pairs in `TaskForm.tsx`.

### 13. Misc touch-target and polish items (Low)

- User menu items measured 32px tall (Navbar.tsx:107,110).
- Theme toggle and user button are small (px-2, btn-sm).
- Day-view left gutter (56px) is an empty dead column on mobile.
- Welcome screen shows an oversized green status pill next to "Running on your
  local network" (m01 screenshot) - visually odd at mobile width.
- Default-category events render in neutral gray (`--ev-cat` fallback), low
  salience against the calendar, especially in dark mode.

### 14. Console noise (Info)

- Two `401 (Unauthorized)` resource errors during load - presumably the
  pre-auth session probe. Consider handling quietly client-side so it does not
  pollute the console.
- No other runtime errors; Vite HMR connects cleanly.

## What works well on mobile

- Quick-login buttons and the login flow are comfortable to use.
- Tap-to-place (arm task, then tap a day column) works and is a good
  touch-native interaction.
- Theme toggle (Pastel <-> Pastel Dusk) functions correctly.
- User menu content fits within the viewport (right edge 382 < 390) even at
  320px width.
- Toast stack itself does not block pointer events when empty.

## Test coverage notes

- Verified with emulated touch/mobile UA; drag gestures (#7) cannot be fully
  simulated through the CDP bridge because synthetic pointers are mouse-class.
  Confirm #7 on a physical device before/after fixing.
- Findings #1-#6, #9, #10 measured directly via DOM geometry on the emulated
  viewports (390x844x3 and 320x568x2).
