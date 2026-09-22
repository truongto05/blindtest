import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { DEFAULT_SETTINGS, type QuizData, type RoomState } from "../types/game";
import GameBoard from "./GameBoard";

type Callbacks = {
  onload: () => void;
  onplay: () => void;
  onstop: () => void;
  onend: () => void;
  onplayerror: () => void;
};
const audio = vi.hoisted(() => ({
  callbacks: null as Callbacks | null,
  play: vi.fn(),
  unload: vi.fn(),
  blocked: false,
}));
vi.mock("howler", () => ({
  Howl: class {
    private callbacks: Callbacks;
    constructor(callbacks: Callbacks) {
      this.callbacks = callbacks;
      audio.callbacks = callbacks;
    }
    play() {
      audio.play();
      if (audio.blocked) this.callbacks.onplayerror();
      else this.callbacks.onplay();
    }
    stop() {
      this.callbacks.onstop();
    }
    seek() {}
    volume() {}
    unload() {
      audio.unload();
    }
  },
}));
vi.mock("../services/socketService", () => ({
  socket: { on: vi.fn(), off: vi.fn() },
}));

const question: QuizData = {
  trackId: "42",
  audioUrl: "https://example.com/preview.mp3",
  coverUrl: "",
  choices: ["One More Time", "Around the World", "Harder", "Something"],
  correctAnswer: "One More Time",
  artistName: "Daft Punk",
  trackTitle: "One More Time",
  questionType: "title",
};
const props = {
  settings: { ...DEFAULT_SETTINGS, rounds: 1, timeLimit: 5 },
  ownerId: "LIB-TEST-12345678",
  isMultiplayer: false,
  room: null,
  playerId: "player",
  round: null,
  reveal: null,
  connection: "connected" as const,
  onSubmitMulti: vi.fn(),
  onRequestSegment: vi.fn(),
  onSoloEnd: vi.fn(),
  onExit: vi.fn(),
};

async function activateSolo() {
  fireEvent.click(
    screen.getByRole("button", { name: /activer le son et commencer/i }),
  );
  await act(async () => {
    await Promise.resolve();
  });
}

async function loadAudio() {
  act(() => audio.callbacks?.onload());
  await act(async () => {
    vi.advanceTimersByTime(0);
  });
  act(() => vi.advanceTimersByTime(250));
}

describe("GameBoard audio and round lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T12:00:00Z"));
    vi.clearAllMocks();
    audio.callbacks = null;
    audio.blocked = false;
    vi.spyOn(api, "nextQuiz").mockResolvedValue(question);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits for sound before timing solo, stops after an answer and cancels a pending transition on exit", async () => {
    const view = render(<GameBoard {...props} />);
    await activateSolo();
    act(() => vi.advanceTimersByTime(7_000));
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "5",
    );
    expect(
      screen.getByRole("button", { name: "One More Time" }),
    ).toBeDisabled();
    await loadAudio();
    expect(audio.play).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "One More Time" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("+1000 points")).toBeVisible();
    act(() => vi.advanceTimersByTime(500));
    expect(audio.play).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.unmount();
    act(() => vi.advanceTimersByTime(4_000));
    expect(props.onSoloEnd).not.toHaveBeenCalled();
    expect(audio.unload).toHaveBeenCalled();
  });

  it("keeps the cost of the longest progressive excerpt when replaying a shorter one", async () => {
    render(
      <GameBoard
        {...props}
        settings={{ ...props.settings, mode: "progressive", timeLimit: 30 }}
      />,
    );
    await activateSolo();
    await loadAudio();
    expect(audio.play).not.toHaveBeenCalled();
    for (const seconds of [0.1, 0.5, 2, 5, 10, 15, 0.1]) {
      fireEvent.click(screen.getByRole("button", { name: `${seconds} s` }));
    }
    act(() => vi.advanceTimersByTime(250));
    fireEvent.click(screen.getByRole("button", { name: "One More Time" }));
    expect(screen.getByText("+100 points")).toBeVisible();
  });

  it.each([
    ["Around the World", "around world"],
    ["Bohemian Rhapsody", "bohemian rapsody"],
  ])(
    "accepts the multiplayer answer tolerance for %s in solo free text",
    async (correctAnswer, input) => {
      vi.mocked(api.nextQuiz).mockResolvedValue({
        ...question,
        correctAnswer,
        choices: [],
      });
      render(
        <GameBoard
          {...props}
          settings={{ ...props.settings, answerMode: "input" }}
        />,
      );
      await activateSolo();
      await loadAudio();
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: input },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Valider la réponse" }),
      );
      expect(screen.getByText("+1000 points")).toBeVisible();
      expect(props.onSubmitMulti).not.toHaveBeenCalled();
    },
  );

  it("retries blocked playback from a direct user click without looping the excerpt", async () => {
    audio.blocked = true;
    render(<GameBoard {...props} />);
    await activateSolo();
    await loadAudio();
    expect(
      screen.getByRole("button", { name: /lire l’extrait/i }),
    ).toBeVisible();
    audio.blocked = false;
    fireEvent.click(screen.getByRole("button", { name: /lire l’extrait/i }));
    expect(audio.play).toHaveBeenCalledTimes(2);
    act(() => audio.callbacks?.onend());
    act(() => vi.advanceTimersByTime(500));
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it("enables multiplayer keyboard answers only after the server start time, accounting for clock offset", async () => {
    const serverNow = Date.now() - 60_000;
    const round = {
      ...question,
      correctAnswer: undefined,
      currentRound: 1,
      startedAt: serverNow + 1_500,
      deadline: serverNow + 6_500,
    };
    const room: RoomState = {
      roomCode: "ABC123",
      settings: props.settings,
      phase: "playing",
      currentRound: 1,
      totalRounds: 1,
      players: [],
      serverNow,
      clockOffsetMs: 60_000,
      deadline: round.deadline,
    };
    render(<GameBoard {...props} isMultiplayer room={room} round={round} />);
    await loadAudio();
    fireEvent.keyDown(window, { key: "1" });
    expect(props.onSubmitMulti).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_500));
    fireEvent.keyDown(window, { key: "1" });
    expect(props.onSubmitMulti).toHaveBeenCalledWith("One More Time");
    fireEvent.keyDown(window, { key: "2" });
    expect(props.onSubmitMulti).toHaveBeenCalledTimes(1);
  });
});
