import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RecurrenceRuleType, ScheduledEvent, Task } from "@planner/shared";
import { describeRule, occurrenceDays, TEMPLATE_DAYS } from "@planner/shared";
import type { RuleShape } from "@planner/shared";
import { usePlannerStore, assigneesOfTask } from "../../store";
import type { TaskRulePayload } from "../../api/client";
import { toast } from "../../store/toasts";
import { CategoryPickerDialog } from "../CategoryPickerDialog";
import { AssigneePickerDialog } from "../AssigneePickerDialog";
import { AvatarStack } from "../Avatar";

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 7];
const DOW_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const DOW_LONG = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface FormState {
  name: string;
  duration: number;
  categoryId: number | null;
  assignees: Set<number>;
  ruleType: RecurrenceRuleType;
  daysOfWeek: Set<number>;
  intervalDays: number;
  dayOfMonth: number;
  notes: string;
}

function rulePayload(s: FormState): RuleShape {
  return {
    ruleType: s.ruleType,
    daysOfWeek: s.ruleType === "weekly_days" ? DOW_ORDER.filter((d) => s.daysOfWeek.has(d)) : null,
    intervalDays: s.ruleType === "interval_days" ? Math.max(1, Math.round(s.intervalDays)) : null,
    dayOfMonth: s.ruleType === "monthly_date" ? s.dayOfMonth : null,
    monthWeek: null,
    monthDow: null,
    startDate: "01",
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Native showModal renders the ::backdrop dim and makes Escape work; the
  // daisyUI `modal-open` class variant has neither.
  useLayoutEffect(() => {
    const d = dialogRef.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);

  const currentCategory = form.categoryId != null ? categories.find((c) => c.id === form.categoryId) : undefined;
  const pickedUsers = users.filter((u) => form.assignees.has(u.id));

  useEffect(() => {
    if (!open) return;
    if (!task) {
      setForm(blankForm());
      return;
    }
    const rule = store.recurrenceRules.find((r) => r.taskId === task.id);
    setForm({
      name: task.name,
      duration: task.durationMinutes,
      categoryId: task.categoryId,
      assignees: new Set(assigneesOfTask(task.id).map((u) => u.id)),
      ruleType: rule?.ruleType ?? "none",
      daysOfWeek: new Set(rule?.daysOfWeek ?? []),
      intervalDays: rule?.intervalDays ?? 2,
      dayOfMonth: rule?.dayOfMonth ?? 1,
      notes: task.notes ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const preview = useMemo((): string => {
    if (form.ruleType === "none") return "One-off — schedule it by hand on the calendar.";
    const days = occurrenceDays(rulePayload(form));
    if (days.length === 0) {
      return `Occurs ${describeRule(rulePayload(form))} — no matching days in the template.`;
    }
    const next = days.slice(0, 5).map((d) => `Day ${d}`);
    return `Occurs ${describeRule(rulePayload(form))} — ${days.length} days in the template: ${next.join(", ")}${days.length > next.length ? ", …" : ""}. Drop it on the calendar once and every occurrence follows that time.`;
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
          recurrence: form.ruleType === "none" ? undefined : rulePayload(form),
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
        const next = rulePayload(form);
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
    <>
      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="task-form-title"
        onClick={(e) => e.target === e.currentTarget && onClose()}
        onClose={onClose}
      >
        <div className="modal-box max-w-lg">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3 id="task-form-title" className="text-lg font-bold">{task ? "Edit task" : "Add task"}</h3>

          <fieldset className="fieldset p-0 gap-2">
            <legend className="fieldset-legend text-xs">Name *</legend>
            <input
              type="text"
              id="task-name"
              name="name"
              className="input w-full"
              placeholder="e.g. Homework"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <fieldset className="fieldset p-0 gap-2 min-w-0">
              <legend className="fieldset-legend text-xs">Duration * (15-min steps)</legend>
              <div className="join w-full items-stretch">
                <button type="button" className="join-item btn btn-sm" onClick={() => stepDuration(-15)}>
                  −
                </button>
                <span className="join-item flex-1 grid place-items-center bg-base-200 text-sm font-semibold min-h-8 border-0 outline-none">
                  {form.duration} min
                </span>
                <button type="button" className="join-item btn btn-sm" onClick={() => stepDuration(15)}>
                  +
                </button>
              </div>
            </fieldset>
            <fieldset className="fieldset p-0 gap-2 min-w-0">
              <legend className="fieldset-legend text-xs">Frequency</legend>
              <select
                id="task-frequency"
                name="ruleType"
                className="select select-sm w-full h-8"
                value={form.ruleType}
                onChange={(e) => set("ruleType", e.target.value as RecurrenceRuleType)}
              >
                <option value="none">One-off (no repeat)</option>
                <option value="weekly_days">On days of week</option>
                <option value="interval_days">Every N days</option>
                <option value="monthly_date">On a specific template day</option>
              </select>
            </fieldset>
          </div>

          {form.ruleType !== "none" && (
            <div className="flex flex-col gap-3">
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
                    id="task-interval-days"
                    name="intervalDays"
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
                  Template day
                  <input
                    type="number"
                    id="task-day-of-month"
                    name="dayOfMonth"
                    className="input input-sm w-20"
                    min={1}
                    max={TEMPLATE_DAYS}
                    value={form.dayOfMonth}
                    onChange={(e) => set("dayOfMonth", Math.min(TEMPLATE_DAYS, Math.max(1, Number(e.target.value) || 1)))}
                  />
                  <span className="opacity-50">(Day {form.dayOfMonth} of the 30-day template)</span>
                </label>
              )}
              <p className="text-xs font-medium text-primary">{preview}</p>
            </div>
          )}

          <fieldset className="fieldset p-0 gap-2 min-w-0">
            <legend className="fieldset-legend text-xs">
              Assignees (optional — shared people drive conflict warnings)
            </legend>
            <button
              type="button"
              className="btn btn-sm w-full h-8 justify-start gap-2 min-w-0 font-normal"
              onClick={() => setAssigneePickerOpen(true)}
              aria-haspopup="dialog"
            >
              {pickedUsers.length > 0 ? (
                <AvatarStack users={pickedUsers} max={5} />
              ) : (
                <span className="opacity-60">No assignees</span>
              )}
              <span className="ml-auto opacity-40 shrink-0">▾</span>
            </button>
          </fieldset>

          <fieldset className="fieldset p-0 gap-2 min-w-0">
            <legend className="fieldset-legend text-xs">Category</legend>
            <button
              type="button"
              className="btn btn-sm w-full h-8 justify-start gap-2 min-w-0 font-normal"
              onClick={() => setPickerOpen(true)}
              aria-haspopup="dialog"
            >
              <span
                className="inline-block w-3.5 h-3.5 rounded-full shrink-0"
                style={{
                  background: currentCategory?.color ?? "var(--color-base-content)",
                  opacity: currentCategory ? 1 : 0.3,
                }}
              />
              <span className={`truncate min-w-0 text-left${currentCategory ? "" : " opacity-60"}`}>
                {currentCategory?.name ?? "No category"}
              </span>
              <span className="ml-auto opacity-40 shrink-0">▾</span>
            </button>
          </fieldset>

          <fieldset className="fieldset p-0 gap-2">
            <legend className="fieldset-legend text-xs">Notes</legend>
            <textarea
              id="task-notes"
              name="notes"
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
              <button type="button" className="btn btn-sm h-11" onClick={() => void runOccurrenceAction("sync-all")}>
                ⤒ Sync time to all
              </button>
              <button
                type="button"
                className="btn btn-sm btn-warning h-11"
                onClick={() => void runOccurrenceAction("delete-one")}
              >
                Delete occurrence
              </button>
              <button
                type="button"
                className="btn btn-sm btn-error h-11"
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
            Recurring tasks start at 09:00 — drop one on the calendar and every occurrence follows that time.
            Moving a single occurrence never touches its siblings; changing frequency regenerates the template.
          </p>
        </form>
      </div>
      </dialog>
      <CategoryPickerDialog
        open={pickerOpen}
        currentId={form.categoryId}
        onClose={(picked) => {
          setPickerOpen(false);
          if (picked !== undefined) set("categoryId", picked);
        }}
      />
      <AssigneePickerDialog
        open={assigneePickerOpen}
        currentUserIds={[...form.assignees]}
        onClose={(picked) => {
          setAssigneePickerOpen(false);
          if (picked !== undefined) set("assignees", new Set(picked));
        }}
      />
    </>
  );
}

function blankForm(): FormState {
  return {
    name: "",
    duration: 45,
    categoryId: null,
    assignees: new Set<number>(),
    ruleType: "none",
    daysOfWeek: new Set<number>(),
    intervalDays: 2,
    dayOfMonth: 1,
    notes: "",
  };
}
