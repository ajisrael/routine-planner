import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RecurrenceRule, ScheduledEvent, Task, TaskCadence, RuleShape } from "@planner/shared";
import { occurrenceDays, TEMPLATE_DAYS } from "@planner/shared";
import { usePlannerStore, assigneesOfTask } from "../../store";
import type { TaskRulePayload } from "../../api/client";
import { toast } from "../../store/toasts";
import { fmtTime, dayNumber, DOW_LABELS } from "../../lib/dates";
import { AvatarStack } from "../Avatar";
import { CategoryPickerDialog } from "../CategoryPickerDialog";
import { AssigneePickerDialog } from "../AssigneePickerDialog";

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 7];
const DOW_LONG = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type FreqMode = "none" | "daily" | "weekly" | "custom";

interface FreqState {
  mode: FreqMode;
  days: Set<number>;
  customN: number;
  customUnit: "day" | "week";
  customDays: Set<number>;
}

interface FormState {
  name: string;
  duration: number;
  categoryId: number | null;
  assignees: Set<number>;
  /** Guided-setup grouping (mirrors Task.cadence). */
  cadence: TaskCadence;
  freq: FreqState;
  notes: string;
}

/** Cadence implied by the approved frequency modes. */
function cadenceFor(freq: FreqState): TaskCadence {
  return freq.mode === "daily" ? "daily" : freq.mode === "weekly" ? "weekly" : "custom";
}

/** Frequency mode preset from the guided-setup cadence. */
function freqFromCadence(cadence: TaskCadence): FreqState {
  if (cadence === "daily") return { mode: "daily", days: new Set(DOW_ORDER), customN: 1, customUnit: "week", customDays: new Set([1]) };
  if (cadence === "weekly") return { mode: "weekly", days: new Set([1, 2, 3, 4, 5]), customN: 1, customUnit: "week", customDays: new Set([1]) };
  return blankFreq();
}

const blankFreq = (): FreqState => ({ mode: "none", days: new Set([1, 3, 5]), customN: 2, customUnit: "week", customDays: new Set([1]) });

function freqFromRule(rule: RecurrenceRule | undefined): FreqState {
  const days = new Set(rule?.daysOfWeek ?? []);
  switch (rule?.ruleType) {
    case "weekly_days":
      return days.size === 7
        ? { mode: "daily", days, customN: 1, customUnit: "week", customDays: new Set([1]) }
        : { mode: "weekly", days, customN: 1, customUnit: "week", customDays: new Set([1]) };
    case "interval_days":
      return { mode: "custom", days: new Set(), customN: rule.intervalDays ?? 2, customUnit: "day", customDays: new Set([1]) };
    case "weekly_interval":
      return { mode: "custom", days: new Set(), customN: rule.weeksInterval ?? 2, customUnit: "week", customDays: days };
    default:
      return blankFreq();
  }
}

/** Map the frequency state to the stored rule payload (null = one-off). */
function rulePayload(freq: FreqState): TaskRulePayload | null {
  switch (freq.mode) {
    case "daily":
      return { ruleType: "weekly_days", daysOfWeek: [1, 2, 3, 4, 5, 6, 7] };
    case "weekly": {
      const days = [...freq.days].sort((a, b) => a - b);
      return days.length > 0 ? { ruleType: "weekly_days", daysOfWeek: days } : null;
    }
    case "custom":
      if (freq.customUnit === "day") {
        return { ruleType: "interval_days", intervalDays: freq.customN };
      }
      {
        const days = [...freq.customDays].sort((a, b) => a - b);
        return days.length > 0
          ? { ruleType: "weekly_interval", weeksInterval: freq.customN, daysOfWeek: days }
          : null;
      }
    default:
      return null;
  }
}

function ruleKey(p: TaskRulePayload | null): string {
  return JSON.stringify([
    p?.ruleType ?? null,
    [...(p?.daysOfWeek ?? [])].sort(),
    p?.intervalDays ?? null,
    p?.weeksInterval ?? null,
  ]);
}

