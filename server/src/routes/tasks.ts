import { Router } from "express";

export const tasksRouter = Router();

// Task CRUD + assignee set + recurrence (ARCHITECTURE.md §5.4).
tasksRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

tasksRouter.post("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

tasksRouter.put("/:id", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

tasksRouter.delete("/:id", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

// Replace a task's assignee set (task_assignees).
tasksRouter.put("/:id/assignees", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

// Update the task's recurrence rule → regenerate events in window.
tasksRouter.put("/:id/recurrence", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

// Delete all occurrences of the task (context menu action).
tasksRouter.delete("/:id/events", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});