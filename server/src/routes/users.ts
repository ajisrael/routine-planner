import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db.js";
import { broadcaster, assigneeKey } from "../services/broadcaster.js";
import { mapUser } from "../services/rows.js";

export const usersRouter = Router();

// Users + personas. Login users are created via /api/auth/login; personas
// (is_login_user=0) are created here. (DATA_MODEL.md §3.1)
usersRouter.get("/", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY id").all() as Array<Record<string, unknown>>;
  res.json(rows.map(mapUser));
});

// Create a persona (never a login user).
usersRouter.post("/", (req: Request, res: Response) => {
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
  if (!displayName || displayName.length > 40) {
    res.status(400).json({ error: "displayName required (1–40 chars)" });
    return;
  }
  const info = db
    .prepare("INSERT INTO users (username, display_name, is_login_user) VALUES (NULL, ?, 0)")
    .run(displayName);
  const user = mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid) as Record<
    string,
    unknown
  >);
  broadcaster.upsert("users", user.id, user);
  res.status(201).json(user);
});

// Rename a user or persona.
usersRouter.put("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  if (!displayName || displayName.length > 40) {
    res.status(400).json({ error: "displayName required (1–40 chars)" });
    return;
  }
  db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, id);
  const user = mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown>);
  broadcaster.upsert("users", user.id, user);
  res.json(user);
});

// Delete a persona (login users can never be deleted). Assignments cascade.
usersRouter.delete("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  if (row.is_login_user === 1) {
    res.status(400).json({ error: "login users cannot be deleted — personas only" });
    return;
  }
  const pairs = db.prepare("SELECT task_id, user_id FROM task_assignees WHERE user_id = ?").all(id) as Array<{
    task_id: number;
    user_id: number;
  }>;
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  broadcaster.emitBatch([
    ...pairs.map((p) => ({
      type: "delete" as const,
      collection: "assignees" as const,
      id: assigneeKey(p.task_id, p.user_id),
    })),
    { type: "delete" as const, collection: "users" as const, id },
  ]);
  res.json({ ok: true });
});
