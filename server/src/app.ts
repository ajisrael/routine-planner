import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { categoriesRouter } from "./routes/categories.js";
import { tasksRouter } from "./routes/tasks.js";
import { eventsRouter } from "./routes/events.js";

export function createApp(): express.Express {
  const app = express();

  app.use(cookieParser());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/events", eventsRouter);

  // Serve the built frontend in production. Set STATIC_DIR to the web dist
  // folder; the SPA fallback returns index.html for non-API routes.
  const staticDir = process.env.STATIC_DIR ?? path.resolve(import.meta.dirname, "../../../web/dist");
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return app;
}