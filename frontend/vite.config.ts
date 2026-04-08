import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'My Blindtest App',
        short_name: 'Blindtest',
        description: 'Le meilleur jeu de blindtest multijoueur',
        theme_color: '#1DB954', // Couleur de ton app (ex: vert style Spotify)
        background_color: '#121212',
        display: 'standalone', // Retire la barre d'URL du navigateur
        orientation: 'portrait',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  // 👇 C'EST ICI QU'ON RÈGLE TON PROBLÈME D'ERREUR HTML 👇
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001', 
        changeOrigin: true,
      },
    },
  },
});