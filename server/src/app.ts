import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import { db } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { categoriesRouter } from "./routes/categories.js";
import { tasksRouter } from "./routes/tasks.js";
import { eventsRouter } from "./routes/events.js";
import { buildSnapshot } from "./services/rows.js";

export function createApp(): express.Express {
  const app = express();

  app.use(cookieParser());
  app.use(express.json());

  // Liveness + DB writable check (ARCHITECTURE.md §3.3): BEGIN IMMEDIATE
  // briefly takes the write lock — fails if the DB is not writable.
  app.get("/api/health", (_req, res) => {
    try {
      db.prepare("SELECT 1").get();
      db.exec("BEGIN IMMEDIATE; COMMIT");
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false, error: "database not writable" });
    }
  });

  app.get("/api/snapshot", (_req, res) => {
    res.json(buildSnapshot());
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/events", eventsRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "unknown API route" });
  });

  // Serve the built frontend in production. Set STATIC_DIR to the web dist
  // folder; the SPA fallback returns index.html for non-API routes.
  // (server/src and server/dist both sit two levels below the repo root.)
  const staticDir = process.env.STATIC_DIR ?? path.resolve(import.meta.dirname, "../../web/dist");
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return app;
}
