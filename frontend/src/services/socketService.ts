import { io } from 'socket.io-client';

// On se connecte au backend (assure-toi que c'est le bon port)
export const socket = io('http://192.168.10.16:3001', {
  autoConnect: true, // Se connecte automatiquement
});