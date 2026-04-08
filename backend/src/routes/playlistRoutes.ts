import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * RÉCUPÉRER LES PLAYLISTS
 * Route: GET /api/playlists?ownerId=...
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const ownerId = req.query.ownerId as string;

    if (!ownerId) {
      return res.json([]);
    }

    const playlists = await prisma.playlist.findMany({
      where: { ownerId: ownerId },
      include: { tracks: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json(playlists);
  } catch (error) {
    console.error("Erreur GET Playlists:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des playlists" });
  }
});

/**
 * CRÉER UNE PLAYLIST
 * Route: POST /api/playlists
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, ownerId } = req.body;

    if (!name || !ownerId) {
      return res.status(400).json({ error: "Nom et ownerId requis" });
    }

    const playlist = await prisma.playlist.create({
      data: { name, ownerId }
    });

    res.json(playlist);
  } catch (error) {
    console.error("Erreur POST Playlist:", error);
    res.status(500).json({ error: "Erreur lors de la création de la playlist" });
  }
});

/**
 * AJOUTER UN TITRE À UNE PLAYLIST
 * Route: POST /api/playlists/:id/tracks
 */
router.post('/:id/tracks', async (req: Request, res: Response) => {
  try {
    // On force l'id en string pour corriger l'erreur TS2322
    const playlistId = String(req.params.id);
    const { deezerId, title, artist, coverUrl, previewUrl } = req.body;

    if (!deezerId) {
      return res.status(400).json({ error: "ID Deezer requis" });
    }

    // 1. On crée le titre s'il n'existe pas, sinon on ne fait rien (upsert)
    await prisma.track.upsert({
      where: { deezerId: String(deezerId) },
      update: {}, 
      create: { 
        deezerId: String(deezerId), 
        title: title || "Titre inconnu", 
        artist: artist || "Artiste inconnu", 
        coverUrl: coverUrl || "", 
        previewUrl: previewUrl || "" 
      }
    });

    // 2. On lie le titre à la playlist
    await prisma.playlist.update({
      where: { id: playlistId }, // Ligne corrigée
      data: { 
        tracks: { 
          connect: { deezerId: String(deezerId) } 
        } 
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Erreur ajout musique:", error);
    res.status(500).json({ error: "Erreur lors de l'ajout du titre à la playlist" });
  }
});

export default router;