import { randomBytes, randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { calculateScore, isCorrectAnswer } from "../domain/answer";
import {
  DEFAULT_SETTINGS,
  type GameSettings,
  type PublicPlayer,
  type PublicQuestion,
  type QuizQuestion,
} from "../domain/game";
import {
  loadMusicPlan,
  prepareMusicPlan,
  type MusicTrack,
} from "../services/choiceService";
import { generateMovieQuizData } from "../services/movieChoiceService";
import { PublicServiceError } from "../services/http";
import { protectLibraryOwner } from "../services/accountService";
import { AuthError } from "../services/authService";
import { PlaylistError } from "../services/playlistService";
import {
  preparePlaylistSource,
  QuizSourceError,
} from "../services/playlistQuizService";
import {
  answerSchema,
  createRoomSchema,
  joinRoomSchema,
  ownerIdSchema,
  roomCodeSchema,
  settingsSchema,
} from "../validation/schemas";

type Player = {
  playerId: string;
  playerToken: string;
  socketId: string | null;
  username: string;
  score: number;
  connected: boolean;
  ready: boolean;
  answeredRound: number | null;
  progressiveTier: number;
  disconnectTimer?: NodeJS.Timeout;
};
type Room = {
  code: string;
  players: Map<string, Player>;
  hostId: string;
  settings: GameSettings;
  libraryOwnerId?: string;
  playlistTracks?: MusicTrack[];
  musicPlan?: QuizQuestion[];
  phase: "lobby" | "loading" | "playing" | "reveal" | "finished";
  currentRound: number;
  playedIds: Array<string | number>;
  question: QuizQuestion | null;
  startedAt: number;
  deadline: number;
  nextRoundAt: number;
  roundTimer?: NodeJS.Timeout;
  transitionTimer?: NodeJS.Timeout;
  updatedAt: number;
  starting?: boolean;
};

const rooms = new Map<string, Room>();
export function isInvitableRoom(roomCode: string, playerToken?: string) {
  const room = rooms.get(roomCode);
  return Boolean(
    room &&
    room.phase === "lobby" &&
    room.players.size < 24 &&
    (!playerToken ||
      [...room.players.values()].some(
        (player) => player.playerToken === playerToken && player.connected,
      )),
  );
}
const RECONNECT_GRACE_MS = 30_000;
const REVEAL_MS = 4_000;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const startGameSchema = z
  .object({
    roomCode: roomCodeSchema,
    requestId: z.string().uuid().optional(),
    accessToken: z.string().min(1).max(8192).optional(),
  })
  .strict();
const updateSettingsSchema = z
  .object({
    accessToken: z.string().min(1).max(8192).optional(),
    requestId: z.string().uuid().optional(),
    roomCode: roomCodeSchema,
    settings: settingsSchema,
    libraryOwnerId: ownerIdSchema.optional(),
  })
  .strict();
const roomChannel = (code: string) => `room:${code}`;
const usesPulse = (settings: GameSettings) =>
  settings.gameType === "music" && settings.genre === "pulse";
const touch = (room: Room) => {
  room.updatedAt = Date.now();
};
const fail = (socket: Socket, message: string, requestId?: string) => {
  socket.emit("room_error", { message, ...(requestId ? { requestId } : {}) });
};

function publicErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AuthError) return error.message;
  return error instanceof PlaylistError ||
    error instanceof QuizSourceError ||
    error instanceof PublicServiceError
    ? error.message
    : fallback;
}

