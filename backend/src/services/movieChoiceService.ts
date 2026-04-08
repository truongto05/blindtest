type MediaType = 'movie' | 'series' | 'screen';

type TmdbListItem = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
  vote_average?: number;
  popularity?: number;
};

type TmdbListResponse = {
  page: number;
  results: TmdbListItem[];
  total_pages: number;
  total_results: number;
};

type TmdbConfigurationResponse = {
  images?: {
    secure_base_url?: string;
    poster_sizes?: string[];
  };
};

type AppleSongResult = {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
};

type AppleSearchResponse = {
  resultCount?: number;
  results?: AppleSongResult[];
};

type ScreenCandidate = {
  id: number;
  mediaType: 'movie' | 'series';
  title: string;
  originalTitle: string;
  year: number | null;
  posterPath: string | null;
  originalLanguage: string | null;
  popularity: number;
};

type ResolvedAudio = {
  audioUrl: string;
  artworkUrl?: string;
};

const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

const normalize = (s: string = ''): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const uniqueStrings = (arr: string[]): string[] =>
  Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));

const sampleSize = <T,>(arr: T[], n: number): T[] => shuffle(arr).slice(0, n);

const yearFromDate = (date?: string): number | null => {
  if (!date || date.length < 4) return null;
  const year = Number(date.slice(0, 4));
  return Number.isNaN(year) ? null : year;
};

const includesLoose = (haystack: string | undefined, needle: string): boolean => {
  if (!haystack) return false;
  return normalize(haystack).includes(normalize(needle));
};

const hasAsianChars = (str: string): boolean => {
  // Détecte les caractères Japonais (Hiragana/Katakana), Chinois (Kanji) et Coréens (Hangul)
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/.test(str);
};

