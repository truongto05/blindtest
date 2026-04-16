import React from 'react';
import { ArrowLeft, Music, Clapperboard, Timer, Target, Link2, ListFilter, Play } from 'lucide-react';
import { Settings as SettingsType } from '../App';

type SettingsProps = {
  settings: SettingsType;
  setSettings: React.Dispatch<React.SetStateAction<SettingsType>>;
  onSave: () => void;
  onBack: () => void;
  isMultiplayer: boolean;
};

export default function Settings({ settings, setSettings, onSave, onBack, isMultiplayer }: SettingsProps) {
  const isMusicMode = settings.gameType === 'music';

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-6 flex flex-col items-center font-sans">
      <div className="w-full max-w-2xl">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>

        <h2 className="text-4xl font-black mb-10 tracking-tight">Configuration</h2>

        <div className="space-y-8 bg-zinc-900/30 border border-zinc-800 p-8 rounded-[2.5rem] backdrop-blur-xl shadow-2xl">
          {/* CATEGORIE PRINCIPALE */}
          <div className="grid grid-cols-2 gap-4">
             <button 
               onClick={() => setSettings(s => ({ ...s, gameType: 'music' }))}
               className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${settings.gameType === 'music' ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-950/50 text-zinc-500'}`}
             >
               <Music /> <span className="font-bold">Musique</span>
             </button>
             <button 
               onClick={() => setSettings(s => ({ ...s, gameType: 'screen' }))}
               className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${settings.gameType !== 'music' ? 'border-yellow-500 bg-yellow-500/10' : 'border-zinc-800 bg-zinc-950/50 text-zinc-500'}`}
             >
               <Clapperboard /> <span className="font-bold">Cinéma / TV</span>
             </button>
          </div>

          <div className="space-y-6">
            
            {/* --- NOUVEAU : DÉROULEMENT DU JEU (Classique vs Songless) --- */}
            {isMusicMode && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-3 flex items-center gap-2">
                  <Play className="w-3 h-3" /> Mode de jeu
                </label>
                <select 
                  value={settings.mode} 
                  onChange={e => setSettings(s => ({ ...s, mode: e.target.value as any }))}
                  className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl font-bold outline-none focus:border-indigo-500"
                >
                  <option value="classic">⏱️ Classique (Continu)</option>
                  <option value="progressive">🧩 Songless (Extraits progressifs)</option>
                </select>
              </div>
            )}

            {/* MODE DE RÉPONSE */}
            <div>
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-3">Mode de réponse</label>
              <select 
                value={settings.answerMode} 
                onChange={e => setSettings(s => ({ ...s, answerMode: e.target.value as any }))}
                className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl font-bold outline-none focus:border-indigo-500"
              >
                <option value="choices">✅ QCM (4 choix)</option>
                <option value="input">⌨️ Saisie clavier (Expert)</option>
              </select>
            </div>

            {/* OPTIONS MUSIQUE (GENRES & CIBLE) */}
            {isMusicMode && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-3 flex items-center gap-2">
                    <ListFilter className="w-3 h-3" /> Genre Musical
                  </label>
                  <select 
                    value={settings.genre} 
                    onChange={e => setSettings(s => ({ ...s, genre: e.target.value as any }))}
                    className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl font-bold outline-none focus:border-indigo-500"
                  >
                    <option value="all">Tous les hits</option>
                    <option value="all_mix">🔀 Aléatoire total</option>
                    <option value="rap">Rap Français</option>
                    <option value="rapus">Rap US</option>
                    <option value="80s">Années 80</option>
                    <option value="rock">Rock</option>
                    <option value="pop">Pop</option>
                    <option value="electro">Electro</option>
                    <option value="francaise">Variété Française</option>
                    <option value="rnb">R&B</option>
                    <option value="metal">Metal</option>
                    <option value="reggae">Reggae</option>
                    <option value="jazz">Jazz</option>
                    <option value="custom">🔗 Playlist Deezer perso</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-3 flex items-center gap-2">
                    <Target className="w-3 h-3" /> Cible à deviner
                  </label>
                  <select 
                    value={settings.answerType} 
                    onChange={e => setSettings(s => ({ ...s, answerType: e.target.value as any }))}
                    className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl font-bold outline-none focus:border-indigo-500"
                  >
                    <option value="random">🎲 Mixte (Artiste ou Titre)</option>
                    <option value="both">Artiste + Titre</option>
                    <option value="artist">Artiste uniquement</option>
                    <option value="title">Titre uniquement</option>
                  </select>
                </div>
              </div>
            )}

            {/* PLAYLIST PERSO */}
            {settings.genre === 'custom' && isMusicMode && (
              <div className="animate-in slide-in-from-top-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-3 flex items-center gap-2">
                  <Link2 className="w-3 h-3" /> ID ou URL de la Playlist
                </label>
                <input 
                  type="text" 
                  value={settings.customPlaylistUrl} 
                  onChange={e => setSettings(s => ({ ...s, customPlaylistUrl: e.target.value }))}
                  placeholder="Ex: 2154865..."
                  className="w-full bg-zinc-950 border-2 border-indigo-500/30 p-4 rounded-xl font-bold outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {/* OPTIONS CINÉMA */}
            {!isMusicMode && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-3">Catégorie Cinéma</label>
                  <select 
                    value={settings.gameType} 
                    onChange={e => setSettings(s => ({ ...s, gameType: e.target.value as any }))}
                    className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl font-bold outline-none focus:border-yellow-500"
                  >
                    <option value="screen">🎬 Mix Films & Séries</option>
                    <option value="movie">🎥 Films uniquement</option>
                    <option value="series">📺 Séries uniquement</option>
                  </select>
                </div>
                
                {/* NOUVEAU : Option pour l'affiche */}
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-3">Aide Visuelle</label>
                  <select 
                    value={settings.showPoster === false ? "false" : "true"} 
                    onChange={e => setSettings(s => ({ ...s, showPoster: e.target.value === "true" }))}
                    className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl font-bold outline-none focus:border-yellow-500"
                  >
                    <option value="true">🖼️ Afficher l'affiche (Floutée)</option>
                    <option value="false">🙈 Masquer l'affiche (Expert)</option>
                  </select>
                </div>
              </div>
            )}

            {/* ROUNDS & TIMER */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-3 flex items-center gap-2">
                  <Target className="w-3 h-3" /> Manches
                </label>
                <input 
                  type="number" min="1" max="30" 
                  value={settings.rounds} 
                  onChange={e => setSettings(s => ({ ...s, rounds: Number(e.target.value) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl font-bold outline-none text-center focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-3 flex items-center gap-2">
                  <Timer className="w-3 h-3" /> Temps (s)
                </label>
                <input 
                  type="number" min="5" max="60" 
                  value={settings.timeLimit} 
                  onChange={e => setSettings(s => ({ ...s, timeLimit: Number(e.target.value) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl font-bold outline-none text-center focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <button 
            onClick={onSave}
            className="w-full bg-white text-black py-5 rounded-2xl font-black text-lg hover:scale-[1.02] transition-all shadow-xl active:scale-95"
          >
            {isMultiplayer ? 'ENREGISTRER LA CONFIG' : 'C\'EST PARTI !'}
          </button>
        </div>
      </div>
    </div>
  );
}