function createCode() {
  let code: string;
  do {
    code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function createPlayer(
  playerToken: string,
  username: string,
  socketId: string,
  ready = false,
): Player {
  return {
    playerId: randomUUID(),
    playerToken,
    username,
    socketId,
    score: 0,
    connected: true,
    ready,
    answeredRound: null,
    progressiveTier: 0,
  };
}

function publicPlayers(room: Room): PublicPlayer[] {
  return [...room.players.values()]
    .map((player) => ({
      playerId: player.playerId,
      username: player.username,
      score: player.score,
      connected: player.connected,
      isHost: player.playerId === room.hostId,
      hasAnswered: player.answeredRound === room.currentRound,
      ready: player.playerId === room.hostId || player.ready,
    }))
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
}

function emitState(io: Server, room: Room) {
  io.to(roomChannel(room.code)).emit("room_state", {
    roomCode: room.code,
    phase: room.phase,
    currentRound: room.currentRound,
    totalRounds: room.settings.rounds,
    players: publicPlayers(room),
    settings: room.settings,
    serverNow: Date.now(),
    deadline: room.deadline || null,
  });
}

function publicQuestion(room: Room): PublicQuestion | null {
  if (!room.question) return null;
  const {
    correctAnswer: _answer,
    artistName: _artist,
    trackTitle: _track,
    mediaTitle: _media,
    ...safe
  } = room.question;
  return {
    ...safe,
    currentRound: room.currentRound,
    totalRounds: room.settings.rounds,
    startedAt: room.startedAt,
    deadline: room.deadline,
  };
}

function revealData(room: Room) {
  return {
    correctAnswer: room.question!.correctAnswer,
    artistName: room.question!.artistName,
    trackTitle: room.question!.trackTitle,
    mediaTitle: room.question!.mediaTitle,
    coverUrl: room.question!.coverUrl,
    players: publicPlayers(room),
    nextRoundAt: room.nextRoundAt,
  };
}

function clearRoomTimers(room: Room) {
  if (room.roundTimer) clearTimeout(room.roundTimer);
  if (room.transitionTimer) clearTimeout(room.transitionTimer);
  room.roundTimer = undefined;
  room.transitionTimer = undefined;
}

async function buildQuestion(room: Room): Promise<QuizQuestion> {
  if (room.settings.gameType !== "music")
    return generateMovieQuizData(room.settings.gameType, room.playedIds);
  if (!room.musicPlan) {
    if (usesPulse(room.settings)) {
      room.playlistTracks ??= await preparePlaylistSource(
        room.settings.pulsePlaylistId,
        room.libraryOwnerId,
        room.settings,
      );
      room.musicPlan = prepareMusicPlan(room.playlistTracks, room.settings);
    } else
      room.musicPlan = await loadMusicPlan(
        room.settings.genre,
        room.settings.customPlaylistUrl,
        room.settings,
      );
  }
  const question = room.musicPlan[room.playedIds.length];
  if (!question)
    throw new PublicServiceError(
      "Toutes les manches de cette sélection ont été jouées.",
    );
  return question;
}

async function startRound(io: Server, room: Room) {
  clearRoomTimers(room);
  room.phase = "loading";
  room.question = null;
  room.deadline = 0;
  touch(room);
  emitState(io, room);
  try {
    const question = await buildQuestion(room);
    if (rooms.get(room.code) !== room || room.phase !== "loading") return;
    room.question = question;
    room.playedIds.push(question.trackId);
    room.startedAt = Date.now() + 1_500;
    room.deadline = room.startedAt + room.settings.timeLimit * 1000;
    room.phase = "playing";
    room.players.forEach((player) => {
      player.answeredRound = null;
      player.progressiveTier = 0;
    });
    touch(room);
    io.to(roomChannel(room.code)).emit("round_started", publicQuestion(room));
    emitState(io, room);
    room.roundTimer = setTimeout(
      () => revealRound(io, room),
      room.deadline - Date.now() + 50,
    );
    room.roundTimer.unref();
  } catch (error) {
    if (rooms.get(room.code) !== room) return;
    room.phase = "lobby";
    io.to(roomChannel(room.code)).emit("game_error", {
      message: publicErrorMessage(
        error,
        "Impossible de préparer la manche. Réessaie dans un instant.",
      ),
    });
    emitState(io, room);
  }
}

function revealRound(io: Server, room: Room) {
  if (room.phase !== "playing" || !room.question) return;
  if (room.roundTimer) clearTimeout(room.roundTimer);
  room.phase = "reveal";
  room.nextRoundAt = Date.now() + REVEAL_MS;
  touch(room);
  io.to(roomChannel(room.code)).emit("round_revealed", revealData(room));
  emitState(io, room);
  room.transitionTimer = setTimeout(() => {
    if (room.currentRound >= room.settings.rounds) {
      room.phase = "finished";
      touch(room);
      io.to(roomChannel(room.code)).emit("game_finished", {
        players: publicPlayers(room),
      });
      emitState(io, room);
    } else {
      room.currentRound += 1;
      void startRound(io, room);
    }
  }, REVEAL_MS);
  room.transitionTimer.unref();
}

function maybeReveal(io: Server, room: Room) {
  const active = [...room.players.values()].filter(
    (player) => player.connected,
  );
  if (
    active.length &&
    active.every((player) => player.answeredRound === room.currentRound)
  )
    revealRound(io, room);
}

function removePlayer(io: Server, room: Room, playerId: string) {
  const player = room.players.get(playerId);
  if (!player) return;
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  room.players.delete(playerId);
  if (room.hostId === playerId)
    room.hostId =
      [...room.players.values()].find((member) => member.connected)?.playerId ||
      room.players.keys().next().value ||
      "";
  if (!room.players.size) {
    clearRoomTimers(room);
    rooms.delete(room.code);
  } else {
    touch(room);
    emitState(io, room);
    maybeReveal(io, room);
  }
}

function currentPlayer(socket: Socket, room?: Room) {
  const player = room?.players.get(socket.data.playerId);
  return player?.connected &&
    player.socketId === socket.id &&
    socket.data.roomCode === room?.code
    ? player
    : undefined;
}

function detachSocket(io: Server, socket: Socket) {
  const room = rooms.get(socket.data.roomCode);
  const player = currentPlayer(socket, room);
  if (room && player) removePlayer(io, room, player.playerId);
  if (room) socket.leave(roomChannel(room.code));
  socket.data.playerId = undefined;
  socket.data.roomCode = undefined;
}

function attachPlayer(
  io: Server,
  socket: Socket,
  room: Room,
  player: Player,
  requestId?: string,
) {
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  if (player.socketId && player.socketId !== socket.id) {
    const previous = io.sockets.sockets.get(player.socketId);
    previous?.leave(roomChannel(room.code));
    if (previous) {
      previous.data.playerId = undefined;
      previous.data.roomCode = undefined;
      previous.emit("kicked_from_room");
    }
  }
  player.socketId = socket.id;
  player.connected = true;
  player.disconnectTimer = undefined;
  socket.join(roomChannel(room.code));
  socket.data.playerId = player.playerId;
  socket.data.roomCode = room.code;
  touch(room);
  socket.emit("joined_room", {
    ...(requestId ? { requestId } : {}),
    roomCode: room.code,
    playerId: player.playerId,
  });
  if (room.phase === "playing" || room.phase === "reveal")
    socket.emit("round_started", publicQuestion(room));
  if (room.phase === "reveal" && room.question)
    socket.emit("round_revealed", revealData(room));
  emitState(io, room);
}

export function registerGameHandlers(io: Server, socket: Socket) {
  socket.on("create_room", async (raw) => {
    const parsed = createRoomSchema.safeParse(raw);
    if (!parsed.success) return fail(socket, "Pseudo ou réglages invalides.");
    if (socket.data.creatingRoom)
      return fail(
        socket,
        "Une création est déjà en cours. Réessaie dans un instant.",
        parsed.data.requestId,
      );
    socket.data.creatingRoom = true;
    const settings = parsed.data.settings ?? DEFAULT_SETTINGS;
    try {
      if (usesPulse(settings)) {
        if (parsed.data.libraryOwnerId)
          await protectLibraryOwner(
            parsed.data.libraryOwnerId,
            parsed.data.accessToken,
          );
        await preparePlaylistSource(
          settings.pulsePlaylistId,
          parsed.data.libraryOwnerId,
          settings,
        );
      }
      if (!socket.connected) return;
      detachSocket(io, socket);
      const code = createCode();
      const player = createPlayer(
        parsed.data.playerToken,
        parsed.data.username,
        socket.id,
        true,
      );
      const room: Room = {
        code,
        players: new Map([[player.playerId, player]]),
        hostId: player.playerId,
        settings,
        libraryOwnerId: usesPulse(settings)
          ? parsed.data.libraryOwnerId
          : undefined,
        phase: "lobby",
        currentRound: 0,
        playedIds: [],
        question: null,
        startedAt: 0,
        deadline: 0,
        nextRoundAt: 0,
        updatedAt: Date.now(),
      };
      rooms.set(code, room);
      attachPlayer(io, socket, room, player, parsed.data.requestId);
    } catch (error) {
      fail(
        socket,
        publicErrorMessage(
          error,
          "Cette playlist est indisponible. Réessaie dans un instant.",
        ),
        parsed.data.requestId,
      );
    } finally {
      socket.data.creatingRoom = false;
    }
  });

  socket.on("join_room", (raw) => {
    const parsed = joinRoomSchema.safeParse(raw);
    if (!parsed.success)
      return fail(socket, "Code, pseudo ou identité invalide.");
    const room = rooms.get(parsed.data.roomCode);
    if (!room)
      return fail(
        socket,
        "Ce salon est introuvable ou a expiré.",
        parsed.data.requestId,
      );
    const activePlayer = currentPlayer(socket, room);
    if (activePlayer && activePlayer.playerToken !== parsed.data.playerToken) {
      return fail(
        socket,
        "Quitte le salon avant de changer d’identité.",
        parsed.data.requestId,
      );
    }
    let player = [...room.players.values()].find(
      (member) => member.playerToken === parsed.data.playerToken,
    );
    if (room.phase !== "lobby" && !player)
      return fail(socket, "La partie a déjà commencé.", parsed.data.requestId);
    if (!player && room.players.size >= 24)
      return fail(socket, "Le salon est complet.", parsed.data.requestId);
    if (socket.data.roomCode && socket.data.roomCode !== room.code)
      detachSocket(io, socket);
    if (!player) {
      player = createPlayer(
        parsed.data.playerToken,
        parsed.data.username,
        socket.id,
      );
      room.players.set(player.playerId, player);
    } else player.username = parsed.data.username;
    attachPlayer(io, socket, room, player, parsed.data.requestId);
  });

  socket.on("update_settings", async (raw) => {
    const parsed = updateSettingsSchema.safeParse(raw);
    if (!parsed.success) return fail(socket, "Paramètres invalides.");
    const room = rooms.get(parsed.data.roomCode);
    if (
      !room ||
      currentPlayer(socket, room)?.playerId !== room.hostId ||
      room.phase !== "lobby"
    )
      return fail(socket, "Action réservée à l’hôte.", parsed.data.requestId);
    if (socket.data.updatingSettings || room.starting)
      return fail(
        socket,
        "Un enregistrement est déjà en cours. Réessaie dans un instant.",
        parsed.data.requestId,
      );
    socket.data.updatingSettings = true;
    try {
      if (usesPulse(parsed.data.settings)) {
        if (parsed.data.libraryOwnerId)
          await protectLibraryOwner(
            parsed.data.libraryOwnerId,
            parsed.data.accessToken,
          );
        await preparePlaylistSource(
          parsed.data.settings.pulsePlaylistId,
          parsed.data.libraryOwnerId,
          parsed.data.settings,
        );
      }
      if (
        rooms.get(room.code) !== room ||
        currentPlayer(socket, room)?.playerId !== room.hostId ||
        room.phase !== "lobby"
      )
        return;
      room.settings = parsed.data.settings;
      room.libraryOwnerId = usesPulse(room.settings)
        ? parsed.data.libraryOwnerId
        : undefined;
      room.playlistTracks = undefined;
      room.musicPlan = undefined;
      room.players.forEach((player) => {
        if (player.playerId !== room.hostId) player.ready = false;
      });
      touch(room);
      emitState(io, room);
      socket.emit("settings_updated", { requestId: parsed.data.requestId });
    } catch (error) {
      fail(
        socket,
        publicErrorMessage(
          error,
          "Cette playlist est indisponible. Réessaie dans un instant.",
        ),
        parsed.data.requestId,
      );
    } finally {
      socket.data.updatingSettings = false;
    }
  });

  socket.on("toggle_ready", (raw) => {
    const code = roomCodeSchema.safeParse(raw?.roomCode);
    if (!code.success) return fail(socket, "Salon invalide.");
    const room = rooms.get(code.data);
    const player = currentPlayer(socket, room);
    if (!room || !player || room.phase !== "lobby")
      return fail(socket, "Le statut ne peut pas être modifié maintenant.");
    if (player.playerId !== room.hostId) player.ready = !player.ready;
    touch(room);
    emitState(io, room);
  });

  socket.on("start_game", async (raw) => {
    const parsed = startGameSchema.safeParse(raw);
    if (!parsed.success) return fail(socket, "Salon invalide.");
    const { roomCode, requestId, accessToken } = parsed.data;
    const room = rooms.get(roomCode);
    if (
      !room ||
      currentPlayer(socket, room)?.playerId !== room.hostId ||
      room.phase !== "lobby"
    )
      return fail(socket, "Action réservée à l’hôte.", requestId);
    if (room.starting || socket.data.updatingSettings)
      return fail(
        socket,
        "Une opération est déjà en cours. Réessaie dans un instant.",
        requestId,
      );
    room.starting = true;
    const settings = room.settings;
    const hostId = room.hostId;
    try {
      if (usesPulse(settings) && room.libraryOwnerId)
        await protectLibraryOwner(room.libraryOwnerId, accessToken);
      if (
        rooms.get(room.code) !== room ||
        room.phase !== "lobby" ||
        room.settings !== settings ||
        room.hostId !== hostId ||
        currentPlayer(socket, room)?.playerId !== hostId
      )
        return fail(
          socket,
          "Le salon a changé. Actualise les réglages avant de démarrer.",
          requestId,
        );
      const waiting = [...room.players.values()].some(
        (player) =>
          player.connected && player.playerId !== room.hostId && !player.ready,
      );
      if (waiting)
        return fail(
          socket,
          "Tous les joueurs connectés doivent être prêts.",
          requestId,
        );
      room.players.forEach((player) => {
        player.score = 0;
        player.answeredRound = null;
      });
      room.currentRound = 1;
      room.playedIds = [];
      room.playlistTracks = undefined;
      room.musicPlan = undefined;
      void startRound(io, room);
    } catch (error) {
      fail(
        socket,
        publicErrorMessage(
          error,
          "Impossible de vérifier cette playlist pour le moment.",
        ),
        requestId,
      );
    } finally {
      room.starting = false;
    }
  });

  socket.on("return_to_lobby", (raw) => {
    const code = roomCodeSchema.safeParse(raw?.roomCode);
    if (!code.success) return;
    const room = rooms.get(code.data);
    if (
      !room ||
      currentPlayer(socket, room)?.playerId !== room.hostId ||
      room.phase !== "finished"
    )
      return fail(socket, "Action réservée à l’hôte.");
    clearRoomTimers(room);
    room.phase = "lobby";
    room.currentRound = 0;
    room.question = null;
    room.deadline = 0;
    room.playlistTracks = undefined;
    room.musicPlan = undefined;
    room.players.forEach((player) => {
      player.answeredRound = null;
      player.ready = player.playerId === room.hostId;
    });
    touch(room);
    emitState(io, room);
  });

  socket.on("submit_answer", (raw) => {
    const parsed = answerSchema.safeParse(raw);
    if (!parsed.success) return fail(socket, "Réponse invalide.");
    const room = rooms.get(parsed.data.roomCode);
    const player = currentPlayer(socket, room);
    if (
      !room ||
      !player ||
      player.playerToken !== parsed.data.playerToken ||
      room.phase !== "playing" ||
      !room.question
    )
      return fail(socket, "Cette réponse ne peut plus être enregistrée.");
    if (player.answeredRound === room.currentRound) return;
    const submittedAt = Date.now();
    if (submittedAt < room.startedAt || submittedAt > room.deadline) return;
    const correct = isCorrectAnswer(parsed.data.answer, room.question);
    const progressivePoints = [1000, 800, 600, 400, 200, 100];
    const points =
      room.settings.mode === "progressive"
        ? correct
          ? (progressivePoints[player.progressiveTier] ?? 100)
          : 0
        : calculateScore(correct, submittedAt, room.startedAt, room.deadline);
    player.answeredRound = room.currentRound;
    player.score += points;
    touch(room);
    socket.emit("answer_result", { correct, points, totalScore: player.score });
    emitState(io, room);
    maybeReveal(io, room);
  });

  socket.on("request_segment", (raw) => {
    const code = roomCodeSchema.safeParse(raw?.roomCode);
    const tier = raw?.tier;
    if (!code.success || !Number.isInteger(tier) || tier < 0 || tier > 5)
      return;
    const room = rooms.get(code.data);
    const player = currentPlayer(socket, room);
    if (
      !room ||
      !player ||
      room.phase !== "playing" ||
      room.settings.mode !== "progressive" ||
      tier > player.progressiveTier + 1 ||
      player.answeredRound === room.currentRound ||
      Date.now() < room.startedAt ||
      Date.now() > room.deadline
    )
      return;
    player.progressiveTier = Math.max(player.progressiveTier, tier);
    touch(room);
  });

  socket.on("kick_player", (raw) => {
    const code = roomCodeSchema.safeParse(raw?.roomCode);
    const playerId = typeof raw?.playerId === "string" ? raw.playerId : "";
    if (!code.success) return fail(socket, "Salon invalide.");
    const room = rooms.get(code.data);
    if (
      !room ||
      currentPlayer(socket, room)?.playerId !== room.hostId ||
      playerId === room.hostId
    )
      return fail(socket, "Expulsion impossible.");
    const target = room.players.get(playerId);
    if (!target) return;
    const targetSocket = target.socketId
      ? io.sockets.sockets.get(target.socketId)
      : undefined;
    if (targetSocket) {
      targetSocket.emit("kicked_from_room");
      targetSocket.leave(roomChannel(room.code));
      targetSocket.data.playerId = undefined;
      targetSocket.data.roomCode = undefined;
    }
    removePlayer(io, room, playerId);
  });

  socket.on("leave_room", (raw) => {
    const code = roomCodeSchema.safeParse(raw?.roomCode);
    if (code.success && code.data === socket.data.roomCode)
      detachSocket(io, socket);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.data.playerId);
    if (!room || !player || player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    touch(room);
    emitState(io, room);
    maybeReveal(io, room);
    player.disconnectTimer = setTimeout(() => {
      if (!player.connected) removePlayer(io, room, player.playerId);
    }, RECONNECT_GRACE_MS);
    player.disconnectTimer.unref();
  });
}

setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [code, room] of rooms) {
    if (room.updatedAt >= cutoff) continue;
    clearRoomTimers(room);
    room.players.forEach((player) => {
      if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    });
    rooms.delete(code);
  }
}, 60_000).unref();
