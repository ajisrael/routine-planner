import type { ReactNode } from "react";

/**
 * Shared picker-dialog chrome used by the category and assignee pickers
 * (reviewed in .lavish/category-management.html): header with selection
 * count, search input, scrollable checkbox rows, optional "＋ Add" row,
 * Cancel/Apply footer. Selection state lives in each picker; this shell
 * standardizes the interface and mechanism.
 */
export function SelectionDialog({
  open,
  title,
  count,
  search,
  onSearchChange,
  rows,
  emptyText,
  addRow,
  onCancel,
  onApply,
}: {
  open: boolean;
  title: string;
  count: string;
  search: string;
  onSearchChange: (v: string) => void;
  rows: ReactNode;
  emptyText?: string;
  addRow?: ReactNode;
  onCancel: () => void;
  onApply: () => void;
}): React.JSX.Element | null {
  if (!open) return null;
  return (
    <dialog className="modal modal-open" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-box max-w-sm p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold">{title}</h3>
          <span className="text-[10px] opacity-40 whitespace-nowrap shrink-0">{count}</span>
        </div>

        <input
          type="text"
          className="input input-sm w-full"
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          autoFocus
        />

        <div className="flex flex-col gap-0.5 min-h-16 max-h-64 overflow-y-auto">
          {rows}
          {emptyText != null && <p className="text-xs opacity-50 p-2">{emptyText}</p>}
        </div>

        {addRow != null && <div className="flex gap-2 items-center border-t border-base-content/10 pt-2">{addRow}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onApply}>
            Apply
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** One checkbox row: leading checkbox + content + optional remove button. */
export function PickerRow({
  checked,
  onToggle,
  color,
  children,
  remove,
}: {
  checked: boolean;
  onToggle: (on: boolean) => void;
  /** Highlight tint color (dot color / person color). */
  color: string;
  children: ReactNode;
  /** Rendered when set — the ✕ "remove this new entry" affordance. */
  remove?: ReactNode;
}): React.JSX.Element {
  return (
    <label
      className={`cat-row flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 cursor-pointer${checked ? " checked" : ""}`}
      style={{ ["--row-color" as string]: color } as React.CSSProperties}
    >
      <input
        type="checkbox"
        className="checkbox checkbox-sm checkbox-primary"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
      {children}
      {remove}
    </label>
  );
}

/** Standard "＋ Add" input row for creating a new pickable entity. */
export function PickerAddRow({
  value,
  onChange,
  onAdd,
  placeholder = "New name…",
  disabled,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  placeholder?: string;
  disabled?: boolean;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <>
      {children}
      <input
        type="text"
        className="input input-sm grow"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onAdd()}
      />
      <button type="button" className="btn btn-sm btn-primary shrink-0" onClick={onAdd} disabled={disabled}>
        ＋ Add
      </button>
    </>
  );
}
