import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// Imports des routes et handlers (fichiers suivants)
import playlistRoutes from './routes/playlistRoutes';
import searchRoutes from './routes/searchRoutes';
import quizRoutes from './routes/quizRoutes';
import { registerGameHandlers } from './sockets/gameHandler';

const app = express();
const httpServer = createServer(app);

// Configuration Socket.io avec gestion du CORS pour le frontend
const io = new Server(httpServer, {
  cors: {
    origin: "*", // En production, remplace par l'URL de ton site
    methods: ["GET", "POST"]
  }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Routes API modulaires
app.use('/api/playlists', playlistRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/quiz', quizRoutes);

// Connexion des Sockets
io.on('connection', (socket) => {
  console.log(`⚡ Nouveau joueur connecté : ${socket.id}`);
  
  // On enregistre toute la logique de jeu (salon, scores, manches)
  registerGameHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log(`❌ Joueur déconnecté : ${socket.id}`);
  });
});

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur Blindtest Pro lancé sur port ${PORT}`);
});