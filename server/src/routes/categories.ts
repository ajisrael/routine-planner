import { Router } from "express";

export const categoriesRouter = Router();

categoriesRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

categoriesRouter.post("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

categoriesRouter.put("/:id", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

categoriesRouter.delete("/:id", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});