function previewFor(freq: FreqState): string {
  if (freq.mode === "none") return "One-off — schedule it by hand on the calendar.";
  const payload = rulePayload(freq);
  if (!payload) {
    return freq.mode === "weekly"
      ? "Repeats weekly — pick the days above"
      : `Repeats every ${freq.customN} ${freq.customUnit}${freq.customN > 1 ? "s" : ""} — pick the days below`;
  }
  const days = occurrenceDays(payload as unknown as RuleShape, 1, TEMPLATE_DAYS);
  if (freq.mode === "daily") return "Repeats every day · 30 occurrences — Day 1 through Day 30";
  if (freq.mode === "weekly") {
    const picked = [...freq.days].sort((a, b) => a - b).map((d) => DOW_LABELS[d - 1]).join(", ");
    return `Repeats weekly on ${picked} · ~${days.length} occurrences`;
  }
  const unit = freq.customUnit;
  const label = `Repeats every ${freq.customN} ${unit}${freq.customN > 1 ? "s" : ""}`;
  const on =
    unit === "week"
      ? ` on ${[...freq.customDays].sort((a, b) => a - b).map((d) => DOW_LABELS[d - 1]).join(", ")}`
      : "";
  const list = days.slice(0, 4).map((d) => `Day ${d}`).join(", ");
  return `${label}${on} · ${days.length} occurrences — ${list}${days.length > 4 ? ", …" : ""}`;
}

/**
 * Task editor: Name|Duration row, the approved frequency selector
 * (Doesn't Repeat · Daily · Weekly · Custom), assignees + category via
 * dialogs, notes. When opened from a calendar occurrence it shows the
 * occurrence chip, the Sync Tasks shortcut and the removal actions.
 */
