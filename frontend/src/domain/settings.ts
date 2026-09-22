import type { Settings } from "../types/game";

export const GENRES = [
  ["all", "Tous les hits"],
  ["all_mix", "Mix soirée"],
  ["rap", "Rap français"],
  ["rapus", "Rap US"],
  ["80s", "Années 80"],
  ["rock", "Rock"],
  ["pop", "Pop"],
  ["electro", "Électro"],
  ["francaise", "Variété française"],
  ["rnb", "R&B"],
  ["metal", "Metal"],
  ["reggae", "Reggae"],
  ["jazz", "Jazz"],
  ["custom", "Playlist Deezer"],
  ["pulse", "Ma playlist"],
] as const;

export const PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  settings: Partial<Settings>;
}> = [
  {
    id: "express",
    name: "Express",
    description: "5 manches, QCM, 15 secondes",
    settings: {
      mode: "classic",
      rounds: 5,
      timeLimit: 15,
      answerMode: "choices",
      answerType: "random",
      gameType: "music",
      genre: "all",
    },
  },
  {
    id: "party",
    name: "Soirée",
    description: "15 manches variées et accessibles",
    settings: {
      mode: "classic",
      rounds: 15,
      timeLimit: 20,
      answerMode: "choices",
      answerType: "random",
      gameType: "music",
      genre: "all_mix",
    },
  },
  {
    id: "progressive",
    name: "Progressif",
    description: "Des indices audio de plus en plus longs",
    settings: {
      mode: "progressive",
      rounds: 10,
      timeLimit: 30,
      answerMode: "choices",
      answerType: "title",
      gameType: "music",
      genre: "pop",
    },
  },
  {
    id: "expert",
    name: "Expert",
    description: "Saisie libre, artiste et titre",
    settings: {
      mode: "classic",
      rounds: 15,
      timeLimit: 30,
      answerMode: "input",
      answerType: "both",
      gameType: "music",
      genre: "all_mix",
    },
  },
];

export const settingLabels = {
  universe: (settings: Settings) =>
    settings.gameType === "music"
      ? "Musique"
      : settings.gameType === "movie"
        ? "Films"
        : settings.gameType === "series"
          ? "Séries"
          : "Films & séries",
  mode: (settings: Settings) =>
    settings.mode === "progressive" ? "Progressif" : "Classique",
  answerMode: (settings: Settings) =>
    settings.answerMode === "choices" ? "QCM" : "Saisie libre",
  selection: (settings: Settings) =>
    settings.gameType === "music"
      ? (GENRES.find(([value]) => value === settings.genre)?.[1] ??
        settings.genre)
      : settings.showPoster
        ? "Affiche floutée"
        : "Sans indice visuel",
  answerType: (settings: Settings) =>
    settings.answerType === "artist"
      ? "Artiste"
      : settings.answerType === "title"
        ? "Titre"
        : settings.answerType === "both"
          ? "Artiste et titre"
          : "Artiste ou titre",
};
