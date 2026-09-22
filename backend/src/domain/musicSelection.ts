import { PublicServiceError } from "../services/http";
import { isCorrectAnswer, normalizeAnswer } from "./answer";
import type { AnswerMode, AnswerType, QuizQuestion } from "./game";
import type { MusicTrack } from "./music";

type ConcreteAnswer = Exclude<AnswerType, "random">;
type Random = () => number;
type QuestionOptions = {
  answerType: AnswerType;
  answerMode: AnswerMode;
  questionTracks?: MusicTrack[];
};

const QCM_ERROR =
  "Cette sélection ne permet pas de proposer quatre réponses sans ambiguïté. Change l’élément à deviner ou choisis la saisie libre.";

export function shuffle<T>(items: T[], rng: Random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function normalizedLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isEditionLabel(value: string): boolean {
  const words = normalizedLabel(value).split(" ");
  return (
    words.some((word) =>
      /^(remaster(?:ed)?|deluxe|anniversary|expanded|reissue|bonus)$/.test(
        word,
      ),
    ) &&
    words.every((word) =>
      /^(\d+(?:th|st|nd|rd)?|remaster(?:ed)?|deluxe|anniversary|expanded|reissue|bonus|track|edition|version|digital|digitally)$/.test(
        word,
      ),
    )
  );
}

function titleIdentity(title: string): string {
  let cleaned = title.replace(
    /\(([^()]*)\)|\[([^\[\]]*)\]/g,
    (match, round, square) => (isEditionLabel(round || square) ? " " : match),
  );
  const suffix = cleaned.match(/\s+[-–—]\s+([^–—]+)$/);
  if (suffix && isEditionLabel(suffix[1]))
    cleaned = cleaned.slice(0, suffix.index);
  return normalizedLabel(cleaned) || normalizedLabel(title);
}

function metadataKey(track: MusicTrack): string {
  return `recording:${normalizedLabel(track.artist)}:${titleIdentity(track.title)}`;
}

export function recordingKey(track: MusicTrack): string {
  const isrc = track.isrc?.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return isrc && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)
    ? `isrc:${isrc}`
    : metadataKey(track);
}

function usable(track: MusicTrack): boolean {
  return Boolean(
    track.title.trim() && track.artist.trim() && track.preview.trim(),
  );
}

function sameArtist(a: MusicTrack, b: MusicTrack): boolean {
  return Boolean(
    (a.artistId && b.artistId && a.artistId === b.artistId) ||
    normalizedLabel(a.artist) === normalizedLabel(b.artist),
  );
}

/** Both ISRC and metadata aliases matter when one edition lacks an ISRC. */
function recordingGroups(tracks: MusicTrack[]): Map<MusicTrack, number> {
  const parents = tracks.map((_, index) => index);
  const aliases = new Map<string, number>();
  const root = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  tracks.forEach((track, index) => {
    for (const alias of [
      `id:${track.id}`,
      recordingKey(track),
      metadataKey(track),
    ]) {
      const previous = aliases.get(alias);
      if (previous !== undefined) parents[root(index)] = root(previous);
      else aliases.set(alias, index);
    }
  });
  return new Map(tracks.map((track, index) => [track, root(index)]));
}

export function uniqueRecordingCount(tracks: MusicTrack[]): number {
  return new Set(recordingGroups(tracks.filter(usable)).values()).size;
}

export function withoutRecentRecordings(
  tracks: MusicTrack[],
  recentIds: Array<string | number>,
): MusicTrack[] {
  const groups = recordingGroups(tracks);
  const ids = new Set(recentIds.map(String));
  const recentGroups = new Set(
    tracks
      .filter((track) => ids.has(String(track.id)))
      .map((track) => groups.get(track)),
  );
  return tracks.filter((track) => !recentGroups.has(groups.get(track)));
}

export function answerValue(track: MusicTrack, type: ConcreteAnswer): string {
  return type === "artist"
    ? track.artist
    : type === "both"
      ? `${track.artist} — ${track.title}`
      : track.title;
}

export function uniqueAnswers(
  tracks: MusicTrack[],
  type: ConcreteAnswer,
): string[] {
  const answers = new Map<string, string>();
  for (const track of tracks) {
    const value = answerValue(track, type);
    const key = normalizeAnswer(value);
    if (key && !answers.has(key)) answers.set(key, value);
  }
  return [...answers.values()];
}

function answerQuestion(correctAnswer: string): QuizQuestion {
  return {
    trackId: "",
    audioUrl: "",
    coverUrl: "",
    choices: [],
    correctAnswer,
    questionType: "title",
  };
}

