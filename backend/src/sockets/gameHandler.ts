import { Server, Socket } from 'socket.io';
import { generateQuizData } from '../services/choiceService';
import { generateMovieQuizData } from '../services/movieChoiceService';

const rooms: Record<string, any> = {};

export const registerGameHandlers = (io: Server, socket: Socket) => {

  socket.on('join_room', ({ roomCode, username }) => {
    if (!roomCode || !username) return;
    socket.join(roomCode);
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: [], settings: null, currentRound: 0, playedIds: [], answersReceived: 0 };
    }
    const existingPlayer = rooms[roomCode].players.find((p: any) => p.username === username);
    if (existingPlayer) existingPlayer.id = socket.id;
    else rooms[roomCode].players.push({ id: socket.id, username, score: 0 });

    io.to(roomCode).emit('room_updated', rooms[roomCode].players);
  });

  socket.on('start_game', async ({ roomCode, settings }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.settings = settings;
    room.currentRound = 1;
    room.playedIds = [];
    room.answersReceived = 0;
    room.players.forEach((p: any) => p.score = 0);
    await sendNewRound(io, roomCode);
  });

  socket.on('submit_answer', ({ roomCode, points }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find((p: any) => p.id === socket.id);
    if (player) player.score += points;
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
      const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) delete rooms[roomCode];
        else io.to(roomCode).emit('room_updated', room.players);
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