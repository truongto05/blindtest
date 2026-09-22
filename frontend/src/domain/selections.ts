import type { Settings } from "../types/game";

export const HOME_SELECTIONS = [
  {
    id: "hits",
    name: "Tous les hits",
    caption: "Hits récents et classiques",
    artwork: "HITS",
    tone: "lime",
    genre: "all",
    gameType: "music",
  },
  {
    id: "rap",
    name: "Rap français",
    caption: "Trouve le flow",
    artwork: "RAP",
    tone: "coral",
    genre: "rap",
    gameType: "music",
  },
  {
    id: "eighties",
    name: "Années 80",
    caption: "Retour sur bande",
    artwork: "80",
    tone: "cyan",
    genre: "80s",
    gameType: "music",
  },
  {
    id: "rock",
    name: "Rock",
    caption: "Monte le volume",
    artwork: "ROCK",
    tone: "coral",
    genre: "rock",
    gameType: "music",
  },
  {
    id: "films",
    name: "Films",
    caption: "Le son du grand écran",
    artwork: "CINÉ",
    tone: "cream",
    genre: "all",
    gameType: "movie",
  },
  {
    id: "series",
    name: "Séries",
    caption: "Tu connais le générique ?",
    artwork: "SÉRIES",
    tone: "cyan",
    genre: "all",
    gameType: "series",
  },
] as const;

export type HomeSelection = (typeof HOME_SELECTIONS)[number];
export type HomeSelectionId = HomeSelection["id"];

export function selectedHomeSelection(settings: Settings) {
  return HOME_SELECTIONS.find(
    (selection) =>
      selection.gameType === settings.gameType &&
      (settings.gameType !== "music" || selection.genre === settings.genre),
  );
}

export function applyHomeSelection(
  settings: Settings,
  id: HomeSelectionId,
): Settings {
  const selection = HOME_SELECTIONS.find((item) => item.id === id);
  if (!selection) return settings;
  return {
    ...settings,
    genre: selection.genre,
    gameType: selection.gameType,
    mode: selection.gameType === "music" ? settings.mode : "classic",
    customPlaylistUrl: "",
    pulsePlaylistId: "",
  };
}
