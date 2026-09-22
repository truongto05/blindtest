import { useEffect, useState } from "react";
import { Loader2, WifiOff } from "lucide-react";

type Props = {
  state: "connected" | "reconnecting" | "offline";
  onRetry: () => void;
};

export default function ConnectionNotice({ state, onRetry }: Props) {
  const [stage, setStage] = useState<"quiet" | "connecting" | "slow">("quiet");
  useEffect(() => {
    setStage("quiet");
    if (state !== "reconnecting") return;
    const visible = window.setTimeout(() => setStage("connecting"), 1_500);
    const slow = window.setTimeout(() => setStage("slow"), 12_000);
    return () => {
      window.clearTimeout(visible);
      window.clearTimeout(slow);
    };
  }, [state]);

  if (state === "connected" || (state === "reconnecting" && stage === "quiet"))
    return null;

  return (
    <aside
      aria-label="Connexion au serveur"
      className="mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-6xl flex-wrap items-center gap-3 border-l-2 border-signal-cyan bg-ink-900 px-4 py-3 text-sm"
    >
      {state === "offline" ? (
        <WifiOff
          size={18}
          className="shrink-0 text-signal-cyan"
          aria-hidden="true"
        />
      ) : (
        <Loader2
          size={18}
          className="shrink-0 animate-spin text-signal-cyan motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      <p
        role="status"
        className="min-w-0 flex-1 basis-56 leading-relaxed text-zinc-300"
      >
        {state === "offline"
          ? "Tu es hors connexion. Les salons seront accessibles au retour du réseau."
          : stage === "slow"
            ? "Le serveur met du temps à répondre. Il peut être en train de démarrer. La connexion se relance automatiquement ; tes réglages restent ici."
            : "Connexion au serveur… Tu peux déjà préparer tes réglages."}
      </p>
      {stage === "slow" && state !== "offline" && (
        <button type="button" className="btn-ghost shrink-0" onClick={onRetry}>
          Relancer la connexion
        </button>
      )}
    </aside>
  );
}
