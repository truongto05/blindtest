import {
  CheckCircle2,
  Crown,
  Home,
  Library,
  Loader2,
  Music2,
  Plus,
  RotateCcw,
  Save,
  Trophy,
} from "lucide-react";
import { type FormEvent, useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PreviewPlayer } from "../features/playlists/PlaylistTrackList";
import { usePlaylistQuery } from "../features/playlists/usePlaylistQuery";
import type { Notify } from "../hooks/useToast";
import { api } from "../services/api";
import type { Player, QuizData, Track } from "../types/game";

type Props = {
  score: number;
  history: QuizData[];
  players: Player[];
  playerId: string;
  ownerId: string;
  notify: Notify;
  canReplay: boolean;
  onReplay: () => void;
  onHome: () => void;
};

export default function EndScreen({
  score,
  history,
  players,
  playerId,
  ownerId,
  notify,
  canReplay,
  onReplay,
  onHome,
}: Props) {
  const ranking = [...players].sort((a, b) => b.score - a.score);
  const position =
    ranking.findIndex((player) => player.playerId === playerId) + 1;
  const tracks = [
    ...new Map(history.map((track) => [String(track.trackId), track])).values(),
  ];

  return (
    <main id="main-content" className="page max-w-4xl py-10">
      <section className="mb-10 text-center">
        {position === 1 && (
          <Trophy
            className="mx-auto mb-4 text-amber-300"
            size={30}
            aria-hidden="true"
          />
        )}
        <p className="eyebrow mb-3">Partie terminée</p>
        <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">
          {position === 1
            ? "Tu remportes la partie !"
            : position > 1
              ? `Tu termines #${position}`
              : "Ton résultat"}
        </h1>
        <p className="mt-4 text-xl text-zinc-400">
          <strong className="text-white">{score}</strong> points
        </p>
      </section>
      {ranking.length > 0 && (
        <FinalRanking ranking={ranking} playerId={playerId} />
      )}
      {tracks.length > 0 && (
        <SessionLibrary
          key={ownerId}
          history={tracks}
          ownerId={ownerId}
          notify={notify}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          className="btn-primary"
          disabled={!canReplay}
          onClick={onReplay}
        >
          <RotateCcw size={19} aria-hidden="true" />
          {canReplay ? "Rejouer" : "En attente de l’hôte"}
        </button>
        <button className="btn-secondary" onClick={onHome}>
          <Home size={19} aria-hidden="true" /> Accueil
        </button>
      </div>
    </main>
  );
}

function FinalRanking({
  ranking,
  playerId,
}: {
  ranking: Player[];
  playerId: string;
}) {
  return (
    <section className="mb-8 border-t border-white/10 pt-6">
      <h2 className="mb-5 text-xl font-black">Classement final</h2>
      <ol className="space-y-3">
        {ranking.map((player, index) => (
          <li
            key={player.playerId}
            className={`flex flex-wrap items-center gap-3 border-b py-4 ${player.playerId === playerId ? "border-beat-400/50" : "border-white/10"}`}
          >
            <span
              className={`flex size-9 shrink-0 items-center justify-center font-mono font-bold ${index === 0 ? "text-beat-300" : "text-zinc-400"}`}
            >
              {index === 0 ? (
                <>
                  <Crown size={19} aria-hidden="true" />
                  <span className="sr-only">1</span>
                </>
              ) : (
                index + 1
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words font-bold">
                {player.username}
                {player.playerId === playerId ? " — toi" : ""}
              </p>
              <p className="text-xs text-zinc-400">
                {player.connected ? "Connecté" : "Déconnecté"}
              </p>
            </div>
            <strong className="tabular-nums">{player.score} pts</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

function isMusic(track: QuizData) {
  return track.questionType !== "movie" && track.questionType !== "series";
}

function toTrack(track: QuizData): Track {
  return {
    deezerId: String(track.trackId),
    title:
      track.trackTitle ||
      track.mediaTitle ||
      track.correctAnswer ||
      "Titre inconnu",
    artist:
      track.artistName ||
      (track.questionType === "movie"
        ? "Film"
        : track.questionType === "series"
          ? "Série"
          : "Artiste inconnu"),
    coverUrl: track.coverUrl || "",
    previewUrl: track.audioUrl || "",
  };
}

function SessionLibrary({
  history,
  ownerId,
  notify,
}: {
  history: QuizData[];
  ownerId: string;
  notify: Notify;
}) {
  const musicTracks = history.filter(isMusic).map(toTrack);
  const hasMusic = musicTracks.length > 0;
  const load = useCallback(
    () => (hasMusic ? api.playlists(ownerId) : Promise.resolve([])),
    [ownerId, hasMusic],
  );
  const { data, loading, error, reload, setData } = usePlaylistQuery(load);
  const playlists = data || [];
  const [playlistId, setPlaylistId] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const mutationPending = useRef(false);
  const destination =
    playlists.find((playlist) => playlist.id === playlistId) || playlists[0];
  const savedIds = new Set(destination?.tracks.map((track) => track.deezerId));
  const allSaved =
    hasMusic && musicTracks.every((track) => savedIds.has(track.deezerId));

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim() || mutationPending.current) return;
    mutationPending.current = true;
    setCreating(true);
    setActionError("");
    try {
      const created = await api.createPlaylist(ownerId, newName.trim());
      setData((current) => [created, ...(current || [])]);
      setPlaylistId(created.id);
      setNewName("");
      setShowCreate(false);
      notify("Playlist privée créée. Tu peux y enregistrer les titres.");
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Création impossible pour le moment.",
      );
    } finally {
      setCreating(false);
      mutationPending.current = false;
    }
  };

  const save = async (requestedTracks: Track[], source: string) => {
    if (!destination || mutationPending.current) return;
    const missing = requestedTracks.filter(
      (track) => !savedIds.has(track.deezerId),
    );
    if (!missing.length) return;
    mutationPending.current = true;
    setSaving(source);
    setActionError("");
    let added = 0;
    try {
      for (const track of missing) {
        await api.addTrack(destination.id, ownerId, track);
        added += 1;
        setData(
          (current) =>
            current?.map((playlist) =>
              playlist.id === destination.id
                ? {
                    ...playlist,
                    tracks: [...playlist.tracks, track],
                    trackCount: playlist.trackCount + 1,
                    playableTrackCount:
                      playlist.playableTrackCount + (track.previewUrl ? 1 : 0),
                  }
                : playlist,
            ) || null,
        );
      }
      notify(
        `${added} titre${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""} à ${destination.name}.`,
      );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Sauvegarde impossible pour le moment.";
      setActionError(
        added
          ? `${added} titre${added > 1 ? "s" : ""} enregistré${added > 1 ? "s" : ""}. ${message} Réessaie pour les titres restants.`
          : message,
      );
    } finally {
      setSaving(null);
      mutationPending.current = false;
    }
  };

  return (
    <section className="mb-8 border-t border-white/10 pt-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-xl font-bold">Titres de la session</h2>
        <Link to="/playlists" className="btn-ghost w-fit px-0 text-sm">
          <Library size={18} aria-hidden="true" /> Ma bibliothèque
        </Link>
      </div>
      {hasMusic &&
        (loading ? (
          <p
            className="mb-5 flex items-center gap-2 text-sm text-zinc-400"
            role="status"
          >
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />{" "}
            Chargement de tes playlists…
          </p>
        ) : error ? (
          <div className="mb-5 rounded-md border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="mb-3 text-sm text-amber-200" role="alert">
              {error}
            </p>
            <button className="btn-secondary" onClick={reload}>
              Réessayer
            </button>
          </div>
        ) : (
          <div className="mb-5 border-b border-white/10 pb-5">
            {destination && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label className="label" htmlFor="session-playlist">
                    Playlist de destination
                  </label>
                  <select
                    id="session-playlist"
                    className="field min-w-0"
                    disabled={Boolean(saving) || creating}
                    value={destination.id}
                    onChange={(event) => {
                      setPlaylistId(event.target.value);
                      setActionError("");
                    }}
                  >
                    {playlists.map((playlist) => (
                      <option key={playlist.id} value={playlist.id}>
                        {playlist.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn-primary"
                  disabled={Boolean(saving) || creating || allSaved}
                  onClick={() => save(musicTracks, "all")}
                >
                  {saving === "all" ? (
                    <Loader2
                      size={18}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : allSaved ? (
                    <CheckCircle2 size={18} aria-hidden="true" />
                  ) : (
                    <Save size={18} aria-hidden="true" />
                  )}
                  {saving === "all"
                    ? "Enregistrement…"
                    : allSaved
                      ? "Session enregistrée"
                      : "Tout enregistrer"}
                </button>
              </div>
            )}
            {!destination && (
              <p className="mb-3 text-zinc-300">
                Crée une playlist pour enregistrer ces titres.
              </p>
            )}
            {destination && !showCreate && (
              <button
                className="btn-ghost mt-2 px-0 text-sm"
                disabled={Boolean(saving)}
                onClick={() => setShowCreate(true)}
              >
                <Plus size={17} aria-hidden="true" /> Nouvelle playlist
              </button>
            )}
            {(!destination || showCreate) && (
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={create}
              >
                <label className="sr-only" htmlFor="result-playlist-name">
                  Nom de la nouvelle playlist
                </label>
                <input
                  id="result-playlist-name"
                  className="field min-w-0"
                  maxLength={60}
                  value={newName}
                  disabled={creating || Boolean(saving)}
                  placeholder="Ex. Découvertes de soirée"
                  onChange={(event) => setNewName(event.target.value)}
                />
                <button
                  className="btn-secondary"
                  disabled={!newName.trim() || creating || Boolean(saving)}
                >
                  {creating ? (
                    <Loader2
                      className="animate-spin"
                      size={18}
                      aria-hidden="true"
                    />
                  ) : (
                    <Plus size={18} aria-hidden="true" />
                  )}{" "}
                  Créer
                </button>
              </form>
            )}
            {actionError && (
              <p className="mt-3 text-sm text-rose-200" role="alert">
                {actionError}
              </p>
            )}
          </div>
        ))}
      {!hasMusic && (
        <p className="mb-5 text-sm text-zinc-400">
          Les playlists Pulse accueillent les morceaux de tes blind tests
          musicaux.
        </p>
      )}
      <div className="grid gap-x-7 sm:grid-cols-2">
        {history.map((quiz) => (
          <TrackResult
            key={quiz.trackId}
            track={toTrack(quiz)}
            saved={isMusic(quiz) && savedIds.has(String(quiz.trackId))}
            saving={saving === String(quiz.trackId)}
            disabled={Boolean(saving) || creating}
            onSave={
              isMusic(quiz) && destination && !loading && !error
                ? (track) => save([track], track.deezerId)
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

function TrackResult({
  track,
  saved,
  saving,
  disabled,
  onSave,
}: {
  track: Track;
  saved: boolean;
  saving: boolean;
  disabled: boolean;
  onSave?: (track: Track) => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <div className="min-w-0 border-b border-white/10 py-5">
      <div className="mb-3 flex min-w-0 items-center gap-3">
        {track.coverUrl && !coverFailed ? (
          <img
            className="size-12 shrink-0 rounded-sm object-cover"
            src={track.coverUrl}
            alt=""
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <Music2
            className="shrink-0 text-zinc-400"
            size={28}
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words font-bold">{track.title}</p>
          <p className="break-words text-sm text-zinc-400">{track.artist}</p>
        </div>
      </div>
      {track.previewUrl && <PreviewPlayer track={track} />}
      {onSave && (
        <button
          className="btn-secondary mt-3 w-full px-3 text-sm"
          disabled={disabled || saved}
          onClick={() => onSave(track)}
          aria-label={
            saved
              ? `${track.title} enregistré`
              : `Ajouter ${track.title} à la playlist`
          }
        >
          {saving ? (
            <Loader2 className="animate-spin" size={17} aria-hidden="true" />
          ) : saved ? (
            <CheckCircle2
              className="text-emerald-300"
              size={17}
              aria-hidden="true"
            />
          ) : (
            <Plus size={17} aria-hidden="true" />
          )}
          {saved ? "Enregistré" : saving ? "Enregistrement…" : "Sauvegarder"}
        </button>
      )}
    </div>
  );
}
