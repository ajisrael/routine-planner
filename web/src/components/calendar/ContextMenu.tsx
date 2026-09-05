import { useEffect } from "react";
import type { ScheduledEvent } from "@planner/shared";
import { fmtTime } from "../../lib/dates";

export interface ContextMenuState {
  event: ScheduledEvent;
  x: number;
  y: number;
}

interface Props {
  state: ContextMenuState | null;
  onClose: () => void;
  onEdit: (event: ScheduledEvent) => void;
  onSync: (event: ScheduledEvent, scope: "all" | "future") => Promise<void> | void;
  onDeleteOne: (event: ScheduledEvent) => Promise<void> | void;
  onDeleteAll: (event: ScheduledEvent) => Promise<void> | void;
}

/**
 * Occurrence context menu (right-click / long-press): edit, sync time to
 * all / future, delete this occurrence, delete all occurrences
 * (DATA_MODEL.md §5.5–5.6).
 */
export function ContextMenu({ state, onClose, onEdit, onSync, onDeleteOne, onDeleteAll }: Props): React.JSX.Element | null {
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  if (!state) return null;
  const { event, x, y } = state;

  const item =
    "w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-base-200 transition-colors whitespace-nowrap";

  return (
    <div
      className="fixed inset-0 z-[60]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
      role="presentation"
    >
      <div
        className="absolute card bg-base-100 border border-base-content/10 shadow-xl p-1.5 w-60"
        style={{ left: Math.min(x, window.innerWidth - 260), top: Math.min(y, window.innerHeight - 240) }}
        role="menu"
        aria-label="Occurrence actions"
      >
        <div className="px-3 py-1.5 text-[11px] opacity-50 truncate">
          {fmtTime(event.startMinute)} · {event.eventDate}
        </div>
        <button className={item} onClick={() => onEdit(event)} role="menuitem">
          ✎ Edit task…
        </button>
        <button className={item} onClick={() => void onSync(event, "all")} role="menuitem">
          ⤒ Sync time to all
        </button>
        <button className={item} onClick={() => void onSync(event, "future")} role="menuitem">
          ⤒ Sync time to future
        </button>
        <div className="divider my-1" />
        <button
          className={`${item} text-warning-content`}
          onClick={() => void onDeleteOne(event)}
          role="menuitem"
        >
          🗑 Delete this occurrence
        </button>
        <button className={`${item} text-error`} onClick={() => void onDeleteAll(event)} role="menuitem">
          🗑 Delete all occurrences
        </button>
      </div>
    </div>
  );
}
