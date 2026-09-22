import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Server } from "socket.io";
import {
  io as createClient,
  type Socket as ClientSocket,
} from "socket.io-client";
import { registerGameHandlers } from "./gameHandler";
import { DEFAULT_SETTINGS, type PublicQuestion } from "../domain/game";
import { preparePlaylistSource } from "../services/playlistQuizService";
import { PlaylistError } from "../services/playlistService";

const database = vi.hoisted(() => ({
  accountProfile: { findUnique: vi.fn() },
}));
const auth = vi.hoisted(() => ({ verifyAccessToken: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: database }));
vi.mock("../services/authService", async (original) => ({
  ...(await original<typeof import("../services/authService")>()),
  ...auth,
}));
import { AuthError } from "../services/authService";

vi.mock("../services/playlistQuizService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/playlistQuizService")>();
  return { ...actual, preparePlaylistSource: vi.fn() };
});

const playlistTracks = Array.from({ length: 4 }, (_, index) => ({
  id: String(index + 1),
  title: `Titre ${index + 1}`,
  artist: `Artiste ${index + 1}`,
  preview: `https://cdn.example.com/${index + 1}.mp3`,
  cover: "",
}));

type State = {
  roomCode: string;
  phase: string;
  settings: { mode: string; rounds: number };
  players: Array<{
    playerId: string;
    isHost: boolean;
    connected: boolean;
    ready: boolean;
  }>;
};
const once = <T>(socket: ClientSocket, event: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout ${event}`)),
      3_000,
    );
    socket.once(event, (value: T) => {
      clearTimeout(timer);
      resolve(value);
    });
  });

describe("multiplayer room lifecycle", () => {
  let io: Server;
  let url: string;
  const clients: ClientSocket[] = [];
  beforeEach(async () => {
    database.accountProfile.findUnique.mockReset();
    database.accountProfile.findUnique.mockResolvedValue(null);
    auth.verifyAccessToken.mockReset();
    auth.verifyAccessToken.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    vi.mocked(preparePlaylistSource).mockReset();
    vi.mocked(preparePlaylistSource).mockResolvedValue(playlistTracks);
    const http = createServer();
    io = new Server(http);
    io.on("connection", (socket) => registerGameHandlers(io, socket));
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });
  afterEach(async () => {
    clients.splice(0).forEach((client) => client.disconnect());
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
  const client = () => {
    const socket = createClient(url, {
      transports: ["websocket"],
      forceNew: true,
    });
    clients.push(socket);
    return socket;
  };

  it("supports 24 connected players, rejects the 25th and scores a simultaneous round", async () => {
    const host = client();
    await once(host, "connect");
    const joined = once<{ roomCode: string }>(host, "joined_room");
    const hostToken = crypto.randomUUID();
    host.emit("create_room", {
      username: "Nina",
      playerToken: hostToken,
      libraryOwnerId: "LIB-GUEST-12345678",
      settings: {
        ...DEFAULT_SETTINGS,
        genre: "pulse",
        rounds: 1,
        answerType: "title",
        answerMode: "input",
        pulsePlaylistId: crypto.randomUUID(),
      },
    });
    const { roomCode } = await joined;
    const players = [{ socket: host, token: hostToken }];
    await Promise.all(
      Array.from({ length: 23 }, async (_, index) => {
        const socket = client();
        const token = crypto.randomUUID();
        await once(socket, "connect");
        const connected = once(socket, "joined_room");
        socket.emit("join_room", {
          roomCode,
          playerToken: token,
          username: `Joueur ${index + 1}`,
        });
        await connected;
        players.push({ socket, token });
        const ready = once(socket, "room_state");
        socket.emit("toggle_ready", { roomCode });
        await ready;
      }),
    );
    const extra = client();
    await once(extra, "connect");
    const full = once<{ message: string }>(extra, "room_error");
    extra.emit("join_room", {
      roomCode,
      playerToken: crypto.randomUUID(),
      username: "En trop",
    });
    expect((await full).message).toMatch(/complet/);
    const rounds = players.map(({ socket }) =>
      once<PublicQuestion>(socket, "round_started"),
    );
    host.emit("start_game", { roomCode });
    const questions = await Promise.all(rounds);
    expect(new Set(questions.map((q) => q.trackId)).size).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 1550));
    const revealed = once<{ players: Array<{ score: number }> }>(
      host,
      "round_revealed",
    );
    players.forEach(({ socket, token }) =>
      socket.emit("submit_answer", {
        roomCode,
        playerToken: token,
        answer: `Titre ${questions[0].trackId}`,
      }),
    );
    const result = await revealed;
    expect(result.players).toHaveLength(24);
    expect(result.players.every((player) => player.score > 0)).toBe(true);
    players.forEach(({ socket }) => socket.emit("leave_room", { roomCode }));
  }, 15000);

  it("rechecks the account owner before reading a private playlist at start", async () => {
    database.accountProfile.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    const host = client();
    await once(host, "connect");
    const joined = once<{ roomCode: string }>(host, "joined_room");
    host.emit("create_room", {
      username: "Nina",
      playerToken: crypto.randomUUID(),
      libraryOwnerId: "LIB-ACCOUNT-12345678",
      accessToken: "owner-token",
      settings: {
        ...DEFAULT_SETTINGS,
        genre: "pulse",
        rounds: 2,
        answerMode: "input",
        pulsePlaylistId: crypto.randomUUID(),
      },
    });
    const { roomCode } = await joined;
    vi.mocked(preparePlaylistSource).mockClear();
    for (const accessToken of [undefined, "expired", "foreign"]) {
      if (accessToken === "expired")
        auth.verifyAccessToken.mockRejectedValueOnce(
          new AuthError(401, "Session expirée."),
        );
      if (accessToken === "foreign")
        auth.verifyAccessToken.mockResolvedValueOnce({
          id: "22222222-2222-4222-8222-222222222222",
        });
      const requestId = crypto.randomUUID();
      const error = once<{ message: string; requestId: string }>(
        host,
        "room_error",
      );
      host.emit("start_game", {
        roomCode,
        requestId,
        ...(accessToken ? { accessToken } : {}),
      });
      expect((await error).requestId).toBe(requestId);
      expect(preparePlaylistSource).not.toHaveBeenCalled();
    }
    const started = once<PublicQuestion>(host, "round_started");
    host.emit("start_game", { roomCode, accessToken: "owner-token" });
    expect((await started).currentRound).toBe(1);
    expect(preparePlaylistSource).toHaveBeenCalledOnce();
    host.emit("leave_room", { roomCode });
  });

  it("abandons a pending account authorization when its host leaves", async () => {
    database.accountProfile.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    const host = client();
    await once(host, "connect");
    const joined = once<{ roomCode: string }>(host, "joined_room");
    host.emit("create_room", {
      username: "Nina",
      playerToken: crypto.randomUUID(),
      libraryOwnerId: "LIB-ACCOUNT-12345678",
      accessToken: "owner-token",
      settings: {
        ...DEFAULT_SETTINGS,
        genre: "pulse",
        rounds: 2,
        answerMode: "input",
        pulsePlaylistId: crypto.randomUUID(),
      },
    });
    const { roomCode } = await joined;
    vi.mocked(preparePlaylistSource).mockClear();
    let release!: (identity: { id: string }) => void;
    auth.verifyAccessToken.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    host.emit("start_game", { roomCode, accessToken: "owner-token" });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const duplicate = once<{ message: string }>(host, "room_error");
    host.emit("start_game", { roomCode, accessToken: "owner-token" });
    expect((await duplicate).message).toMatch(/déjà en cours/);
    host.emit("leave_room", { roomCode });
    const changed = once<{ message: string }>(host, "room_error");
    // Socket events are ordered; wait for a reply to prove leave was processed.
    host.emit("toggle_ready", { roomCode });
    await changed;
    const abandoned = once<{ message: string }>(host, "room_error");
    release({ id: "11111111-1111-4111-8111-111111111111" });
    expect((await abandoned).message).toMatch(/changé/);
    expect(preparePlaylistSource).not.toHaveBeenCalled();
  });

  it("rejects creating an account-library room without JWT, accepts only its verified owner and keeps credentials private", async () => {
    database.accountProfile.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    const host = client();
    await once(host, "connect");
    const payload = {
      username: "Nina",
      playerToken: crypto.randomUUID(),
      libraryOwnerId: "LIB-ACCOUNT-12345678",
      settings: {
        ...DEFAULT_SETTINGS,
        genre: "pulse",
        rounds: 2,
        pulsePlaylistId: crypto.randomUUID(),
      },
    };
    const missing = once<{ message: string }>(host, "room_error");
    host.emit("create_room", payload);
    expect((await missing).message).toMatch(/Connecte-toi/);
    expect(preparePlaylistSource).not.toHaveBeenCalled();
    auth.verifyAccessToken.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
    });
    const wrongAccount = once<{ message: string }>(host, "room_error");
    host.emit("create_room", {
      ...payload,
      accessToken: "other-account-token",
    });
    expect((await wrongAccount).message).toMatch(/autre compte/);
    expect(preparePlaylistSource).not.toHaveBeenCalled();
    const joined = once<{ roomCode: string }>(host, "joined_room");
    const state = once<State>(host, "room_state");
    host.emit("create_room", {
      ...payload,
      accessToken: "verified-owner-token",
    });
    const { roomCode } = await joined;
    expect(auth.verifyAccessToken).toHaveBeenLastCalledWith(
      "verified-owner-token",
    );
    expect(preparePlaylistSource).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(await state);
    expect(serialized).not.toContain("verified-owner-token");
    expect(serialized).not.toContain(payload.libraryOwnerId);
    expect(serialized).not.toContain(payload.playerToken);
    host.emit("leave_room", { roomCode });
  });

  it("rejects changing room settings to an account playlist with a missing or expired JWT", async () => {
    const host = client();
    await once(host, "connect");
    const joined = once<{ roomCode: string }>(host, "joined_room");
    host.emit("create_room", {
      username: "Nina",
      playerToken: crypto.randomUUID(),
    });
    const { roomCode } = await joined;
    database.accountProfile.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    const payload = {
      roomCode,
      libraryOwnerId: "LIB-ACCOUNT-12345678",
      settings: {
        ...DEFAULT_SETTINGS,
        genre: "pulse",
        rounds: 2,
        pulsePlaylistId: crypto.randomUUID(),
      },
    };
    const missing = once<{ message: string }>(host, "room_error");
    host.emit("update_settings", payload);
    expect((await missing).message).toMatch(/Connecte-toi/);
    auth.verifyAccessToken.mockRejectedValueOnce(
      new AuthError(401, "Session expirée."),
    );
    const expired = once<{ message: string }>(host, "room_error");
    host.emit("update_settings", { ...payload, accessToken: "expired-token" });
    expect((await expired).message).toBe("Session expirée.");
    expect(preparePlaylistSource).not.toHaveBeenCalled();
    host.emit("leave_room", { roomCode });
  });
  it("correlates creation, joining, settings and refusal with the requesting action", async () => {
    const host = client();
    await once(host, "connect");
    const createId = crypto.randomUUID();
    const created = once<{ roomCode: string; requestId: string }>(
      host,
      "joined_room",
    );
    host.emit("create_room", {
      username: "Nina",
      playerToken: crypto.randomUUID(),
      requestId: createId,
    });
    const joined = await created;
    expect(joined.requestId).toBe(createId);
    const saveId = crypto.randomUUID();
    const saved = once<{ requestId: string }>(host, "settings_updated");
    host.emit("update_settings", {
      roomCode: joined.roomCode,
      settings: DEFAULT_SETTINGS,
      requestId: saveId,
    });
    expect((await saved).requestId).toBe(saveId);
    const guest = client();
    await once(guest, "connect");
    const joinId = crypto.randomUUID();
    const guestJoined = once<{ requestId: string }>(guest, "joined_room");
    guest.emit("join_room", {
      roomCode: joined.roomCode,
      username: "Sam",
      playerToken: crypto.randomUUID(),
      requestId: joinId,
    });
    expect((await guestJoined).requestId).toBe(joinId);
    const refusalId = crypto.randomUUID();
    const refused = once<{ requestId: string }>(guest, "room_error");
    guest.emit("update_settings", {
      roomCode: joined.roomCode,
      settings: DEFAULT_SETTINGS,
      requestId: refusalId,
    });
    expect((await refused).requestId).toBe(refusalId);
  });

  it("rejects a concurrent creation explicitly without mixing its request with the first", async () => {
    const host = client();
    await once(host, "connect");
    let release!: (tracks: typeof playlistTracks) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.mocked(preparePlaylistSource).mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const playerToken = crypto.randomUUID();
    const created = once<{ requestId: string }>(host, "joined_room");
    host.emit("create_room", {
      username: "Nina",
      playerToken,
      requestId: firstId,
      libraryOwnerId: "LIB-TEST-12345678",
      settings: {
        ...DEFAULT_SETTINGS,
        genre: "pulse",
        pulsePlaylistId: crypto.randomUUID(),
      },
    });
    await started;
    const refused = once<{ requestId: string; message: string }>(
      host,
      "room_error",
    );
    host.emit("create_room", {
      username: "Nina",
      playerToken,
      requestId: secondId,
    });
    expect(await refused).toMatchObject({
      requestId: secondId,
      message: expect.stringContaining("déjà en cours"),
    });
    release(playlistTracks);
    expect((await created).requestId).toBe(firstId);
  });
  it("keeps a persistent identity and transfers host on explicit leave", async () => {
    const host = client();
    await once(host, "connect");
    const hostToken = crypto.randomUUID();
    const joined = once<{ roomCode: string }>(host, "joined_room");
    host.emit("create_room", { username: "Nina", playerToken: hostToken });
    const { roomCode } = await joined;
    const guest = client();
    await once(guest, "connect");
    const guestToken = crypto.randomUUID();
    const guestJoined = once<{ playerId: string }>(guest, "joined_room");
    guest.emit("join_room", {
      roomCode,
      username: "Sam",
      playerToken: guestToken,
    });
    const { playerId: guestPlayerId } = await guestJoined;
    const transferred = once<State>(guest, "room_state");
    host.emit("leave_room", { roomCode });
    const state = await transferred;
    expect(state.players).toHaveLength(1);
    expect(state.players[0]).toMatchObject({
      playerId: guestPlayerId,
      isHost: true,
    });
    expect(guestPlayerId).not.toBe(guestToken);
    expect(JSON.stringify(state)).not.toContain(guestToken);
    expect(JSON.stringify(state)).not.toContain(hostToken);
  });
  it("reconnects the same token without duplicating the player", async () => {
    const first = client();
    await once(first, "connect");
    const token = crypto.randomUUID();
    const joined = once<{ roomCode: string; playerId: string }>(
      first,
      "joined_room",
    );
    first.emit("create_room", { username: "Nina", playerToken: token });
    const { roomCode, playerId } = await joined;
    first.disconnect();
    const replacement = client();
    await once(replacement, "connect");
    const statePromise = once<State>(replacement, "room_state");
    replacement.emit("join_room", {
      roomCode,
      username: "Nina",
      playerToken: token,
    });
    const state = await statePromise;
    expect(state.players).toHaveLength(1);
    expect(state.players[0]).toMatchObject({
      playerId,
      connected: true,
      isHost: true,
    });
    expect(playerId).not.toBe(token);
  });
  it("ignores a late disconnect from a replaced socket", async () => {
    const first = client();
    await once(first, "connect");
    const token = crypto.randomUUID();
    const joined = once<{ roomCode: string; playerId: string }>(
      first,
      "joined_room",
    );
    first.emit("create_room", { username: "Nina", playerToken: token });
    const { roomCode, playerId } = await joined;
    const replacement = client();
    await once(replacement, "connect");
    const attached = once<State>(replacement, "room_state");
    replacement.emit("join_room", {
      roomCode,
      username: "Nina",
      playerToken: token,
    });
    await attached;
    first.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const observer = client();
    await once(observer, "connect");
    const observed = once<State>(observer, "room_state");
    observer.emit("join_room", {
      roomCode,
      username: "Sam",
      playerToken: crypto.randomUUID(),
    });
    const state = await observed;
    expect(
      state.players.find((player) => player.playerId === playerId)?.connected,
    ).toBe(true);
  });
  it("creates a room with the host settings and requires guests to be ready", async () => {
    const host = client();
    await once(host, "connect");
    const settings = {
      mode: "progressive",
      rounds: 7,
      timeLimit: 20,
      genre: "pop",
      answerType: "title",
      gameType: "music",
      answerMode: "choices",
      customPlaylistUrl: "",
      showPoster: true,
    };
    const joined = once<{ roomCode: string }>(host, "joined_room");
    host.emit("create_room", {
      username: "Nina",
      playerToken: crypto.randomUUID(),
      settings,
    });
    const { roomCode } = await joined;
    const guest = client();
    await once(guest, "connect");
    const guestJoined = once(guest, "joined_room");
    guest.emit("join_room", {
      roomCode,
      username: "Sam",
      playerToken: crypto.randomUUID(),
    });
    await guestJoined;
    const blocked = once<{ message: string }>(host, "room_error");
    host.emit("start_game", { roomCode });
    await expect(blocked).resolves.toMatchObject({
      message: expect.stringMatching(/prêts/i),
    });
    const readyState = once<State>(host, "room_state");
    guest.emit("toggle_ready", { roomCode });
    const state = await readyState;
    expect(state.settings).toMatchObject({ mode: "progressive", rounds: 7 });
    expect(state.players.find((player) => !player.isHost)?.ready).toBe(true);
  });

  it("keeps library credentials private and snapshots Pulse tracks only after a launch access check", async () => {
    const host = client();
    await once(host, "connect");
    const playerToken = crypto.randomUUID();
    const libraryOwnerId = "LIB-PRIVATE-12345678";
    const settings = {
      ...DEFAULT_SETTINGS,
      rounds: 2,
      genre: "pulse",
      pulsePlaylistId: crypto.randomUUID(),
      answerType: "title" as const,
    };
    const joined = once<{ roomCode: string }>(host, "joined_room");
    const initialState = once<State>(host, "room_state");
    host.emit("create_room", {
      username: "Nina",
      playerToken,
      libraryOwnerId,
      settings,
    });
    const { roomCode } = await joined;
    const state = await initialState;
    expect(JSON.stringify(state)).not.toContain(libraryOwnerId);
    expect(JSON.stringify(state)).not.toContain(playerToken);
    expect(preparePlaylistSource).toHaveBeenCalledWith(
      settings.pulsePlaylistId,
      libraryOwnerId,
      settings,
    );

    const firstRound = once<PublicQuestion>(host, "round_started");
    host.emit("start_game", { roomCode });
    const first = await firstRound;
    expect(preparePlaylistSource).toHaveBeenCalledTimes(2);
    expect(first).not.toHaveProperty("correctAnswer");
    expect(first).not.toHaveProperty("artistName");
    expect(first).not.toHaveProperty("trackTitle");

    vi.mocked(preparePlaylistSource).mockRejectedValue(
      new Error("Playlist supprimée"),
    );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, first.startedAt - Date.now() + 20)),
    );
    const revealed = once(host, "round_revealed");
    host.emit("submit_answer", {
      roomCode,
      playerToken,
      answer: `Titre ${first.trackId}`,
    });
    await revealed;
    const second = await new Promise<PublicQuestion>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Second round did not start")),
        5_000,
      );
      host.once("round_started", (value: PublicQuestion) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
    expect(second.trackId).not.toBe(first.trackId);
    expect(preparePlaylistSource).toHaveBeenCalledTimes(2);
    host.emit("leave_room", { roomCode });
  }, 12_000);

  it("returns to the lobby when a Pulse playlist was removed before starting", async () => {
    const host = client();
    await once(host, "connect");
    const settings = {
      ...DEFAULT_SETTINGS,
      rounds: 2,
      genre: "pulse",
      pulsePlaylistId: crypto.randomUUID(),
    };
    const joined = once<{ roomCode: string }>(host, "joined_room");
    host.emit("create_room", {
      username: "Nina",
      playerToken: crypto.randomUUID(),
      libraryOwnerId: "LIB-MUSIC-12345678",
      settings,
    });
    const { roomCode } = await joined;
    vi.mocked(preparePlaylistSource).mockRejectedValueOnce(
      new PlaylistError(404, "Playlist introuvable dans cette bibliothèque."),
    );
    const error = once<{ message: string }>(host, "game_error");
    host.emit("start_game", { roomCode });
    expect((await error).message).toMatch(/Playlist introuvable/);
    host.emit("leave_room", { roomCode });
  });

  it("rejects commands from the replaced host socket", async () => {
    const first = client();
    await once(first, "connect");
    const token = crypto.randomUUID();
    const joined = once<{ roomCode: string }>(first, "joined_room");
    first.emit("create_room", { username: "Nina", playerToken: token });
    const { roomCode } = await joined;
    const replacement = client();
    await once(replacement, "connect");
    const attached = once(replacement, "joined_room");
    replacement.emit("join_room", {
      roomCode,
      username: "Nina",
      playerToken: token,
    });
    await attached;
    const rejected = once<{ message: string }>(first, "room_error");
    first.emit("start_game", { roomCode });
    expect((await rejected).message).toMatch(/réservée à l’hôte/);
    replacement.emit("leave_room", { roomCode });
  });

  it("rejects an identity change on the same connection without leaving ghost players", async () => {
    const host = client();
    await once(host, "connect");
    const token = crypto.randomUUID();
    const joined = once<{ roomCode: string; playerId: string }>(
      host,
      "joined_room",
    );
    host.emit("create_room", { username: "Nina", playerToken: token });
    const { roomCode, playerId } = await joined;
    const rejected = once<{ message: string }>(host, "room_error");
    host.emit("join_room", {
      roomCode,
      username: "Ghost",
      playerToken: crypto.randomUUID(),
    });
    expect((await rejected).message).toBeTruthy();

    const unchanged = once<State>(host, "room_state");
    host.emit("toggle_ready", { roomCode });
    const state = await unchanged;
    expect(state.players).toHaveLength(1);
    expect(state.players[0]).toMatchObject({
      playerId,
      isHost: true,
      connected: true,
    });
    const settingsUpdated = once<State>(host, "room_state");
    host.emit("update_settings", {
      roomCode,
      settings: { ...DEFAULT_SETTINGS, rounds: 3 },
    });
    expect((await settingsUpdated).settings.rounds).toBe(3);
    host.emit("leave_room", { roomCode });
  });

  it("never exposes unexpected database details while creating, configuring or starting a room", async () => {
    const host = client();
    await once(host, "connect");
    const libraryOwnerId = "LIB-PRIVATE-12345678";
    const credentials = {
      username: "Nina",
      playerToken: crypto.randomUUID(),
      libraryOwnerId,
    };
    const settings = {
      ...DEFAULT_SETTINGS,
      rounds: 2,
      genre: "pulse",
      pulsePlaylistId: crypto.randomUUID(),
    };
    const databaseFailure = new Error(
      `Prisma invocation failed: ownerId=${libraryOwnerId}; password=private-database-secret`,
    );
    const expectSafeMessage = ({ message }: { message: string }) => {
      expect(message).toBeTruthy();
      expect(message).not.toContain(libraryOwnerId);
      expect(message).not.toMatch(/Prisma|password|private-database-secret/);
    };

    vi.mocked(preparePlaylistSource).mockRejectedValueOnce(databaseFailure);
    const creationError = once<{ message: string }>(host, "room_error");
    host.emit("create_room", { ...credentials, settings });
    expectSafeMessage(await creationError);

    const joined = once<{ roomCode: string }>(host, "joined_room");
    host.emit("create_room", { ...credentials, settings });
    const { roomCode } = await joined;
    const guest = client();
    await once(guest, "connect");
    const guestJoined = once(guest, "joined_room");
    guest.emit("join_room", {
      roomCode,
      username: "Sam",
      playerToken: crypto.randomUUID(),
    });
    await guestJoined;

    vi.mocked(preparePlaylistSource).mockRejectedValueOnce(databaseFailure);
    const settingsError = once<{ message: string }>(host, "room_error");
    host.emit("update_settings", { roomCode, settings, libraryOwnerId });
    expectSafeMessage(await settingsError);

    const ready = once<State>(host, "room_state");
    guest.emit("toggle_ready", { roomCode });
    await ready;
    vi.mocked(preparePlaylistSource).mockRejectedValueOnce(databaseFailure);
    const hostError = once<{ message: string }>(host, "game_error");
    const guestError = once<{ message: string }>(guest, "game_error");
    host.emit("start_game", { roomCode });
    expectSafeMessage(await hostError);
    expectSafeMessage(await guestError);
    host.emit("leave_room", { roomCode });
    guest.emit("leave_room", { roomCode });
  });
});