const titleWordBonus = (text: string | undefined, title: string): number => {
  if (!text) return 0;

  const normalizedText = normalize(text);
  const words = uniqueStrings(
    title
      .split(/[\s:,'’"!?().-]+/)
      .map((w) => normalize(w))
      .filter((w) => w.length >= 4)
  );

  let score = 0;
  for (const word of words) {
    if (normalizedText.includes(word)) score += 2;
  }
  return score;
};

export class MovieChoiceService {
  private static tmdbImageBaseUrl: string | null = null;

  private static getTmdbAuthHeaders(): HeadersInit {
    const bearer = process.env.TMDB_BEARER_TOKEN;
    if (bearer) {
      return {
        Authorization: `Bearer ${bearer}`,
        accept: 'application/json',
      };
    }

    return {
      accept: 'application/json',
    };
  }

  private static buildTmdbUrl(path: string, params: Record<string, string | number | undefined> = {}) {
    const apiKey = process.env.TMDB_API_KEY;
    const url = new URL(`https://api.themoviedb.org/3${path}`);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    if (!process.env.TMDB_BEARER_TOKEN) {
      if (!apiKey) {
        throw new Error('TMDB_API_KEY ou TMDB_BEARER_TOKEN manquant');
      }
      url.searchParams.set('api_key', apiKey);
    }

    return url.toString();
  }

  private static async tmdbGet<T>(
    path: string,
    params: Record<string, string | number | undefined> = {}
  ): Promise<T> {
    const response = await fetch(this.buildTmdbUrl(path, params), {
      headers: this.getTmdbAuthHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TMDb ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  private static async appleSearch(term: string): Promise<AppleSongResult[]> {
    const country = process.env.APPLE_SEARCH_COUNTRY || 'FR';

    const url = new URL('https://itunes.apple.com/search');
    url.searchParams.set('term', term);
    url.searchParams.set('media', 'music');
    url.searchParams.set('entity', 'song');
    url.searchParams.set('limit', '20');
    url.searchParams.set('country', country);

    const response = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as AppleSearchResponse;
    return data.results || [];
  }

  private static async getPosterBaseUrl(): Promise<string> {
    if (this.tmdbImageBaseUrl) {
      return this.tmdbImageBaseUrl;
    }

    const config = await this.tmdbGet<TmdbConfigurationResponse>('/configuration');
    const secureBaseUrl = config.images?.secure_base_url || 'https://image.tmdb.org/t/p/';
    const posterSizes = config.images?.poster_sizes || [];
    const preferredSize =
      posterSizes.includes('w500')
        ? 'w500'
        : posterSizes.includes('original')
        ? 'original'
        : posterSizes[posterSizes.length - 1] || 'w500';

    this.tmdbImageBaseUrl = `${secureBaseUrl}${preferredSize}`;
    return this.tmdbImageBaseUrl;
  }

  private static mapTmdbItem(item: TmdbListItem, mediaType: 'movie' | 'series'): ScreenCandidate | null {
    let title = mediaType === 'movie' ? item.title : item.name;
    const originalTitle = mediaType === 'movie' ? item.original_title : item.original_name;
    const year = mediaType === 'movie' ? yearFromDate(item.release_date) : yearFromDate(item.first_air_date);

    if (!item.id || !title || !item.poster_path) {
      return null;
    }

    // Sécurité anti-caractères asiatiques (impossibles à deviner/taper)
    if (hasAsianChars(title)) {
      if (originalTitle && !hasAsianChars(originalTitle)) {
        // On se rabat sur le titre original s'il est écrit en alphabet latin
        title = originalTitle;
      } else {
        // Si les deux sont en idéogrammes, on éjecte l'œuvre du jeu
        return null; 
      }
    }

    return {
      id: item.id,
      mediaType,
      title,
      originalTitle: originalTitle || title,
      year,
      posterPath: item.poster_path || null,
      originalLanguage: item.original_language || null,
      popularity: item.popularity || 0,
    };
  }

  private static async fetchTop100Movies(): Promise<ScreenCandidate[]> {
    const pages = await Promise.all(
      [1, 2, 3, 4, 5].map((page) =>
        this.tmdbGet<TmdbListResponse>('/movie/popular', {
          language: 'fr-FR',
          page,
        })
      )
    );

    return pages
      .flatMap((page) => page.results || [])
      .map((item) => this.mapTmdbItem(item, 'movie'))
      .filter((item): item is ScreenCandidate => Boolean(item));
  }

  private static async fetchTop100Series(): Promise<ScreenCandidate[]> {
    const pages = await Promise.all(
      [1, 2, 3, 4, 5].map((page) =>
        this.tmdbGet<TmdbListResponse>('/tv/top_rated', {
          language: 'fr-FR',
          page,
        })
      )
    );

    return pages
      .flatMap((page) => page.results || [])
      .map((item) => this.mapTmdbItem(item, 'series'))
      .filter((item): item is ScreenCandidate => Boolean(item));
  }

  private static async getPool(gameType: MediaType): Promise<ScreenCandidate[]> {
    if (gameType === 'movie') {
      return this.fetchTop100Movies();
    }

    if (gameType === 'series') {
      return this.fetchTop100Series();
    }

    const [movies, series] = await Promise.all([this.fetchTop100Movies(), this.fetchTop100Series()]);
    return shuffle([...movies, ...series]).slice(0, 100);
  }

  private static buildPosterUrl(baseUrl: string, posterPath: string | null): string {
    if (!posterPath) return '';
    return `${baseUrl}${posterPath}`;
  }

  private static scoreAudioResult(result: AppleSongResult, candidate: ScreenCandidate): number {
    if (!result.previewUrl) return -999;

    let score = 10;

    const title = candidate.title;
    const originalTitle = candidate.originalTitle;
    const trackName = result.trackName || '';
    const collectionName = result.collectionName || '';
    const artistName = result.artistName || '';

    score += titleWordBonus(trackName, title);
    score += titleWordBonus(collectionName, title);
    score += titleWordBonus(trackName, originalTitle);
    score += titleWordBonus(collectionName, originalTitle);

    if (includesLoose(trackName, title) || includesLoose(collectionName, title)) score += 8;
    if (includesLoose(trackName, originalTitle) || includesLoose(collectionName, originalTitle)) score += 6;

    if (/theme|main title|soundtrack|suite|score/i.test(trackName)) score += 6;
    if (/original motion picture soundtrack|original television soundtrack|soundtrack/i.test(collectionName)) {
      score += 5;
    }

    if (/karaoke|tribute|cover|8-bit|lullaby/i.test(trackName)) score -= 8;
    if (/karaoke|tribute|cover|8-bit|lullaby/i.test(collectionName)) score -= 6;
    if (/karaoke|tribute|cover/i.test(artistName)) score -= 6;

    return score;
  }

  private static async findAudioForCandidate(candidate: ScreenCandidate): Promise<ResolvedAudio | null> {
    const queries = uniqueStrings([
      `${candidate.originalTitle} main theme`,
      `${candidate.originalTitle} soundtrack`,
      `${candidate.originalTitle} original soundtrack`,
      `${candidate.originalTitle} theme`,
      `${candidate.title} main theme`,
      `${candidate.title} soundtrack`,
      `${candidate.title} original soundtrack`,
      `${candidate.title} theme`,
    ]);

    let bestResult: AppleSongResult | null = null;
    let bestScore = -999;

    for (const query of queries) {
      const results = await this.appleSearch(query);

      for (const result of results) {
        const score = this.scoreAudioResult(result, candidate);
        if (score > bestScore) {
          bestScore = score;
          bestResult = result;
        }
      }

      if (bestScore >= 20 && bestResult?.previewUrl) {
        break;
      }
    }

    if (!bestResult?.previewUrl) {
      return null;
    }

    return {
      audioUrl: bestResult.previewUrl,
      artworkUrl: bestResult.artworkUrl100,
    };
  }

  private static scoreWrongChoice(candidate: ScreenCandidate, correct: ScreenCandidate): number {
    if (candidate.id === correct.id) return -999;

    let score = 0;

    if (candidate.mediaType === correct.mediaType) score += 6;
    if (candidate.originalLanguage && correct.originalLanguage && candidate.originalLanguage === correct.originalLanguage) {
      score += 3;
    }

    if (candidate.year && correct.year) {
      const diff = Math.abs(candidate.year - correct.year);
      if (diff <= 3) score += 4;
      else if (diff <= 8) score += 2;
    }

    const a = normalize(candidate.title);
    const b = normalize(correct.title);

    if (a[0] && b[0] && a[0] === b[0]) score += 1;
    if (Math.abs(a.length - b.length) <= 4) score += 1;

    return score + Math.random() * 2;
  }

  private static buildWrongChoices(correct: ScreenCandidate, pool: ScreenCandidate[]): string[] {
    const ranked = pool
      .filter((candidate) => candidate.id !== correct.id)
      .map((candidate) => ({
        title: candidate.title,
        score: this.scoreWrongChoice(candidate, correct),
      }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.title);

    const uniqueRanked = uniqueStrings(ranked);
    const topPool = uniqueRanked.slice(0, 12);
    const picked = sampleSize(topPool, 3);

    if (picked.length === 3) {
      return picked;
    }

    const remaining = uniqueRanked.filter((title) => !picked.includes(title));
    return [...picked, ...remaining.slice(0, 3 - picked.length)];
  }

  static async getRandomMovieQuestion(
    gameType: MediaType = 'screen',
    playedIds: string[] = []
  ) {
    const pool = await this.getPool(gameType);

    if (pool.length < 4) {
      throw new Error(`Pas assez de titres TMDb pour ${gameType}`);
    }

    const posterBaseUrl = await this.getPosterBaseUrl();

    let candidates = pool.filter((item) => !playedIds.includes(String(item.id)));
    if (!candidates.length) {
      candidates = pool;
    }

    const attempts = shuffle(candidates).slice(0, 15);

    for (const candidate of attempts) {
      const resolvedAudio = await this.findAudioForCandidate(candidate);

      if (!resolvedAudio?.audioUrl) {
        continue;
      }

      const wrongChoices = this.buildWrongChoices(candidate, pool);
      if (wrongChoices.length < 3) {
        continue;
      }

      const correctAnswer = candidate.title;
      const choices = shuffle([correctAnswer, ...wrongChoices.slice(0, 3)]);

      return {
        trackId: String(candidate.id),
        audioUrl: resolvedAudio.audioUrl,
        choices,
        correctAnswer,
        coverUrl: this.buildPosterUrl(posterBaseUrl, candidate.posterPath),
        questionType: candidate.mediaType === 'movie' ? 'movie' : 'series',
        mediaTitle: candidate.title,
        mediaType: candidate.mediaType,
        year: candidate.year,
      };
    }

    throw new Error("Impossible de trouver un titre avec un extrait audio exploitable");
  }
}