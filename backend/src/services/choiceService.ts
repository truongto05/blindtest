import fetch from 'node-fetch';

// Configuration des IDs de Playlists par genre
const GENRE_PLAYLISTS: Record<string, string> = {
  all: '3155776842', 
  rap: '3272614282', 
  rapus: '1677006641', 
  '80s': '1163842311',
  rock: '1306931615', 
  electro: '1902101402', 
  pop: '1083902971', 
  francaise: '1420459465',
  rnb: '1999466402', 
  metal: '1388965575', 
  reggae: '2448918882', 
  jazz: '1615514485',
};

const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

/**
 * Génère les données d'une manche (Musique)
 */
export const generateQuizData = async (
  genre: string = 'all', 
  answerType: string = 'both', 
  playedIds: any[] = [], 
  customPlaylistUrl?: string
) => {
  try {
    let playlistId = GENRE_PLAYLISTS[genre] || GENRE_PLAYLISTS.all;

    // Gestion du mode Custom
    if (genre === 'custom' && customPlaylistUrl) {
      const match = customPlaylistUrl.match(/playlist\/(\d+)/);
      playlistId = match ? match[1] : customPlaylistUrl;
    }

    // Récupération des pistes depuis Deezer
    const response = await fetch(`https://api.deezer.com/playlist/${playlistId}/tracks?limit=100`);
    const data: any = await response.json();
    const tracks = data.data || [];

    if (tracks.length === 0) throw new Error("La playlist est vide ou introuvable");

    // Filtrage des morceaux déjà joués
    const availableTracks = tracks.filter((t: any) => !playedIds.includes(t.id) && t.preview);
    const selectedTrack = availableTracks.length > 0 
      ? availableTracks[Math.floor(Math.random() * availableTracks.length)] 
      : tracks[0];

    // Détermination du type de question (Artiste ou Titre)
    let currentAnswerType = answerType;
    if (answerType === 'random') {
      currentAnswerType = Math.random() > 0.5 ? 'artist' : 'title';
    }

    const correctAnswer = currentAnswerType === 'artist' 
      ? selectedTrack.artist.name 
      : selectedTrack.title;

    // Génération des 3 faux choix
    const otherTracks = tracks.filter((t: any) => 
      (currentAnswerType === 'artist' ? t.artist.name : t.title) !== correctAnswer
    );
    
    const wrongChoices = shuffle(
      Array.from(new Set(otherTracks.map((t: any) => 
        currentAnswerType === 'artist' ? t.artist.name : t.title
      )))
    ).slice(0, 3);

    // Mélange final des 4 choix
    const choices = shuffle([correctAnswer, ...wrongChoices]);

    return {
      trackId: selectedTrack.id,
      audioUrl: selectedTrack.preview,
      choices,
      correctAnswer,
      questionType: currentAnswerType,
      coverUrl: selectedTrack.album.cover_medium,
      artistName: selectedTrack.artist.name,
      trackTitle: selectedTrack.title
    };
  } catch (error) {
    console.error("Erreur ChoiceService:", error);
    throw error;
  }
};