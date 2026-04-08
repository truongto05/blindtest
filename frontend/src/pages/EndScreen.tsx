import React from 'react';
import { Trophy, RotateCcw, Plus, Check } from 'lucide-react';

type EndScreenProps = {
  score: number;
  history: any[];
  onReplay: () => void;
  onShowPlaylistModal: (track: any) => void;
  addedTracks: Set<string>;
};

export default function EndScreen({ score, history, onReplay, onShowPlaylistModal, addedTracks }: EndScreenProps) {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-6 flex flex-col items-center font-sans overflow-y-auto">
      <div className="w-full max-w-2xl py-12">
        <div className="text-center mb-16">
          <div className="inline-flex p-4 bg-yellow-500/10 rounded-full mb-6">
            <Trophy className="w-12 h-12 text-yellow-500" />
          </div>
          <h2 className="text-5xl font-black mb-4">Terminé !</h2>
          <div className="text-8xl font-black text-white tracking-tighter">{score}</div>
          <p className="text-zinc-500 font-bold uppercase tracking-widest mt-2">Points récoltés</p>
        </div>

        <button 
          onClick={onReplay}
          className="w-full bg-white text-black py-5 rounded-3xl font-black text-xl flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] mb-16"
        >
          <RotateCcw className="w-6 h-6" /> REJOUER
        </button>

        <h3 className="text-2xl font-bold mb-6 text-zinc-400">Récapitulatif de la session</h3>
        <div className="space-y-3">
          {history.map((track, i) => {
            const isAdded = addedTracks.has(track.trackId);
            return (
              <div key={i} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between group transition-all hover:bg-zinc-900">
                <div className="flex items-center gap-4">
                  {track.coverUrl ? (
                    <img src={track.coverUrl} className="w-14 h-14 rounded-xl object-cover shadow-lg" alt="cover" />
                  ) : (
                    <div className="w-14 h-14 bg-zinc-800 rounded-xl flex items-center justify-center">🎵</div>
                  )}
                  <div>
                    <p className="font-bold text-lg leading-tight">{track.trackTitle || track.correctAnswer}</p>
                    <p className="text-zinc-500 text-sm font-medium">{track.artistName || 'Artiste inconnu'}</p>
                  </div>
                </div>
                
                <button 
                  onClick={() => onShowPlaylistModal(track)}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    isAdded ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {isAdded ? <Check className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}