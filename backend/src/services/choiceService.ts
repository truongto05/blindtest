// choiceService.ts

export let DYNAMIC_MOVIES = [
  "Interstellar", "Inception", "Titanic", "Gladiator", "Le Seigneur des Anneaux", "Harry Potter",
  "Star Wars", "Jurassic Park", "Pirates des Caraibes", "Matrix", "Pulp Fiction", "Rocky",
  "Retour vers le futur", "Indiana Jones", "Terminator", "Le Roi Lion", "Avengers", "Top Gun",
  "Ghostbusters", "Mission Impossible", "Grease", "Dirty Dancing", "Shrek", "La Reine des Neiges",
  "James Bond", "Spider-Man", "Batman", "Drive", "Les Gardiens de la Galaxie", "Mad Max", "Deadpool"
];

export let DYNAMIC_SERIES = [
  "Game of Thrones", "Stranger Things", "Breaking Bad", "The Walking Dead", "Peaky Blinders",
  "Friends", "The Office", "How I Met Your Mother", "Prison Break", "Dexter", "La Casa de Papel",
  "Narcos", "Vikings", "Squid Game", "Dark", "The Boys", "Les Simpson", "Doctor Who", "X-Files"
];

const GENRE_PLAYLISTS: Record<string, string> = {
  all: '3155776842', rap: '3272614282', rapus: '1677006641', '80s': '1163842311',
  rock: '1306931615', electro: '1902101402', pop: '1083902971', francaise: '1420459465',
  rnb: '1999466402', metal: '1388965575', reggae: '2448918882', jazz: '1615514485',
};

const CINEMA_PLAYLISTS: Record<string, string> = {
  movie: '7581335042', series: '11222880024', screen: '10682283942'
};

type ArtistBucket = 'male_solo' | 'female_solo' | 'group' | 'mixed' | 'unknown';
type DeezerArtist = { id: number; name: string; };
type DeezerTrack = { id: number; title: string; preview?: string; artist: DeezerArtist; album?: { cover_medium?: string; }; };
type DeezerPlaylistResponse = { tracks?: { data?: DeezerTrack[]; next?: string; }; };
type DeezerTrackListResponse = { data?: DeezerTrack[]; next?: string; };
type DeezerArtistListResponse = { data?: DeezerArtist[]; };

const ARTIST_BUCKETS: Record<string, ArtistBucket> = {
  booba: 'male_solo', nekfeu: 'male_solo', jul: 'male_solo', ninho: 'male_solo',
  sch: 'male_solo', damso: 'male_solo', orelsan: 'male_solo', pnl: 'group',
  theweeknd: 'male_solo', dualipa: 'female_solo',
  brunomars: 'male_solo', adele: 'female_solo', angele: 'female_solo',
  drake: 'male_solo', taylorswift: 'female_solo', arianagrande: 'female_solo',
  coldplay: 'group', imaginedragons: 'group',
  michaeljackson: 'male_solo', madonna: 'female_solo', davidguetta: 'male_solo',
  daftpunk: 'group', justice: 'group'
};

const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
const sampleSize = <T,>(arr: T[], n: number): T[] => shuffle(arr).slice(0, n);

const normalize = (s: string = ''): string => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const uniqueStrings = (arr: string[]): string[] => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const hasAccent = (s: string): boolean => /[àâäéèêëïîôöùûüç]/i.test(s);

const getArtistBucket = (artistName: string): ArtistBucket => ARTIST_BUCKETS[normalize(artistName)] || 'unknown';

const bucketBonus = (candidateArtist: string, correctArtist: string): number => {
  const candidateBucket = getArtistBucket(candidateArtist);
  const correctBucket = getArtistBucket(correctArtist);
  if (candidateBucket === 'unknown' || correctBucket === 'unknown') return 0;
  if (candidateBucket === correctBucket) return 6;
  const candidateSolo = candidateBucket === 'male_solo' || candidateBucket === 'female_solo';
  const correctSolo = correctBucket === 'male_solo' || correctBucket === 'female_solo';
  if ((candidateBucket === 'mixed' && correctSolo) || (correctBucket === 'mixed' && candidateSolo)) return 2;
  return -4;
};

