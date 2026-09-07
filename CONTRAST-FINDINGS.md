# UI Contrast Findings - routine-planner

**Status: all 16 findings fixed on 2026-09-06** - re-measured with the same
auditor after the fixes: 0 issues on every audited surface (tasks, plan
week/day/month, view tab, task form + occurrence actions, pickers, context
menu, toasts, welcome) in both themes, at 390px and 1440px. The findings and
root-cause analysis below are kept for reference; fixes are summarized at the
bottom.

Audited both themes (Pastel = light, Pastel Dusk = dark) on the 390px mobile
viewport plus 1440px desktop spot-checks, across the full app: Welcome, Task
library, task form + pickers, category/assignee/people managers, Plan
(day/week/month), View tab, context menu, toasts, navbar.

**Method**: programmatic WCAG 2.x contrast measurement over computed styles -
text color and every background layer (including daisyUI's translucent
`bg-x/15`, `/25` tints and oklch/oklab colors) are composited, element and
ancestor opacity folded in, then scored against 4.5:1 for normal text (3:1
for large text and UI components). Not eyeballed - measured. Audit script
preserved at `/tmp/opencode/contrast2.js` (viewport-filtered) and
`contrast-all.js` (full DOM).

## Severity summary

| Finding | Light (Pastel) | Dark (Pastel Dusk) | Where |
|---|---|---|---|
| 1. Frequency badge on task cards | **1.31:1** (recurring, `badge-primary`) | **1.34:1** (one-off, `badge-warning`) | `TasksView.tsx` card badges |
| 2. "unscheduled" badge | passes | **1.53:1** | `TasksView.tsx` |
| 3. ConflictBadge ("no conflicts") | **1.32:1** (`badge-success badge-outline`) | passes | `Chips.tsx` |
| 4. Month grid day cells | **1.37:1** | passes (~6.6) | `MonthGrid.tsx` |
| 5. Frequency preview line (`text-primary`) | **~1.6:1** | passes (~6.6) | `TaskForm.tsx` |
| 6. Welcome hero tagline (`text-primary-content/70`) | **2.95:1** | **3.53:1** | `Welcome.tsx` |
| 7. Welcome hero subtitle (`/80`) | **3.51:1** | **4.34:1** | `Welcome.tsx` |
| 8. Toasts (`alert-info`) | **3.60:1** | passes (~7) | `Toaster.tsx` / daisyUI |
| 9. Inactive navbar tabs | **3.40:1** | **4.28:1** | daisyUI `tabs-box` |
| 10. `opacity-50` helper texts | passes | **4.09-4.28:1** | ~10 places (see list) |
| 11. `opacity-40` Welcome footnote | passes | **3.15:1** | `Welcome.tsx` |
| 12. Picker count ("0 selected", `opacity-40`) | passes | **3.15:1** | `SelectionDialog.tsx` |
| 13. Month sticky weekday header (`opacity-60`) | passes (~4.6) | **3.31:1** | `MonthGrid.tsx` |
| 14. Category dot, cyan | **1.81:1** | passes | category palette |
| 15. Category dot, rose | passes | **2.99:1** (marginal) | category palette |
| 16. Conflict ring (`--color-error`) | **~1.9:1** | passes (~5.8) | `styles.css` `.event-block.conflict` |

Everything below 3:1 is effectively unreadable; items 1-5 and 14 are the worst
offenders. WCAG AA requires 4.5:1 for normal text and 3:1 for large text and
meaningful non-text UI.

## Root causes (4 patterns explain all 16 findings)

### A. Translucent-tint badges break in the opposite theme
daisyUI's `--color-x-content` is tuned for a **solid** `--color-x` background.
When the app uses `bg-primary/15` + `text-primary`, `bg-warning/25` +
`text-warning-content`, or a `badge-outline`, the effective background is
almost the plain base, so the content color sits against its own complement
and collapses to ~1.3:1. Which theme fails depends on the pair:

- `badge-primary` tint + `text-primary` -> fails **light** (near-white lavender text on white)
- `badge-warning`, `badge-success badge-outline` -> fail **dark** (same-hue content on base)

