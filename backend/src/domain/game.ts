export type GameMode = "classic" | "progressive";
export type AnswerType = "random" | "both" | "artist" | "title";
export type GameType = "music" | "movie" | "series" | "screen";
export type AnswerMode = "choices" | "input";

export type GameSettings = {
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

export type QuizQuestion = {
  trackId: string | number;
  audioUrl: string;
  choices: string[];
  correctAnswer: string;
  questionType: "artist" | "title" | "both" | "movie" | "series";
  coverUrl: string;
  artistName?: string;
  trackTitle?: string;
  mediaTitle?: string;
};

export type PublicQuestion = Omit<
  QuizQuestion,
  "correctAnswer" | "artistName" | "trackTitle" | "mediaTitle"
> & {
  currentRound: number;
  totalRounds: number;
  startedAt: number;
  deadline: number;
};

export type PublicPlayer = {
  playerId: string;
  username: string;
  score: number;
  isHost: boolean;
  connected: boolean;
  hasAnswered: boolean;
  ready: boolean;
};

export const DEFAULT_SETTINGS: GameSettings = {
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
