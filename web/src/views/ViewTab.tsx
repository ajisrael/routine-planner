import { useMemo, useState } from "react";
import { TimeGrid } from "../components/calendar/TimeGrid";
import { MonthGrid } from "../components/calendar/MonthGrid";
import { PersonFilterChips } from "../components/Chips";
import { usePlannerStore } from "../store";
import { computeConflicts, filterEventsByPerson } from "../selectors/conflicts";
import { dayDowLabel, dayNumber, allTemplateDays, templateDay, weekDays, weekLabel } from "../lib/dates";

type ViewMode = "day" | "week" | "month";

/** View tab: read-only routine template with person filter + legend (DESIGN.md §5.4). */
export default function ViewTab(): React.JSX.Element {
  const store = usePlannerStore();
  const [mode, setMode] = useState<ViewMode>("week");
  const [selDay, setSelDay] = useState(1);
  const [selWeek, setSelWeek] = useState(1);
  const [person, setPerson] = useState<number | null>(null);

  const allDays = useMemo(allTemplateDays, []);

  const rangeDates = useMemo((): string[] => {
    if (mode === "day") return [templateDay(selDay)];
    if (mode === "week") return weekDays(selWeek);
    return allDays;
  }, [mode, selDay, selWeek, allDays]);

  const visibleEvents = useMemo(
    () => filterEventsByPerson(store.events, person, store.assignees, store.tasks),
    [store.events, person, store.assignees, store.tasks],
  );
  const conflicts = useMemo(
    () => computeConflicts(visibleEvents, store.tasks, store.assignees).byEvent,
    [visibleEvents, store.tasks, store.assignees],
  );

  const stepDay = (dir: -1 | 1): void => setSelDay((d) => Math.min(30, Math.max(1, d + dir)));
  const stepWeek = (dir: -1 | 1): void => setSelWeek((w) => Math.min(5, Math.max(1, w + dir)));

  const rangeTitle =
    mode === "day"
      ? `Day ${selDay} · ${dayDowLabel(templateDay(selDay))}`
      : mode === "week"
        ? weekLabel(selWeek)
        : "Routine template · 30 days";

  const emptyInRange = visibleEvents.filter((e) => rangeDates.includes(e.eventDate)).length === 0;

  return (
    <section className="h-full min-h-0">
      <div className="card flex h-full min-h-0 flex-col overflow-hidden bg-base-100 border border-base-content/10">
        <div className="card-body flex min-h-0 flex-1 flex-col gap-3 p-3 lg:p-4">
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
              {mode === "day" && (
                <div className="flex items-center gap-1 ml-1">
                  <button
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => stepDay(-1)}
                    disabled={selDay <= 1}
                    aria-label="Previous day"
                  >
                    ‹
                  </button>
                  <button
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => stepDay(1)}
                    disabled={selDay >= 30}
                    aria-label="Next day"
                  >
                    ›
                  </button>
                </div>
              )}
              {mode === "week" && (
                <div className="flex items-center gap-1 ml-1">
                  <button
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => stepWeek(-1)}
                    disabled={selWeek <= 1}
                    aria-label="Previous week"
                  >
                    ‹
                  </button>
                  <button
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => stepWeek(1)}
                    disabled={selWeek >= 5}
                    aria-label="Next week"
                  >
                    ›
                  </button>
                </div>
              )}
              <h3 className="font-bold text-sm lg:text-base ml-1">{rangeTitle}</h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs opacity-70">Person:</span>
              <PersonFilterChips users={store.users} value={person} onChange={setPerson} />
            </div>
          </div>

          {/* category legend */}
          {store.categories.length > 0 && (
            <div className="flex flex-wrap gap-3 text-[11px] opacity-80">
              {store.categories.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: c.color ?? "var(--color-base-content)" }}
                  />
                  {c.name}
                </span>
              ))}
            </div>
          )}

          {emptyInRange && (
            <div className="alert alert-info text-sm">
              <span>
                Nothing scheduled for{" "}
                {person != null ? `${store.users.find((u) => u.id === person)?.displayName}'s` : "this"} view in the
                template — enjoy the quiet, or add something from the <b>Plan</b> tab.
              </span>
            </div>
          )}

          {mode === "month" ? (
            <MonthGrid
              events={visibleEvents}
              conflicts={conflicts}
              interactive={false}
              onDayClick={(date) => {
                setMode("day");
                setSelDay(dayNumber(date));
              }}
            />
          ) : (
            <TimeGrid dates={rangeDates} events={visibleEvents} conflicts={conflicts} interactive={false} />
          )}

          <p className="text-[11px] opacity-70">
            Read-only preview of the repeating template. Conflicts show as red rings — they're warnings only.
            Use <b>Plan</b> to edit.
          </p>
        </div>
      </div>
    </section>
  );
}
