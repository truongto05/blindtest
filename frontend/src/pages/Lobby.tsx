import React from 'react';
import { Users, Settings as SettingsIcon, Play, ArrowLeft, Crown, UserX } from 'lucide-react';
import { socket } from '../services/socketService';

type LobbyProps = {
  roomCode: string;
  players: any[];
  username: string;
  setUsername: (val: string) => void;
  isStarting: boolean;
  onStart: () => void;
  onKick: (playerId: string) => void;
  onSettings: () => void;
  onBack: () => void;
};

export default function Lobby({ roomCode, players, username, setUsername, isStarting, onStart, onKick, onSettings, onBack }: LobbyProps) {
  // On vérifie si l'utilisateur local est déjà dans la liste
  const me = players.find(p => p.id === socket.id);
  const hasExplicitHost = players.some((p) => p.isHost);
  const isHost = Boolean(me?.isHost || (!hasExplicitHost && players[0]?.id === socket.id));

  const handleJoin = () => {
    if (!username.trim()) return;
    socket.emit('join_room', { roomCode, username });
  };

  return (
    <div className="min-h-screen flex flex-col p-6">
      {/* Header bouton retour */}
      <div className="mb-8">
        <button 
          onClick={onBack} 
          className="group flex items-center gap-2 text-zinc-500 hover:text-white transition-all font-bold uppercase text-xs tracking-widest"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
          Retour
        </button>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
        {/* Affichage du Code */}
        <div className="text-center mb-16">
          <p className="text-indigo-500 font-black uppercase tracking-[0.3em] text-[10px] mb-4">Code du salon</p>
          <h2 className="text-8xl md:text-9xl font-black tracking-tighter text-white drop-shadow-[0_0_30px_rgba(99,102,241,0.2)]">
            {roomCode}
          </h2>
        </div>

        {/* Formulaire Pseudo si pas encore dans le salon */}
        {!me ? (
          <div className="w-full max-w-md bg-zinc-900/40 border border-zinc-800/50 p-10 rounded-[2.5rem] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500 shadow-2xl">
            <h3 className="text-2xl font-black mb-8 text-center text-white tracking-tight">Prêt pour le show ?</h3>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Ton pseudo..." 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                className="w-full bg-zinc-950/50 border-2 border-zinc-800 focus:border-indigo-500 rounded-2xl px-6 py-4 outline-none font-bold text-lg text-white transition-all placeholder:text-zinc-700"
              />
              <button 
                onClick={handleJoin}
                disabled={!username.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:grayscale py-5 rounded-2xl font-black text-lg transition-all shadow-[0_10px_30px_rgba(79,70,229,0.3)] active:scale-95"
              >
                REJOINDRE LE SALON
              </button>
            </div>
          </div>
        ) : (
          /* Liste des joueurs connectés */
          <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex items-center justify-between mb-10 border-b border-zinc-800/50 pb-6">
              <h3 className="text-3xl font-black flex items-center gap-4 text-white">
                <Users className="text-indigo-500 w-8 h-8" /> 
                Équipage <span className="text-zinc-600 font-medium">({players.length})</span>
              </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
              {players.map((p, i) => {
                const playerIsMe = p.id === socket.id;
                const playerIsHost = Boolean(p.isHost || (!hasExplicitHost && i === 0));

                return (
                  <div key={p.id || i} className={`group p-5 rounded-3xl border transition-all flex items-center gap-4 ${
                    playerIsMe ? 'bg-indigo-500/10 border-indigo-500/50 shadow-lg shadow-indigo-500/5' : 'bg-zinc-900/30 border-zinc-800 hover:border-zinc-700'
                  }`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                      playerIsMe ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {p.username?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-lg truncate ${playerIsMe ? 'text-white' : 'text-zinc-300'}`}>
                        {p.username}
                      </p>
                      {playerIsMe && <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">C'est toi</p>}
                    </div>
                    {playerIsHost && (
                      <span title="Chef de salon" className="shrink-0">
                         <Crown className="w-5 h-5 text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.4)]" />
                      </span>
                    )}
                    {isHost && !playerIsMe && !playerIsHost && (
                      <button
                        type="button"
                        onClick={() => onKick(p.id)}
                        title={`Expulser ${p.username}`}
                        className="w-10 h-10 rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center shrink-0"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions du bas */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              {isHost ? (
                <>
              <button 
                onClick={onSettings} 
                className="w-full sm:w-auto bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 px-10 py-5 rounded-2xl font-black flex items-center justify-center gap-3 transition-all"
              >
                <SettingsIcon className="w-5 h-5 text-zinc-500" /> RÉGLAGES
              </button>
              <button 
                onClick={onStart} 
                disabled={isStarting || players.length === 0}
                className="w-full sm:w-auto bg-white text-black hover:bg-zinc-200 px-14 py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)] active:scale-95 disabled:opacity-20"
              >
                <Play className="w-6 h-6 fill-black" /> {isStarting ? 'LANCEMENT...' : 'DEMARRER'}
              </button>
                </>
              ) : (
                <div className="w-full sm:w-auto bg-zinc-900 border border-zinc-800 px-10 py-5 rounded-2xl font-black text-zinc-500 text-center">
                  EN ATTENTE DU CHEF
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
