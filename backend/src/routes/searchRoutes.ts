import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { q, type } = req.query;

  if (!q) {
    return res.json([]);
  }

  try {
    // Appel à l'API Deezer
    const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q as string)}&limit=15`);
    const data: any = await response.json();

    if (!data.data) {
      return res.json([]);
    }

    // On formate les suggestions selon si on cherche l'artiste, le titre ou les deux
    let suggestions: string[] = [];
    
    data.data.forEach((item: any) => {
      if (type === 'artist') {
        suggestions.push(item.artist.name);
      } else if (type === 'title') {
        suggestions.push(item.title);
      } else {
        // Format par défaut : Artiste - Titre
        suggestions.push(`${item.artist.name} - ${item.title}`);
      }
    });

    // Nettoyage : on retire les doublons et on limite à 5 résultats
    const uniqueSuggestions = Array.from(new Set(suggestions)).slice(0, 5);
    
    res.json(uniqueSuggestions);
  } catch (error) {
    console.error("Erreur API Search:", error);
    res.json([]); // On renvoie un tableau vide en cas d'erreur pour ne pas faire crash le front
  }
});

export default router;