const cleanTitle = (title: string): string => title.replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/\s*-\s*(Remastered|Live|Radio Edit|Mono|Stereo|Version|Edit|Mix).*$/i, '').trim();

const formatChoice = (track: DeezerTrack, answerType: string): string => {
  if (answerType === 'artist') return track.artist.name;
  if (['title', 'movie', 'series'].includes(answerType)) return cleanTitle(track.title);
  return `${track.artist.name} - ${cleanTitle(track.title)}`;
};

const scoreArtistName = (candidate: string, correct: string): number => {
  const a = normalize(candidate); const b = normalize(correct);
  if (!a || !b || a === b) return -999;
  let score = 0;
  if (a[0] === b[0]) score += 4;
  if (Math.abs(a.length - b.length) <= 2) score += 3;
  if (wordCount(candidate) === wordCount(correct)) score += 2;
  if (hasAccent(candidate) === hasAccent(correct)) score += 1;
  return score;
};

const scoreTitle = (candidate: string, correct: string): number => {
  const a = normalize(candidate); const b = normalize(correct);
  if (!a || !b || a === b) return -999;
  let score = 0;
  if (wordCount(candidate) === wordCount(correct)) score += 3;
  if (Math.abs(a.length - b.length) <= 4) score += 3;
  if (a[0] === b[0]) score += 2;
  return score;
};

const pickFromRankedPool = (ranked: string[], wanted = 3, topSize = 15): string[] => {
  const uniqueRanked = uniqueStrings(ranked);
  const topPool = uniqueRanked.slice(0, Math.max(topSize, wanted));
  const picked = sampleSize(topPool, Math.min(wanted, topPool.length));
  if (picked.length >= wanted) return picked;
  const remaining = uniqueRanked.filter((item) => !picked.includes(item));
  return [...picked, ...remaining.slice(0, wanted - picked.length)];
};

export class ChoiceService {

  static async initCinematheque(apiKey?: string) {
    if (!apiKey) {
      console.log("⚠️ Aucune clé TMDB trouvée. Utilisation du Top 100 Cinéma de secours (hors ligne).");
      return;
    }
    try {
      console.log("🎬 Synchronisation avec l'API TMDB...");
      const movies: string[] = [];
      const series: string[] = [];
      
      // 👇 NOUVEAU : Regex qui détecte le Japonais, Chinois, Coréen
      const hasAsianChars = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
      
      const getValidTitle = (r: any) => {
        const title = r.title || r.name;
        const original = r.original_title || r.original_name;
        
        // Si le titre principal est propre, on le prend
        if (title && !hasAsianChars.test(title)) return title;
        // Sinon, on se rabat sur le titre original
        if (original && !hasAsianChars.test(original)) return original;
        return null;
      };

      const movieUrls = [
        `https://api.themoviedb.org/3/movie/top_rated?api_key=${apiKey}&language=fr-FR&page=1`,
        `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=fr-FR&page=1`
      ];
      for (const url of movieUrls) {
        const res = await fetch(url);
        const data = await res.json();
        if (data.results) movies.push(...data.results.map(getValidTitle).filter(Boolean));
      }

      const seriesUrls = [
        `https://api.themoviedb.org/3/tv/top_rated?api_key=${apiKey}&language=fr-FR&page=1`,
        `https://api.themoviedb.org/3/tv/popular?api_key=${apiKey}&language=fr-FR&page=1`
      ];
      for (const url of seriesUrls) {
        const res = await fetch(url);
        const data = await res.json();
        if (data.results) series.push(...data.results.map(getValidTitle).filter(Boolean));
      }

      if (movies.length > 0) DYNAMIC_MOVIES = uniqueStrings([...DYNAMIC_MOVIES, ...movies]);
      if (series.length > 0) DYNAMIC_SERIES = uniqueStrings([...DYNAMIC_SERIES, ...series]);

      console.log(`✅ TMDB à jour ! Base vivante : ${DYNAMIC_MOVIES.length} films et ${DYNAMIC_SERIES.length} séries (sans caractères asiatiques).`);
    } catch (error) {
      console.error("❌ Erreur TMDB, on garde la liste de secours.", error);
    }
  }

