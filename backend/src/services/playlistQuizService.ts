import type { AnswerMode, AnswerType } from "../domain/game";
import {
  createMusicQuestion,
  shuffle,
  uniqueAnswers,
  type MusicTrack,
} from "./choiceService";
import { getOwnedPlaylist } from "./playlistService";

type SourceSettings = {
  rounds: number;
  answerType: AnswerType;
  answerMode: AnswerMode;
};
export type PlaylistSource = {
  name: string;
  trackCount: number;
  playableCount: number;
  issues: string[];
  tracks: MusicTrack[];
};

export class QuizSourceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function inspectPlaylistSource(
  playlistId: string,
  ownerId: string,
  settings: SourceSettings,
): Promise<PlaylistSource> {
  const playlist = await getOwnedPlaylist(playlistId, ownerId);
  const tracks: MusicTrack[] = playlist.tracks
    .filter(
      (track) =>
        /^\d+$/.test(track.deezerId) &&
        /^https:\/\//i.test(track.previewUrl) &&
        track.title.trim() &&
        track.artist.trim(),
    )
    .map((track) => ({
      id: track.deezerId,
      title: track.title,
      artist: track.artist,
      preview: track.previewUrl,
      cover: track.coverUrl,
    }));
  const issues: string[] = [];
  if (!playlist.tracks.length)
    issues.push("Cette playlist est vide. Ajoute des morceaux pour jouer.");
  else if (!tracks.length)
    issues.push(
      "Cette playlist ne contient aucun titre musical avec un extrait disponible.",
    );
  else if (tracks.length < settings.rounds)
    issues.push(
      `Seulement ${tracks.length} titre${tracks.length > 1 ? "s" : ""} avec extrait : choisis au maximum ${tracks.length} manche${tracks.length > 1 ? "s" : ""}.`,
    );
  if (tracks.length && settings.answerMode === "choices") {
    const types: Array<Exclude<AnswerType, "random">> =
      settings.answerType === "random"
        ? ["artist", "title"]
        : [settings.answerType];
    if (types.some((type) => uniqueAnswers(tracks, type).length < 4)) {
      issues.push(
        "Le QCM demande 4 réponses différentes pour chaque élément à deviner. Change cet élément ou choisis la saisie libre.",
      );
    }
  }
  return {
    name: playlist.name,
    trackCount: playlist.tracks.length,
    playableCount: tracks.length,
    issues,
    tracks,
  };
}

export async function preparePlaylistSource(
  playlistId: string,
  ownerId: string | undefined,
  settings: SourceSettings,
): Promise<MusicTrack[]> {
  if (!ownerId)
    throw new QuizSourceError(
      "Ta bibliothèque doit être disponible pour utiliser cette playlist.",
    );
  const source = await inspectPlaylistSource(playlistId, ownerId, settings);
  if (source.issues.length) throw new QuizSourceError(source.issues[0]!);
  return source.tracks;
}

export function nextPlaylistQuestion(
  tracks: MusicTrack[],
  playedIds: Array<string | number>,
  settings: SourceSettings,
) {
  const played = new Set(playedIds.map(String));
  const selected = shuffle(
    tracks.filter((track) => !played.has(String(track.id))),
  )[0];
  if (!selected)
    throw new QuizSourceError(
      "Tous les extraits de cette playlist ont été joués.",
    );
  return createMusicQuestion(
    tracks,
    selected,
    settings.answerType,
    settings.answerMode,
  );
}