Affected: frequency badge (#1), unscheduled (#2), conflict badge (#3), toast
alert tints (#8), and the same classes wherever else they appear.

### B. `text-primary` is decorative in light, textual elsewhere
Pastel light's `--color-primary` is a near-white lavender (oklch 0.9). Any
place that uses `text-primary` for **reading** material collapses on light
surfaces: the frequency preview (#5), month cells (#4). In dark, the same
class lands on a dark base and passes - which is why this went unnoticed.

### C. MonthGrid renders cells as if always armed
`MonthGrid.tsx` chooses cell text color with
`armed || onDayClick ? "text-primary" : "opacity-70"`. `onDayClick` is always
passed in PlanView, so every cell is primary-tinted whether or not a task is
armed - pattern B then makes it fail in light (#4).

### D. Opacity-reduced utility text on small sizes
The codebase uses `opacity-40/50/60` on 9-12px helper text throughout. In
dark theme that lands at 4.09-4.31:1 (just under AA). In light it survives
(dark text on white tolerates dimming better) - so the failure is
theme-asymmetric. Affected places (dark): rail row meta ("🕒 45m · 🔁 ...",
"no assignees"), TasksView "Filter:", Plan/View helper footers, read-only
banner, "Person:" label, picker selection count, context-menu header line,
Welcome footnote/status line, month sticky header (#10-13).

### E. Raw category palette colors
Category dots use saturated raw colors (e.g. rose `rgb(225,29,72)`, cyan
`rgb(34,211,238)`) against both themes' bases. Cyan on light = 1.81:1, rose on
dark = 2.99:1 (#14-15). The event-block tints are fine (16% mix), it is the
small solid dots that fail.

### F. Light-theme error color too pale for thin rings
`--color-error` in Pastel light is a light rose (oklch 0.8); a 2px ring
against a white-ish day column is ~1.9:1 (#16) - conflicts (a safety feature
of the planner) are easy to miss in light mode.

## What already passes (both themes)

Event block text (17.3:1 dark), day/week grid headers, gutter hour labels
(dark 4.6), solid primary buttons in dark, context menu, dialog body text,
category manager, assignee/people rows, avatar chips (4.7), Welcome form and
quick-login chips, inactive category filter chips, month pills, drop ghost.

## Recommended fix directions (for discussion)

1. **Stop using content-colors over translucent tints.** For the tinted
   badges, either (a) use solid `badge` colors (`badge-primary` without the
   /15 override + `text-primary-content`), or (b) keep tints but pair them
   with the **base-content** color instead of `x-content`, or (c) define
   dedicated on-tint tokens per theme.
2. **Replace `text-primary` when it carries information** (preview line,
   month cells): use `text-primary` only in dark, or a dedicated
   `--color-accent-text` that passes in both themes (e.g. darkened primary for
   light).
3. **Fix the MonthGrid condition**: `armed ? "text-primary" : "opacity-70"`
   (drop `|| onDayClick`), and consider whether the armed tint should be a bg
   tint instead of a text color swap.
4. **Raise helper-text opacities**: `opacity-50` -> `opacity-70` (dark lands
   ~5.4:1) or introduce a `text-muted` token per theme tuned to pass 4.5:1 in
   both.
5. **Welcome hero**: drop the `/70`-`/80` opacity on `primary-content`, or
   give the hero a solid primary bg with full-contrast content.
6. **Toasts in light**: use `alert` with explicit content pairing that passes
   (e.g. solid alert colors), or bump `--color-info-content` contrast.
7. **Inactive tabs**: override daisyUI's inactive tab color per theme
   (`.tabs-box .tab` color) to clear 4.5:1 in both.
8. **Category palette**: pre-validate palette entries against both theme
   bases (3:1) when assigning colors (`nextFreeCategoryColor`), or draw dots
   with a contrasting ring.
9. **Conflict ring**: theme-aware ring color - in light use a darkened error
   (e.g. `color-mix(in oklab, var(--color-error) 70%, black)`), keeping the
   current one for dark.

Items 1, 2, 3, 4 are small CSS/class changes with no layout risk; 8 needs a
palette check; 6 and 9 are tiny. All are dark+light dual-theme issues - the
fixes must be verified in both themes.

## Fixes applied (all verified with the auditor, both themes)

1. **Tinted badges -> solid daisyUI pairs**: frequency badge and "unscheduled"
   use plain `badge-primary`/`badge-warning`; ConflictBadge uses plain
   `badge-success` (no `/15`-`/25` tints with same-hue text).
2. **Pale solid pairs in light get darkened text via CSS** (`styles.css`):
   `--error-strong` token + overrides for `.text-error`, `.badge-error`,
   `.btn-error`, `.badge-warning`, `.btn-warning` under
   `html[data-theme="pastel"]`.
3. **`--accent-text` token**: light theme uses a darkened primary
   (`oklch(0.45 0.15 306.703)`, ~8:1 on white); dark keeps primary. Applied to
   the task-form preview and armed month cells via `.accent-text`.
4. **MonthGrid condition fixed**: `armed ? "accent-text" : "opacity-70"` -
   the `|| onDayClick` that made every cell render as armed is gone.
5. **Welcome hero**: dropped the `/70`/`/80` opacity on `primary-content`
   text (full content passes on primary in both themes); footnote/status
   opacities bumped.
6. **Toasts**: daisyUI's soft-tint + content-text pairing fails in both
   themes (3.6 light / 1.0 dark); overridden to pair the soft tint with the
   full hue text on dark and a darkened hue on light.
7. **Inactive tabs**: `styles.css` override
   (`.tabs-box .tab:not(.tab-active)`) with 78% base-content.
8. **Category palette**: swapped to 600-level mid-tones that clear 3:1
   against both theme bases (`lib/colors.ts`); plus a `.dot-ring` hairline on
   all category dots so legacy stored colors stay visible too.
9. **Conflict ring**: theme-aware `--conflict-ring` token (error mixed 35%
   with black in light) used by event rings, month-pill rings and the
   conflict dot.
10. **Helper text opacities**: all informational `opacity-40/50` bumps to
    60/70 across tasks/plan/view/form/pickers/menu/welcome.

Also removed the dead `.now-line` CSS block (orphaned with the template-month
rework).
