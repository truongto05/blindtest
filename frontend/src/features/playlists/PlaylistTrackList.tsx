import { Loader2, Music2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { Track } from "../../types/game";

export function PreviewPlayer({ track }: { track: Track }) {
  const player = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);

  if (!track.previewUrl)
    return <p className="text-sm text-zinc-400">Extrait indisponible</p>;

  return (
    <div className="min-w-0">
      <audio
        ref={player}
        controls
        preload="none"
        src={track.previewUrl}
        className="h-10 w-full min-w-0"
        aria-label={`Extrait de ${track.title} — ${track.artist}`}
        onError={() => setFailed(true)}
        onCanPlay={() => setFailed(false)}
        onPlay={(event) => {
          document.querySelectorAll("audio").forEach((audio) => {
            if (audio !== event.currentTarget) audio.pause();
          });
        }}
      />
      {failed && (
        <div className="mt-2 text-sm text-amber-200" role="status">
          <p>L’extrait ne se charge pas.</p>
          <button
            className="mt-1 min-h-10 text-left font-semibold underline underline-offset-4"
            onClick={() => {
              setFailed(false);
              player.current?.load();
            }}
          >
            Réessayer l’extrait
          </button>
        </div>
      )}
    </div>
  );
}

function TrackCover({ track }: { track: Track }) {
  const [failed, setFailed] = useState(false);
  return track.coverUrl && !failed ? (
    <img
      src={track.coverUrl}
      alt=""
      loading="lazy"
      className="size-12 shrink-0 rounded-sm object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-sm bg-white/5">
      <Music2 size={22} className="text-zinc-400" aria-hidden="true" />
    </span>
  );
}

type Props = {
  tracks: Track[];
  onRemove?: (track: Track) => void;
  removingId?: string | null;
};

export function PlaylistTrackList({ tracks, onRemove, removingId }: Props) {
  return (
    <ol
      className="divide-y divide-white/10 border-b border-white/10"
      aria-label="Morceaux de la playlist"
    >
      {tracks.map((track, index) => (
        <li
          key={track.deezerId}
          className="grid min-w-0 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] md:items-center"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="hidden w-5 shrink-0 text-sm tabular-nums text-zinc-400 sm:block"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <TrackCover track={track} />
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold">{track.title}</p>
              <p className="mt-0.5 break-words text-sm text-zinc-400">
                {track.artist}
              </p>
            </div>
            {onRemove && (
              <button
                className="icon-btn"
                disabled={Boolean(removingId)}
                onClick={() => onRemove(track)}
                aria-label={`Retirer ${track.title}`}
              >
                {removingId === track.deezerId ? (
                  <Loader2
                    size={17}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Trash2 size={17} aria-hidden="true" />
                )}
              </button>
            )}
          </div>
          <PreviewPlayer track={track} />
        </li>
      ))}
    </ol>
  );
}
