import { useEffect, useMemo, useState } from "react";
import { usePlannerStore } from "../store";
import { toast } from "../store/toasts";
import { Avatar } from "./Avatar";
import { personColor } from "../lib/colors";
import { PickerAddRow, PickerRow, SelectionDialog } from "./SelectionDialog";

/**
 * "Pick assignees" dialog for the task form (multi-select — tasks can have
 * several responsible people; shared assignees drive conflict warnings).
 * Same mechanism as the category picker: search, "＋ Add" creates a persona
 * immediately (applied by default) with an ✕ to undo in-dialog; Apply
 * commits, Cancel reverts.
 */
export function AssigneePickerDialog({
  open,
  currentUserIds,
  onClose,
}: {
  open: boolean;
  currentUserIds: number[];
  /** picked user ids or undefined for Cancel. */
  onClose: (picked: number[] | undefined) => void;
}): React.JSX.Element | null {
  const users = usePlannerStore((s) => s.users);
  const createPersona = usePlannerStore((s) => s.createPersona);
  const deletePersona = usePlannerStore((s) => s.deletePersona);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [sessionNew, setSessionNew] = useState<Set<number>>(new Set());
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPicked(new Set(currentUserIds));
      setSessionNew(new Set());
      setSearch("");
      setNewName("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...users].sort((a, b) => a.displayName.localeCompare(b.displayName));
    return q ? sorted.filter((u) => u.displayName.toLowerCase().includes(q)) : sorted;
  }, [users, search]);

  const toggle = (id: number, on: boolean): void =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const addNew = async (): Promise<void> => {
    const name = newName.trim();
    if (!name) return;
    if (users.some((u) => u.displayName.toLowerCase() === name.toLowerCase())) {
      toast.warning(`“${name}” already exists`);
      return;
    }
    setBusy(true);
    const created = await createPersona(name);
    setBusy(false);
    if (created) {
      setPicked((s) => new Set(s).add(created.id)); // apply by default
      setSessionNew((s) => new Set(s).add(created.id));
      setNewName("");
    }
  };

  const removeNew = async (id: number): Promise<void> => {
    const user = users.find((u) => u.id === id);
    if (!user || !sessionNew.has(id)) return;
    if (await deletePersona(id)) {
      setSessionNew((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      toggle(id, false);
    }
  };

  return (
    <SelectionDialog
      open={open}
      title="Pick assignees"
      count={`${picked.size} ${picked.size === 1 ? "selected" : "selected"}`}
      search={search}
      onSearchChange={setSearch}
      onCancel={() => onClose(undefined)}
      onApply={() => onClose([...picked])}
      addRow={
        <PickerAddRow
          value={newName}
          onChange={setNewName}
          onAdd={() => void addNew()}
          placeholder="New persona's name…"
          disabled={busy}
        />
      }
      rows={visible.map((u) => (
        <PickerRow
          key={u.id}
          checked={picked.has(u.id)}
          onToggle={(on) => toggle(u.id, on)}
          color={personColor(u.id)}
          remove={
            sessionNew.has(u.id) ? (
              <>
                <span className="badge badge-xs badge-ghost shrink-0">persona</span>
                <button
                  type="button"
                  className="ml-auto btn btn-ghost btn-xs shrink-0 hover:text-error"
                  title="Delete (it was just added)"
                  aria-label={`Delete ${u.displayName}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void removeNew(u.id);
                  }}
                >
                  ✕
                </button>
              </>
            ) : undefined
          }
        >
          <Avatar user={u} />
          <span className="text-sm font-medium truncate min-w-0" title={u.displayName}>
            {u.displayName}
          </span>
          {!sessionNew.has(u.id) && !u.isLoginUser && <span className="badge badge-xs badge-ghost shrink-0">persona</span>}
        </PickerRow>
      ))}
      emptyText={visible.length === 0 ? "No matches — add a persona below." : undefined}
    />
  );
}
