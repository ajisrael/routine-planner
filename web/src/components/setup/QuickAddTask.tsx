import { useState } from "react";
import type { TaskCadence } from "@planner/shared";
import { usePlannerStore } from "../../store";
import { CategoryPickerDialog } from "../CategoryPickerDialog";
import { AssigneePickerDialog } from "../AssigneePickerDialog";
import { AvatarStack } from "../Avatar";
import { toast } from "../../store/toasts";

const CADENCE_LABEL: Record<Exclude<TaskCadence, "custom">, string> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
};

/** Slim "add a {cadence} task" form for the setup stages. */
export function QuickAddTask({ cadence }: { cadence: Exclude<TaskCadence, "custom"> }): React.JSX.Element {
  const store = usePlannerStore();
  const users = usePlannerStore((s) => s.users);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(30);
  const [assignees, setAssignees] = useState<Set<number>>(new Set());
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await store.createTask({
        name: trimmed,
        durationMinutes: duration,
        notes: notes.trim() || null,
        categoryId,
        assigneeIds: [...assignees],
        cadence,
      });
      toast.success(`“${trimmed}” is part of your ${CADENCE_LABEL[cadence]} routine`);
      setName("");
      setNotes("");
      setAssignees(new Set());
      setCategoryId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the task");
    } finally {
      setBusy(false);
    }
  };

  const step = (d: -6 | 6): void => setDuration((v) => Math.max(5, Math.min(180, v + d)));

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-base-content/10 bg-base-200/40 p-2">
      <label className="text-[11px] font-bold uppercase tracking-wide opacity-70">Add a {CADENCE_LABEL[cadence]} task</label>
      <input
        className="input input-sm input-bordered"
        placeholder="Task name (e.g. Walk the dog)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        aria-label="Task name"
      />
      <div className="flex items-center gap-2">
        <div className="join">
          <button className="join-item btn btn-xs" onClick={() => step(-6)} aria-label="Shorter">
            −
          </button>
          <span className="join-item flex items-center px-2 text-xs">🕒 {duration}m</span>
          <button className="join-item btn btn-xs" onClick={() => step(6)} aria-label="Longer">
            +
          </button>
        </div>
        <div className="grow" />
        <button className="btn btn-xs btn-ghost" onClick={() => setCategoryOpen(true)}>
          {categoryId != null ? "Category ✓" : "Category"}
        </button>
        <button className="btn btn-xs btn-ghost" onClick={() => setAssigneeOpen(true)}>
          {assignees.size > 0 ? (
            <AvatarStack users={users.filter((u) => assignees.has(u.id))} max={2} />
          ) : (
            "Who"
          )}
        </button>
      </div>
      <button className="btn btn-sm btn-primary" onClick={() => void submit()} disabled={!name.trim() || busy}>
        + Add task
      </button>
      {categoryOpen && (
        <CategoryPickerDialog
          open={categoryOpen}
          currentId={categoryId}
          onClose={(picked) => {
            setCategoryOpen(false);
            if (picked !== undefined) setCategoryId(picked);
          }}
        />
      )}
      {assigneeOpen && (
        <AssigneePickerDialog
          open={assigneeOpen}
          currentUserIds={[...assignees]}
          onClose={(picked) => {
            setAssigneeOpen(false);
            if (picked !== undefined) setAssignees(new Set(picked));
          }}
        />
      )}
    </div>
  );
}