/** Keep the real scoring matcher as the authority, including fuzzy tolerance. */
function answerCompatibility() {
  const cache = new Map<string, boolean>();
  return (a: string, b: string): boolean => {
    const first = normalizeAnswer(a);
    const second = normalizeAnswer(b);
    if (!first || !second || first === second) return false;
    const key = [first, second].sort().join("\u0000");
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    // The matcher cannot accept lengths whose difference alone exceeds 16%.
    const clearlyDifferent =
      Math.min(first.length, second.length) /
        Math.max(first.length, second.length) <
      0.84;
    const compatible =
      clearlyDifferent ||
      (!isCorrectAnswer(a, answerQuestion(b)) &&
        !isCorrectAnswer(b, answerQuestion(a)));
    cache.set(key, compatible);
    return compatible;
  };
}

function tags(values?: string[]): string[] {
  return [...new Set((values || []).map(normalizedLabel).filter(Boolean))];
}

function shares(a?: string[], b?: string[]): boolean {
  const known = new Set(tags(a));
  return tags(b).some((value) => known.has(value));
}

function rankedAlternatives(
  tracks: MusicTrack[],
  selected: MusicTrack,
  type: ConcreteAnswer,
  rng?: Random,
): string[] {
  const groups = recordingGroups(tracks);
  const selectedGroups = new Set(
    tracks
      .filter(
        (track) =>
          String(track.id) === String(selected.id) ||
          recordingKey(track) === recordingKey(selected) ||
          metadataKey(track) === metadataKey(selected),
      )
      .map((track) => groups.get(track)),
  );
  const knownRanks = [
    ...new Set(
      tracks
        .map((track) => track.popularity)
        .filter(
          (rank): rank is number =>
            typeof rank === "number" && Number.isFinite(rank) && rank > 0,
        ),
    ),
  ].sort((a, b) => a - b);
  const rankOf = (track: MusicTrack) =>
    knownRanks.indexOf(track.popularity ?? -1);
  const selectedRank = rankOf(selected);
  const distance = (track: MusicTrack) =>
    selectedRank >= 0 && rankOf(track) >= 0
      ? Math.abs(selectedRank - rankOf(track)) /
        Math.max(1, knownRanks.length - 1)
      : 1;
  const affinity = (track: MusicTrack) => [
    type === "title" && sameArtist(selected, track) ? 1 : 0,
    shares(selected.genres, track.genres) ? 1 : 0,
    shares(selected.sourceIds, track.sourceIds) ? 1 : 0,
  ];
  const candidates = tracks
    .filter((track) => usable(track) && !selectedGroups.has(groups.get(track)))
    .map((track) => ({ track, affinity: affinity(track) }));
  candidates.sort((a, b) => {
    for (let index = 0; index < a.affinity.length; index++) {
      const difference = b.affinity[index] - a.affinity[index];
      if (difference) return difference;
    }
    return distance(a.track) - distance(b.track);
  });
  const ordered: MusicTrack[] = [];
  const included = new Set<number>();
  for (let index = 0; index < candidates.length;) {
    let end = index + 1;
    while (
      end < candidates.length &&
      candidates[end].affinity.join("") === candidates[index].affinity.join("")
    )
      end++;
    // Randomize among nearby candidates, without replacing related answers
    // with unrelated genres merely because the catalogue is large.
    for (let start = index; start < end; start += 4) {
      const neighbors = candidates
        .slice(start, Math.min(start + 4, end))
        .map((item) => item.track);
      for (const track of rng ? shuffle(neighbors, rng) : neighbors) {
        const group = groups.get(track)!;
        if (!included.has(group)) {
          ordered.push(track);
          included.add(group);
        }
      }
    }
    index = end;
  }
  return uniqueAnswers(ordered, type);
}

function alternatives(
  tracks: MusicTrack[],
  selected: MusicTrack,
  type: ConcreteAnswer,
  rng?: Random,
): string[] | null {
  const correct = answerValue(selected, type);
  if (!normalizeAnswer(correct)) return null;
  const compatible = answerCompatibility();
  const candidates = rankedAlternatives(tracks, selected, type, rng).filter(
    (value) => compatible(correct, value),
  );
  // Search a compatible triple, not just a greedy prefix: one close spelling
  // must not hide an otherwise valid four-choice question farther down.
  for (let a = 0; a < candidates.length - 2; a++) {
    for (let b = a + 1; b < candidates.length - 1; b++) {
      if (!compatible(candidates[a], candidates[b])) continue;
      for (let c = b + 1; c < candidates.length; c++) {
        if (
          compatible(candidates[a], candidates[c]) &&
          compatible(candidates[b], candidates[c])
        )
          return [candidates[a], candidates[b], candidates[c]];
      }
    }
  }
  return null;
}

