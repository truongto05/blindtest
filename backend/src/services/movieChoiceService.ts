import fetch from 'node-fetch';

const TMDB_API_KEY = process.env.TMDB_API_KEY;

export const generateMovieQuizData = async (gameType: string, playedIds: any[]) => {
  const type = gameType === 'screen' ? (Math.random() > 0.5 ? 'movie' : 'tv') : (gameType === 'series' ? 'tv' : 'movie');
  
  let validTrackFound = false;
  let selected: any = null;
  let audioUrl = '';
  let results: any[] = [];
  let creatorName = "Réalisateur inconnu";

  let attempts = 0;
  while (!validTrackFound && attempts < 5) {
    attempts++;
    
    const randomPage = Math.floor(Math.random() * 5) + 1;
    // 1. CORRECTION ICI : On utilise "discover" au lieu de "popular" avec "with_original_language=en|fr"
    // Cela empêche l'apparition de titres originaux en Hindi, Coréen, etc.
    const tmdbUrl = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=fr-FR&sort_by=popularity.desc&page=${randomPage}&with_original_language=en|fr`;

    try {
      const response = await fetch(tmdbUrl);
      const data: any = await response.json();
      results = data.results;

      const available = results.filter((m: any) => !playedIds.includes(m.id));
      if (available.length === 0) continue;

      selected = available[Math.floor(Math.random() * available.length)];
      const originalTitle = type === 'movie' ? selected.original_title : selected.original_name;

      // 2. Recherche de la BO sur Deezer
      const keyword = type === 'movie' ? 'soundtrack' : 'theme';
      const searchQuery = encodeURIComponent(`${originalTitle} ${keyword}`);
      const deezerUrl = `https://api.deezer.com/search?q=${searchQuery}&limit=5`;

      const deezerRes = await fetch(deezerUrl);
      const deezerData: any = await deezerRes.json();
      const track = deezerData.data?.find((t: any) => t.preview && t.preview !== '');

      if (track) {
        audioUrl = track.preview;
        validTrackFound = true;

        // 3. CORRECTION ICI : Récupérer le Réalisateur / Créateur
        const detailsRes = await fetch(`https://api.themoviedb.org/3/${type}/${selected.id}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`);
        const detailsData: any = await detailsRes.json();
        
        if (type === 'movie' && detailsData.credits?.crew) {
           const director = detailsData.credits.crew.find((c: any) => c.job === 'Director');
           if (director) creatorName = `De : ${director.name}`;
        } else if (type === 'tv' && detailsData.created_by?.length > 0) {
           creatorName = `Créé par : ${detailsData.created_by[0].name}`;
        }

      } else {
        playedIds.push(selected.id);
      }
    } catch (e) {
      console.error("Erreur lors de la récupération (TMDB ou Deezer):", e);
    }
  }

  if (!selected) {
      throw new Error("Impossible de trouver un film/série.");
  }

  const title = type === 'movie' ? selected.title : selected.name;

  const choices = new Set<string>();
  choices.add(title);
  while (choices.size < 4) {
    const randomItem = results[Math.floor(Math.random() * results.length)];
    const c = type === 'movie' ? randomItem.title : randomItem.name;
    choices.add(c);
  }

  return {
    trackId: selected.id,
    audioUrl: audioUrl,
    correctAnswer: title,
    choices: Array.from(choices).sort(() => Math.random() - 0.5),
    questionType: type === 'movie' ? 'movie' : 'series',
    coverUrl: `https://image.tmdb.org/t/p/w500${selected.poster_path}`,
    mediaTitle: title,
    artistName: creatorName // <-- Le réalisateur est maintenant transmis ici !
  };
};