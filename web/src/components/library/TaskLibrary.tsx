import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Task } from "@planner/shared";
import { describeRule } from "@planner/shared";
import { usePlannerStore, assigneesOfTask, ruleForTask, categoryById, eventsOfTask, windowStart } from "../../store";
import { AvatarStack } from "../Avatar";
import { CategoryDot } from "../Chips";
import { addDaysISO } from "../../lib/dates";

/** Compact draggable task row for the Plan rail (DESIGN.md §5.3). */
export function LibraryRail({
  armedTaskId,
  onArm,
  onOpenLibrary,
}: {
  armedTaskId: number | null;
  onArm: (taskId: number | null) => void;
  onOpenLibrary: () => void;
}): React.JSX.Element {
  const tasks = usePlannerStore((s) => s.tasks);
  const categories = usePlannerStore((s) => s.categories);
  const [filter, setFilter] = useState<number | null>(null);

  const active = tasks.filter((t) => t.active);
  const filtered = active.filter((t) => filter == null || t.categoryId === filter);

  return (
    <aside className="card h-full min-h-0 flex-col bg-base-100 border border-base-content/10">
      <div className="card-body flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">Task library</h3>
          <button className="btn btn-ghost btn-xs" onClick={onOpenLibrary}>
            Open →
          </button>
        </div>
        <p className="text-[11px] opacity-60 leading-snug">
          Drag a task onto the calendar — or tap it, then tap a slot (touch-friendly).
        </p>
        <div className="flex flex-wrap gap-1">
          <FilterChip active={filter === null} onClick={() => setFilter(null)} label="All" />
          {categories.map((c) => (
            <FilterChip
              key={c.id}
              active={filter === c.id}
              onClick={() => setFilter(c.id)}
              label={c.name}
              dot={c.color}
            />
          ))}
        </div>
        <div className="lib-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <p className="text-xs opacity-50 p-2">No tasks yet — add some in the Tasks tab.</p>
          )}
          {filtered.map((t) => (
            <RailRow key={t.id} task={t} armed={armedTaskId === t.id} onArm={onArm} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dot?: string | null;
}): React.JSX.Element {
  return (
    <button className={`btn btn-xs rounded-full${active ? " btn-primary" : " btn-ghost"}`} onClick={onClick}>
      {dot != null && <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} />}
      {label}
    </button>
  );
}

function RailRow({
  task,
  armed,
  onArm,
}: {
  task: Task;
  armed: boolean;
  onArm: (taskId: number | null) => void;
}): React.JSX.Element {
  const category = categoryById(task.categoryId);
  const rule = ruleForTask(task.id);
  const assigneeUsers = assigneesOfTask(task.id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib-${task.id}`,
    data: { type: "library-task", taskId: task.id },
  });

  const freqLabel = rule
    ? describeRule(rule)
    : "One-off";

  return (
    <div
      ref={setNodeRef}
      className={`lib-row flex items-center gap-2 rounded-xl border border-base-content/5 px-2 py-1.5 text-sm cursor-grab active:cursor-grabbing ${
        armed ? " armed" : ""
      }${isDragging ? " opacity-40" : ""}`}
      onClick={() => onArm(armed ? null : task.id)}
      {...listeners}
      {...attributes}
      role="button"
      aria-pressed={armed}
      aria-label={`Arm ${task.name} for placement`}
      title="Drag onto the calendar, or tap to arm"
    >
      <span className="opacity-40 select-none" aria-hidden>
        ⠿
      </span>
      <CategoryDot category={category} />
      <span className="grow truncate font-medium" title={task.name}>
        {task.name}
      </span>
      <span className="text-[10px] opacity-60 whitespace-nowrap">
        🕒 {task.durationMinutes}m · 🔁 {freqLabel}
      </span>
      <AvatarStack users={assigneeUsers} max={2} />
    </div>
  );
}

/** "N× this week" count used by the Tasks tab cards. */
export function occurrencesThisWeek(taskId: number): number {
  const events = eventsOfTask(taskId);
  const start = windowStart();
  const end = addDaysISO(start, 6);
  return events.filter((e) => e.eventDate >= start && e.eventDate <= end).length;
}
