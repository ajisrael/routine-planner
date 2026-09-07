import { useState } from "react";
import type { User } from "@planner/shared";
import { usePlannerStore } from "../../store";
import { useSession } from "../../store/session";
import { Avatar } from "../Avatar";
import { personColor } from "../../lib/colors";

/**
 * People management (REQUIREMENTS.md §7.1): every user is a login account.
 * Anyone can add a person, rename them, or delete them - except themselves
 * (the deleting account's session would dangle).
 */
export function UserManager({ onClose }: { onClose: () => void }): React.JSX.Element {
  const users = usePlannerStore((s) => s.users);
  const createUser = usePlannerStore((s) => s.createUser);
  const renameUser = usePlannerStore((s) => s.renameUser);
  const deleteUser = usePlannerStore((s) => s.deleteUser);
  const me = useSession((s) => s.user);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const addUser = async (): Promise<void> => {
    if (!username.trim()) return;
    await createUser(username.trim(), displayName.trim() || undefined);
    setUsername("");
    setDisplayName("");
  };

  return (
    <dialog className="modal modal-open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <h3 className="text-lg font-bold">People</h3>
        <p className="text-xs opacity-60 mb-3">
          Everyone here can log in by name on any device. Accounts you add get you started with the
          routine; you can't delete the account you're currently using.
        </p>

        <ul className="flex flex-col gap-1 mb-4">
          {users.map((u: User) => {
            const isMe = u.id === me?.id;
            return (
              <li key={u.id} className="flex items-center gap-2 rounded-xl bg-base-200 px-3 py-2">
                <Avatar user={u} />
                {editing === u.id ? (
                  <>
                    <input
                      className="input input-sm input-bordered grow"
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void renameUser(u.id, editName.trim() || u.displayName);
                          setEditing(null);
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        void renameUser(u.id, editName.trim() || u.displayName);
                        setEditing(null);
                      }}
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <div className="grow leading-tight">
                      <div className="font-medium">{u.displayName}</div>
                      <div className="text-[10px] opacity-50">@{u.username}</div>
                    </div>
                    <span className="w-3 h-3 rounded-full" style={{ background: personColor(u.id) }} title="Avatar color" />
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        setEditing(u.id);
                        setEditName(u.displayName);
                      }}
                      aria-label={`Rename ${u.displayName}`}
                    >
                      ✎
                    </button>
                    <button
                      className="btn btn-ghost btn-xs hover:text-error"
                      onClick={() => void deleteUser(u.id)}
                      disabled={isMe}
                      title={isMe ? "You can't delete your own account" : `Delete ${u.displayName}`}
                      aria-label={`Delete ${u.displayName}`}
                    >
                      ✕
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex gap-2">
          <input
            className="input input-bordered grow"
            placeholder="Login name (e.g. Levi)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addUser()}
            aria-label="Login name"
          />
          <input
            className="input input-bordered grow"
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addUser()}
            aria-label="Display name"
          />
          <button className="btn btn-primary" onClick={() => void addUser()} disabled={!username.trim()}>
            Add
          </button>
        </div>

        <div className="modal-action">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}