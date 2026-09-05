import type { User } from "@planner/shared";
import { initial, personColor } from "../lib/colors";

/** 20px colored circle with a white initial (DESIGN.md §3.3). */
export function Avatar({
  user,
  stack = false,
  size = 20,
  title,
}: {
  user: User;
  stack?: boolean;
  size?: number;
  title?: string;
}): React.JSX.Element {
  return (
    <span
      className={`avatar-dot${stack ? " stack" : ""}`}
      style={{ background: personColor(user.id), width: size, height: size, fontSize: size * 0.45 }}
      title={title ?? `${user.displayName}${user.isLoginUser ? "" : " (persona)"}`}
      aria-label={title ?? user.displayName}
    >
      {initial(user.displayName)}
    </span>
  );
}

/** Overlapping avatar stack with a +N tail. */
export function AvatarStack({ users, max = 4 }: { users: User[]; max?: number }): React.JSX.Element {
  if (users.length === 0) {
    return <span className="text-[10px] opacity-50">no assignees</span>;
  }
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((u, i) => (
        <span key={u.id} style={{ marginLeft: i === 0 ? 0 : -6, display: "inline-flex" }}>
          <Avatar user={u} stack={i > 0} />
        </span>
      ))}
      {rest > 0 && <span className="avatar-dot stack bg-base-300">+{rest}</span>}
    </span>
  );
}
