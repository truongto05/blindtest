import { Router, Request, Response } from 'express';
import { generateQuizData } from '../services/choiceService';
import { generateMovieQuizData } from '../services/movieChoiceService';

const router = Router();

// Route appelée par le frontend pour obtenir la manche suivante
router.get('/next', async (req: Request, res: Response) => {
  try {
    const genre = (req.query.genre as string) || 'all';
    const answerType = (req.query.type as string) || 'both';
    const gameType = (req.query.gameType as string) || 'music'; // <-- C'était manquant
    
    // On récupère les IDs déjà joués pour éviter les doublons
    let playedIds: number[] = [];
    if (req.query.playedIds) {
      playedIds = (req.query.playedIds as string).split(',').map(Number);
    }
    
    const customPlaylistUrl = req.query.customPlaylistUrl as string | undefined;

    let quizData;
    // On aiguille vers le bon service
    if (['movie', 'series', 'screen'].includes(gameType)) {
      quizData = await generateMovieQuizData(gameType, playedIds);
    } else {
      quizData = await generateQuizData(genre, answerType, playedIds, customPlaylistUrl);
    }
    
    res.json(quizData);
  } catch (error: any) {
    console.error("Erreur Quiz Route:", error.message);
    res.status(500).json({ error: "Impossible de générer la manche" });
  }
});

export default router;