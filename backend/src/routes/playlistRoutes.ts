import { Router, type ErrorRequestHandler, type Request } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { DeezerTrackError } from "../services/deezerTrackService";
import { AuthError, accessTokenFromRequest } from "../services/authService";
import { protectLibraryOwner } from "../services/accountService";
import {
  addPlaylistTrack,
  copySharedPlaylist,
  createPlaylist,
  deletePlaylist,
  getOwnedPlaylist,
  getSharedPlaylist,
  listOwnedPlaylists,
  listPublicPlaylists,
  ownerPlaylistDto,
  PlaylistError,
  publicPlaylistDto,
  removePlaylistTrack,
  renamePlaylist,
  setPlaylistVisibility,
} from "../services/playlistService";
import {
  addTrackBodySchema,
  catalogQuerySchema,
  copyBodySchema,
  ownerQuerySchema,
  playlistBodySchema,
  playlistIdSchema,
  shareIdSchema,
  trackIdSchema,
  visibilityBodySchema,
} from "../validation/playlists";

const router = Router();

async function readOwner(req: Request) {
  // Keep the former query contract for existing clients; the app uses a header
  // so library access keys do not appear in request URLs and proxy access logs.
  const ownerId = ownerQuerySchema.parse({
    ...req.query,
    ownerId: req.get("X-Library-Id") ?? req.query.ownerId,
  }).ownerId;
  return protectLibraryOwner(ownerId, accessTokenFromRequest(req));
}

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

router.get("/public", async (req, res) => {
  const { page, limit } = catalogQuerySchema.parse(req.query);
  res.json(await listPublicPlaylists(page, limit));
});

router.get("/share/:shareId", async (req, res) => {
  const shareId = shareIdSchema.parse(req.params.shareId);
  res.json(publicPlaylistDto(await getSharedPlaylist(shareId)));
});

router.post("/share/:shareId/copy", async (req, res) => {
  const shareId = shareIdSchema.parse(req.params.shareId);
  const { ownerId } = copyBodySchema.parse(req.body);
  await protectLibraryOwner(ownerId, accessTokenFromRequest(req));
  res.status(201).json(await copySharedPlaylist(shareId, ownerId));
});

router.get("/", async (req, res) => {
  const ownerId = await readOwner(req);
  res.json(await listOwnedPlaylists(ownerId));
});

router.post("/", async (req, res) => {
  const { ownerId, name } = playlistBodySchema.parse(req.body);
  await protectLibraryOwner(ownerId, accessTokenFromRequest(req));
  res.status(201).json(await createPlaylist(ownerId, name));
});

router.get("/:id", async (req, res) => {
  const id = playlistIdSchema.parse(req.params.id);
  const ownerId = await readOwner(req);
  res.json(ownerPlaylistDto(await getOwnedPlaylist(id, ownerId)));
});

router.patch("/:id", async (req, res) => {
  const id = playlistIdSchema.parse(req.params.id);
  const { ownerId, name } = playlistBodySchema.parse(req.body);
  await protectLibraryOwner(ownerId, accessTokenFromRequest(req));
  res.json(await renamePlaylist(id, ownerId, name));
});

router.delete("/:id", async (req, res) => {
  const id = playlistIdSchema.parse(req.params.id);
  const ownerId = await readOwner(req);
  await deletePlaylist(id, ownerId);
  res.status(204).send();
});

router.patch("/:id/visibility", async (req, res) => {
  const id = playlistIdSchema.parse(req.params.id);
  const { ownerId, visibility } = visibilityBodySchema.parse(req.body);
  await protectLibraryOwner(ownerId, accessTokenFromRequest(req));
  res.json(await setPlaylistVisibility(id, ownerId, visibility));
});

router.post("/:id/tracks", async (req, res) => {
  const id = playlistIdSchema.parse(req.params.id);
  const { ownerId, ...track } = addTrackBodySchema.parse(req.body);
  await protectLibraryOwner(ownerId, accessTokenFromRequest(req));
  await addPlaylistTrack(id, ownerId, track);
  res.status(201).json({ success: true });
});

router.delete("/:id/tracks/:trackId", async (req, res) => {
  const id = playlistIdSchema.parse(req.params.id);
  const trackId = trackIdSchema.parse(req.params.trackId);
  const ownerId = await readOwner(req);
  await removePlaylistTrack(id, ownerId, trackId);
  res.status(204).send();
});

const playlistErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error:
        "Les informations de la playlist sont invalides. Vérifie les champs renseignés.",
    });
  } else if (
    error instanceof PlaylistError ||
    error instanceof DeezerTrackError ||
    error instanceof AuthError
  ) {
    res.status(error.status).json({ error: error.message });
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    res
      .status(404)
      .json({ error: "Playlist introuvable dans cette bibliothèque." });
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003", "P2034"].includes(error.code)
  ) {
    res.status(409).json({
      error: "La playlist a changé entre-temps. Actualise la page et réessaie.",
    });
  } else {
    res.status(503).json({
      error:
        "Bibliothèque temporairement indisponible. Réessaie dans un instant.",
    });
  }
};

router.use(playlistErrorHandler);
export default router;
