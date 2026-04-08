import React from 'react';
import { ArrowLeft, Key, Music2, Headphones, Play } from 'lucide-react';

type PlaylistsProps = {
  guestId: string;
  importCode: string;
  setImportCode: (val: string) => void;
  onImportCode: (e: React.FormEvent) => void;
  libraryPlaylists: any[];
  selectedPlaylist: any;
  setSelectedPlaylist: (pl: any) => void;
  onBack: () => void;
};

export default function Playlists({ guestId, importCode, setImportCode, onImportCode, libraryPlaylists, selectedPlaylist, setSelectedPlaylist, onBack }: PlaylistsProps) {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-6 flex flex-col items-center font-sans overflow-y-auto">
      <div className="w-full max-w-4xl">
        <div className="flex justify-between items-center mb-12">
          <button onClick={() => selectedPlaylist ? setSelectedPlaylist(null) : onBack()} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> {selectedPlaylist ? 'Mes playlists' : 'Accueil'}
          </button>

          {!selectedPlaylist && (
            <div className="flex items-center gap-4 bg-zinc-900/80 border border-zinc-800 p-2 rounded-2xl">
              <div className="px-4 py-2 border-r border-zinc-800">
                <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Cadenas Actuel</span>
                <span className="font-mono text-indigo-400 font-bold">{guestId}</span>
              </div>
              <form onSubmit={onImportCode} className="flex gap-2 pr-2">
                <input 
                  type="text" placeholder="Changer..." 
                  value={importCode} onChange={e => setImportCode(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-xl text-sm outline-none focus:border-indigo-500 w-32 font-bold uppercase"
                />
                <button type="submit" className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">
                  <Key className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>

        {!selectedPlaylist ? (
          <>
            <h2 className="text-5xl font-black mb-10 tracking-tight">Ma Bibliothèque</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {libraryPlaylists.map(pl => (
                <button 
                  key={pl.id} 
                  onClick={() => setSelectedPlaylist(pl)}
                  className="group bg-zinc-900/50 border border-zinc-800 p-8 rounded-[2rem] hover:bg-zinc-900 hover:border-indigo-500/50 transition-all text-left shadow-xl"
                >
                  <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Music2 className="text-indigo-400 w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2 leading-tight">{pl.name}</h3>
                  <p className="text-indigo-400/60 font-bold text-xs uppercase tracking-widest">{pl.tracks?.length || 0} titres</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="animate-in fade-in slide-in-from-right-4">
             <div className="flex items-end gap-6 mb-12">
               <div className="w-32 h-32 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl">
                 <Headphones className="w-16 h-16 text-white" />
               </div>
               <div>
                 <p className="text-indigo-400 font-bold text-xs uppercase tracking-widest mb-2">Playlist Privée</p>
                 <h2 className="text-5xl font-black">{selectedPlaylist.name}</h2>
               </div>
             </div>

             <div className="space-y-2">
               {selectedPlaylist.tracks.map((track: any, i: number) => (
                 <div key={i} className="flex items-center justify-between p-4 bg-zinc-900/30 border border-transparent hover:border-zinc-800 hover:bg-zinc-900/80 rounded-2xl transition-all group">
                   <div className="flex items-center gap-4">
                     <span className="text-zinc-600 font-bold w-4 text-center group-hover:hidden">{i + 1}</span>
                     <Play className="w-4 h-4 text-white hidden group-hover:block fill-white" />
                     {track.coverUrl && <img src={track.coverUrl} className="w-12 h-12 rounded-lg object-cover" alt="cover" />}
                     <div>
                       <p className="font-bold text-zinc-100">{track.title}</p>
                       <p className="text-zinc-500 text-sm font-medium">{track.artist}</p>
                     </div>
                   </div>
                   {track.previewUrl && <audio controls src={track.previewUrl} className="h-8 w-40 opacity-20 hover:opacity-100 transition-opacity" />}
                 </div>
               ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}