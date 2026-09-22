import { Router, type Response } from "express";
import { z } from "zod";
import { generateMovieQuizData } from "../services/movieChoiceService";
import {
  generateQuizData,
  loadMusicPlan,
  prepareMusicPlan,
} from "../services/choiceService";
import { soloPlanQuestion } from "../services/soloPlanService";
import { AuthError, accessTokenFromRequest } from "../services/authService";
import { protectLibraryOwner } from "../services/accountService";
import {
  inspectPlaylistSource,
  nextPlaylistQuestion,
  preparePlaylistSource,
  QuizSourceError,
} from "../services/playlistQuizService";
import { PlaylistError } from "../services/playlistService";
import { PublicServiceError } from "../services/http";
import { ownerIdSchema } from "../validation/schemas";

const router = Router();
const querySchema = z
  .object({
    runId: z.string().uuid().optional(),
    recentIds: z.string().max(2000).optional(),
    genre: z.string().trim().min(1).max(40).default("all"),
    type: z.enum(["random", "both", "artist", "title"]).default("random"),
    gameType: z.enum(["music", "movie", "series", "screen"]).default("music"),
    answerMode: z.enum(["choices", "input"]).default("choices"),
    rounds: z.coerce.number().int().min(1).max(30).default(1),
    playedIds: z.string().max(2_000).optional(),
    customPlaylistUrl: z.string().trim().max(500).optional(),
    playlistId: z.union([z.string().uuid(), z.literal("")]).optional(),
  })
  .strict();
const sourceQuerySchema = z
  .object({
    playlistId: z.string().uuid(),
    rounds: z.coerce.number().int().min(1).max(30),
    answerType: z.enum(["random", "both", "artist", "title"]),
    answerMode: z.enum(["choices", "input"]),
  })
  .strict();

function sourceError(error: unknown, res: Response) {
  if (
    error instanceof PlaylistError ||
    error instanceof QuizSourceError ||
    error instanceof AuthError
  ) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof PublicServiceError)
    return res.status(400).json({ error: error.message });
  return res.status(503).json({
    error:
      "La bibliothèque ne répond pas pour le moment. Réessaie dans un instant.",
  });
}

router.get("/source", async (req, res) => {
  const query = sourceQuerySchema.safeParse(req.query);
  const owner = ownerIdSchema.safeParse(req.get("X-Library-Id"));
  if (!query.success || !owner.success)
    return res.status(400).json({ error: "Playlist ou réglages invalides." });
  res.setHeader("Cache-Control", "no-store");
  try {
    await protectLibraryOwner(owner.data, accessTokenFromRequest(req));
    const { tracks: _tracks, ...source } = await inspectPlaylistSource(
      query.data.playlistId,
      owner.data,
      query.data,
    );
    return res.json(source);
  } catch (error) {
    return sourceError(error, res);
  }
});

router.get("/next", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Les réglages de la partie sont invalides." });
  const query = parsed.data;
  const played = (query.playedIds || "").split(",").filter(Boolean);
  const recent = (query.recentIds || "")
    .split(",")
    .filter((value) => /^\d{1,16}$/.test(value))
    .slice(-60);
  res.setHeader("Cache-Control", "no-store");
  if (query.gameType === "music" && query.genre === "pulse") {
    const owner = ownerIdSchema.safeParse(req.get("X-Library-Id"));
    if (!owner.success || !query.playlistId)
      return res
        .status(400)
        .json({ error: "Choisis une playlist de ta bibliothèque." });
    try {
      await protectLibraryOwner(owner.data, accessTokenFromRequest(req));
      const settings = {
        rounds: query.rounds,
        answerType: query.type,
        answerMode: query.answerMode,
      };
      const tracks = await preparePlaylistSource(
        query.playlistId,
        owner.data,
        settings,
      );
      return res.json(
        query.runId
          ? await soloPlanQuestion(
              query.runId,
              JSON.stringify({
                settings,
                owner: owner.data,
                playlist: query.playlistId,
              }),
              played.length,
              async () => prepareMusicPlan(tracks, settings),
            )
          : nextPlaylistQuestion(tracks, played, settings),
      );
    } catch (error) {
      return sourceError(error, res);
    }
  }
  try {
    if (query.gameType === "music" && query.runId) {
      const settings = {
        rounds: query.rounds,
        answerType: query.type,
        answerMode: query.answerMode,
      };
      const fingerprint = JSON.stringify({
        settings,
        genre: query.genre,
        source: query.customPlaylistUrl,
      });
      return res.json(
        await soloPlanQuestion(query.runId, fingerprint, played.length, () =>
          loadMusicPlan(query.genre, query.customPlaylistUrl, settings, recent),
        ),
      );
    }
    const data =
      query.gameType === "music"
        ? await generateQuizData(
            query.genre,
            query.type,
            played,
            query.customPlaylistUrl,
            query.answerMode,
          )
        : await generateMovieQuizData(query.gameType, played);
    return res.json(data);
  } catch (error) {
    return res.status(503).json({
      error:
        error instanceof PublicServiceError
          ? error.message
          : "Impossible de préparer cet extrait. Réessaie.",
    });
  }
});

export default router;
