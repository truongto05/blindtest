import { ArrowUpRight, Globe2, Link2, LockKeyhole, Music2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { PlaylistVisibility, Track } from "../../types/game";
import { trackCountLabel, visibilityLabels } from "./playlistPresentation";

export function VisibilityBadge({
  visibility,
}: {
  visibility: PlaylistVisibility;
}) {
  const Icon =
    visibility === "PRIVATE"
      ? LockKeyhole
      : visibility === "UNLISTED"
        ? Link2
        : Globe2;
  return (
    <span className="inline-flex min-w-0 items-start gap-1.5 text-sm text-zinc-300">
      <Icon className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
      <span className="min-w-0 break-words">
        {visibilityLabels[visibility]}
      </span>
    </span>
  );
}

function Cover({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <Music2 size={25} className="m-auto text-beat-300" aria-hidden="true" />
  );
}

export function PlaylistArtwork({
  tracks,
  large = false,
}: {
  tracks: Track[];
  large?: boolean;
}) {
  const covers = tracks.filter((track) => track.coverUrl).slice(0, 4);
  const mosaic = covers.length >= 4;
  return (
    <div
      className={`grid shrink-0 overflow-hidden rounded-sm bg-ink-800 ${mosaic ? "grid-cols-2" : "grid-cols-1"} ${large ? "size-28 sm:size-36" : "size-20 sm:size-24"}`}
      aria-hidden="true"
    >
      {(mosaic ? covers : [covers[0]]).map((track, index) => (
        <span
          className="flex min-h-0 items-center justify-center overflow-hidden"
          key={track?.deezerId ?? index}
        >
          <Cover src={track?.coverUrl ?? ""} />
        </span>
      ))}
    </div>
  );
}

type CardPlaylist = {
  name: string;
  tracks: Track[];
  trackCount: number;
  visibility: PlaylistVisibility;
};

export function PlaylistCard({
  playlist,
  to,
}: {
  playlist: CardPlaylist;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 flex-wrap items-center gap-4 border-b border-white/10 py-5 transition hover:border-beat-300/60"
    >
      <PlaylistArtwork tracks={playlist.tracks} />
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 break-words text-lg font-bold transition group-hover:text-beat-300">
            {playlist.name}
          </h2>
          <ArrowUpRight
            className="mt-1 shrink-0 text-zinc-400 transition group-hover:text-beat-300"
            size={18}
            aria-hidden="true"
          />
        </div>
        <p className="mb-2 mt-1 font-mono text-xs text-zinc-400">
          {trackCountLabel(playlist.trackCount)}
        </p>
        <VisibilityBadge visibility={playlist.visibility} />
      </div>
    </Link>
  );
}
