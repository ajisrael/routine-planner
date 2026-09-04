import { Router } from "express";

export const usersRouter = Router();

// Users + personas. Login users are created via /api/auth/login; personas
// (is_login_user=0) are created here. (DATA_MODEL.md §3.1)
usersRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

usersRouter.post("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});