import { useState } from "react";
import type { User } from "@planner/shared";
import { usePlannerStore } from "../../store";
import { Avatar } from "../Avatar";
import { personColor } from "../../lib/colors";

/**
 * User / persona management (REQUIREMENTS.md §7.1, DATA_MODEL.md §3.1):
 * login users log in by name; personas (children) are assignable + filterable
 * only — they are created and renamed here, never via login.
 */
export function UserManager({ onClose }: { onClose: () => void }): React.JSX.Element {
  const users = usePlannerStore((s) => s.users);
  const createPersona = usePlannerStore((s) => s.createPersona);
  const renameUser = usePlannerStore((s) => s.renameUser);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const addPersona = async (): Promise<void> => {
    if (!name.trim()) return;
    if (await createPersona(name.trim())) setName("");
  };

  return (
    <dialog className="modal modal-open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <h3 className="text-lg font-bold">People</h3>
        <p className="text-xs opacity-60 mb-3">
          Adults log in by name. Personas (kids, pets…) are assigned to tasks and filterable — they never
          log in.
        </p>

        <ul className="flex flex-col gap-1 mb-4">
          {users.map((u: User) => (
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
                  <span className="grow font-medium">{u.displayName}</span>
                  <span
                    className={`badge badge-sm border-0 ${u.isLoginUser ? "badge-info" : "badge-ghost"}`}
                    title={u.isLoginUser ? "Logs in by name" : "Assignable persona (never logs in)"}
                  >
                    {u.isLoginUser ? "login" : "persona"}
                  </span>
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
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            className="input input-bordered grow"
            placeholder="New persona's name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addPersona()}
          />
          <button className="btn btn-primary" onClick={() => void addPersona()} disabled={!name.trim()}>
            Add persona
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
