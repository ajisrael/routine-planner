import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { Task, TaskCadence } from "@planner/shared";
import { describeRule } from "@planner/shared";
import { usePlannerStore, assigneesOfTask, ruleForTask, categoryById, eventsOfTask } from "../../store";
import { AvatarStack } from "../Avatar";
import { CategoryDot } from "../Chips";
import { isPlaced } from "../../lib/wizard/status";

/** Compact draggable task row list for the Plan rail (DESIGN.md §5.3).
 * In setup scopes it filters to one cadence and its "+ Add task" button opens
 * the shared TaskForm dialog; for weekly, rows double as drop-to-remove
 * weekday zones. */
export function LibraryRail({
  armedTaskId,
  onArm,
  onOpenLibrary,
  onAdd,
  onEditTask,
  cadenceFilter = null,
  removeZone = false,
  placedBadge = false,
  title = "Task library",
  caption,
}: {
  armedTaskId: number | null;
  onArm: (taskId: number | null) => void;
  onOpenLibrary?: () => void;
  onAdd?: () => void;
  onEditTask?: (taskId: number) => void;
  cadenceFilter?: TaskCadence | null;
  removeZone?: boolean;
  placedBadge?: boolean;
  title?: string;
  caption?: string;
}): React.JSX.Element {
  const tasks = usePlannerStore((s) => s.tasks);
  const categories = usePlannerStore((s) => s.categories);
  const [filter, setFilter] = useState<number | null>(null);

  const active = tasks.filter((t) => t.active);
  const filtered = active.filter((t) => cadenceFilter == null || t.cadence === cadenceFilter);
  const scoped = filtered.filter((t) => filter == null || t.categoryId === filter);

  return (
    <aside className="card h-full max-h-[45vh] min-h-0 flex-col lg:max-h-none bg-base-100 border border-base-content/10">
      <div className="card-body flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-sm">{title}</h3>
          <div className="flex items-center gap-1">
            {onAdd && (
              <button className="btn btn-primary btn-xs" onClick={onAdd}>
                + Add task
              </button>
            )}
            {onOpenLibrary && (
              <button className="btn btn-ghost btn-xs" onClick={onOpenLibrary}>
                Open →
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] opacity-60 leading-snug">
          {caption ?? "Drag a task onto the calendar — or tap it, then tap a slot (touch-friendly)."}
        </p>
        {categories.length > 0 && (
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
        )}
        <div className="lib-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {scoped.length === 0 && (
            <p className="text-xs opacity-50 p-2">
              {cadenceFilter == null
                ? "No tasks yet — add some in the Tasks tab."
                : "Nothing here yet - add one above, then drag it onto the calendar."}
            </p>
          )}
          {scoped.map((t) => (
            <RailRow
              key={t.id}
              task={t}
              armed={armedTaskId === t.id}
              onArm={onArm}
              onEdit={onEditTask ? () => onEditTask(t.id) : undefined}
              removeZone={removeZone}
              placedBadge={placedBadge}
            />
          ))}
        </div>
        {removeZone && (
          <p className="text-[10px] opacity-70">To drop a weekday, drag its block onto its row here.</p>
        )}
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
    <button className={`btn btn-sm rounded-full h-11${active ? " btn-primary" : " btn-ghost"}`} onClick={onClick}>
      {dot != null && <span className="dot-ring inline-block w-2 h-2 rounded-full" style={{ background: dot }} />}
      {label}
    </button>
  );
}

function RailRow({
  task,
  armed,
  onArm,
  onEdit,
  removeZone,
  placedBadge,
}: {
  task: Task;
  armed: boolean;
  onArm: (taskId: number | null) => void;
  onEdit?: () => void;
  removeZone: boolean;
  placedBadge: boolean;
}): React.JSX.Element {
  const category = categoryById(task.categoryId);
  const rule = ruleForTask(task.id);
  const assigneeUsers = assigneesOfTask(task.id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib-${task.id}`,
    data: { type: "library-task", taskId: task.id },
  });
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `rail-${task.id}`,
    data: { type: "rail-task", taskId: task.id },
    disabled: !removeZone,
  });
  const mergedRef = (node: HTMLElement | null): void => {
    setNodeRef(node);
    setDropRef(node);
  };

  const placed = placedBadge && isPlaced(task.id);
  const freqLabel = placedBadge ? (placed ? "● placed" : "○ unscheduled") : rule ? describeRule(rule) : "One-off";

  return (
    <div
      ref={mergedRef}
      className={`lib-row flex items-center gap-2 rounded-xl border border-base-content/5 px-2 py-1.5 text-sm h-11 cursor-grab active:cursor-grabbing ${
        armed ? " armed" : ""
      }${isDragging ? " opacity-40" : ""}${isOver ? " remove-zone" : ""}`}
      onClick={() => onArm(armed ? null : task.id)}
      {...listeners}
      {...attributes}
      role="button"
      aria-pressed={armed}
      aria-label={`Arm ${task.name} for placement`}
      title={
        removeZone
          ? "Drag onto the calendar. Drop a placed block here to remove its weekday."
          : "Drag onto the calendar, or tap to arm"
      }
    >
      {!placedBadge && <span className="opacity-40 select-none" aria-hidden>⠿</span>}
      <CategoryDot category={category} />
      <span className="grow truncate font-medium" title={task.name}>
        {task.name}
      </span>
      <span className={`text-[10px] opacity-60 whitespace-nowrap ${placed ? "opacity-80" : ""}`}>
        {placedBadge ? "" : "🔁 "}{freqLabel} · 🕒 {task.durationMinutes}m
      </span>
      <AvatarStack users={assigneeUsers} max={2} />
      {onEdit && (
        <button
          className="btn btn-ghost btn-xs btn-square shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`Edit ${task.name}`}
          title="Edit task"
        >
          ✎
        </button>
      )}
    </div>
  );
}

/** Total occurrences of the task across the template. */
export function scheduledOccurrenceCount(taskId: number): number {
  return eventsOfTask(taskId).length;
}
