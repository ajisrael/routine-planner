import { useMemo, useState } from "react";
import { TimeGrid } from "../components/calendar/TimeGrid";
import { MonthGrid } from "../components/calendar/MonthGrid";
import { PersonFilterChips } from "../components/Chips";
import { usePlannerStore, windowStart, windowEnd } from "../store";
import { computeConflicts, filterEventsByPerson } from "../selectors/conflicts";
import {
  addDaysISO,
  addMonthsISO,
  clampISO,
  dayLabel,
  monthCells,
  monthLabel,
  todayISO,
  weekDates,
  weekRangeLabel,
} from "../lib/dates";

type ViewMode = "day" | "week" | "month";

/** View tab: read-only schedule with person filter + legend (DESIGN.md §5.4). */
export default function ViewTab(): React.JSX.Element {
  const store = usePlannerStore();
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(todayISO());
  const [person, setPerson] = useState<number | null>(null);

  const wStart = windowStart();
  const wEnd = windowEnd();
  const anchorSafe = clampISO(anchor, wStart, wEnd);

  const rangeDates = useMemo(
    () => (mode === "day" ? [anchorSafe] : mode === "week" ? weekDates(anchorSafe) : monthCells(anchorSafe).map((c) => c.date)),
    [mode, anchorSafe],
  );

  const visibleEvents = useMemo(
    () => filterEventsByPerson(store.events, person, store.assignees, store.tasks),
    [store.events, person, store.assignees, store.tasks],
  );
  const conflicts = useMemo(
    () => computeConflicts(visibleEvents, store.tasks, store.assignees).byEvent,
    [visibleEvents, store.tasks, store.assignees],
  );

  const moveAnchor = (dir: -1 | 1): void => {
    const step = mode === "day" ? 1 : mode === "week" ? 7 : 0;
    const next = mode === "month" ? addMonthsISO(anchorSafe, dir) : addDaysISO(anchorSafe, step * dir);
    setAnchor(clampISO(next, wStart, wEnd));
  };

  const rangeTitle =
    mode === "day"
      ? dayLabel(anchorSafe)
      : mode === "week"
        ? weekRangeLabel(weekDates(anchorSafe)[0]!, weekDates(anchorSafe)[6]!)
        : monthLabel(anchorSafe);

  const emptyInRange = visibleEvents.filter((e) => rangeDates.includes(e.eventDate)).length === 0;

  return (
    <section>
      <div className="card bg-base-100 border border-base-content/10">
        <div className="card-body p-3 lg:p-4 gap-3">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div role="tablist" className="join">
                {(["day", "week", "month"] as ViewMode[]).map((m) => (
                  <button
                    key={m}
                    className={`join-item btn btn-sm capitalize${mode === m ? " btn-primary" : ""}`}
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 ml-1">
                <button
                  className="btn btn-ghost btn-sm btn-square"
                  onClick={() => moveAnchor(-1)}
                  disabled={mode !== "month" && anchorSafe <= wStart}
                  aria-label="Previous"
                >
                  ‹
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAnchor(todayISO())}>
                  Today
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-square"
                  onClick={() => moveAnchor(1)}
                  disabled={mode !== "month" && anchorSafe >= wEnd}
                  aria-label="Next"
                >
                  ›
                </button>
              </div>
              <h3 className="font-bold text-sm lg:text-base ml-1">{rangeTitle}</h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs opacity-50">Person:</span>
              <PersonFilterChips users={store.users} value={person} onChange={setPerson} />
            </div>
          </div>

          {/* category legend */}
          <div className="flex flex-wrap gap-3 text-[11px] opacity-80">
            {store.categories.map((c) => (
              <span key={c.id} className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c.color ?? "var(--color-base-content)" }} />
                {c.name}
              </span>
            ))}
          </div>

          {emptyInRange && (
            <div className="alert alert-info text-sm">
              <span>
                Nothing scheduled for {person != null ? `${store.users.find((u) => u.id === person)?.displayName}'s` : "this"}{" "}
                view in this range — enjoy the quiet, or add something from the <b>Plan</b> tab.
              </span>
            </div>
          )}

          {mode === "month" ? (
            <MonthGrid
              anchor={anchorSafe}
              events={visibleEvents}
              conflicts={conflicts}
              interactive={false}
              onDayClick={(date) => {
                setMode("day");
                setAnchor(date);
              }}
            />
          ) : (
            <TimeGrid
              dates={rangeDates}
              events={visibleEvents}
              conflicts={conflicts}
              interactive={false}
            />
          )}

          <p className="text-[11px] opacity-50">
            Read-only preview. Conflicts show as red rings — they're warnings only. Use <b>Plan</b> to edit.
          </p>
        </div>
      </div>
    </section>
  );
}
