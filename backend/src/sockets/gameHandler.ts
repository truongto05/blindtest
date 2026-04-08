import { Server, Socket } from 'socket.io';
import { generateQuizData } from '../services/choiceService';

// On stocke l'état des salons en mémoire
const rooms: Record<string, any> = {};

export const registerGameHandlers = (io: Server, socket: Socket) => {

  // --- REJOINDRE UN SALON ---
  socket.on('join_room', ({ roomCode, username }) => {
    if (!roomCode || !username) return;

    socket.join(roomCode);

    // Si la room n'existe pas, on l'initialise
    if (!rooms[roomCode]) {
      rooms[roomCode] = { 
        players: [], 
        settings: null,
        currentRound: 0, 
        playedIds: [], 
        answersReceived: 0 
      };
    }

    // On évite les doublons de pseudo
    const existingPlayer = rooms[roomCode].players.find((p: any) => p.username === username);
    if (existingPlayer) {
      existingPlayer.id = socket.id; // Mise à jour de l'ID si reconnexion
    } else {
      rooms[roomCode].players.push({ id: socket.id, username, score: 0 });
    }

    // On prévient tout le monde dans la room
    io.to(roomCode).emit('room_updated', rooms[roomCode].players);
    console.log(`👤 ${username} a rejoint le salon ${roomCode}`);
  });

  // --- LANCER LA PARTIE ---
  socket.on('start_game', async ({ roomCode, settings }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.settings = settings;
    room.currentRound = 1;
    room.playedIds = [];
    room.answersReceived = 0;
    
    // On remet les scores à zéro pour le début
    room.players.forEach((p: any) => p.score = 0);

    await sendNewRound(io, roomCode);
  });

  // --- SOUMETTRE UNE RÉPONSE ---
  socket.on('submit_answer', ({ roomCode, points }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find((p: any) => p.id === socket.id);
    if (player) {
      player.score += points;
    }

    room.answersReceived++;

    // Quand tout le monde a répondu
    if (room.answersReceived >= room.players.length) {
      setTimeout(async () => {
        // Est-ce la fin de la partie ?
        if (room.currentRound >= room.settings.rounds) {
          io.to(roomCode).emit('game_over', room.players);
        } else {
          room.currentRound++;
          room.answersReceived = 0;
          await sendNewRound(io, roomCode);
        }
      }, 2500); // Temps pour voir la correction sur le frontend
    }
  });

  // --- DÉCONNEXION ---
  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);

      if (playerIndex !== -1) {
        const name = room.players[playerIndex].username;
        room.players.splice(playerIndex, 1);
        
        if (room.players.length === 0) {
          delete rooms[roomCode];
        } else {
          io.to(roomCode).emit('room_updated', room.players);
        }
        console.log(`❌ ${name} a quitté le salon ${roomCode}`);
      }
    }
  });
};

/**
 * Fonction interne pour générer et envoyer une manche à toute la room
 */
async function sendNewRound(io: Server, roomCode: string) {
  const room = rooms[roomCode];
  if (!room) return;

  try {
    // Appel du service corrigé
    const quizData = await generateQuizData(
      room.settings.genre, 
      room.settings.answerType, 
      room.playedIds, 
      room.settings.customPlaylistUrl
    );

    room.playedIds.push(quizData.trackId);

    // Envoi à TOUS les joueurs du salon
    io.to(roomCode).emit('new_round', { 
      ...quizData, 
      currentRound: room.currentRound,
      settings: room.settings 
    });
  } catch (error) {
    console.error(`Erreur génération round pour ${roomCode}:`, error);
    io.to(roomCode).emit('generation_error');
  }
}