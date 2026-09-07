import { useState } from "react";
import { usePlannerStore } from "../../store";
import { useSession } from "../../store/session";
import { Avatar } from "../Avatar";
import { personColor } from "../../lib/colors";

/**
 * Setup step 1: the people on the routine. Every user is a login account;
 * anyone can be added, renamed, or deleted - except the account in use.
 */
export function PeopleStage(): React.JSX.Element {
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
    <div className="mx-auto grid w-full max-w-xl grid-rows-[minmax(0,1fr)_auto] gap-4">
      <div className="card min-h-0 bg-base-100 border border-base-content/10">
        <div className="card-body gap-3 p-4">
          <h3 className="text-sm font-bold">Who is on the routine?</h3>
          <p className="text-xs opacity-60 leading-snug">
            Anyone you add can log in by name on any device and gets their own colored avatar. You
            can't delete the account you're currently using.
          </p>
          <ul className="lib-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            <li className="text-[11px] font-bold uppercase tracking-wide opacity-50 px-1">You · {users.length} total</li>
            {users.map((u) => {
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
                        <div className="text-[10px] opacity-50">@{u.username}
                          {isMe && <span className="ml-1 opacity-60">· you</span>}
                        </div>
                      </div>
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ background: personColor(u.id) }}
                        title="Avatar color"
                      />
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
        </div>
      </div>
      <div className="card bg-base-100 border border-base-content/10">
        <div className="card-body flex-row gap-2 p-2">
          <input
            className="input input-sm input-bordered grow"
            placeholder="Login name (e.g. Levi)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addUser()}
            aria-label="Login name"
          />
          <input
            className="input input-sm input-bordered grow"
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addUser()}
            aria-label="Display name"
          />
          <button className="btn btn-primary btn-sm" onClick={() => void addUser()} disabled={!username.trim()}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}