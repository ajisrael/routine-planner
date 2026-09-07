import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db.js";
import { COOKIE_NAME } from "../realtime.js";
import { broadcaster, assigneeKey } from "../services/broadcaster.js";
import { mapUser } from "../services/rows.js";

export const usersRouter = Router();

// People manager. Every user is a login user (no personas); accounts are
// created here or via /api/auth/login, and any user may rename or delete
// another user except themselves (the currently logged-in session).

function sessionUserId(req: Request): number | undefined {
  const raw = req.cookies?.[COOKIE_NAME];
  const id = Number(raw);
  if (!raw || !Number.isInteger(id)) return undefined;
  return id;
}

usersRouter.get("/", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY id").all() as Array<Record<string, unknown>>;
  res.json(rows.map(mapUser));
});

// Create a login user: username is the account key, displayName optional.
usersRouter.post("/", (req: Request, res: Response) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const displayName =
    typeof req.body?.displayName === "string" && req.body.displayName.trim()
      ? req.body.displayName.trim()
      : username;
  if (!username || username.length > 40) {
    res.status(400).json({ error: "username required (1–40 chars)" });
    return;
  }
  if (!displayName || displayName.length > 40) {
    res.status(400).json({ error: "displayName required (1–40 chars)" });
    return;
  }
  if (db.prepare("SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)").get(username)) {
    res.status(409).json({ error: "username already taken" });
    return;
  }
  const info = db.prepare("INSERT INTO users (username, display_name) VALUES (?, ?)").run(username, displayName);
  const user = mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid) as Record<
    string,
    unknown
  >);
  broadcaster.upsert("users", user.id, user);
  res.status(201).json(user);
});

// Rename a user.
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

// Delete a user (anyone but the current session's user). Assignments cascade.
usersRouter.delete("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  if (id === sessionUserId(req)) {
    res.status(400).json({ error: "you cannot delete the account you're logged in as" });
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
