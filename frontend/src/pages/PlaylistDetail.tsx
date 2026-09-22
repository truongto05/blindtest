import { ArrowLeft, Pencil, Play, Share2, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  PlaylistArtwork,
  VisibilityBadge,
} from "../features/playlists/PlaylistCard";
import { PlaylistDialog } from "../features/playlists/PlaylistDialog";
import {
  PlaylistEmpty,
  PlaylistError,
  PlaylistLoading,
} from "../features/playlists/PlaylistFeedback";
import { PlaylistTrackList } from "../features/playlists/PlaylistTrackList";
import { SharePlaylistDialog } from "../features/playlists/SharePlaylistDialog";
import { trackCountLabel } from "../features/playlists/playlistPresentation";
import { usePlaylistQuery } from "../features/playlists/usePlaylistQuery";
import type { Notify } from "../hooks/useToast";
import { api } from "../services/api";
import type { Playlist, Track } from "../types/game";

type Props = {
  ownerId: string;
  playlistId: string;
  notify: Notify;
  onPlay: (playlist: Playlist) => void;
};

export default function PlaylistDetail({
  ownerId,
  playlistId,
  notify,
  onPlay,
}: Props) {
  const navigate = useNavigate();
  const load = useCallback(
    () => api.ownerPlaylist(playlistId, ownerId),
    [playlistId, ownerId],
  );
  const {
    data: playlist,
    loading,
    error,
    reload,
    setData,
  } = usePlaylistQuery(load);
  const [dialog, setDialog] = useState<"share" | "rename" | "delete" | null>(
    null,
  );
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<Track | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const close = () => {
    setDialog(null);
    setRemoving(null);
    setActionError("");
  };

  const mutate = async () => {
    if (!playlist || busy) return;
    setBusy(true);
    setActionError("");
    try {
      if (removing) {
        await api.removeTrack(playlist.id, ownerId, removing.deezerId);
        notify("Morceau retiré.");
        await reload();
      } else if (dialog === "delete") {
        await api.deletePlaylist(playlist.id, ownerId);
        notify("Playlist supprimée.");
        navigate("/playlists", { replace: true });
      } else if (dialog === "rename") {
        await api.renamePlaylist(playlist.id, ownerId, name.trim());
        setData({ ...playlist, name: name.trim() });
        notify("Playlist renommée.");
      }
      close();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Modification impossible.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main-content" className="page max-w-5xl">
      <header className="mb-8">
        <Link to="/playlists" className="btn-ghost w-fit px-3">
          <ArrowLeft size={18} aria-hidden="true" /> Bibliothèque
        </Link>
      </header>
      {loading ? (
        <PlaylistLoading />
      ) : error ? (
        <PlaylistError message={error} onRetry={reload} />
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
                    {trackCountLabel(playlist.trackCount)} ·{" "}
                    {playlist.playableTrackCount} avec extrait musical
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={!playlist.playableTrackCount}
                  onClick={() => onPlay(playlist)}
                >
                  <Play size={18} aria-hidden="true" /> Jouer avec cette
                  playlist
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setDialog("share")}
                >
                  <Share2 size={18} aria-hidden="true" /> Partager
                </button>
                <button
                  className="icon-btn"
                  aria-label="Renommer la playlist"
                  onClick={() => {
                    setName(playlist.name);
                    setDialog("rename");
                  }}
                >
                  <Pencil size={18} aria-hidden="true" />
                </button>
                <button
                  className="icon-btn text-rose-200"
                  aria-label="Supprimer la playlist"
                  onClick={() => setDialog("delete")}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
              {!playlist.playableTrackCount && (
                <p className="mt-3 text-sm text-zinc-400">
                  Ajoute des morceaux avec un extrait musical pour utiliser
                  cette playlist dans une partie.
                </p>
              )}
            </section>
            {playlist.tracks.length ? (
              <PlaylistTrackList
                tracks={playlist.tracks}
                onRemove={setRemoving}
                removingId={busy ? removing?.deezerId : null}
              />
            ) : (
              <PlaylistEmpty title="Cette playlist attend ses morceaux">
                <p>
                  À la fin d’un blind test musical, utilise « Sauvegarder » pour
                  garder tes découvertes ici.
                </p>
                <Link to="/settings" className="btn-secondary mt-5">
                  Lancer un blind test
                </Link>
              </PlaylistEmpty>
            )}
            {dialog === "share" && (
              <SharePlaylistDialog
                playlist={playlist}
                ownerId={ownerId}
                notify={notify}
                onChange={setData}
                onClose={close}
              />
            )}
            {(dialog === "rename" || dialog === "delete" || removing) && (
              <PlaylistDialog
                title={
                  removing
                    ? "Retirer ce morceau ?"
                    : dialog === "delete"
                      ? "Supprimer la playlist ?"
                      : "Renommer la playlist"
                }
                busy={busy}
                onClose={close}
              >
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutate();
                  }}
                >
                  {dialog === "rename" ? (
                    <>
                      <label className="label" htmlFor="rename-playlist">
                        Nom de la playlist
                      </label>
                      <input
                        id="rename-playlist"
                        className="field"
                        value={name}
                        maxLength={60}
                        onChange={(event) => setName(event.target.value)}
                        disabled={busy}
                      />
                    </>
                  ) : (
                    <p className="break-words leading-relaxed text-zinc-300">
                      {removing
                        ? `« ${removing.title} » sera retiré de cette playlist uniquement.`
                        : `« ${playlist.name} » sera supprimée et son lien désactivé. Cette action ne peut pas être annulée ; les copies déjà faites restent indépendantes.`}
                    </p>
                  )}
                  {actionError && (
                    <p role="alert" className="mt-4 text-rose-200">
                      {actionError}
                    </p>
                  )}
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn-secondary flex-1"
                      disabled={busy}
                      onClick={close}
                    >
                      Annuler
                    </button>
                    <button
                      className="btn-primary flex-1"
                      disabled={busy || (dialog === "rename" && !name.trim())}
                    >
                      {busy
                        ? "Enregistrement…"
                        : removing
                          ? "Retirer"
                          : dialog === "delete"
                            ? "Supprimer"
                            : "Enregistrer"}
                    </button>
                  </div>
                </form>
              </PlaylistDialog>
            )}
          </>
        )
      )}
    </main>
  );
}
