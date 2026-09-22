import { Copy, KeyRound, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { api } from "../../services/api";
import { copyText } from "../../services/clipboard";
import type { Notify } from "./playlistPresentation";

type Props = {
  ownerId: string;
  onRestoreOwner: (ownerId: string) => void;
  notify: Notify;
};

export function LibraryAccess({ ownerId, onRestoreOwner, notify }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const copyCode = async () => {
    setError("");
    try {
      await copyText(ownerId);
      notify("Code de bibliothèque copié.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sélectionne le code pour le copier.",
      );
    }
  };

  const restore = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!/^LIB-[A-Z0-9-]{8,}$/.test(normalizedCode)) {
      setError("Vérifie ton code : il commence par LIB-.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.playlists(normalizedCode);
      onRestoreOwner(normalizedCode);
      setCode("");
      notify("Bibliothèque ouverte sur cet appareil.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Cette bibliothèque ne peut pas être ouverte pour le moment.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="border-y border-white/10 py-3">
      <summary className="min-h-10 cursor-pointer py-2 font-semibold text-zinc-300">
        Retrouver ma bibliothèque sur un autre appareil
      </summary>
      <div className="grid gap-6 pb-2 pt-4 lg:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="library-code">
            Ton code de bibliothèque
          </label>
          <div className="flex min-w-0 gap-2">
            <input
              id="library-code"
              className="field min-w-0 font-mono text-sm"
              readOnly
              value={ownerId}
              onFocus={(event) => event.target.select()}
            />
            <button
              className="icon-btn"
              onClick={copyCode}
              aria-label="Copier le code de bibliothèque"
            >
              <Copy size={19} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Ce code donne accès à tes playlists et à leur modification. Garde-le
            pour toi ; partage plutôt le lien d’une playlist.
          </p>
        </div>
        <form className="min-w-0" onSubmit={restore}>
          <label className="label" htmlFor="restore-library">
            Ouvrir une autre bibliothèque
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="restore-library"
              className="field min-w-0 font-mono uppercase"
              value={code}
              maxLength={80}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="LIB-XXXXXXXXXXXX"
              onChange={(event) => setCode(event.target.value)}
            />
            <button className="btn-secondary" disabled={!code.trim() || busy}>
              {busy ? (
                <Loader2
                  size={18}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <KeyRound size={18} aria-hidden="true" />
              )}{" "}
              Ouvrir
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Conserve ton code actuel avant d’en utiliser un autre.
          </p>
        </form>
      </div>
      {error && (
        <p className="pb-3 text-sm text-rose-200" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