export function TaskForm({
  open,
  task,
  occurrence,
  presetCadence,
  onClose,
}: {
  open: boolean;
  task: Task | null;
  occurrence?: ScheduledEvent | null;
  /** Cadence preselected for a brand-new task (setup scopes open it per stage). */
  presetCadence?: TaskCadence;
  onClose: () => void;
}): React.JSX.Element | null {
  const categories = usePlannerStore((s) => s.categories);
  const users = usePlannerStore((s) => s.users);
  const store = usePlannerStore();
  const [form, setForm] = useState<FormState>(() => blankForm(presetCadence));
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const customWrapRef = useRef<HTMLDivElement>(null);
  const repeatOnRowRef = useRef<HTMLDivElement>(null);
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
      setForm(blankForm(presetCadence));
      return;
    }
    const rule = store.recurrenceRules.find((r) => r.taskId === task.id);
    setForm({
      name: task.name,
      duration: task.durationMinutes,
      categoryId: task.categoryId,
      assignees: new Set(assigneesOfTask(task.id).map((u) => u.id)),
      cadence: task.cadence ?? "custom",
      freq: freqFromRule(rule),
      notes: task.notes ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, presetCadence]);

  // Custom panel: the "Repeat every" row spans the "Repeat on" row's width.
  useEffect(() => {
    const wrap = customWrapRef.current;
    const row2 = repeatOnRowRef.current;
    if (!wrap || !row2 || form.freq.mode !== "custom") return;
    wrap.style.width = "max-content";
    row2.style.width = "max-content";
    const w = row2.getBoundingClientRect().width;
    row2.style.width = "";
    if (w > 0) wrap.style.width = `${w}px`;
  });

  const preview = useMemo(() => previewFor(form.freq), [form.freq]);

  if (!open) return null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((f) => ({ ...f, [key]: value }));

  const setFreq = (patch: Partial<FreqState>): void =>
    setForm((f) => ({ ...f, freq: { ...f.freq, ...patch } }));

  const toggleIn = (key: "days" | "customDays", id: number): void =>
    setForm((f) => {
      const next = new Set(f.freq[key]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...f, freq: { ...f.freq, [key]: next } };
    });

  const stepDuration = (delta: number): void =>
    setForm((f) => ({ ...f, duration: Math.max(15, Math.min(240, f.duration + delta)) }));

  const stepCustomN = (delta: number): void =>
    setFreq({ customN: Math.max(1, Math.min(15, form.freq.customN + delta)) });

  const save = async (): Promise<void> => {
    if (!form.name.trim()) {
      toast.error("Give the task a name first");
      return;
    }
    setBusy(true);
    try {
      if (task == null) {
        const recurrence = rulePayload(form.freq);
        await store.createTask({
          name: form.name.trim(),
          durationMinutes: form.duration,
          notes: form.notes || null,
          categoryId: form.categoryId,
          assigneeIds: [...form.assignees],
          cadence: cadenceFor(form.freq),
          recurrence: recurrence ?? undefined,
        });
        toast.success(`“${form.name.trim()}” added to the library`);
      } else {
        const fieldsChanged =
          task.name !== form.name.trim() ||
          task.durationMinutes !== form.duration ||
          task.notes !== (form.notes || null) ||
          task.categoryId !== form.categoryId ||
          task.cadence !== cadenceFor(form.freq);
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
            cadence: cadenceFor(form.freq),
          });
        }
        const existing = store.recurrenceRules.find((r) => r.taskId === task.id);
        const next = rulePayload(form.freq);
        const existingPayload: TaskRulePayload | null = existing
          ? {
              ruleType: existing.ruleType,
              daysOfWeek: existing.daysOfWeek,
              intervalDays: existing.intervalDays,
              weeksInterval: existing.weeksInterval,
              dayOfMonth: existing.dayOfMonth,
              monthWeek: existing.monthWeek,
              monthDow: existing.monthDow,
            }
          : null;
        if (ruleKey(next) !== ruleKey(existingPayload)) {
          await store.setRecurrence(task.id, next ?? { ruleType: "none" });
          if (next) toast.success("Frequency saved — occurrences regenerated across the template");
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

  const runOccurrenceAction = async (action: "remove-one" | "remove-all"): Promise<void> => {
    if (!occurrence || !task) return;
    try {
      if (action === "remove-one") {
        await store.deleteEvent(occurrence.id);
        toast.info("Occurrence removed");
        onClose();
      } else {
        if (!window.confirm(`Remove every occurrence of “${task.name}” from the template?`)) return;
        await store.deleteTaskEvents(task.id);
        toast.info("All occurrences removed");
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const runSync = async (): Promise<void> => {
    if (!occurrence) return;
    await store.syncEvent(occurrence.id, "all");
    toast.success("Time synced to all occurrences of this task");
  };

  const dayCircles = (key: "days" | "customDays"): React.JSX.Element[] =>
    DOW_ORDER.map((d, i) => (
      <button
        type="button"
        key={d}
        className={`day-circle${form.freq[key].has(d) ? " on" : ""}`}
        onClick={() => toggleIn(key, d)}
        aria-pressed={form.freq[key].has(d)}
        title={DOW_LONG[i]}
      >
        {DOW_LABELS[i].slice(0, 1).toUpperCase()}
      </button>
    ));

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
            <div className="flex items-start justify-between gap-2">
              <h3 id="task-form-title" className="text-lg font-bold">{task ? "Edit task" : "Add task"}</h3>
              {occurrence && (
                <span className="badge badge-ghost border-base-content/10 shrink-0">
                  Day {dayNumber(occurrence.eventDate)} · {fmtTime(occurrence.startMinute)}–
                  {fmtTime(occurrence.endMinute)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <fieldset className="fieldset p-0 gap-2 min-w-0">
                <legend className="fieldset-legend text-xs">Name *</legend>
                <input
                  type="text"
                  className="input w-full h-10"
                  placeholder="e.g. Homework"
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  autoFocus
                />
              </fieldset>
              <fieldset className="fieldset p-0 gap-2 min-w-0">
                <legend className="fieldset-legend text-xs">Duration *</legend>
                <div className="join duration-join w-full items-stretch h-10">
                  <button type="button" className="join-item btn btn-sm" onClick={() => stepDuration(-15)}>
                    −
                  </button>
                  <span className="join-item flex-1 grid place-items-center bg-base-200 text-sm font-semibold border-0 outline-none">
                    {form.duration} min
                  </span>
                  <button type="button" className="join-item btn btn-sm" onClick={() => stepDuration(15)}>
                    +
                  </button>
                </div>
              </fieldset>
            </div>

            <fieldset className="fieldset p-0 gap-2 min-w-0">
              <div className="flex items-center justify-between -mb-1">
                <legend className="fieldset-legend text-xs mb-0">Frequency</legend>
                {occurrence && task && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs freq-preview"
                    onClick={() => void runSync()}
                    title="Sync the time to all occurrences of this task"
                  >
                    ⤒ Sync Tasks
                  </button>
                )}
              </div>
              <div className="seg" role="tablist" aria-label="Frequency">
                {(
                  [
                    ["none", "Doesn't Repeat"],
                    ["daily", "Daily"],
                    ["weekly", "Weekly"],
                    ["custom", "Custom"],
                  ] as Array<[FreqMode, string]>
                ).map(([m, label]) => (
                  <button
                    type="button"
                    key={m}
                    className={form.freq.mode === m ? "on" : ""}
                    onClick={() => setFreq({ mode: m })}
                    aria-pressed={form.freq.mode === m}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {form.freq.mode === "weekly" && (
                <div className="flex items-center justify-center gap-2.5 text-sm">
                  <span className="opacity-70">Repeat on</span>
                  <div className="flex gap-1.5">{dayCircles("days")}</div>
                </div>
              )}
              {form.freq.mode === "custom" && (
                <div className="flex justify-center">
                  <div className="inline-flex flex-col gap-2.5" ref={customWrapRef}>
                    <div className="flex items-center justify-between gap-2.5 text-sm">
                      <span>Repeat every</span>
                      <div className="stepper">
                        <button type="button" onClick={() => stepCustomN(-1)}>−</button>
                        <span className="val">{form.freq.customN}</span>
                        <button type="button" onClick={() => stepCustomN(1)}>+</button>
                      </div>
                      <select
                        className="select select-sm"
                        style={{ width: "6.5rem" }}
                        value={form.freq.customUnit}
                        onChange={(e) => setFreq({ customUnit: e.target.value as "day" | "week" })}
                        aria-label="Unit"
                      >
                        <option value="day">day</option>
                        <option value="week">week</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm" ref={repeatOnRowRef}>
                      <span className="opacity-70">Repeat on</span>
                      <div className="flex gap-1.5">{dayCircles("customDays")}</div>
                    </div>
                  </div>
                </div>
              )}
              <p className="preview">{preview}</p>
            </fieldset>

            <fieldset className="fieldset p-0 gap-2 min-w-0">
              <legend className="fieldset-legend text-xs">Assignees</legend>
              <button
                type="button"
                className="btn btn-sm w-full h-10 justify-start gap-2 min-w-0 font-normal"
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
                className="textarea w-full"
                rows={2}
                placeholder="Optional context…"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </fieldset>

            <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
              {occurrence && task && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="btn btn-xs btn-warning"
                    onClick={() => void runOccurrenceAction("remove-one")}
                  >
                    Remove Occurrence
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-error"
                    onClick={() => void runOccurrenceAction("remove-all")}
                  >
                    Remove All Occurrences
                  </button>
                </div>
              )}
              <div className={`flex gap-2${occurrence && task ? "" : " ml-auto"}`}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  {busy ? <span className="loading loading-spinner loading-sm" /> : task ? "Save changes" : "Save task"}
                </button>
              </div>
            </div>
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

function blankForm(presetCadence?: TaskCadence): FormState {
  return {
    name: "",
    duration: 45,
    categoryId: null,
    assignees: new Set<number>(),
    cadence: presetCadence ?? "custom",
    freq: freqFromCadence(presetCadence ?? "custom"),
    notes: "",
  };
}
