import { useEffect, useMemo, useState } from "react";
import { usePlannerStore } from "../store";
import { toast } from "../store/toasts";
import { nextFreeCategoryColor } from "../lib/colors";
import { PickerAddRow, PickerRow, SelectionDialog } from "./SelectionDialog";

/**
 * "Choose category" dialog for the task form (single-select). Uses the
 * shared SelectionDialog mechanism: search filters, "＋ Add" creates the
 * category immediately (auto color, applied by default) with an ✕ to undo
 * while still in the dialog; Apply commits, Cancel reverts.
 */
export function CategoryPickerDialog({
  open,
  currentId,
  onClose,
}: {
  open: boolean;
  currentId: number | null;
  /** picked id (null = "No category") or undefined for Cancel. */
  onClose: (picked: number | null | undefined) => void;
}): React.JSX.Element | null {
  const categories = usePlannerStore((s) => s.categories);
  const createCategory = usePlannerStore((s) => s.createCategory);
  const deleteCategory = usePlannerStore((s) => s.deleteCategory);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [sessionNew, setSessionNew] = useState<Set<number>>(new Set());
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPicked(currentId);
      setSessionNew(new Set());
      setSearch("");
      setNewName("");
    }
  }, [open, currentId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
    return q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted;
  }, [categories, search]);

  const addNew = async (): Promise<void> => {
    const name = newName.trim();
    if (!name) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.warning(`“${name}” already exists`);
      return;
    }
    setBusy(true);
    const created = await createCategory(name, nextFreeCategoryColor(categories.map((c) => c.color ?? "")));
    setBusy(false);
    if (created) {
      setPicked(created.id); // apply by default
      setSessionNew((s) => new Set(s).add(created.id));
      setNewName("");
    }
  };

  const removeNew = async (id: number): Promise<void> => {
    const cat = categories.find((c) => c.id === id);
    if (!cat || !sessionNew.has(id)) return;
    if (await deleteCategory(id)) {
      setSessionNew((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      if (picked === id) setPicked(null);
    }
  };

  return (
    <SelectionDialog
      open={open}
      title="Choose category"
      count={picked != null ? "1 selected" : "none"}
      search={search}
      onSearchChange={setSearch}
      onCancel={() => onClose(undefined)}
      onApply={() => onClose(picked)}
      addRow={
        <PickerAddRow
          value={newName}
          onChange={setNewName}
          onAdd={() => void addNew()}
          placeholder="New category name…"
          disabled={busy}
        />
      }
      rows={visible.map((c) => (
        <PickerRow
          key={c.id}
          checked={picked === c.id}
          onToggle={(on) => setPicked(on ? c.id : null)}
          color={c.color ?? "var(--color-base-content)"}
          remove={
            sessionNew.has(c.id) ? (
              <>
                <span className="badge badge-xs badge-success border-0 shrink-0">new</span>
                <button
                  type="button"
                  className="ml-auto btn btn-ghost btn-xs shrink-0 hover:text-error"
                  title="Delete (it was just added)"
                  aria-label={`Delete ${c.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void removeNew(c.id);
                  }}
                >
                  ✕
                </button>
              </>
            ) : undefined
          }
        >
          <span className="dot-ring inline-block w-3.5 h-3.5 rounded-full shrink-0" style={{ background: c.color ?? "var(--color-base-content)" }} />
          <span className="text-sm font-medium truncate min-w-0" title={c.name}>
            {c.name}
          </span>
        </PickerRow>
      ))}
      emptyText={visible.length === 0 ? "No matches — add it below." : undefined}
    />
  );
}