function possibleTypes(answerType: AnswerType): ConcreteAnswer[] {
  return answerType === "random" ? ["artist", "title"] : [answerType];
}

export function canCreateMusicQuestion(
  tracks: MusicTrack[],
  selected: MusicTrack,
  answerType: AnswerType,
  answerMode: AnswerMode = "choices",
): boolean {
  return (
    usable(selected) &&
    possibleTypes(answerType).some((type) =>
      answerMode === "input"
        ? Boolean(normalizeAnswer(answerValue(selected, type)))
        : alternatives(tracks, selected, type) !== null,
    )
  );
}

export function createMusicQuestion(
  tracks: MusicTrack[],
  selected: MusicTrack,
  answerType: AnswerType,
  answerMode: AnswerMode = "choices",
  rng: Random = Math.random,
): QuizQuestion {
  if (!usable(selected))
    throw new PublicServiceError(
      "Cet extrait ne peut pas être joué. Choisis une autre sélection.",
    );
  const feasible = possibleTypes(answerType).flatMap((type) => {
    const distractors =
      answerMode === "choices" ? alternatives(tracks, selected, type, rng) : [];
    return normalizeAnswer(answerValue(selected, type)) && distractors
      ? [{ type, distractors }]
      : [];
  });
  if (!feasible.length) throw new PublicServiceError(QCM_ERROR);
  const { type, distractors } = feasible[Math.floor(rng() * feasible.length)];
  const correctAnswer = answerValue(selected, type);
  return {
    trackId: selected.id,
    audioUrl: selected.preview,
    choices:
      answerMode === "choices"
        ? shuffle([correctAnswer, ...distractors], rng)
        : [],
    correctAnswer,
    questionType: type,
    coverUrl: selected.cover,
    artistName: selected.artist,
    trackTitle: selected.title,
  };
}

function tagCounts(
  history: MusicTrack[],
  key: "genres" | "sourceIds",
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const track of history) {
    const values = tags(track[key]);
    for (const value of values)
      counts.set(value, (counts.get(value) || 0) + 1 / values.length);
  }
  return counts;
}

function exposure(
  track: MusicTrack,
  key: "genres" | "sourceIds",
  counts: Map<string, number>,
): number | null {
  const values = tags(track[key]);
  return values.length
    ? values.reduce((sum, value) => sum + (counts.get(value) || 0), 0) /
        values.length
    : null;
}

export function selectNextTrack(
  tracks: MusicTrack[],
  playedIds: Array<string | number>,
  rng: Random = Math.random,
  options?: QuestionOptions,
): MusicTrack {
  if (!tracks.some(usable))
    throw new PublicServiceError(
      "Cette sélection ne contient pas d’extrait jouable. Choisis une autre sélection.",
    );
  const groups = recordingGroups(tracks);
  const lookup = new Map<string, MusicTrack>();
  for (const track of tracks) {
    lookup.set(String(track.id), track);
    lookup.set(recordingKey(track), track);
    lookup.set(metadataKey(track), track);
  }
  const history = playedIds
    .map((id) => lookup.get(String(id)))
    .filter((track): track is MusicTrack => Boolean(track));
  const playedGroups = new Set(history.map((track) => groups.get(track)));
  const included = new Set<number>();
  const fresh = shuffle(
    tracks.filter((track) => {
      const group = groups.get(track)!;
      if (!usable(track) || playedGroups.has(group) || included.has(group))
        return false;
      included.add(group);
      return true;
    }),
    rng,
  );
  if (!fresh.length)
    throw new PublicServiceError(
      "Tous les morceaux de cette sélection ont déjà été joués. Choisis une autre sélection pour continuer.",
    );
  const recent = history.slice(-3).reverse();
  const recency = (track: MusicTrack) => {
    const position = recent.findIndex((played) => sameArtist(played, track));
    return position < 0 ? 0 : 3 - position;
  };
  const genreCounts = tagCounts(history, "genres");
  const sourceCounts = tagCounts(history, "sourceIds");
  fresh.sort((a, b) => {
    const artistDifference = recency(a) - recency(b);
    if (artistDifference) return artistDifference;
    for (const [key, counts] of [
      ["genres", genreCounts],
      ["sourceIds", sourceCounts],
    ] as const) {
      const first = exposure(a, key, counts);
      const second = exposure(b, key, counts);
      if (first !== null && second !== null && first !== second)
        return first - second;
    }
    return 0;
  });
  const next = fresh.find(
    (track) =>
      !options ||
      canCreateMusicQuestion(
        options.questionTracks || tracks,
        track,
        options.answerType,
        options.answerMode,
      ),
  );
  if (!next) throw new PublicServiceError(QCM_ERROR);
  return next;
}
