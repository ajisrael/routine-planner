import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { User } from "@planner/shared";
import { Avatar } from "./Avatar";
import { toast } from "../store/toasts";

/** Split-hero welcome / name login (DESIGN.md §5.1). */
export function Welcome({ onLogin }: { onLogin: (user: User) => void }): React.JSX.Element {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginUsers, setLoginUsers] = useState<User[]>([]);

  useEffect(() => {
    api
      .users()
      .then(setLoginUsers)
      .catch(() => setLoginUsers([]));
  }, []);

  const login = async (value: string): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const user = await api.login(trimmed);
      toast.success(`Welcome, ${user.displayName}!`);
      onLogin(user);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* brand panel */}
      <div
        className="relative bg-primary text-primary-content p-8 lg:p-14 flex flex-col justify-between min-h-[38vh]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 88% 8%, rgba(255,255,255,.10) 0 160px, transparent 161px), radial-gradient(circle at 6% 92%, rgba(255,255,255,.10) 0 104px, transparent 105px)",
        }}
      >
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary-content/15 grid place-items-center text-2xl">🗓️</div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Routine Planner</h1>
              <p className="text-primary-content text-sm">One plan for the whole family</p>
            </div>
          </div>
        </div>
        <div className="relative mt-10 lg:mt-0">
          <h2 className="text-3xl lg:text-4xl font-bold leading-tight mb-3">
            Stop figuring it out
            <br />
            every single day.
          </h2>
          <p className="text-primary-content max-w-md">
            Time-block your family's recurring routines — chores, school runs, practices, dinners — and
            see everyone's week in one shared place.
          </p>
          <div className="flex flex-wrap gap-2 mt-6 text-xs font-medium">
            <span className="badge border-0 bg-primary-content text-primary">Daily · Weekly · Monthly</span>
            <span className="badge border-0 bg-primary-content text-primary">Drag-to-plan calendar</span>
            <span className="badge border-0 bg-primary-content text-primary">Per-person filters</span>
            <span className="badge border-0 bg-primary-content text-primary">Live 2-device sync</span>
          </div>
        </div>
      </div>

      {/* login panel */}
      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-md">
          <div className="card bg-base-100 shadow-sm border border-base-content/10">
            <div className="card-body gap-5">
              <div>
                <h3 className="card-title text-xl">Who's planning? 👋</h3>
                <p className="text-sm opacity-70">
                  Enter your name to log in — no password needed on your home network.
                </p>
              </div>

              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void login(name);
                }}
              >
                <label className="input input-lg w-full items-center gap-2">
                  <span aria-hidden>🧑</span>
                  <input
                    type="text"
                    className="grow"
                    placeholder="Type your name…"
                    autoComplete="off"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Your name"
                  />
                </label>
                <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
                  Enter planner →
                </button>
              </form>

              {loginUsers.length > 0 && (
                <>
                  <div className="flex items-center gap-3 text-xs opacity-70">
                    <div className="divider my-0 flex-1" /> quick login <div className="divider my-0 flex-1" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {loginUsers.map((u) => (
                      <button
                        key={u.id}
                        className="btn btn-outline justify-start gap-2"
                        onClick={() => void login(u.username ?? u.displayName)}
                        disabled={busy}
                      >
                        <Avatar user={u} />
                        {u.displayName}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <p className="text-xs opacity-70 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-success" />
                Running on your local network · anyone who's on a routine logs in by name
              </p>
            </div>
          </div>
          <p className="text-center text-xs opacity-60 mt-4">
            {loginUsers.length === 0
              ? "No planning accounts yet — typing your name creates the first one."
              : "Typing an unknown name creates a new planning account."}
          </p>
        </div>
      </div>
    </div>
  );
}
