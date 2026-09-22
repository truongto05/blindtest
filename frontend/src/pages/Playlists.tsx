import { ArrowLeft, Globe2, Loader2, Plus } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LibraryAccess } from "../features/playlists/LibraryAccess";
import { PlaylistCard } from "../features/playlists/PlaylistCard";
import {
  PlaylistEmpty,
  PlaylistError,
  PlaylistLoading,
} from "../features/playlists/PlaylistFeedback";
import type { Notify } from "../features/playlists/playlistPresentation";
import { usePlaylistQuery } from "../features/playlists/usePlaylistQuery";
import { api } from "../services/api";

type Props = {
  accountLinked?: boolean;
  ownerId: string;
  onRestoreOwner: (ownerId: string) => void;
  notify: Notify;
};

export default function Playlists({
  ownerId,
  onRestoreOwner,
  notify,
  accountLinked = false,
}: Props) {
  const navigate = useNavigate();
  const load = useCallback(() => api.playlists(ownerId), [ownerId]);
  const { data: items, loading, error, reload } = usePlaylistQuery(load);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const playlist = await api.createPlaylist(ownerId, name.trim());
      notify("Playlist créée. Elle est privée pour le moment.");
      navigate(`/playlists/${playlist.id}`);
    } catch (cause) {
      setCreateError(
        cause instanceof Error
          ? cause.message
          : "Création impossible pour le moment.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <main id="main-content" className="page max-w-5xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-2">
        <Link className="btn-ghost px-3" to="/">
          <ArrowLeft size={18} aria-hidden="true" /> Accueil
        </Link>
        <Link className="btn-secondary px-3 text-sm" to="/playlists/public">
          <Globe2 size={18} aria-hidden="true" /> Playlists publiques
        </Link>
      </header>
      <div className="mb-7">
        <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">
          Bibliothèque musicale
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-zinc-400">
          Tes titres sauvegardés, à partager ou à utiliser dans une partie.
        </p>
      </div>
      <form onSubmit={create} className="mb-3 border-y border-white/10 py-5">
        <label className="label" htmlFor="playlist-name">
          Créer une playlist
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="playlist-name"
            className="field min-w-0"
            maxLength={60}
            value={name}
            placeholder="Ex. Les classiques du vendredi"
            onChange={(event) => setName(event.target.value)}
            disabled={creating}
            aria-describedby={createError ? "create-playlist-error" : undefined}
          />
          <button className="btn-primary" disabled={!name.trim() || creating}>
            {creating ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={18} aria-hidden="true" />
            )}
            {creating ? "Création…" : "Créer"}
          </button>
        </div>
        {createError && (
          <p
            id="create-playlist-error"
            className="mt-3 text-sm text-rose-200"
            role="alert"
          >
            {createError}
          </p>
        )}
      </form>
      <section className="mb-8" aria-label="Mes playlists">
        {loading ? (
          <PlaylistLoading />
        ) : error ? (
          <PlaylistError message={error} onRetry={reload} />
        ) : items?.length ? (
          <div className="grid gap-x-7 sm:grid-cols-2">
            {items.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                to={`/playlists/${playlist.id}`}
              />
            ))}
          </div>
        ) : (
          <PlaylistEmpty title="Ta première playlist t’attend">
            <p>
              Crée une playlist ci-dessus, puis ajoute les titres depuis les
              résultats d’une partie.
            </p>
            <Link
              className="mt-4 inline-block min-h-10 py-2 font-semibold text-beat-300 underline underline-offset-4"
              to="/playlists/public"
            >
              Ou découvre les playlists publiques
            </Link>
          </PlaylistEmpty>
        )}
      </section>
      {accountLinked ? (
        <p className="text-sm text-zinc-400">
          Bibliothèque liée à ton compte.{" "}
          <Link className="text-beat-300 underline" to="/compte">
            Gérer mon compte
          </Link>
        </p>
      ) : (
        <LibraryAccess
          ownerId={ownerId}
          onRestoreOwner={onRestoreOwner}
          notify={notify}
        />
      )}
    </main>
  );
}
