export type GameType = 'music' | 'movie' | 'series' | 'screen';

export type QuizQuestionType = 'artist' | 'title' | 'both' | 'random' | 'movie' | 'series';

export type QuizData = {
  trackId: string | number;
  audioUrl: string;
  choices: string[];
  correctAnswer: string;
  coverUrl: string;
  questionType: QuizQuestionType;
  artistName?: string;
  trackTitle?: string;
  mediaTitle?: string;
  year?: string;
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const fetchNextQuiz = async (
  genre: string,
  answerType: string,
  playedIds: Array<string | number>,
  gameType: GameType,
  customPlaylistUrl?: string
): Promise<QuizData> => {
  
  const playedParam = playedIds.length > 0 ? `&playedIds=${playedIds.join(',')}` : '';
  const customUrlParam = customPlaylistUrl ? `&customPlaylistUrl=${encodeURIComponent(customPlaylistUrl)}` : '';

  // ICI ON UTILISE L'URL DE RENDER
  const response = await fetch(
    `${API_URL}/api/quiz/next?genre=${genre}&type=${answerType}&gameType=${gameType}${playedParam}${customUrlParam}`
  );

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const textError = await response.text();
    console.error("Erreur serveur :", textError.substring(0, 200));
    throw new Error("Le serveur backend est injoignable ou a renvoyé une erreur HTML.");
  }
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Erreur lors du chargement du quiz');
  }
  
  return response.json();
};