import type { AnswerMode, AnswerType, QuizQuestion } from "../domain/game";
import type { MusicTrack } from "../domain/music";
import {
  createMusicQuestion,
  uniqueRecordingCount,
  withoutRecentRecordings,
  selectNextTrack,
} from "../domain/musicSelection";
import { loadMusicCatalog } from "./musicCatalogService";
import { PublicServiceError } from "./http";

export type { MusicTrack } from "../domain/music";
export {
  answerValue,
  createMusicQuestion,
  shuffle,
  uniqueAnswers,
} from "../domain/musicSelection";

export type MusicSettings = {
  rounds: number;
  answerType: AnswerType;
  answerMode: AnswerMode;
};

export function prepareMusicPlan(
  tracks: MusicTrack[],
  settings: MusicSettings,
  recentIds: Array<string | number> = [],
): QuizQuestion[] {
  const available = uniqueRecordingCount(tracks);
  if (available < settings.rounds)
    throw new PublicServiceError(
      `Cette sélection contient ${available} morceaux différents avec extrait. Choisis au maximum ${available} manches.`,
    );
  // Recent listening is a preference, never permission to repeat a recording in a game.
  const unseen = withoutRecentRecordings(tracks, recentIds);
  const candidates =
    uniqueRecordingCount(unseen) >= settings.rounds ? unseen : tracks;
  const played: Array<string | number> = [];
  const questions: QuizQuestion[] = [];
  for (let index = 0; index < settings.rounds; index++) {
    const selected = selectNextTrack(candidates, played, Math.random, {
      ...settings,
      questionTracks: tracks,
    });
    questions.push(
      createMusicQuestion(
        tracks,
        selected,
        settings.answerType,
        settings.answerMode,
      ),
    );
    played.push(selected.id);
  }
  return questions;
}

export async function loadMusicPlan(
  genre: string,
  customPlaylistUrl: string | undefined,
  settings: MusicSettings,
  recentIds: Array<string | number> = [],
) {
  return prepareMusicPlan(
    await loadMusicCatalog(genre, customPlaylistUrl),
    settings,
    recentIds,
  );
}

// Compatibility for older clients: the current application freezes a whole plan.
export async function generateQuizData(
  genre = "all",
  answerType: AnswerType = "random",
  playedIds: Array<string | number> = [],
  customPlaylistUrl?: string,
  answerMode: AnswerMode = "choices",
): Promise<QuizQuestion> {
  const tracks = await loadMusicCatalog(genre, customPlaylistUrl);
  const selected = selectNextTrack(tracks, playedIds, Math.random, {
    answerType,
    answerMode,
  });
  return createMusicQuestion(tracks, selected, answerType, answerMode);
}
