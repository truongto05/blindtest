import { Router } from "express";
import { z } from "zod";
import { fetchJson } from "../services/http";
const router = Router();
const querySchema = z.string().trim().min(2).max(80);
const typeSchema = z.enum(["artist", "title", "both"]).catch("both");
type SearchResponse = {
  data?: Array<{ title: string; artist: { name: string } }>;
};
router.get("/", async (req, res) => {
  const query = querySchema.safeParse(req.query.q);
  if (!query.success) return res.json([]);
  const type = typeSchema.parse(req.query.type);
  try {
    const data = await fetchJson<SearchResponse>(
      `https://api.deezer.com/search?q=${encodeURIComponent(query.data)}&limit=15`,
      5_000,
    );
    const values = (data.data || []).map((item) =>
      type === "artist"
        ? item.artist.name
        : type === "title"
          ? item.title
          : `${item.artist.name} — ${item.title}`,
    );
    return res.json([...new Set(values)].slice(0, 5));
  } catch {
    return res.json([]);
  }
});
export default router;
