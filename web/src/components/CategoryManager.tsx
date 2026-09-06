import { useMemo, useState } from "react";
import { usePlannerStore } from "../store";
import { toast } from "../store/toasts";
import { nextFreeCategoryColor } from "../lib/colors";

/**
 * Category manager, opened from the Tasks tab (reviewed in
 * .lavish/category-management.html): add categories with a color, edit any
 * category's color, delete any category — tasks using a deleted one fall
 * back to "No category" (schema ON DELETE SET NULL).
 */
export function CategoryManager({ onClose }: { onClose: () => void }): React.JSX.Element {
  const categories = usePlannerStore((s) => s.categories);
  const tasks = usePlannerStore((s) => s.tasks);
  const createCategory = usePlannerStore((s) => s.createCategory);
  const updateCategory = usePlannerStore((s) => s.updateCategory);
  const deleteCategory = usePlannerStore((s) => s.deleteCategory);
  const [name, setName] = useState("");
  const [color, setColor] = useState(() => nextFreeCategoryColor(categories.map((c) => c.color ?? "")));
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => [...categories].sort((a, b) => a.name.localeCompare(b.name)), [categories]);
  const usageOf = (id: number): number => tasks.filter((t) => t.categoryId === id).length;

  const add = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.warning(`“${trimmed}” already exists`);
      return;
    }
    setBusy(true);
    const created = await createCategory(trimmed, color);
    setBusy(false);
    if (created) {
      setName("");
      setColor(nextFreeCategoryColor([...categories.map((c) => c.color ?? ""), color]));
    }
  };

  const recolor = async (id: number, next: string): Promise<void> => {
    await updateCategory(id, undefined, next);
  };

  const remove = async (id: number): Promise<void> => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const used = usageOf(id);
    if (
      !(await (async () => {
        if (used === 0) return window.confirm(`Delete category “${cat.name}”?`);
        return window.confirm(
          `Delete category “${cat.name}”? ${used} ${used === 1 ? "task uses" : "tasks use"} it and will fall back to “No category”.`,
        );
      })())
    ) {
      return;
    }
    if (await deleteCategory(id)) toast.info(`Deleted “${cat.name}”`);
  };

  return (
    <dialog className="modal modal-open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-sm p-4 flex flex-col gap-3">
        <h3 className="text-base font-bold">Manage categories</h3>
        <p className="text-xs opacity-60 -mt-1">
          Categories color the calendar and filter the library. Deleting one never deletes tasks — they fall
          back to “No category”.
        </p>

        <div className="flex flex-col gap-0.5 min-h-16 max-h-72 overflow-y-auto">
          {sorted.map((c) => {
            const used = usageOf(c.id);
            return (
              <div
                key={c.id}
                className="cat-row flex items-center gap-2.5 rounded-lg px-2.5 py-1.5"
                style={{ ["--row-color" as string]: c.color ?? "var(--color-base-content)" } as React.CSSProperties}
              >
                <input
                  type="color"
                  className="swatch"
                  value={c.color ?? "#808080"}
                  onChange={(e) => void recolor(c.id, e.target.value)}
                  title={`${c.name} color`}
                  aria-label={`${c.name} color`}
                />
                <span className="text-sm font-medium truncate min-w-0" title={c.name}>
                  {c.name}
                </span>
                <span className="badge badge-ghost badge-xs border-base-content/10 shrink-0">
                  {used} {used === 1 ? "task" : "tasks"}
                </span>
                <button
                  type="button"
                  className="ml-auto btn btn-ghost btn-xs shrink-0 hover:text-error"
                  onClick={() => void remove(c.id)}
                  aria-label={`Delete ${c.name}`}
                  title="Delete category"
                >
                  🗑
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 items-center border-t border-base-content/10 pt-2">
          <input
            type="color"
            className="swatch"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Color for the new category"
            aria-label="Color for the new category"
          />
          <input
            type="text"
            className="input input-sm grow"
            placeholder="New category name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
          />
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void add()} disabled={busy || !name.trim()}>
            ＋ Add
          </button>
        </div>

        <div className="flex justify-end">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
