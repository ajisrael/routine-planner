import { useSession } from "../store/session";
import { useTheme } from "../lib/theme";
import { Avatar } from "./Avatar";
import { api } from "../api/client";
import { toast } from "../store/toasts";
import { disconnectRealtime } from "../store/socket";
import { usePlannerStore } from "../store";

export type Tab = "tasks" | "plan" | "view";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "tasks", label: "Tasks", icon: "🗂️" },
  { id: "plan", label: "Plan", icon: "📅" },
  { id: "view", label: "View", icon: "👁️" },
];

/** App shell navbar: brand · Tasks→Plan→View tabs · theme · sync · user menu. */
export function Navbar({
  tab,
  onTab,
  onManagePeople,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  onManagePeople: () => void;
}): React.JSX.Element {
  const user = useSession((s) => s.user);
  const connected = useSession((s) => s.connected);
  const syncPulse = useSession((s) => s.syncPulse);
  const [theme, toggleTheme] = useTheme();
  const setUser = useSession((s) => s.setUser);

  const logout = async (): Promise<void> => {
    try {
      await api.logout();
    } finally {
      disconnectRealtime();
      usePlannerStore.getState().reset();
      setUser(null);
      toast.info("Logged out");
    }
  };

  const syncLabel = connected ? (syncPulse > 0 ? "Live · synced just now" : "Live") : "Reconnecting…";

  return (
    <div className="navbar z-40 shrink-0 bg-base-100 border-b border-base-content/10 px-2 lg:px-4">
      <div className="navbar-start gap-1">
        <div className="w-8 h-8 rounded-lg bg-primary text-primary-content grid place-items-center text-sm shrink-0">
          🗓️
        </div>
        <span className="font-bold hidden sm:inline">Routine&nbsp;Planner</span>
      </div>
      <div className="navbar-center">
        <div role="tablist" className="tabs tabs-box">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab${tab === t.id ? " tab-active" : ""}`}
              onClick={() => onTab(t.id)}
            >
              <span aria-hidden>{t.icon}</span>
              <span className="hidden sm:inline">&nbsp;{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="navbar-end gap-2">
        <button
          className="btn btn-ghost btn-sm btn-square"
          onClick={toggleTheme}
          title="Toggle light / dark (Pastel ↔ Pastel Dusk)"
          aria-label="Toggle theme"
        >
          {theme === "pastel" ? "🌙" : "☀️"}
        </button>
        <div className="hidden md:flex items-center gap-2 text-xs opacity-70" title={syncLabel}>
          <span className="relative flex w-2 h-2">
            {connected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
            )}
            <span
              className={`relative inline-flex rounded-full w-2 h-2 ${connected ? "bg-success" : "bg-warning"}`}
            />
          </span>
          <span>{syncLabel}</span>
        </div>
        {user && (
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-sm gap-2 px-2">
              <Avatar user={user} />
              <span className="hidden sm:inline font-medium">{user.displayName}</span>
              <span className="text-[10px] opacity-50">▾</span>
            </div>
            <ul
              tabIndex={0}
              className="dropdown-content menu bg-base-100 rounded-box border border-base-content/10 shadow-lg w-56 z-50 p-2 text-sm"
            >
              <li className="menu-title">
                <span>
                  {user.displayName} · planning account
                </span>
              </li>
              <li>
                <button onClick={onManagePeople}>👪 Manage people</button>
              </li>
              <li>
                <button onClick={() => void logout()}>↩︎ Log out</button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
