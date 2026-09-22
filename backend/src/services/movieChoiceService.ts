import type { QuizQuestion } from "../domain/game";
import { shuffle } from "./choiceService";
import { fetchJson, PublicServiceError } from "./http";

type Media = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string;
};
type TmdbList = { results?: Media[] };
type DeezerSearch = { data?: Array<{ preview?: string }> };
type TmdbDetails = {
  credits?: { crew?: Array<{ job: string; name: string }> };
  created_by?: Array<{ name: string }>;
};

export async function generateMovieQuizData(
  gameType: string,
  playedIds: Array<string | number>,
): Promise<QuizQuestion> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey)
    throw new PublicServiceError(
      "Le catalogue cinéma et séries n’est pas disponible sur cette installation. Choisis une partie musicale.",
    );
  const type =
    gameType === "screen"
      ? Math.random() > 0.5
        ? "movie"
        : "tv"
      : gameType === "series"
        ? "tv"
        : "movie";
  const questionType = type === "movie" ? "movie" : "series";
  const played = new Set(playedIds.map(String));
  const deadline = Date.now() + 10_000;
  const fetchWithinDeadline = <T>(url: string) =>
    fetchJson<T>(url, Math.max(1, Math.min(4_000, deadline - Date.now())));
  for (let attempt = 0; attempt < 6 && Date.now() < deadline; attempt++) {
    const page = Math.floor(Math.random() * 5) + 1;
    const list = await fetchWithinDeadline<TmdbList>(
      `https://api.themoviedb.org/3/discover/${type}?api_key=${encodeURIComponent(apiKey)}&language=fr-FR&sort_by=popularity.desc&page=${page}&with_original_language=en|fr`,
    );
    const results = (list.results || []).filter(
      (item) =>
        !played.has(`${questionType}:${item.id}`) &&
        !played.has(String(item.id)),
    );
    const selected = results[Math.floor(Math.random() * results.length)];
    if (!selected) continue;
    const original =
      type === "movie" ? selected.original_title : selected.original_name;
    const title = type === "movie" ? selected.title : selected.name;
    if (!original || !title) continue;
    const audio = await fetchWithinDeadline<DeezerSearch>(
      `https://api.deezer.com/search?q=${encodeURIComponent(`${original} ${type === "movie" ? "soundtrack" : "theme"}`)}&limit=8`,
    );
    const preview = audio.data?.find((track) => track.preview)?.preview;
    if (!preview) continue;
    const details = await fetchWithinDeadline<TmdbDetails>(
      `https://api.themoviedb.org/3/${type}/${selected.id}?api_key=${encodeURIComponent(apiKey)}&append_to_response=credits&language=fr-FR`,
    );
    const creator =
      type === "movie"
        ? details.credits?.crew?.find((person) => person.job === "Director")
            ?.name
        : details.created_by?.[0]?.name;
    const alternatives = [
      ...new Set(
        results
          .map((item) => (type === "movie" ? item.title : item.name))
          .filter((name): name is string => Boolean(name) && name !== title),
      ),
    ];
    if (alternatives.length < 3) continue;
    return {
      trackId: `${questionType}:${selected.id}`,
      audioUrl: preview,
      correctAnswer: title,
      choices: shuffle([title, ...shuffle(alternatives).slice(0, 3)]),
      questionType,
      coverUrl: selected.poster_path
        ? `https://image.tmdb.org/t/p/w500${selected.poster_path}`
        : "",
      mediaTitle: title,
      artistName: creator
        ? `${type === "movie" ? "De" : "Créé par"} : ${creator}`
        : undefined,
    };
  }
  throw new PublicServiceError(
    "Aucun extrait cinéma exploitable trouvé. Réessaie.",
  );
}
