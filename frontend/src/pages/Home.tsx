import React, { useState } from 'react';
import { Play, Users, Headphones, ListMusic } from 'lucide-react';

// 👇 NOUVEAU : On définit exactement ce qu'attend le composant Home
type HomeProps = {
  onJoinMulti: (code: string, isCreating?: boolean) => void;
  onPlaySolo: () => void;
  onGoPlaylists: () => void;
};

// 👇 On applique le type "HomeProps" à nos paramètres
export default function Home({ onJoinMulti, onPlaySolo, onGoPlaylists }: HomeProps) {
  const [code, setCode] = useState('');

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] bg-rose-600/10 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="z-10 w-full max-w-md flex flex-col items-center">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(99,102,241,0.3)]">
          <Headphones className="text-white w-8 h-8" />
        </div>
        
        <h1 className="text-5xl font-extrabold tracking-tight mb-2 text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">Blindtest</h1>
        <p className="text-zinc-500 mb-10 font-medium">L'expérience musicale ultime.</p>

        {/* Rejoindre */}
        <div className="w-full bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 mb-6 shadow-2xl">
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Rejoindre un salon</label>
          <div className="flex gap-3">
            <input 
              type="text" 
              placeholder="Code (ex: A1B2)" 
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-3 outline-none font-medium text-lg text-white uppercase transition-all"
            />
            <button onClick={() => onJoinMulti(code)} className="bg-white text-black hover:bg-zinc-200 px-6 rounded-xl font-bold transition-colors shadow-lg">Go</button>
          </div>
        </div>

        {/* Créer */}
        <div className="grid grid-cols-2 gap-4 w-full mb-6">
          <button onClick={() => onJoinMulti(Math.random().toString(36).substring(2, 8).toUpperCase(), true)} className="group flex flex-col items-center justify-center bg-zinc-900/30 border border-zinc-800 hover:border-indigo-500/50 p-6 rounded-3xl transition-all hover:bg-zinc-900/80">
            <Users className="w-6 h-6 text-indigo-400 mb-3 group-hover:scale-110 transition-transform" />
            <span className="font-semibold text-sm">Créer une Room</span>
          </button>
          <button onClick={onPlaySolo} className="group flex flex-col items-center justify-center bg-zinc-900/30 border border-zinc-800 hover:border-emerald-500/50 p-6 rounded-3xl transition-all hover:bg-zinc-900/80">
            <Play className="w-6 h-6 text-emerald-400 mb-3 group-hover:scale-110 transition-transform" />
            <span className="font-semibold text-sm">Jouer Solo</span>
          </button>
        </div>

        {/* Playlists */}
        <button onClick={onGoPlaylists} className="w-full flex items-center justify-center gap-2 bg-zinc-900/30 border border-zinc-800 hover:border-pink-500/50 p-4 rounded-2xl transition-all hover:bg-zinc-900/80 text-pink-400 font-semibold text-sm">
          <ListMusic className="w-5 h-5" /> Mes Playlists
        </button>
      </div>
    </div>
  );
}