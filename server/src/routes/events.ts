import { Router } from "express";

export const eventsRouter = Router();

// Scheduled occurrences (ARCHITECTURE.md §5.4).
eventsRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

// Create one event (drag from library / one-off).
eventsRouter.post("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

// Move / resize one occurrence.
eventsRouter.put("/:id", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

// Delete one occurrence.
eventsRouter.delete("/:id", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

// Sync this occurrence's time/duration to siblings.
// Body: { scope: 'all' | 'future' }
eventsRouter.post("/:id/sync", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});