  private static async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erreur Deezer: ${response.status}`);
    return response.json() as Promise<T>;
  }

  private static async deezerGet<T>(path: string): Promise<T> {
    return this.fetchJson<T>(`https://api.deezer.com${path}`);
  }

  private static async getPlaylistTracks(playlistId: string): Promise<DeezerTrack[]> {
    const firstPage = await this.deezerGet<DeezerPlaylistResponse>(`/playlist/${playlistId}`);
    const collected: DeezerTrack[] = [...(firstPage.tracks?.data || [])];
    let nextUrl = firstPage.tracks?.next;
    let guard = 0;

    while (nextUrl && guard < 4) {
      const nextPage = await this.fetchJson<DeezerTrackListResponse>(nextUrl);
      collected.push(...(nextPage.data || []));
      nextUrl = nextPage.next;
      guard += 1;
    }

    const seen = new Set<number>();
    return collected.filter((track) => {
      if (!track?.id || !track?.artist?.id || !track?.artist?.name || !track?.title) return false;
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }

  private static async getArtistRelated(artistId: number): Promise<DeezerArtist[]> {
    try {
      const data = await this.deezerGet<DeezerArtistListResponse>(`/artist/${artistId}/related?limit=30`);
      return (data.data || []).filter((a) => a?.id && a?.name);
    } catch { return []; }
  }

  private static async getArtistTopTracks(artistId: number): Promise<DeezerTrack[]> {
    try {
      const data = await this.deezerGet<DeezerTrackListResponse>(`/artist/${artistId}/top?limit=50`);
      return (data.data || []).filter(t => t?.id && t?.artist?.id && t?.artist?.name && t?.title);
    } catch { return []; }
  }

  private static buildArtistWrongChoices(correctTrack: DeezerTrack, allTracks: DeezerTrack[], relatedArtists: DeezerArtist[]): string[] {
    const correctArtist = correctTrack.artist.name;
    const relatedNames = uniqueStrings(relatedArtists.map((a) => a.name).filter((n) => normalize(n) !== normalize(correctArtist)));
    const playlistNames = uniqueStrings(allTracks.map((t) => t.artist.name).filter((n) => normalize(n) !== normalize(correctArtist)));
    const merged = uniqueStrings([...relatedNames, ...playlistNames]);
    
    const ranked = merged.map((name) => ({
      name,
      score: scoreArtistName(name, correctArtist) + bucketBonus(name, correctArtist) + Math.random() * 2,
    })).sort((a, b) => b.score - a.score);

    return pickFromRankedPool(ranked.map(i => i.name), 3, 15);
  }

  private static buildTitleWrongChoices(correctTrack: DeezerTrack, allTracks: DeezerTrack[], sameArtistTracks: DeezerTrack[]): string[] {
    const correctTitle = cleanTitle(correctTrack.title);
    const sameArtistTitles = uniqueStrings(sameArtistTracks.map((t) => cleanTitle(t.title)).filter((t) => normalize(t) !== normalize(correctTitle)));
    const sameArtistTitleSet = new Set(sameArtistTitles.map((t) => normalize(t)));
    const playlistTitles = uniqueStrings(allTracks.map((t) => cleanTitle(t.title)).filter((t) => normalize(t) !== normalize(correctTitle)));
    const merged = uniqueStrings([...sameArtistTitles, ...playlistTitles]);

    const ranked = merged.map((title) => ({
      title,
      score: scoreTitle(title, correctTitle) + (sameArtistTitleSet.has(normalize(title)) ? 8 : 0) + Math.random() * 2,
    })).sort((a, b) => b.score - a.score);

    return pickFromRankedPool(ranked.map(i => i.title), 3, 15);
  }

  private static buildBothWrongChoices(correctTrack: DeezerTrack, allTracks: DeezerTrack[], relatedArtists: DeezerArtist[], sameArtistTracks: DeezerTrack[]): string[] {
    const correctChoice = formatChoice(correctTrack, 'both');
    const correctArtist = correctTrack.artist.name;
    const correctTitle = cleanTitle(correctTrack.title);
    const relatedArtistIdSet = new Set(relatedArtists.map((a) => a.id));
    const sameArtistId = correctTrack.artist.id;
    const mergedTracks = [...sameArtistTracks, ...allTracks.filter((t) => t.id !== correctTrack.id)];
    
    const seenTrackIds = new Set<number>();
    const uniqueTracks = mergedTracks.filter((t) => {
      if (!t?.id || seenTrackIds.has(t.id)) return false;
      seenTrackIds.add(t.id);
      return true;
    });

    const ranked = uniqueTracks
      .filter((t) => t.id !== correctTrack.id)
      .map((track) => ({
        text: formatChoice(track, 'both'),
        score: scoreArtistName(track.artist.name, correctArtist) +
               bucketBonus(track.artist.name, correctArtist) +
               scoreTitle(cleanTitle(track.title), correctTitle) +
               (track.artist.id === sameArtistId ? 4 : 0) +
               (relatedArtistIdSet.has(track.artist.id) ? 5 : 0) +
               Math.random() * 2,
      }))
      .filter((item) => normalize(item.text) !== normalize(correctChoice))
      .sort((a, b) => b.score - a.score);

    return pickFromRankedPool(ranked.map(i => i.text), 3, 17);
  }

  private static buildGenericFallbackChoices(correctTrack: DeezerTrack, allTracks: DeezerTrack[], answerType: string): string[] {
    const correctChoice = formatChoice(correctTrack, answerType);
    const pool = uniqueStrings(allTracks.map((t) => formatChoice(t, answerType)).filter((c) => normalize(c) !== normalize(correctChoice)));
    return pickFromRankedPool(pool, 3, 20);
  }

  private static async getMovieOrSeriesTrack(type: 'movie' | 'series', playedIds: number[]) {
    const list = type === 'movie' ? DYNAMIC_MOVIES : DYNAMIC_SERIES;
    let track: DeezerTrack | null = null;
    let attempts = 0;
    let selectedTitle = '';

    while (!track && attempts < 10) {
      selectedTitle = list[Math.floor(Math.random() * list.length)];
      const query = `${selectedTitle} theme`; 
      
      try {
        const response = await this.deezerGet<{ data: DeezerTrack[] }>(`/search?q=${encodeURIComponent(query)}&limit=5`);
        if (response.data && response.data.length > 0) {
          const validTrack = response.data.find(t => t.preview && !playedIds.includes(t.id));
          if (validTrack) track = validTrack;
        }
      } catch (e) {}
      attempts++;
    }

    if (!track) throw new Error("Impossible de trouver une bande originale.");
    return { track, title: selectedTitle };
  }

  static async getRandomTrackWithChoices(
    genre: string = 'all', 
    answerType: string = 'both', 
    playedIds: any[] = [], 
    customPlaylistUrl?: string, 
    gameType: string = 'music'
  ) {
    try {
      const safePlayedIds = playedIds.map(id => Number(id));

      if (['movie', 'series', 'screen'].includes(gameType)) {
        let typeToFetch = gameType;
        if (gameType === 'screen') typeToFetch = Math.random() > 0.5 ? 'movie' : 'series';

        const { track: correctTrack, title: correctTitle } = await this.getMovieOrSeriesTrack(typeToFetch as 'movie' | 'series', safePlayedIds);
        
        const list = typeToFetch === 'movie' ? DYNAMIC_MOVIES : DYNAMIC_SERIES;
        const wrongChoices = shuffle(list.filter(item => item !== correctTitle)).slice(0, 3);
        const choices = shuffle([correctTitle, ...wrongChoices]);

        console.log(`[ChoiceService] 🎬 Oeuvre sélectionnée : ${correctTitle}`);

        return {
          trackId: correctTrack.id,
          audioUrl: correctTrack.preview as string,
          choices,
          correctAnswer: correctTitle,
          coverUrl: correctTrack.album?.cover_medium || '',
          questionType: typeToFetch,
          artistName: 'Bande Originale', 
          trackTitle: correctTitle,
        };
      }

      let playlistId = GENRE_PLAYLISTS[genre] || GENRE_PLAYLISTS.all;
      if (genre === 'all_mix') {
        const availableGenres = Object.keys(GENRE_PLAYLISTS).filter(g => g !== 'all');
        const randomGenre = availableGenres[Math.floor(Math.random() * availableGenres.length)];
        playlistId = GENRE_PLAYLISTS[randomGenre];
      } else if (genre === 'custom') {
        if (!customPlaylistUrl) throw new Error('Aucun lien de playlist fourni');
        const deezerMatch = customPlaylistUrl.match(/playlist\/(\d+)/);
        if (deezerMatch) playlistId = deezerMatch[1];
        else if (/^\d+$/.test(customPlaylistUrl)) playlistId = customPlaylistUrl;
        else throw new Error('Lien invalide.');
      }
      
      console.log(`\n========================================`);
      console.log(`[ChoiceService] 🎯 Nouvelle manche musique | Genre: ${genre} | Playlist: ${playlistId}`);
      
      const allTracks = await this.getPlaylistTracks(playlistId);
      if (!allTracks.length) throw new Error('Playlist introuvable ou vide');

      let availableTracks = allTracks.filter((t) => t.preview && !safePlayedIds.includes(t.id));
      if (!availableTracks.length) availableTracks = allTracks.filter((t) => !!t.preview);
      if (!availableTracks.length) throw new Error('Aucune piste avec extrait disponible');

      const correctTrack = shuffle(availableTracks)[0];
      const cleanedCorrectTitle = cleanTitle(correctTrack.title);

      let currentAnswerType = answerType;
      if (currentAnswerType === 'random') {
        currentAnswerType = Math.random() > 0.5 ? 'artist' : 'title';
      }

      const [relatedArtists, sameArtistTracks] = await Promise.all([
        this.getArtistRelated(correctTrack.artist.id),
        this.getArtistTopTracks(correctTrack.artist.id),
      ]);

      let wrongChoices: string[] = [];
      if (currentAnswerType === 'artist') wrongChoices = this.buildArtistWrongChoices(correctTrack, allTracks, relatedArtists);
      else if (currentAnswerType === 'title') wrongChoices = this.buildTitleWrongChoices(correctTrack, allTracks, sameArtistTracks);
      else wrongChoices = this.buildBothWrongChoices(correctTrack, allTracks, relatedArtists, sameArtistTracks);

      if (wrongChoices.length < 3) {
        const fallbackChoices = this.buildGenericFallbackChoices(correctTrack, allTracks, currentAnswerType);
        wrongChoices = uniqueStrings([...wrongChoices, ...fallbackChoices]).slice(0, 3);
      }

      if (wrongChoices.length < 3) throw new Error('Impossible de générer assez de faux choix');

      const correctChoice = formatChoice(correctTrack, currentAnswerType);
      const choices = shuffle([correctChoice, ...wrongChoices.slice(0, 3)]);

      return {
        trackId: correctTrack.id,
        audioUrl: correctTrack.preview as string,
        choices,
        correctAnswer: correctChoice,
        coverUrl: correctTrack.album?.cover_medium || '',
        questionType: currentAnswerType,
        artistName: correctTrack.artist.name,
        trackTitle: cleanedCorrectTitle,
      };
    } catch (error) {
      console.error('[ChoiceService] 💥 Erreur Critique:', error);
      throw error;
    }
  }
}