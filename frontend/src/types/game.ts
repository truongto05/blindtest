export type GameMode = "classic" | "progressive";
export type AnswerType = "random" | "both" | "artist" | "title";
export type GameType = "music" | "movie" | "series" | "screen";
export type AnswerMode = "choices" | "input";
export type GamePhase = "lobby" | "loading" | "playing" | "reveal" | "finished";

export type Settings = {
  mode: GameMode;
  rounds: number;
  timeLimit: number;
  genre: string;
  answerType: AnswerType;
  gameType: GameType;
  answerMode: AnswerMode;
  customPlaylistUrl: string;
  pulsePlaylistId: string;
  showPoster: boolean;
};
export const DEFAULT_SETTINGS: Settings = {
  mode: "classic",
  rounds: 10,
  timeLimit: 20,
  genre: "all",
  answerType: "random",
  gameType: "music",
  answerMode: "choices",
  customPlaylistUrl: "",
  pulsePlaylistId: "",
  showPoster: true,
};

export type Player = {
  playerId: string;
  username: string;
  score: number;
  isHost: boolean;
  connected: boolean;
  hasAnswered: boolean;
  ready: boolean;
};
export type RoomState = {
  clockOffsetMs?: number;
  roomCode: string;
  phase: GamePhase;
  currentRound: number;
  totalRounds: number;
  players: Player[];
  settings: Settings;
  serverNow: number;
  deadline: number | null;
};
export type QuizData = {
  trackId: string | number;
  audioUrl: string;
  choices: string[];
  correctAnswer?: string;
  coverUrl: string;
  questionType: "artist" | "title" | "both" | "movie" | "series";
  artistName?: string;
  trackTitle?: string;
  mediaTitle?: string;
  currentRound?: number;
  totalRounds?: number;
  startedAt?: number;
  deadline?: number;
};
export type Reveal = {
  correctAnswer: string;
  artistName?: string;
  trackTitle?: string;
  mediaTitle?: string;
  coverUrl: string;
  players: Player[];
  nextRoundAt: number;
};
export type Track = {
  deezerId: string;
  title: string;
  artist: string;
  coverUrl: string;
  previewUrl: string;
};
export type PlaylistVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";
export type Playlist = {
  id: string;
  name: string;
  visibility: PlaylistVisibility;
  shareId: string | null;
  createdAt: string;
  updatedAt: string;
  tracks: Track[];
  trackCount: number;
  playableTrackCount: number;
};
export type PublicPlaylist = Omit<Playlist, "id" | "visibility" | "shareId"> & {
  visibility: "UNLISTED" | "PUBLIC";
  shareId: string;
};
export type PublicPlaylistPage = {
  items: PublicPlaylist[];
  total: number;
  page: number;
  pageSize: number;
};
export type PlaylistSource = {
  name: string;
  trackCount: number;
  playableCount: number;
  issues: string[];
};
