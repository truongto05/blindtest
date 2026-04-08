import fetch from 'node-fetch';

const TMDB_API_KEY = process.env.TMDB_API_KEY;

export const generateMovieQuizData = async (gameType: string, playedIds: any[]) => {
  // gameType peut être 'movie', 'series' ou 'screen' (mix)
  const type = gameType === 'screen' ? (Math.random() > 0.5 ? 'movie' : 'tv') : (gameType === 'series' ? 'tv' : 'movie');
  
  // On récupère une page aléatoire parmi les films/séries populaires
  const randomPage = Math.floor(Math.random() * 5) + 1;
  const url = `https://api.themoviedb.org/3/${type}/popular?api_key=${TMDB_API_KEY}&language=fr-FR&page=${randomPage}`;

  try {
    const response = await fetch(url);
    const data: any = await response.json();
    const results = data.results;

    const available = results.filter((m: any) => !playedIds.includes(m.id));
    const selected = available[Math.floor(Math.random() * available.length)] || results[0];

    const title = type === 'movie' ? selected.title : selected.name;

    // Faux choix basés sur les autres résultats de la même page
    const choices = new Set<string>();
    choices.add(title);
    while (choices.size < 4) {
      const randomItem = results[Math.floor(Math.random() * results.length)];
      const c = type === 'movie' ? randomItem.title : randomItem.name;
      choices.add(c);
    }

    return {
      trackId: selected.id,
      audioUrl: '', // Pas d'audio pour le mode cinéma (basé sur l'image ou le titre)
      correctAnswer: title,
      choices: Array.from(choices).sort(() => Math.random() - 0.5),
      questionType: type === 'movie' ? 'movie' : 'series',
      coverUrl: `https://image.tmdb.org/t/p/w500${selected.poster_path}`,
      mediaTitle: title
    };
  } catch (error) {
    console.error("Erreur MovieChoiceService:", error);
    throw error;
  }
};