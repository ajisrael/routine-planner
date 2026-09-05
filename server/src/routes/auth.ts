import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db.js";
import { COOKIE_NAME } from "../realtime.js";
import { broadcaster } from "../services/broadcaster.js";
import { mapUser } from "../services/rows.js";

export const authRouter = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 365 * 24 * 3600 * 1000,
};

function currentUser(req: Request): Record<string, unknown> | undefined {
  const raw = req.cookies?.[COOKIE_NAME];
  const id = Number(raw);
  if (!raw || !Number.isInteger(id)) return undefined;
  return db.prepare("SELECT * FROM users WHERE id = ? AND is_login_user = 1").get(id) as
    | Record<string, unknown>
    | undefined;
}

// POST /api/auth/login  {username}
//   find is_login_user=1 user by case-insensitive username; create if absent;
//   set httpOnly cookie with user id. (ARCHITECTURE.md §5.5)
authRouter.post("/login", (req: Request, res: Response) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  if (!username || username.length > 40) {
    res.status(400).json({ error: "username required (1–40 chars)" });
    return;
  }
  let row = db
    .prepare("SELECT * FROM users WHERE is_login_user = 1 AND LOWER(username) = LOWER(?)")
    .get(username) as Record<string, unknown> | undefined;
  if (!row) {
    // Typing an unknown name creates a new login account.
    const info = db
      .prepare("INSERT INTO users (username, display_name, is_login_user) VALUES (?, ?, 1)")
      .run(username, username);
    row = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid) as Record<
      string,
      unknown
    >;
  }
  const user = mapUser(row);
  broadcaster.upsert("users", user.id, user);
  res.cookie(COOKIE_NAME, String(user.id), COOKIE_OPTS).json(user);
});

// GET /api/auth/me → current user from cookie
authRouter.get("/me", (req: Request, res: Response) => {
  const row = currentUser(req);
  if (!row) {
    res.status(401).json({ error: "not logged in" });
    return;
  }
  res.json(mapUser(row));
});

// POST /api/auth/logout
authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: "/" }).json({ ok: true });
});
