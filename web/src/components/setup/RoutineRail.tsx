import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { Task } from "@planner/shared";
import { categoryById, assigneesOfTask } from "../../store";
import { AvatarStack } from "../Avatar";
import { CategoryDot } from "../Chips";
import { isPlaced } from "../../lib/wizard/status";

/** Draggable task list for a setup arrange step.
 * Rows can be armed (tap-to-place) and, when `removeZone`, are also drop
 * targets that remove the dragged occurrence's weekday from the pattern.
 */
export function RoutineRail({
  title,
  caption,
  tasks,
  armedTaskId,
  onArm,
  removeZone = false,
  emptyHint,
}: {
  title: string;
  caption: string;
  tasks: Task[];
  armedTaskId: number | null;
  onArm: (taskId: number | null) => void;
  removeZone?: boolean;
  emptyHint: string;
}): React.JSX.Element {
  return (
    <aside className="card min-h-0 flex-1 flex-col overflow-hidden bg-base-100 border border-base-content/10 lg:min-w-0">
      <div className="card-body flex min-h-0 flex-1 flex-col gap-2 p-3">
        <h3 className="font-bold text-sm">{title}</h3>
        <p className="text-[11px] opacity-60 leading-snug">{caption}</p>
        <div className="lib-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {tasks.length === 0 && <p className="text-xs opacity-50 p-2">{emptyHint}</p>}
          {tasks.map((t) => (
            <RailRow
              key={t.id}
              task={t}
              armed={armedTaskId === t.id}
              onArm={onArm}
              removeZone={removeZone}
            />
          ))}
        </div>
        {removeZone && (
          <p className="text-[10px] opacity-50">To drop a weekday, drag its block onto its row here.</p>
        )}
      </div>
    </aside>
  );
}

function RailRow({
  task,
  armed,
  onArm,
  removeZone,
}: {
  task: Task;
  armed: boolean;
  onArm: (taskId: number | null) => void;
  removeZone: boolean;
}): React.JSX.Element {
  const category = categoryById(task.categoryId);
  const assignees = assigneesOfTask(task.id);
  const placed = isPlaced(task.id);
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

  return (
    <div
      ref={mergedRef}
      className={`lib-row flex items-center gap-2 rounded-xl border border-base-content/5 px-2 py-1.5 text-sm cursor-grab active:cursor-grabbing ${
        armed ? " armed" : ""
      }${isDragging ? " opacity-40" : ""}${isOver ? " remove-zone" : ""}`}
      onClick={() => onArm(armed ? null : task.id)}
      {...listeners}
      {...attributes}
      role="button"
      aria-pressed={armed}
      aria-label={`Arm ${task.name} for placement`}
      title={removeZone ? "Drag onto the calendar. Drop a placed block here to remove its weekday." : "Drag onto the calendar, or tap to arm"}
    >
      <CategoryDot category={category} />
      <span className="grow truncate font-medium" title={task.name}>
        {task.name}
      </span>
      <span className={`text-[10px] whitespace-nowrap ${placed ? "opacity-80" : "opacity-50"}`}>
        {placed ? "● placed" : "○ unscheduled"} · 🕒 {task.durationMinutes}m
      </span>
      <AvatarStack users={assignees} max={1} />
    </div>
  );
}