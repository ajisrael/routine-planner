import type { Category, User } from "@planner/shared";
import { Avatar } from "./Avatar";

/** Person filter chip row: Everyone · each user with avatar (DESIGN.md §5.3). */
export function PersonFilterChips({
  users,
  value,
  onChange,
}: {
  users: User[];
  value: number | null;
  onChange: (person: number | null) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by person">
      <button
        className={`btn btn-xs rounded-full${value === null ? " btn-primary" : " btn-ghost"}`}
        onClick={() => onChange(null)}
      >
        Everyone
      </button>
      {users.map((u) => (
        <button
          key={u.id}
          className={`btn btn-xs rounded-full gap-1${value === u.id ? " btn-primary" : " btn-ghost"}`}
          onClick={() => onChange(u.id)}
        >
          <Avatar user={u} size={16} />
          {u.displayName}
        </button>
      ))}
    </div>
  );
}

/** `⚠ N conflicts` badge / green "no conflicts" chip (DESIGN.md §6.1). */
export function ConflictBadge({ count }: { count: number }): React.JSX.Element {
  if (count === 0) {
    return (
      <span className="badge badge-success gap-1 border-0 text-xs">
        <span aria-hidden>✓</span> no conflicts
      </span>
    );
  }
  return (
    <span className="badge badge-error gap-1 text-xs">
      <span aria-hidden>⚠</span> {count} {count === 1 ? "conflict" : "conflicts"}
    </span>
  );
}

/** Small colored category dot. */
export function CategoryDot({ category }: { category: Category | undefined }): React.JSX.Element {
  return (
    <span
      className="dot-ring inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: category?.color ?? "var(--color-base-content)", opacity: category ? 1 : 0.3 }}
      title={category?.name ?? "No category"}
    />
  );
}
