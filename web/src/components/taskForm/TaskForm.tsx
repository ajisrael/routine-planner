import { useEffect, useMemo, useState } from "react";
import type { RecurrenceRuleType, ScheduledEvent, Task } from "@planner/shared";
import { describeRule, occurrenceDates } from "@planner/shared";
import type { RuleShape } from "@planner/shared";
import { windowEnd } from "../../store";
import { usePlannerStore, assigneesOfTask, eventsOfTask } from "../../store";
import type { TaskRulePayload } from "../../api/client";
import { toast } from "../../store/toasts";
import { fmtTime, parseTime, todayISO, dateFromISO } from "../../lib/dates";
import { personColor } from "../../lib/colors";
import { Avatar } from "../Avatar";

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 7];
const DOW_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const DOW_LONG = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface FormState {
  name: string;
  duration: number;
  categoryId: number | null;
  assignees: Set<number>;
  ruleType: RecurrenceRuleType;
  refTime: string;
  daysOfWeek: Set<number>;
  intervalDays: number;
  dayOfMonth: number;
  monthWeek: number;
  monthDow: number;
  notes: string;
}

function rulePayload(s: FormState, startDate: string): RuleShape & { refStartMinute: number | null } {
  return {
    ruleType: s.ruleType,
    daysOfWeek: s.ruleType === "weekly_days" ? DOW_ORDER.filter((d) => s.daysOfWeek.has(d)) : null,
    intervalDays: s.ruleType === "interval_days" ? Math.max(1, Math.round(s.intervalDays)) : null,
    dayOfMonth: s.ruleType === "monthly_date" ? s.dayOfMonth : null,
    monthWeek: s.ruleType === "monthly_weekday" ? s.monthWeek : null,
    monthDow: s.ruleType === "monthly_weekday" ? s.monthDow : null,
    startDate,
    refStartMinute: s.ruleType === "none" ? null : parseTime(s.refTime),
  };
}

function sameRule(a: TaskRulePayload, b: TaskRulePayload): boolean {
  const key = (r: TaskRulePayload): string =>
    JSON.stringify([r.ruleType, [...(r.daysOfWeek ?? [])].sort(), r.intervalDays, r.dayOfMonth, r.monthWeek, r.monthDow]);
  return key(a) === key(b);
}

/**
 * Task editor (DESIGN.md §5.2): name, duration stepper, category, assignee
 * picks, frequency + reference time with live preview, notes. When opened
 * from a calendar occurrence it also exposes the occurrence actions row
 * (sync / delete this / delete all — DATA_MODEL.md §5.4–5.6).
 */
