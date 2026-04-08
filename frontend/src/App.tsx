import React, { useState, useEffect } from 'react';
import GameBoard from './components/GameBoard';
import { socket } from './services/socketService';
import { Howler } from 'howler'; 

export type GameMode = 'classic' | 'progressive';
export type AnswerType = 'random' | 'both' | 'artist' | 'title';
export type GenreType = 'all' | 'all_mix' | 'rap' | '80s' | 'rock' | 'electro' | 'pop' | 'francaise' | 'rnb' | 'metal' | 'reggae' | 'jazz' | 'rapus' | 'custom';
export type GameType = 'music' | 'movie' | 'series' | 'screen';
export type AnswerMode = 'choices' | 'input';

export type Settings = { mode: GameMode; rounds: number; timeLimit: number; genre: GenreType; answerType: AnswerType; gameType: GameType; answerMode: AnswerMode; customPlaylistUrl: string; };

const DEFAULT_SETTINGS: Settings = { mode: 'classic', rounds: 5, timeLimit: 15, genre: 'all', answerType: 'random', gameType: 'music', answerMode: 'choices', customPlaylistUrl: '' };

type GameState = 'home' | 'settings' | 'lobby' | 'playing' | 'end' | 'playlists';

const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001' : `http://${window.location.hostname}:3001`;

