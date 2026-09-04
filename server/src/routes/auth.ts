import { Router } from "express";

export const authRouter = Router();

// POST /api/auth/login  {username}
//   find is_login_user=1 user by case-insensitive username; create if absent;
//   set httpOnly cookie with user id. (ARCHITECTURE.md §5.5)
authRouter.post("/login", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

// GET /api/auth/me  → current user from cookie
authRouter.get("/me", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

// POST /api/auth/logout
authRouter.post("/logout", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});