export function TaskForm({
  open,
  task,
  occurrence,
  onClose,
}: {
  open: boolean;
  task: Task | null;
  occurrence?: ScheduledEvent | null;
  onClose: () => void;
}): React.JSX.Element | null {
  const categories = usePlannerStore((s) => s.categories);
  const users = usePlannerStore((s) => s.users);
  const store = usePlannerStore();
  const [form, setForm] = useState<FormState>(blankForm());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!task) {
      setForm(blankForm());
      return;
    }
    const rule = store.recurrenceRules.find((r) => r.taskId === task.id);
    const evs = eventsOfTask(task.id);
    const first = evs.filter((e) => e.eventDate >= todayISO()).sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];
    const refTime = fmtTime(first?.startMinute ?? 540);
    setForm({
      name: task.name,
      duration: task.durationMinutes,
      categoryId: task.categoryId,
      assignees: new Set(assigneesOfTask(task.id).map((u) => u.id)),
      ruleType: rule?.ruleType ?? "none",
      refTime,
      daysOfWeek: new Set(rule?.daysOfWeek ?? []),
      intervalDays: rule?.intervalDays ?? 2,
      dayOfMonth: rule?.dayOfMonth ?? 1,
      monthWeek: rule?.monthWeek ?? 1,
      monthDow: rule?.monthDow ?? 1,
      notes: task.notes ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const preview = useMemo((): { count: number; next: string[]; label: string } => {
    if (form.ruleType === "none") return { count: 0, next: [], label: "One-off — schedule it by hand on the calendar." };
    const dates = occurrenceDates(
      {
        ruleType: form.ruleType,
        daysOfWeek: DOW_ORDER.filter((d) => form.daysOfWeek.has(d)),
        intervalDays: form.intervalDays,
        dayOfMonth: form.dayOfMonth,
        monthWeek: form.monthWeek,
        monthDow: form.monthDow,
        startDate: todayISO(),
      },
      todayISO(),
      windowEnd(),
    );
    const at = ` at ${form.refTime}`;
    if (dates.length === 0) {
      return { count: 0, next: [], label: `Occurs ${describeRule(rulePayload(form, todayISO()))}${at} — no dates in the 30-day window.` };
    }
    const next = dates.slice(0, 3).map((d) => {
      const dt = dateFromISO(d);
      return `${dt.toLocaleDateString(undefined, { weekday: "short" })} ${dt.getDate()}/${dt.getMonth() + 1}`;
    });
    return {
      count: dates.length,
      next,
      label: `Occurs ${describeRule(rulePayload(form, todayISO()))}${at} — next: ${next.join(", ")} · ${dates.length} occurrences generated for the 30-day window.`,
    };
  }, [form]);

  if (!open) return null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleDay = (d: number): void =>
    setForm((f) => {
      const days = new Set(f.daysOfWeek);
      if (days.has(d)) days.delete(d);
      else days.add(d);
      return { ...f, daysOfWeek: days };
    });

  const toggleAssignee = (id: number): void =>
    setForm((f) => {
      const set_ = new Set(f.assignees);
      if (set_.has(id)) set_.delete(id);
      else set_.add(id);
      return { ...f, assignees: set_ };
    });

  const save = async (): Promise<void> => {
    if (!form.name.trim()) {
      toast.error("Give the task a name first");
      return;
    }
    setBusy(true);
    try {
      if (task == null) {
        await store.createTask({
          name: form.name.trim(),
          durationMinutes: form.duration,
          notes: form.notes || null,
          categoryId: form.categoryId,
          assigneeIds: [...form.assignees],
          recurrence: form.ruleType === "none" ? undefined : rulePayload(form, todayISO()),
        });
        toast.success(`“${form.name.trim()}” added to the library`);
      } else {
        const fieldsChanged =
          task.name !== form.name.trim() ||
          task.durationMinutes !== form.duration ||
          task.notes !== (form.notes || null) ||
          task.categoryId !== form.categoryId;
        const assigneesChanged =
          JSON.stringify([...form.assignees].sort()) !==
          JSON.stringify(assigneesOfTask(task.id).map((u) => u.id).sort());
        if (fieldsChanged || assigneesChanged) {
          await store.updateTask(task.id, {
            name: form.name.trim(),
            durationMinutes: form.duration,
            notes: form.notes || null,
            categoryId: form.categoryId,
            assigneeIds: [...form.assignees],
          });
        }
        const existing = store.recurrenceRules.find((r) => r.taskId === task.id);
        const next = rulePayload(form, existing?.startDate ?? todayISO());
        const existingPayload: TaskRulePayload | null = existing
          ? {
              ruleType: existing.ruleType,
              daysOfWeek: existing.daysOfWeek,
              intervalDays: existing.intervalDays,
              dayOfMonth: existing.dayOfMonth,
              monthWeek: existing.monthWeek,
              monthDow: existing.monthDow,
            }
          : { ruleType: "none", daysOfWeek: null, intervalDays: null, dayOfMonth: null, monthWeek: null, monthDow: null };
        if (!sameRule(next, existingPayload)) {
          await store.setRecurrence(task.id, next);
          if (next.ruleType !== "none") toast.success("Frequency saved — occurrences regenerated for the 30-day window");
        }
        toast.success(`“${form.name.trim()}” updated`);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save task");
    } finally {
      setBusy(false);
    }
  };

  const runOccurrenceAction = async (action: "sync-all" | "delete-one" | "delete-all"): Promise<void> => {
    if (!occurrence || !task) return;
    try {
      if (action === "sync-all") {
        await store.syncEvent(occurrence.id, "all");
        toast.success("Time synced to all occurrences of this task");
      } else if (action === "delete-one") {
        await store.deleteEvent(occurrence.id);
        toast.info("Occurrence removed");
        onClose();
      } else {
        if (!window.confirm("Delete every occurrence of this task in the 30-day window?")) return;
        await store.deleteTaskEvents(task.id);
        toast.info("All occurrences removed");
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const stepDuration = (delta: number): void =>
    setForm((f) => ({ ...f, duration: Math.max(15, Math.min(240, f.duration + delta)) }));

  return (
    <dialog className="modal modal-open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-lg">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3 className="text-lg font-bold">{task ? "Edit task" : "Add task"}</h3>

          <fieldset className="fieldset p-0 gap-2">
            <legend className="fieldset-legend text-xs">Name *</legend>
            <input
              type="text"
              className="input w-full"
              placeholder="e.g. Homework"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <fieldset className="fieldset p-0 gap-2">
              <legend className="fieldset-legend text-xs">Duration * (15-min steps)</legend>
              <div className="join w-full items-stretch">
                <button type="button" className="join-item btn btn-sm" onClick={() => stepDuration(-15)}>
                  −
                </button>
                <span className="join-item flex-1 grid place-items-center bg-base-200 text-sm font-semibold min-h-8">
                  {form.duration} min
                </span>
                <button type="button" className="join-item btn btn-sm" onClick={() => stepDuration(15)}>
                  +
                </button>
              </div>
            </fieldset>
            <fieldset className="fieldset p-0 gap-2">
              <legend className="fieldset-legend text-xs">Category</legend>
              <select
                className="select select-sm w-full h-8"
                value={form.categoryId ?? ""}
                onChange={(e) => set("categoryId", e.target.value === "" ? null : Number(e.target.value))}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </fieldset>
          </div>

          <fieldset className="fieldset p-0 gap-2">
            <legend className="fieldset-legend text-xs">
              Assignees (optional — shared people drive conflict warnings)
            </legend>
            <div className="flex flex-wrap gap-2">
              {users.map((u) => {
                const on = form.assignees.has(u.id);
                return (
                  <button
                    type="button"
                    key={u.id}
                    className={`assign-pick text-sm${on ? " on" : ""}`}
                    style={{ ["--ppl-color" as string]: personColor(u.id) } as React.CSSProperties}
                    onClick={() => toggleAssignee(u.id)}
                    aria-pressed={on}
                  >
                    <Avatar user={u} />
                    <span className="font-medium">{u.displayName}</span>
                    {!u.isLoginUser && <span className="badge badge-xs badge-ghost">persona</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <fieldset className="fieldset p-0 gap-2">
              <legend className="fieldset-legend text-xs">Frequency</legend>
              <select
                className="select w-full"
                value={form.ruleType}
                onChange={(e) => set("ruleType", e.target.value as RecurrenceRuleType)}
              >
                <option value="none">One-off (no repeat)</option>
                <option value="weekly_days">On days of week</option>
                <option value="interval_days">Every N days</option>
                <option value="monthly_date">On day of month</option>
                <option value="monthly_weekday">Nth weekday of month</option>
              </select>
            </fieldset>
            {form.ruleType !== "none" && (
              <fieldset className="fieldset p-0 gap-2">
                <legend className="fieldset-legend text-xs">Reference time</legend>
                <input
                  type="time"
                  className="input w-full"
                  value={form.refTime}
                  step={900}
                  onChange={(e) => set("refTime", e.target.value)}
                />
              </fieldset>
            )}
          </div>

          {form.ruleType === "weekly_days" && (
            <div className="flex gap-1" role="group" aria-label="Days of week">
              {DOW_ORDER.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  className={`btn btn-sm btn-square${form.daysOfWeek.has(d) ? " btn-primary" : ""}`}
                  onClick={() => toggleDay(d)}
                  aria-pressed={form.daysOfWeek.has(d)}
                  title={DOW_LONG[i]}
                >
                  {DOW_SHORT[i]}
                </button>
              ))}
            </div>
          )}
          {form.ruleType === "interval_days" && (
            <label className="flex items-center gap-2 text-sm">
              Every
              <input
                type="number"
                className="input input-sm w-20"
                min={1}
                max={365}
                value={form.intervalDays}
                onChange={(e) => set("intervalDays", Math.max(1, Number(e.target.value) || 1))}
              />
              days
            </label>
          )}
          {form.ruleType === "monthly_date" && (
            <label className="flex items-center gap-2 text-sm">
              Day of month
              <input
                type="number"
                className="input input-sm w-20"
                min={1}
                max={31}
                value={form.dayOfMonth}
                onChange={(e) => set("dayOfMonth", Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              />
              <span className="opacity-50">(skipped when the day doesn't exist, e.g. Feb 30)</span>
            </label>
          )}
          {form.ruleType === "monthly_weekday" && (
            <div className="flex items-center gap-2 text-sm">
              <select
                className="select select-sm"
                value={form.monthWeek}
                onChange={(e) => set("monthWeek", Number(e.target.value))}
                aria-label="Which week"
              >
                <option value={1}>1st</option>
                <option value={2}>2nd</option>
                <option value={3}>3rd</option>
                <option value={4}>4th</option>
                <option value={-1}>Last</option>
              </select>
              <select
                className="select select-sm"
                value={form.monthDow}
                onChange={(e) => set("monthDow", Number(e.target.value))}
                aria-label="Weekday"
              >
                {DOW_LONG.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <span>of each month</span>
            </div>
          )}

          <p className={`text-xs font-medium ${form.ruleType === "none" ? "opacity-60" : "text-primary"}`}>
            {preview.label}
          </p>

          <fieldset className="fieldset p-0 gap-2">
            <legend className="fieldset-legend text-xs">Notes</legend>
            <textarea
              className="textarea w-full"
              rows={2}
              placeholder="Optional context…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </fieldset>

          {occurrence && task && (
            <div className="border border-base-content/10 rounded-xl p-2 flex flex-wrap gap-2 items-center bg-base-200/60">
              <span className="text-[11px] opacity-60 mr-1">This occurrence:</span>
              <button type="button" className="btn btn-xs" onClick={() => void runOccurrenceAction("sync-all")}>
                ⤒ Sync time to all
              </button>
              <button
                type="button"
                className="btn btn-xs btn-warning"
                onClick={() => void runOccurrenceAction("delete-one")}
              >
                Delete occurrence
              </button>
              <button
                type="button"
                className="btn btn-xs btn-error"
                onClick={() => void runOccurrenceAction("delete-all")}
              >
                Delete all occurrences
              </button>
            </div>
          )}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <span className="loading loading-spinner loading-sm" /> : "Save task"}
            </button>
          </div>
          <p className="text-[11px] opacity-50">
            Instance-first: moving one occurrence never touches its siblings. Changing frequency regenerates
            occurrences for the 30-day window.
          </p>
        </form>
      </div>
    </dialog>
  );
}

function blankForm(): FormState {
  return {
    name: "",
    duration: 45,
    categoryId: null,
    assignees: new Set<number>(),
    ruleType: "none",
    refTime: "09:00",
    daysOfWeek: new Set<number>(),
    intervalDays: 2,
    dayOfMonth: 1,
    monthWeek: 1,
    monthDow: 1,
    notes: "",
  };
}
