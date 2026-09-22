import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import PulseSignal from "../../components/PulseSignal";

export function PlaylistLoading() {
  return (
    <div className="py-6" aria-busy="true">
      <p
        className="mb-6 flex items-center gap-3 text-sm text-zinc-400"
        role="status"
      >
        <PulseSignal animated className="shrink-0" />
        Chargement des playlists…
      </p>
      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="flex min-w-0 items-center gap-4 border-b border-white/[.06] py-4"
          >
            <span className="size-12 shrink-0 rounded-sm bg-white/[.04]" />
            <span className="flex-1 space-y-3">
              <span className="block h-3 w-2/3 max-w-64 rounded bg-white/[.07]" />
              <span className="block h-2 w-1/3 max-w-32 rounded bg-white/[.04]" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlaylistError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-md border border-rose-400/20 bg-rose-400/5 p-4 sm:p-5">
      <div className="mb-5 flex items-start gap-3 text-rose-200" role="alert">
        <AlertCircle className="mt-0.5 shrink-0" size={21} aria-hidden="true" />
        <p className="break-words">{message}</p>
      </div>
      <button className="btn-secondary" onClick={onRetry}>
        Réessayer
      </button>
    </section>
  );
}

export function PlaylistEmpty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-y border-white/10 py-10">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-3 max-w-xl leading-relaxed text-zinc-400">
        {children}
      </div>
    </section>
  );
}
