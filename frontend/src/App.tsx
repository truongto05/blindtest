import React, { useState, useEffect } from 'react';
import { socket } from './services/socketService';
import { Howler } from 'howler';

// Pages & UI
import Toast from './components/ui/Toast';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import SettingsPage from './pages/Settings';
import PlaylistsPage from './pages/Playlists';
import EndScreen from './pages/EndScreen';
import GameBoard from './components/GameBoard';

// Types
export type GameMode = 'classic' | 'progressive';
export type AnswerType = 'random' | 'both' | 'artist' | 'title';
export type GenreType = 'all' | 'all_mix' | 'rap' | '80s' | 'rock' | 'electro' | 'pop' | 'francaise' | 'rnb' | 'metal' | 'reggae' | 'jazz' | 'rapus' | 'custom';
export type GameType = 'music' | 'movie' | 'series' | 'screen';
export type AnswerMode = 'choices' | 'input';
export type Settings = { mode: GameMode; rounds: number; timeLimit: number; genre: GenreType; answerType: AnswerType; gameType: GameType; answerMode: AnswerMode; customPlaylistUrl: string; showPoster: boolean; };

const DEFAULT_SETTINGS: Settings = { mode: 'classic', rounds: 5, timeLimit: 15, genre: 'all', answerType: 'random', gameType: 'music', answerMode: 'choices', customPlaylistUrl: '', showPoster: true };
type GameState = 'home' | 'settings' | 'lobby' | 'playing' | 'end' | 'playlists';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('home');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [finalScore, setFinalScore] = useState(0);
  const [gameHistory, setGameHistory] = useState<any[]>([]);

  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [initialQuizData, setInitialQuizData] = useState<any>(null);
  const [isStarting, setIsStarting] = useState(false);

  // --- ÉTATS PLAYLISTS & MODALE ---
  const [guestId, setGuestId] = useState<string>('');
  const [importCode, setImportCode] = useState('');
  const [libraryPlaylists, setLibraryPlaylists] = useState<any[]>([]);
  const [selectedLibraryPlaylist, setSelectedLibraryPlaylist] = useState<any>(null);
  const [addedTracks, setAddedTracks] = useState<Set<string>>(new Set());
  
  // Modale d'ajout
  const [showPlaylistModal, setShowPlaylistModal] = useState<any>(null); 
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Initialisation du Cadenas (GuestID)
  useEffect(() => {
    let storedId = localStorage.getItem('blindtest_guest_id');
    if (!storedId) {
      storedId = 'JOUEUR-' + Math.random().toString(36).substring(2, 7).toUpperCase();
      localStorage.setItem('blindtest_guest_id', storedId);
    }
    setGuestId(storedId);
  }, []);

  // Gestion des Sockets
  useEffect(() => {
    socket.on('room_updated', (updatedPlayers: any[]) => setPlayers(updatedPlayers));
    socket.on('new_round', (data: any) => {
      setInitialQuizData(data);
      if (data.settings) setSettings(data.settings);
      setIsStarting(false); 
      setGameState('playing');
    });
    return () => { socket.off('room_updated'); socket.off('new_round'); };
  }, []);

  // --- LOGIQUE PLAYLISTS ---
  
  // Fonction pour rafraîchir la liste complète des playlists
  const fetchLibrary = async () => {
    if (!guestId) return;
    try {
      const res = await fetch(`${API_URL}/api/playlists?ownerId=${guestId}`);
      const data = await res.json();
      setLibraryPlaylists(data);
    } catch (e) { console.error("Erreur fetch library", e); }
  };

  // On fetch la bibliothèque dès que l'ID change ou qu'on va sur les pages concernées
  useEffect(() => {
    if (guestId) fetchLibrary();
  }, [guestId, gameState]);

  const handleAddToPlaylist = async (playlistId: string, track: any) => {
    try {
      const res = await fetch(`${API_URL}/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deezerId: track.trackId,
          title: track.trackTitle || track.correctAnswer,
          artist: track.artistName || 'Inconnu',
          coverUrl: track.coverUrl || '',
          previewUrl: track.audioUrl || ''
        })
      });
      
      if (res.ok) {
        showToast(`✅ Musique ajoutée !`);
        setAddedTracks(prev => new Set(prev).add(track.trackId));
        setShowPlaylistModal(null);
        // CRUCIAL : On rafraîchit la library pour mettre à jour les "est déjà dedans" et les compteurs
        await fetchLibrary();
      }
    } catch (e) { showToast("❌ Erreur lors de l'ajout", "error"); }
  };

  const handleCreatePlaylist = async (e: React.FormEvent, track: any) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName, ownerId: guestId }) 
      });
      const newPlaylist = await res.json();
      await handleAddToPlaylist(newPlaylist.id, track);
      setNewPlaylistName('');
    } catch (e) { showToast("❌ Erreur de création", "error"); }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans relative overflow-hidden">
      {/* Background FX */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none"></div>
      
      <Toast toast={toast} />

      <div className="relative z-10">
        {gameState === 'home' && <Home onJoinMulti={(code) => { setIsMultiplayer(true); setRoomCode(code); setGameState('lobby'); }} onPlaySolo={() => { setIsMultiplayer(false); setGameState('settings'); }} onGoPlaylists={() => setGameState('playlists')} />}

        {gameState === 'lobby' && <Lobby roomCode={roomCode} players={players} username={username} setUsername={setUsername} isStarting={isStarting} onBack={() => setGameState('home')} onSettings={() => setGameState('settings')} onStart={() => { setIsStarting(true); socket.emit('start_game', { roomCode, settings }); }} />}

        {gameState === 'settings' && <SettingsPage settings={settings} setSettings={setSettings} isMultiplayer={isMultiplayer} onBack={() => setGameState(isMultiplayer ? 'lobby' : 'home')} onSave={() => setGameState(isMultiplayer ? 'lobby' : 'playing')} />}

        {gameState === 'playing' && <GameBoard settings={settings} isMultiplayer={isMultiplayer} roomCode={roomCode} initialData={initialQuizData} onGameEnd={(score, history) => { setFinalScore(score); setGameHistory(history); setGameState('end'); }} />}

        {gameState === 'end' && (
          <EndScreen 
            score={finalScore} history={gameHistory} addedTracks={addedTracks}
            onReplay={() => { setGameState(isMultiplayer ? 'lobby' : 'home'); setFinalScore(0); setGameHistory([]); setAddedTracks(new Set()); }}
            onShowPlaylistModal={(track) => setShowPlaylistModal(track)}
          />
        )}

        {gameState === 'playlists' && (
          <PlaylistsPage 
            guestId={guestId} 
            importCode={importCode} setImportCode={setImportCode} 
            onImportCode={(e) => { e.preventDefault(); localStorage.setItem('blindtest_guest_id', importCode.toUpperCase()); setGuestId(importCode.toUpperCase()); setImportCode(''); showToast("🔑 Cadenas mis à jour"); }} 
            libraryPlaylists={libraryPlaylists} 
            selectedPlaylist={selectedLibraryPlaylist} setSelectedPlaylist={setSelectedLibraryPlaylist} 
            onBack={() => setGameState('home')} 
          />
        )}
      </div>

      {/* --- MODALE D'AJOUT CORRIGÉE --- */}
      {showPlaylistModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl relative">
            <button onClick={() => setShowPlaylistModal(null)} className="absolute top-6 right-6 text-zinc-500 hover:text-white font-black text-xl">✕</button>
            <h3 className="text-2xl font-black mb-2">Sauvegarder</h3>
            <p className="text-zinc-500 text-sm mb-8">Choisis une playlist pour ce titre.</p>
            
            <div className="space-y-2 mb-8 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {libraryPlaylists.map(pl => {
                // LOGIQUE "EST DÉJÀ DEDANS"
                const isAlreadyIn = pl.tracks?.some((t: any) => String(t.deezerId) === String(showPlaylistModal.trackId));
                
                return (
                  <button 
                    key={pl.id} 
                    disabled={isAlreadyIn}
                    onClick={() => handleAddToPlaylist(pl.id, showPlaylistModal)} 
                    className={`w-full text-left p-4 rounded-2xl border transition-all flex justify-between items-center group ${
                      isAlreadyIn ? 'bg-zinc-800/50 border-emerald-500/30 opacity-60 cursor-not-allowed' : 'bg-zinc-950 border-zinc-800 hover:border-indigo-500'
                    }`}
                  >
                    <div>
                      <span className={`font-bold block ${isAlreadyIn ? 'text-zinc-500' : 'text-zinc-100'}`}>{pl.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{pl.tracks?.length || 0} titres</span>
                    </div>
                    {isAlreadyIn ? (
                      <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">DÉJÀ DEDANS ✓</span>
                    ) : (
                      <span className="text-xs text-zinc-600 group-hover:text-indigo-400">Ajouter +</span>
                    )}
                  </button>
                );
              })}
            </div>

            <form onSubmit={(e) => handleCreatePlaylist(e, showPlaylistModal)} className="pt-6 border-t border-zinc-800">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-3">Nouvelle Playlist</label>
              <div className="flex gap-2">
                <input type="text" placeholder="Nom..." value={newPlaylistName} onChange={e => setNewPlaylistName(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 outline-none focus:border-indigo-500 font-bold" />
                <button type="submit" disabled={!newPlaylistName.trim()} className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-xl font-bold transition-all disabled:opacity-50">CRÉER</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}