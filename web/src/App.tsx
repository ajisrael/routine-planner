import { useState } from "react";
import TasksView from "./views/TasksView";
import CalendarView from "./views/CalendarView";

type Tab = "tasks" | "calendar";

// Top-level shell: Task Library tab + Calendar tab (REQUIREMENTS.md §2.1/§2.2).
export default function App() {
  const [tab, setTab] = useState<Tab>("tasks");

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <h1 className="text-lg font-semibold">Routine Planner</h1>
        <nav className="flex gap-2">
          <button
            className={tab === "tasks" ? "font-semibold" : ""}
            onClick={() => setTab("tasks")}
          >
            Tasks
          </button>
          <button
            className={tab === "calendar" ? "font-semibold" : ""}
            onClick={() => setTab("calendar")}
          >
            Calendar
          </button>
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        {tab === "tasks" ? <TasksView /> : <CalendarView />}
      </main>
    </div>
  );
}