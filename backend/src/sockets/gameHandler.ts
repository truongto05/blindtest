import { Server, Socket } from 'socket.io';
import { generateQuizData } from '../services/choiceService';
import { generateMovieQuizData } from '../services/movieChoiceService';

type Player = {
  id: string;
  username: string;
  score: number;
};

type Room = {
  players: Player[];
  settings: any;
  currentRound: number;
  playedIds: string[];
  answersReceived: number;
  hostId: string | null;
};

const rooms: Record<string, Room> = {};

function ensureHost(room: Room) {
  if (room.hostId && room.players.some((player) => player.id === room.hostId)) return;
  room.hostId = room.players[0]?.id ?? null;
}

function emitRoomUpdated(io: Server, roomCode: string) {
  const room = rooms[roomCode];
  if (!room) return;

  ensureHost(room);
  io.to(roomCode).emit(
    'room_updated',
    room.players.map((player) => ({ ...player, isHost: player.id === room.hostId }))
  );
}

function isHost(room: Room, socketId: string) {
  ensureHost(room);
  return room.hostId === socketId;
}

export const registerGameHandlers = (io: Server, socket: Socket) => {

  socket.on('join_room', ({ roomCode, username }) => {
    if (!roomCode || !username) return;
    socket.join(roomCode);
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: [], settings: null, currentRound: 0, playedIds: [], answersReceived: 0, hostId: socket.id };
    }
    const room = rooms[roomCode];
    const existingPlayer = room.players.find((p) => p.username === username);
    if (existingPlayer) {
      if (existingPlayer.id === room.hostId) room.hostId = socket.id;
      existingPlayer.id = socket.id;
    } else {
      room.players.push({ id: socket.id, username, score: 0 });
    }

    emitRoomUpdated(io, roomCode);
  });

  socket.on('start_game', async ({ roomCode, settings }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (!isHost(room, socket.id)) {
      socket.emit('room_error', { message: 'Seul le chef du salon peut lancer la partie.' });
      return;
    }

    room.settings = settings;
    room.currentRound = 1;
    room.playedIds = [];
    room.answersReceived = 0;
    room.players.forEach((p) => p.score = 0);
    await sendNewRound(io, roomCode);
  });

  socket.on('kick_player', ({ roomCode, playerId }) => {
    const room = rooms[roomCode];
    if (!room || !playerId) return;
    if (!isHost(room, socket.id)) {
      socket.emit('room_error', { message: 'Seul le chef du salon peut expulser un joueur.' });
      return;
    }
    if (playerId === room.hostId) {
      socket.emit('room_error', { message: "Le chef du salon ne peut pas s'expulser lui-meme." });
      return;
    }

    const playerIndex = room.players.findIndex((player) => player.id === playerId);
    if (playerIndex === -1) return;

    room.players.splice(playerIndex, 1);

    const kickedSocket = io.sockets.sockets.get(playerId);
    kickedSocket?.emit('kicked_from_room', { roomCode });
    kickedSocket?.leave(roomCode);

    emitRoomUpdated(io, roomCode);
  });

  socket.on('submit_answer', ({ roomCode, points }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    player.score += points;
    room.answersReceived++;

    if (room.answersReceived >= room.players.length) {
      setTimeout(async () => {
        if (room.currentRound >= room.settings.rounds) {
          io.to(roomCode).emit('game_over', room.players);
        } else {
          room.currentRound++;
          room.answersReceived = 0;
          await sendNewRound(io, roomCode);
        }
      }, 2500); 
    }
  });

  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) delete rooms[roomCode];
        else emitRoomUpdated(io, roomCode);
      }
    }
  });
};

async function sendNewRound(io: Server, roomCode: string) {
  const room = rooms[roomCode];
  if (!room) return;

  try {
    const gameType = room.settings.gameType || 'music';
    let quizData;

    // Aiguillage ici aussi pour le mode Film en multi
    if (['movie', 'series', 'screen'].includes(gameType)) {
      quizData = await generateMovieQuizData(gameType, room.playedIds);
    } else {
      quizData = await generateQuizData(room.settings.genre, room.settings.answerType, room.playedIds, room.settings.customPlaylistUrl);
    }

    room.playedIds.push(quizData.trackId);
    io.to(roomCode).emit('new_round', { ...quizData, currentRound: room.currentRound, settings: room.settings });
  } catch (error) {
    console.error(`Erreur génération round pour ${roomCode}:`, error);
    io.to(roomCode).emit('generation_error');
  }
}
