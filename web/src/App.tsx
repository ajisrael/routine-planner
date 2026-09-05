import { useEffect, useState } from "react";
import { api } from "./api/client";
import { Navbar, type Tab } from "./components/Navbar";
import { Welcome } from "./components/Welcome";
import { Toaster } from "./components/Toaster";
import { UserManager } from "./components/users/UserManager";
import TasksView from "./views/TasksView";
import PlanView from "./views/PlanView";
import ViewTab from "./views/ViewTab";
import { useSession } from "./store/session";
import { usePlannerStore } from "./store";
import { connectRealtime } from "./store/socket";

/**
 * App shell (DESIGN.md §4): welcome gate → navbar (Tasks → Plan → View tabs,
 * theme toggle, live-sync indicator, user menu) → tab content + toasts.
 */
export default function App(): React.JSX.Element {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("tasks");
  const [peopleOpen, setPeopleOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        void usePlannerStore.getState().refresh();
        connectRealtime();
      })
      .catch(() => {
        /* not logged in → welcome screen */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (me: Parameters<typeof setUser>[0]): void => {
    setUser(me);
    void usePlannerStore.getState().refresh();
    connectRealtime();
    setTab("tasks");
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-base-200">
        <span className="loading loading-spinner loading-lg text-primary" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Welcome onLogin={handleLogin} />
        <Toaster />
      </>
    );
  }

  return (
    // Fixed-height shell: the navbar and main split the viewport; each tab
    // decides how its own space scrolls. Plan/View fill main exactly (their
    // cards are the "window"), Tasks scrolls naturally.
    <div className="flex h-dvh flex-col overflow-hidden bg-base-200">
      <Navbar tab={tab} onTab={setTab} onManagePeople={() => setPeopleOpen(true)} />
      <main className="flex min-h-0 w-full max-w-[1500px] flex-1 flex-col overflow-y-auto mx-auto p-3 lg:p-5">
        {tab === "tasks" ? <TasksView /> : tab === "plan" ? <PlanView onOpenLibrary={() => setTab("tasks")} /> : <ViewTab />}
      </main>
      {peopleOpen && <UserManager onClose={() => setPeopleOpen(false)} />}
      <Toaster />
    </div>
  );
}
