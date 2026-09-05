import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db.js";
import { broadcaster } from "../services/broadcaster.js";
import { mapCategory } from "../services/rows.js";

export const categoriesRouter = Router();

const HEX = /^#[0-9a-fA-F]{6}$/;

categoriesRouter.get("/", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM categories ORDER BY name COLLATE NOCASE").all() as Array<
    Record<string, unknown>
  >;
  res.json(rows.map(mapCategory));
});

categoriesRouter.post("/", (req: Request, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const color = typeof req.body?.color === "string" ? req.body.color.trim() : null;
  if (!name || name.length > 40) {
    res.status(400).json({ error: "name required (1–40 chars)" });
    return;
  }
  if (color && !HEX.test(color)) {
    res.status(400).json({ error: "color must be a #rrggbb hex string" });
    return;
  }
  try {
    const info = db.prepare("INSERT INTO categories (name, color) VALUES (?, ?)").run(name, color);
    const cat = mapCategory(db.prepare("SELECT * FROM categories WHERE id = ?").get(info.lastInsertRowid) as Record<
      string,
      unknown
    >);
    broadcaster.upsert("categories", cat.id, cat);
    res.status(201).json(cat);
  } catch {
    res.status(409).json({ error: "category name already exists" });
  }
});

categoriesRouter.put("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: "category not found" });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : (row.name as string);
  const color =
    req.body?.color === undefined ? (row.color as string | null) : (req.body.color as string | null);
  if (!name || name.length > 40) {
    res.status(400).json({ error: "name required (1–40 chars)" });
    return;
  }
  if (color && !HEX.test(color)) {
    res.status(400).json({ error: "color must be a #rrggbb hex string" });
    return;
  }
  try {
    db.prepare("UPDATE categories SET name = ?, color = ? WHERE id = ?").run(name, color, id);
    const cat = mapCategory(db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as Record<
      string,
      unknown
    >);
    broadcaster.upsert("categories", cat.id, cat);
    res.json(cat);
  } catch {
    res.status(409).json({ error: "category name already exists" });
  }
});

categoriesRouter.delete("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: "category not found" });
    return;
  }
  broadcaster.delete("categories", id);
  res.json({ ok: true });
});
