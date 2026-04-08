import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { ChoiceService, DYNAMIC_MOVIES, DYNAMIC_SERIES } from './services/choiceService';

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient(); 

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

ChoiceService.initCinematheque(process.env.TMDB_API_KEY);

// ==========================================
// 💾 ROUTES DE LA BDD (AVEC OWNER ID)
// ==========================================

// 👇 On récupère uniquement les playlists de CE joueur
app.get('/api/playlists', async (req, res) => {
  try {
    const ownerId = req.query.ownerId as string;
    if (!ownerId) return res.json([]);

    const playlists = await prisma.playlist.findMany({ 
      where: { ownerId }, // Filtre magique
      include: { tracks: true } 
    });
    res.json(playlists);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 👇 On crée la playlist en l'attachant à CE joueur
app.post('/api/playlists', async (req, res) => {
  try {
    const { name, ownerId } = req.body;
    if (!name || !ownerId) return res.status(400).json({ error: "Nom et OwnerId requis" });
    
    const playlist = await prisma.playlist.create({ data: { name, ownerId } });
    res.json(playlist);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// L'ajout de musique ne change pas (la playlist appartient déjà au joueur)
app.post('/api/playlists/:id/tracks', async (req, res) => {
  try {
    const { id } = req.params;
    const { deezerId, title, artist, coverUrl, previewUrl } = req.body;

    await prisma.track.upsert({
      where: { deezerId: String(deezerId) },
      update: {}, 
      create: { deezerId: String(deezerId), title, artist, coverUrl, previewUrl }
    });

    await prisma.playlist.update({
      where: { id },
      data: { tracks: { connect: { deezerId: String(deezerId) } } }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 🎮 ROUTES DU JEU (INCHANGÉES)
// ==========================================

app.get('/api/quiz/next', async (req, res) => {
  try {
    const genre = (req.query.genre as string) || 'all';
    const answerType = (req.query.type as string) || 'both';
    const gameType = (req.query.gameType as string) || 'music'; 
    let playedIds: number[] = [];
    if (req.query.playedIds) playedIds = (req.query.playedIds as string).split(',').map(Number);
    const customPlaylistUrl = req.query.customPlaylistUrl as string | undefined;
    
    const quizData = await ChoiceService.getRandomTrackWithChoices(genre, answerType, playedIds, customPlaylistUrl, gameType);
    res.json(quizData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    const type = req.query.type as string; 
    if (!q) return res.json([]);
    const qLower = q.toLowerCase();

    const hasAsianChars = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
    const getValidTitle = (r: any) => {
      const title = r.title || r.name;
      const original = r.original_title || r.original_name;
      if (title && !hasAsianChars.test(title)) return title;
      if (original && !hasAsianChars.test(original)) return original;
      return null;
    };

    if (type === 'movie' || type === 'series' || type === 'screen') {
      if (process.env.TMDB_API_KEY) {
         const searchType = type === 'movie' ? 'movie' : type === 'series' ? 'tv' : 'multi';
         const response = await fetch(`https://api.themoviedb.org/3/search/${searchType}?query=${encodeURIComponent(q)}&api_key=${process.env.TMDB_API_KEY}&language=fr-FR`);
         const data = await response.json();
         let suggestions = (data.results || []).map(getValidTitle).filter(Boolean);
         suggestions = Array.from(new Set(suggestions)).slice(0, 5);
         return res.json(suggestions);
      } else {
         const list = type === 'movie' ? DYNAMIC_MOVIES : type === 'series' ? DYNAMIC_SERIES : [...DYNAMIC_MOVIES, ...DYNAMIC_SERIES];
         const suggestions = list.filter(item => item.toLowerCase().includes(qLower)).slice(0, 5);
         return res.json(suggestions);
      }
    }

    const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15`);
    const data = await response.json();
    if (!data.data) return res.json([]);
    
    let suggestions: string[] = [];
    data.data.forEach((t: any) => {
      if (type === 'artist') suggestions.push(t.artist.name);
      else if (['title'].includes(type)) {
        const cleanTitle = t.title.replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/\s*-\s*(Remastered|Live|Radio Edit|Mono|Stereo|Version|Edit|Mix).*$/i, '').trim();
        suggestions.push(cleanTitle);
      } else {
        const cleanTitle = t.title.replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/\s*-\s*(Remastered|Live|Radio Edit|Mono|Stereo|Version|Edit|Mix).*$/i, '').trim();
        suggestions.push(`${t.artist.name} - ${cleanTitle}`);
      }
    });
    
    suggestions = Array.from(new Set(suggestions)).filter(Boolean).slice(0, 5);
    res.json(suggestions);
  } catch (error) {
    console.error('Search error', error);
    res.json([]);
  }
});

const rooms: Record<string, { players: any[], settings: any, playedIds: number[], currentRound: number, isGenerating: boolean }> = {};

io.on('connection', (socket) => {
  console.log(`⚡ Connecté : ${socket.id}`);

  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { players: [], settings: {}, playedIds: [], currentRound: 0, isGenerating: false };
    rooms[roomCode].players = rooms[roomCode].players.filter(p => p.id !== socket.id);
    rooms[roomCode].players.push({ id: socket.id, username, score: 0, ready: false, hasAnswered: false });
    io.to(roomCode).emit('room_updated', rooms[roomCode].players);
  });

  const sendNextRound = async (roomCode: string) => {
    const room = rooms[roomCode];
    if (!room || room.isGenerating) return; 
    
    room.isGenerating = true;
    try {
      room.players.forEach(p => p.hasAnswered = false);
      const quizData = await ChoiceService.getRandomTrackWithChoices(room.settings.genre, room.settings.answerType, room.playedIds, room.settings.customPlaylistUrl, room.settings.gameType);
      room.playedIds.push(quizData.trackId);
      room.currentRound++;
      io.to(roomCode).emit('new_round', {
        ...quizData,
        currentRound: room.currentRound,
        totalRounds: room.settings.rounds,
        settings: room.settings
      });
    } catch (error) { 
      console.error("Erreur serveur :", error); 
      io.to(roomCode).emit('generation_error'); 
    } finally {
      room.isGenerating = false;
    }
  };

  socket.on('start_game', async ({ roomCode, settings }) => {
    if (!rooms[roomCode]) return;
    rooms[roomCode].settings = settings;
    rooms[roomCode].currentRound = 0;
    rooms[roomCode].playedIds = [];
    rooms[roomCode].players.forEach(p => { p.score = 0; p.hasAnswered = false; });
    await sendNextRound(roomCode);
  });

  socket.on('submit_answer', ({ roomCode, points }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    
    if (player && !player.hasAnswered) {
      player.hasAnswered = true;
      player.score += points || 0;
      io.to(roomCode).emit('room_updated', room.players);

      const allAnswered = room.players.every(p => p.hasAnswered);
      if (allAnswered) {
        setTimeout(() => {
          if (room.currentRound >= room.settings.rounds) io.to(roomCode).emit('game_over');
          else sendNextRound(roomCode).catch(console.error);
        }, 1500); 
      }
    }
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      room.players = room.players.filter(p => p.id !== socket.id);
      io.to(code).emit('room_updated', room.players);

      if (room.players.length > 0 && room.currentRound > 0) {
        const allAnswered = room.players.every(p => p.hasAnswered);
        if (allAnswered) {
          setTimeout(() => {
            if (room.currentRound >= room.settings.rounds) io.to(code).emit('game_over');
            else sendNextRound(code).catch(console.error);
          }, 1500);
        }
      }
    }
  });
});

httpServer.listen(3001, '0.0.0.0', () => {
  console.log(`🚀 Serveur backend sur port 3001`);
});