import { ArrowLeft, Copy, Library, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  PlaylistArtwork,
  VisibilityBadge,
} from "../features/playlists/PlaylistCard";
import {
  PlaylistEmpty,
  PlaylistError,
  PlaylistLoading,
} from "../features/playlists/PlaylistFeedback";
import { PlaylistTrackList } from "../features/playlists/PlaylistTrackList";
import {
  shareUrl,
  trackCountLabel,
} from "../features/playlists/playlistPresentation";
import { usePlaylistQuery } from "../features/playlists/usePlaylistQuery";
import type { Notify } from "../hooks/useToast";
import { api } from "../services/api";
import { copyText } from "../services/clipboard";

export default function SharedPlaylist({
  ownerId,
  shareId,
  notify,
}: {
  ownerId: string;
  shareId: string;
  notify: Notify;
}) {
  const navigate = useNavigate();
  const load = useCallback(() => api.sharedPlaylist(shareId), [shareId]);
  const { data: playlist, loading, error, reload } = usePlaylistQuery(load);
  const [copying, setCopying] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showLink, setShowLink] = useState(false);
  const duplicate = async () => {
    if (copying) return;
    setCopying(true);
    setActionError("");
    try {
      const copy = await api.duplicatePlaylist(shareId, ownerId);
      notify("Une copie privée a été ajoutée à ta bibliothèque.");
      navigate(`/playlists/${copy.id}`);
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Copie impossible pour le moment.",
      );
    } finally {
      setCopying(false);
    }
  };
  const copyLink = async () => {
    setActionError("");
    try {
      await copyText(shareUrl(shareId));
      setShowLink(false);
      notify("Lien copié.");
    } catch (cause) {
      setShowLink(true);
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Sélectionne le lien pour le copier.",
      );
    }
  };
  return (
    <main id="main-content" className="page max-w-5xl">
      <header className="mb-8 flex flex-wrap justify-between gap-2">
        <Link to="/playlists/public" className="btn-ghost px-3">
          <ArrowLeft size={18} aria-hidden="true" /> Découvrir
        </Link>
        <Link to="/playlists" className="btn-secondary px-3">
          <Library size={18} aria-hidden="true" /> Ma bibliothèque
        </Link>
      </header>
      {loading ? (
        <PlaylistLoading />
      ) : error ? (
        <>
          <h1 className="mb-6 text-3xl font-black">Playlist indisponible</h1>
          <PlaylistError message={error} onRetry={reload} />
        </>
      ) : (
        playlist && (
          <>
            <section className="mb-8 border-b border-white/10 pb-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <PlaylistArtwork tracks={playlist.tracks} large />
                <div className="min-w-0">
                  <VisibilityBadge visibility={playlist.visibility} />
                  <h1 className="my-3 break-words text-3xl font-bold tracking-tight sm:text-4xl">
                    {playlist.name}
                  </h1>
                  <p className="text-zinc-400">
                    {trackCountLabel(playlist.trackCount)}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className="btn-primary"
                  onClick={duplicate}
                  disabled={copying}
                >
                  {copying && (
                    <Loader2
                      size={18}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {copying ? "Copie en cours…" : "Ajouter à ma bibliothèque"}
                </button>
                <button className="btn-secondary" onClick={copyLink}>
                  <Copy size={18} aria-hidden="true" /> Copier le lien
                </button>
              </div>
              <p className="mt-3 text-sm text-zinc-400">
                Crée ta propre copie privée pour la modifier ou jouer avec, sans
                changer l’original.
              </p>
              {showLink && (
                <div className="mt-4">
                  <label className="label" htmlFor="shared-url">
                    Lien à copier
                  </label>
                  <input
                    id="shared-url"
                    className="field"
                    readOnly
                    value={shareUrl(shareId)}
                    onFocus={(event) => event.target.select()}
                  />
                </div>
              )}
              {actionError && (
                <p className="mt-4 text-rose-200" role="alert">
                  {actionError}
                </p>
              )}
            </section>
            {playlist.tracks.length ? (
              <PlaylistTrackList tracks={playlist.tracks} />
            ) : (
              <PlaylistEmpty title="Aucun morceau pour le moment">
                <p>Le propriétaire n’a pas encore ajouté de titres.</p>
              </PlaylistEmpty>
            )}
          </>
        )
      )}
    </main>
  );
}
