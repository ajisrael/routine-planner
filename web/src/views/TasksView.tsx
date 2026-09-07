import { useMemo, useState } from "react";
import type { Task, TaskCadence } from "@planner/shared";
import { describeRule } from "@planner/shared";
import { usePlannerStore, assigneesOfTask, ruleForTask, categoryById } from "../store";
import { AvatarStack } from "../components/Avatar";
import { CategoryDot } from "../components/Chips";
import { TaskForm } from "../components/taskForm/TaskForm";
import { CategoryManager } from "../components/CategoryManager";
import { scheduledOccurrenceCount } from "../components/library/TaskLibrary";
import { toast } from "../store/toasts";

type CadenceFilter = "all" | TaskCadence;

const CADENCE_SEGMENTS: Array<{ value: CadenceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Other" },
];

export const CADENCE_BADGE: Record<TaskCadence, { label: string; cls: string }> = {
  daily: { label: "Daily", cls: "badge-success bg-success/15 text-success" },
  weekly: { label: "Weekly", cls: "badge-info bg-info/15 text-info" },
  monthly: { label: "Monthly", cls: "badge-secondary bg-secondary/15 text-secondary" },
  custom: { label: "Custom", cls: "badge-ghost" },
};

/** Task Library tab (REQUIREMENTS.md §2.1): manage tasks, filter, add/edit. */
export default function TasksView(): React.JSX.Element {
  const tasks = usePlannerStore((s) => s.tasks);
  const categories = usePlannerStore((s) => s.categories);
  const [cadence, setCadence] = useState<CadenceFilter>("all");
  const [filter, setFilter] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

  const active = useMemo(() => tasks.filter((t) => t.active), [tasks]);
  const visible = active.filter(
    (t) => (cadence === "all" || t.cadence === cadence) && (filter == null || t.categoryId === filter),
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold">Task library</h2>
          <p className="text-sm opacity-60">
            Every routine your family repeats lives here — scheduled or not. Drag tasks onto the calendar
            from the <b>Plan</b> tab.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setManagerOpen(true)}>
            🏷️ Manage categories
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            ➕ Add task
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2" role="group" aria-label="Cadence filter">
        {CADENCE_SEGMENTS.map((c) => (
          <button
            key={c.value}
            className={`btn btn-xs rounded-full${cadence === c.value ? " btn-primary" : " btn-ghost"}`}
            onClick={() => setCadence(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs opacity-70 mr-1">Filter:</span>
        <button
          className={`btn btn-sm rounded-full h-11${filter === null ? " btn-primary" : " btn-ghost"}`}
          onClick={() => setFilter(null)}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`btn btn-sm rounded-full gap-1 h-11${filter === c.id ? " btn-primary" : " btn-ghost"}`}
            onClick={() => setFilter(c.id)}
          >
            <span className="dot-ring inline-block w-2 h-2 rounded-full" style={{ background: c.color ?? "transparent" }} />
            {c.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card bg-base-100 border border-base-content/10">
          <div className="card-body items-center py-10 text-center">
            <p className="text-3xl" aria-hidden>
              🗂️
            </p>
            <h3 className="font-bold">Nothing here yet</h3>
            <p className="text-sm opacity-60 max-w-sm">
              {active.length === 0
                ? "Add your first routine — a chore, a school run, dinner prep — and then plan it on the calendar."
                : "No tasks match this cadence + category filter."}
            </p>
            {active.length === 0 && (
              <button
                className="btn btn-primary mt-2"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                ➕ Add task
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
          {visible.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onEdit={() => {
                setEditing(t);
                setFormOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <TaskForm open={formOpen} task={editing} onClose={() => setFormOpen(false)} />
      {managerOpen && <CategoryManager onClose={() => setManagerOpen(false)} />}
    </section>
  );
}

function TaskCard({ task, onEdit }: { task: Task; onEdit: () => void }): React.JSX.Element {
  const deleteTask = usePlannerStore((s) => s.deleteTask);
  const category = categoryById(task.categoryId);
  const rule = ruleForTask(task.id);
  const assigneeUsers = assigneesOfTask(task.id);
  const scheduledTotal = scheduledOccurrenceCount(task.id);

  const freqLabel = rule ? describeRule(rule) : "One-off";

  const remove = async (): Promise<void> => {
    if (!window.confirm(`Delete “${task.name}” and all of its scheduled occurrences?`)) return;
    if (await deleteTask(task.id)) toast.info(`“${task.name}” deleted`);
  };

  return (
    <div className="card bg-base-100 border border-base-content/10 shadow-sm">
      <div className="card-body p-4 gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug flex items-center gap-2 min-w-0">
            <CategoryDot category={category} />
            <span className="truncate" title={task.name}>
              {task.name}
            </span>
          </h3>
          <div className="flex gap-1 shrink-0">
            <button className="btn btn-ghost btn-sm w-11 h-11" onClick={onEdit} aria-label={`Edit ${task.name}`}>
              ✎
            </button>
            <button className="btn btn-ghost btn-sm w-11 h-11" onClick={() => void remove()} aria-label={`Delete ${task.name}`}>
              🗑
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span className="badge badge-ghost border-base-content/10 gap-1">🕒 {task.durationMinutes} min</span>
          <span className={`badge gap-1 border-0 ${CADENCE_BADGE[task.cadence].cls}`}>
            🔁 {CADENCE_BADGE[task.cadence].label}
          </span>
          <span
            className={`badge gap-1 border-0 ${rule && rule.ruleType !== "none" ? "badge-primary" : "badge-warning"}`}
          >
            {freqLabel}
          </span>
          {scheduledTotal > 0 ? (
            <span className="badge badge-ghost border-base-content/10 gap-1">📅 {scheduledTotal}× scheduled</span>
          ) : (
            <span className="badge badge-warning border-0">unscheduled</span>
          )}
        </div>

        {task.notes && (
          <p className="text-xs opacity-60 line-clamp-2" title={task.notes}>
            {task.notes}
          </p>
        )}

        <div className="mt-0.5">
          <AvatarStack users={assigneeUsers} max={5} />
        </div>
      </div>
    </div>
  );
}

