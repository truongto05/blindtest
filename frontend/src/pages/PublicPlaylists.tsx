import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PlaylistCard } from "../features/playlists/PlaylistCard";
import {
  PlaylistEmpty,
  PlaylistError,
  PlaylistLoading,
} from "../features/playlists/PlaylistFeedback";
import { usePlaylistQuery } from "../features/playlists/usePlaylistQuery";
import { api } from "../services/api";

export default function PublicPlaylists() {
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get("page") || 1);
  const page =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, 10000)
      : 1;
  const load = useCallback(() => api.publicPlaylists(page), [page]);
  const { data, loading, error, reload } = usePlaylistQuery(load);
  return (
    <main id="main-content" className="page max-w-5xl">
      <header className="mb-8">
        <Link to="/playlists" className="btn-ghost w-fit px-3">
          <ArrowLeft size={18} aria-hidden="true" /> Ma bibliothèque
        </Link>
      </header>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Playlists publiques
      </h1>
      <p className="mb-8 mt-4 max-w-2xl leading-relaxed text-zinc-400">
        Écoute les extraits et copie une playlist dans ta bibliothèque pour
        jouer avec.
      </p>
      {loading ? (
        <PlaylistLoading />
      ) : error ? (
        <PlaylistError message={error} onRetry={reload} />
      ) : (
        <>
          {data?.items.length ? (
            <div className="grid gap-x-7 border-t border-white/10 sm:grid-cols-2">
              {data.items.map((playlist) => (
                <PlaylistCard
                  key={playlist.shareId}
                  playlist={playlist}
                  to={`/p/${playlist.shareId}`}
                />
              ))}
            </div>
          ) : (
            <PlaylistEmpty title="Aucune playlist sur cette page">
              <p>
                Les playlists publiées apparaîtront ici. Tu peux partager la
                première depuis ta bibliothèque.
              </p>
            </PlaylistEmpty>
          )}
          {data && (page > 1 || data.total > data.pageSize) && (
            <nav
              aria-label="Pagination des playlists"
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
            >
              <button
                className="btn-secondary"
                disabled={page === 1}
                onClick={() => setParams({ page: String(page - 1) })}
              >
                Précédente
              </button>
              <p className="text-sm text-zinc-400">
                Page {page} /{" "}
                {Math.max(1, Math.ceil(data.total / data.pageSize))}
              </p>
              <button
                className="btn-secondary"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                Suivante
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  );
}