export default function App() {
  const [gameState, setGameState] = useState<GameState>('home');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [finalScore, setFinalScore] = useState(0);

  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [initialQuizData, setInitialQuizData] = useState<any>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Système de notifications esthétiques (Toasts)
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Gestion du Cadenas Secret
  const [guestId, setGuestId] = useState<string>('');
  const [importCode, setImportCode] = useState('');

  const [gameHistory, setGameHistory] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [showPlaylistModal, setShowPlaylistModal] = useState<any>(null); 
  const [newPlaylistName, setNewPlaylistName] = useState('');
  
  // Mémoriser les musiques déjà ajoutées pendant cette session
  const [addedTracks, setAddedTracks] = useState<Set<string>>(new Set());

  const [libraryPlaylists, setLibraryPlaylists] = useState<any[]>([]);
  const [selectedLibraryPlaylist, setSelectedLibraryPlaylist] = useState<any>(null);

  useEffect(() => {
    let storedId = localStorage.getItem('blindtest_guest_id');
    if (!storedId) {
      storedId = 'JOUEUR-' + Math.random().toString(36).substring(2, 7).toUpperCase();
      localStorage.setItem('blindtest_guest_id', storedId);
    }
    setGuestId(storedId);
  }, []);

  useEffect(() => {
    socket.on('room_updated', (updatedPlayers: any[]) => setPlayers(updatedPlayers));
    socket.on('new_round', (data: any) => {
      setInitialQuizData(data);
      if (data.settings) setSettings(data.settings);
      setIsStarting(false); 
      setGameState('playing');
    });
    socket.on('generation_error', () => {
      showToast("❌ Impossible de charger la musique. Essaie à nouveau !", "error");
      setIsStarting(false);
    });
    return () => { socket.off('room_updated'); socket.off('new_round'); socket.off('generation_error'); };
  }, []);

  useEffect(() => {
    if (gameState === 'playlists' && guestId) {
      fetchLibrary();
    }
  }, [gameState, guestId]);

  const fetchLibrary = async () => {
    try {
      const res = await fetch(`${API_URL}/api/playlists?ownerId=${guestId}`);
      const data = await res.json();
      setLibraryPlaylists(data);
    } catch (e) { console.error("Erreur chargement bibliothèque", e); }
  };

  const fetchPlaylistsForModal = async () => {
    try {
      const res = await fetch(`${API_URL}/api/playlists?ownerId=${guestId}`);
      const data = await res.json();
      setPlaylists(data);
    } catch (e) { console.error("Erreur chargement playlists", e); }
  };

  const handleAddToPlaylist = async (playlistId: string, track: any) => {
    try {
      await fetch(`${API_URL}/api/playlists/${playlistId}/tracks`, {
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
      showToast(`✅ Ajouté avec succès !`, "success");
      
      setAddedTracks(prev => new Set(prev).add(track.trackId));
      setShowPlaylistModal(null);
    } catch (e) { 
      showToast("❌ Erreur lors de l'ajout", "error"); 
    }
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
      fetchPlaylistsForModal(); 
    } catch (e) { 
      showToast("❌ Erreur de création", "error"); 
    }
  };

  const handleImportCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (importCode.trim().length >= 3) {
      const newCode = importCode.trim().toUpperCase().replace(/\s+/g, '-');
      localStorage.setItem('blindtest_guest_id', newCode);
      setGuestId(newCode);
      setImportCode('');
      showToast(`🔑 Cadenas mis à jour : ${newCode}`, "success");
    } else {
      showToast("❌ Ton cadenas doit faire au moins 3 caractères.", "error");
    }
  };

  const isMusicMode = settings.gameType === 'music';

  // COMPOSANT TOAST (NOTIFICATION)
  const ToastNotification = () => {
    if (!toast) return null;
    return (
      <div className={`fixed top-8 left-1/2 transform -translate-x-1/2 px-8 py-4 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] font-black text-lg z-[100] flex items-center justify-center transition-all duration-300 ease-out animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-[#1DB954] text-gray-900' : 'bg-red-500 text-white'}`}>
        {toast.message}
      </div>
    );
  };

  // ==========================================
  // 📚 PAGE : LA BIBLIOTHÈQUE DE PLAYLISTS
  // ==========================================
  if (gameState === 'playlists') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center overflow-y-auto relative">
        <ToastNotification />
        <div className="w-full max-w-4xl mt-8">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <button 
              onClick={() => { setGameState('home'); setSelectedLibraryPlaylist(null); }} 
              className="text-gray-400 hover:text-white font-bold transition"
            >
              ← Retour à l'accueil
            </button>
            
            {!selectedLibraryPlaylist && (
              <div className="bg-gray-800 px-4 py-3 rounded-xl text-sm border border-gray-700 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto shadow-lg">
                <div className="flex flex-col items-center sm:items-start">
                  <span className="text-gray-400 text-xs font-bold uppercase mb-1">🔑 Cadenas actuel</span>
                  <strong className="text-pink-400 text-lg tracking-wider">{guestId}</strong>
                </div>
                
                <div className="hidden sm:block w-px h-10 bg-gray-700"></div>
                
                <form onSubmit={handleImportCode} className="flex gap-2 w-full sm:w-auto">
                  <input 
                    type="text" 
                    placeholder="Choisir un mot de passe..." 
                    value={importCode} 
                    onChange={e => setImportCode(e.target.value)}
                    className="bg-gray-900 px-3 py-2 rounded-lg text-sm outline-none focus:border-pink-500 border border-transparent font-bold w-full sm:w-48 text-white uppercase placeholder-gray-600"
                  />
                  <button type="submit" disabled={!importCode} className="bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded-lg font-bold disabled:opacity-50 transition shadow-md">
                    Appliquer
                  </button>
                </form>
              </div>
            )}
          </div>

          {!selectedLibraryPlaylist ? (
            <>
              <h2 className="text-5xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 tracking-tight">
                MES PLAYLISTS
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {libraryPlaylists.length === 0 ? (
                  <div className="col-span-3 bg-gray-800 p-8 rounded-3xl text-center border-2 border-dashed border-gray-700">
                    <p className="text-gray-400 text-lg font-bold">Ton cadenas actuel est <span className="text-pink-400">{guestId}</span></p>
                    <p className="text-gray-500 mt-2">Ce cadenas est vide. Fais une partie pour sauvegarder tes premières découvertes, ou tape ton cadenas habituel en haut à droite !</p>
                  </div>
                ) : (
                  libraryPlaylists.map(pl => (
                    <button 
                      key={pl.id} 
                      onClick={() => setSelectedLibraryPlaylist(pl)} 
                      className="bg-gray-800 p-8 rounded-[2rem] hover:bg-gray-700 hover:scale-105 transition border-2 border-gray-700 text-left shadow-xl group"
                    >
                      <div className="bg-gray-900 w-12 h-12 rounded-full flex items-center justify-center text-xl mb-4 group-hover:bg-blue-600 transition">🎵</div>
                      <h3 className="text-2xl font-black mb-2 leading-tight">{pl.name}</h3>
                      <p className="text-blue-400 font-bold uppercase text-sm tracking-widest">{pl.tracks?.length || 0} sons</p>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="bg-gray-800 p-8 rounded-[2rem] border border-gray-700 shadow-2xl animate-fade-in">
              <div className="flex justify-between items-end mb-8 border-b border-gray-700 pb-6">
                <div>
                  <h3 className="text-4xl font-black text-white">{selectedLibraryPlaylist.name}</h3>
                  <p className="text-blue-400 font-bold mt-2">{selectedLibraryPlaylist.tracks?.length || 0} titres sauvegardés</p>
                </div>
                <button onClick={() => setSelectedLibraryPlaylist(null)} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-full font-bold transition">
                  ← Retour
                </button>
              </div>
              
              <div className="flex flex-col gap-4">
                {selectedLibraryPlaylist.tracks.length === 0 ? (
                   <p className="text-gray-500 italic">Cette playlist est vide.</p>
                ) : (
                  selectedLibraryPlaylist.tracks.map((track: any, i: number) => (
                    <div key={i} className="bg-gray-900 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between shadow-lg gap-4 border border-gray-800 hover:border-gray-600 transition">
                      <div className="flex items-center gap-4">
                         {track.coverUrl ? <img src={track.coverUrl} className="w-16 h-16 rounded-xl object-cover border-2 border-gray-700 shadow-md" alt="cover" /> : <div className="w-16 h-16 bg-gray-800 rounded-xl flex items-center justify-center text-2xl border border-gray-700">🎵</div>}
                         <div>
                           <p className="font-bold text-lg text-white leading-tight">{track.title}</p>
                           <p className="text-gray-400 text-sm font-bold mt-1">{track.artist}</p>
                         </div>
                      </div>
                      {track.previewUrl && (
                        <audio controls src={track.previewUrl} className="h-10 w-full sm:w-48 outline-none" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // 🏠 ACCUEIL
  // ==========================================
  if (gameState === 'home') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative">
        <ToastNotification />
        <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-12 text-center tracking-tighter">BLINDTEST ULTIME</h1>
        <div className="flex flex-col gap-6 w-full max-w-md">
          <button onClick={() => { Howler.ctx?.resume(); setIsMultiplayer(true); setRoomCode(Math.random().toString(36).substring(2, 8).toUpperCase()); setGameState('lobby'); }} className="bg-gray-800 border-2 border-green-500 p-8 rounded-3xl hover:scale-105 transition shadow-xl text-left">
            <h2 className="text-3xl font-bold text-green-400 mb-2">MODE MULTIJOUEUR</h2>
          </button>
          <button onClick={() => { Howler.ctx?.resume(); setIsMultiplayer(false); setSettings((prev) => ({ ...prev, mode: 'classic', gameType: 'music' })); setGameState('settings'); }} className="bg-gray-800 border-2 border-blue-500 p-8 rounded-3xl hover:scale-105 transition shadow-xl text-left">
            <h2 className="text-3xl font-bold text-blue-400 mb-2">MODE CLASSIQUE (SOLO)</h2>
          </button>
          <button onClick={() => { Howler.ctx?.resume(); setIsMultiplayer(false); setSettings((prev) => ({ ...prev, mode: 'progressive', gameType: 'music' })); setGameState('settings'); }} className="bg-gray-800 border-2 border-purple-500 p-8 rounded-3xl hover:scale-105 transition shadow-xl text-left">
            <h2 className="text-3xl font-bold text-purple-400 mb-2">MODE SONGLESS (SOLO)</h2>
          </button>
          <button onClick={() => { Howler.ctx?.resume(); setIsMultiplayer(false); setSettings((prev) => ({ ...prev, mode: 'classic', gameType: 'screen', answerType: 'title', genre: 'all' })); setGameState('settings'); }} className="bg-gray-800 border-2 border-yellow-500 p-8 rounded-3xl hover:scale-105 transition shadow-xl text-left">
            <h2 className="text-3xl font-bold text-yellow-400 mb-2">MODE CINÉMA (SOLO)</h2>
          </button>
          
          <button onClick={() => setGameState('playlists')} className="bg-gray-800 border-2 border-pink-500 p-6 rounded-3xl hover:scale-105 transition shadow-xl text-center mt-4">
            <h2 className="text-2xl font-black text-pink-400">📚 MES PLAYLISTS</h2>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // 👥 LOBBY
  // ==========================================
  if (gameState === 'lobby') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative">
        <ToastNotification />
        <button onClick={() => setGameState('home')} className="absolute top-8 left-8 text-gray-400 hover:text-white font-bold">← Retour</button>
        <h2 className="text-4xl font-bold mb-4 uppercase tracking-tighter">Salon Multijoueur</h2>
        <div className="bg-gray-800 p-8 rounded-3xl text-center mb-8 w-full max-w-md border-2 border-green-500 shadow-2xl">
          <input type="text" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} className="w-full bg-gray-900 text-center text-4xl font-black text-green-400 p-4 rounded-2xl outline-none" />
        </div>
        {!players.find(p => p.id === socket.id) ? (
          <div className="flex flex-col gap-4 w-full max-w-md bg-gray-800 p-6 rounded-3xl">
            <input type="text" placeholder="Pseudo" value={username} onChange={(e) => setUsername(e.target.value)} className="bg-gray-700 p-4 rounded-xl text-center outline-none" />
            <button onClick={() => { 
              if (!username.trim() || !roomCode.trim()) return showToast("❌ Pseudo et Code requis !", "error");
              Howler.ctx?.resume(); 
              socket.emit('join_room', { roomCode, username }); 
            }} className="bg-green-600 py-4 rounded-xl font-black">REJOINDRE</button>
          </div>
        ) : (
          <div className="w-full max-w-md">
            <div className="flex gap-4">
              <button onClick={() => setGameState('settings')} disabled={isStarting} className="flex-1 bg-gray-800 py-4 rounded-2xl font-black">⚙️ RÉGLAGES</button>
              <button disabled={isStarting} onClick={() => { setIsStarting(true); socket.emit('start_game', { roomCode, settings }); }} className="flex-1 bg-green-600 py-4 rounded-2xl font-black">{isStarting ? '...' : 'LANCER ▶'}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // ⚙️ RÉGLAGES
  // ==========================================
  if (gameState === 'settings') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative">
        <ToastNotification />
        <button onClick={() => setGameState(isMultiplayer ? 'lobby' : 'home')} className="absolute top-8 left-8 text-gray-400 hover:text-white font-bold">← Retour</button>
        <h2 className="text-4xl font-bold mb-8">Réglages du Blindtest</h2>
        <form onSubmit={(e) => { e.preventDefault(); setGameState(isMultiplayer ? 'lobby' : 'playing'); }} className={`bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-md flex flex-col gap-6 border-t-8 ${isMusicMode ? settings.mode === 'classic' ? 'border-blue-500' : 'border-purple-500' : 'border-yellow-500'}`}>
          <div>
            <label className="block text-gray-400 font-black text-xs uppercase mb-2">Mode de réponse</label>
            <select value={settings.answerMode} onChange={(e) => setSettings((prev) => ({ ...prev, answerMode: e.target.value as AnswerMode }))} className="w-full bg-gray-700 p-4 rounded-xl text-white font-bold outline-none focus:ring-2 focus:ring-blue-500">
              <option value="choices">✅ QCM (4 choix)</option>
              <option value="input">⌨️ Saisie clavier (Expert)</option>
            </select>
          </div>

          {isMusicMode && (
            <>
              <div>
                <label className="block text-gray-400 font-black text-xs uppercase mb-2">Cible à deviner</label>
                <select value={settings.answerType} onChange={(e) => setSettings((prev) => ({ ...prev, answerType: e.target.value as AnswerType }))} className="w-full bg-gray-700 p-4 rounded-xl text-white font-bold outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="random">🎲 Mixte (Artiste ou Titre)</option>
                  <option value="both">Artiste + Titre</option>
                  <option value="artist">Artiste uniquement</option>
                  <option value="title">Titre uniquement</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-400 font-black text-xs uppercase mb-2">Genre musical</label>
                <select value={settings.genre} onChange={(e) => setSettings((prev) => ({ ...prev, genre: e.target.value as GenreType }))} className="w-full bg-gray-700 p-4 rounded-xl text-white font-bold outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">Tous les hits</option>
                  <option value="all_mix">🔀 Aléatoire total</option>
                  <option value="rap">Rap Français</option>
                  <option value="rapus">Rap US</option>
                  <option value="80s">Années 80</option>
                  <option value="rock">Rock</option>
                  <option value="pop">Pop</option>
                  <option value="electro">Electro</option>
                  <option value="custom">🔗 Playlist Deezer perso</option>
                </select>
              </div>
              {settings.genre === 'custom' && (
                <input type="text" value={settings.customPlaylistUrl} onChange={(e) => setSettings((prev) => ({ ...prev, customPlaylistUrl: e.target.value }))} placeholder="ID ou URL de la playlist" className="w-full bg-gray-900 p-4 rounded-xl text-white font-bold border-2 border-blue-500 outline-none" />
              )}
            </>
          )}

          {!isMusicMode && (
            <div>
              <label className="block text-gray-400 font-black text-xs uppercase mb-2">Catégorie Cinéma</label>
              <select value={settings.gameType} onChange={(e) => setSettings((prev) => ({ ...prev, gameType: e.target.value as GameType }))} className="w-full bg-gray-700 p-4 rounded-xl text-white font-bold outline-none focus:ring-2 focus:ring-yellow-500">
                <option value="screen">🎬 Mix Films & Séries</option>
                <option value="movie">🎥 Films uniquement</option>
                <option value="series">📺 Séries uniquement</option>
              </select>
            </div>
          )}

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-gray-400 font-black text-xs uppercase mb-2">Manches</label>
              <input type="number" min="1" max="30" value={settings.rounds} onChange={(e) => setSettings((prev) => ({ ...prev, rounds: Number(e.target.value) }))} className="w-full bg-gray-700 p-4 rounded-xl text-white text-center font-bold outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {settings.mode === 'classic' && (
              <div className="flex-1">
                <label className="block text-gray-400 font-black text-xs uppercase mb-2">Timer (s)</label>
                <input type="number" min="5" max="60" value={settings.timeLimit} onChange={(e) => setSettings((prev) => ({ ...prev, timeLimit: Number(e.target.value) }))} className="w-full bg-gray-700 p-4 rounded-xl text-white text-center font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
          </div>
          <button type="submit" className={`w-full text-white font-black py-5 rounded-2xl text-xl mt-4 transition shadow-lg ${isMusicMode ? settings.mode === 'classic' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500' : 'bg-yellow-600 hover:bg-yellow-500'}`}>
            {isMultiplayer ? 'ENREGISTRER' : 'C\'EST PARTI !'}
          </button>
        </form>
      </div>
    );
  }

  // ==========================================
  // 🏁 ÉCRAN DE FIN (AVEC HISTORIQUE)
  // ==========================================
  if (gameState === 'end') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 overflow-y-auto relative">
        <ToastNotification />
        <div className="max-w-3xl mx-auto flex flex-col items-center pt-8">
          <h2 className="text-6xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">TERMINÉ !</h2>
          <div className="bg-gray-800 p-8 rounded-[2rem] shadow-2xl text-center mb-8 border-b-8 border-green-500 w-full max-w-sm">
            <p className="text-gray-400 text-sm font-black uppercase mb-2">Score Final</p>
            <p className="text-7xl font-black text-green-400">{finalScore}</p>
          </div>
          
          <button onClick={() => { setGameState(isMultiplayer ? 'lobby' : 'home'); setFinalScore(0); setInitialQuizData(null); setIsStarting(false); setGameHistory([]); setAddedTracks(new Set()); }} className="bg-white text-black px-12 py-4 rounded-full font-black text-xl hover:scale-105 transition mb-12 shadow-[0_0_20px_rgba(255,255,255,0.2)]">REJOUER ➔</button>

          <div className="w-full">
            <h3 className="text-2xl font-black mb-6 text-gray-300">🎵 Les sons de la partie</h3>
            <div className="flex flex-col gap-4">
              {gameHistory.map((track, i) => {
                const isAdded = addedTracks.has(track.trackId);
                return (
                  <div key={i} className="bg-gray-800 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-4">
                       {track.coverUrl ? <img src={track.coverUrl} className="w-16 h-16 rounded-xl object-cover border-2 border-gray-700" alt="cover" /> : <div className="w-16 h-16 bg-gray-700 rounded-xl flex items-center justify-center text-2xl">🎵</div>}
                       <div>
                         <p className="font-bold text-lg leading-tight">{track.trackTitle || track.correctAnswer}</p>
                         <p className="text-gray-400 text-sm font-bold mt-1">{track.artistName}</p>
                       </div>
                    </div>
                    {/* Le bouton reste cliquable même si ajouté, pour pouvoir l'ajouter ailleurs */}
                    <button 
                      onClick={() => { 
                        fetchPlaylistsForModal(); 
                        setShowPlaylistModal(track); 
                      }} 
                      className={`${isAdded ? 'bg-[#1DB954] text-gray-900' : 'bg-blue-600 hover:bg-blue-500 text-white'} w-12 h-12 rounded-full font-black text-2xl flex items-center justify-center transition-all duration-300 shadow-md active:scale-95`}
                    >
                      {isAdded ? '✓' : '+'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* MODALE D'AJOUT DE PLAYLIST */}
        {showPlaylistModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-gray-800 p-8 rounded-3xl w-full max-w-md shadow-2xl border border-gray-700 relative">
              <button onClick={() => setShowPlaylistModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white font-black text-xl">✕</button>
              
              <h3 className="text-2xl font-black mb-6 pr-6 leading-tight">Ajouter à une playlist</h3>
              
              {playlists.length > 0 && (
                <div className="mb-6 max-h-40 overflow-y-auto pr-2 flex flex-col gap-2">
                  <p className="text-gray-400 text-xs font-bold uppercase mb-1">Playlists existantes</p>
                  {playlists.map((pl) => {
                    // 👇 VÉRIFICATION : La musique est-elle déjà dans cette playlist ?
                    const isTrackInPlaylist = pl.tracks?.some((t: any) => String(t.deezerId) === String(showPlaylistModal.trackId));
                    
                    return (
                      <button 
                        key={pl.id} 
                        disabled={isTrackInPlaylist}
                        onClick={() => handleAddToPlaylist(pl.id, showPlaylistModal)}
                        className={`w-full text-left p-4 rounded-xl font-bold transition flex justify-between items-center ${isTrackInPlaylist ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                      >
                        <span>{pl.name}</span>
                        <span className={`text-xs px-2 py-1 rounded-lg ${isTrackInPlaylist ? 'bg-[#1DB954]/20 text-[#1DB954]' : 'bg-gray-900 text-gray-400'}`}>
                          {isTrackInPlaylist ? '✓ Déjà dedans' : `${pl.tracks?.length || 0} sons`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              <form onSubmit={(e) => handleCreatePlaylist(e, showPlaylistModal)} className="mt-2">
                <p className="text-gray-400 text-xs font-bold uppercase mb-2">Nouvelle playlist</p>
                <div className="flex gap-2">
                  <input 
                    type="text" placeholder="Nom de la playlist..." value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    className="flex-1 bg-gray-900 border-2 border-gray-700 focus:border-blue-500 rounded-xl px-4 py-3 outline-none font-bold"
                  />
                  <button type="submit" disabled={!newPlaylistName.trim()} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 rounded-xl font-black transition">Créer</button>
                </div>
              </form>

            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // ▶️ ÉCRAN DE JEU PRINCIPAL
  // ==========================================
  return (
    <div className="min-h-screen bg-gray-900 overflow-hidden relative">
      <ToastNotification />
      <GameBoard settings={settings} onGameEnd={(score: number, history: any[]) => { setFinalScore(score); setGameHistory(history); setGameState('end'); }} isMultiplayer={isMultiplayer} roomCode={roomCode} initialData={initialQuizData} />
    </div>
  );
}