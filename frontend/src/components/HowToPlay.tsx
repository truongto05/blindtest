import { CircleHelp, Volume2, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "../hooks/useModalFocus";
import PulseSignal from "./PulseSignal";

export default function HowToPlay({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const modal = useRef<HTMLElement>(null);
  const close = () => setOpen(false);
  useModalFocus(open, modal, close);

  return (
    <>
      <button
        type="button"
        className={`inline-flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-zinc-300 transition-colors hover:text-beat-300 ${className}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <CircleHelp size={18} className="shrink-0" aria-hidden="true" />
        Comment jouer
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-ink-950/90 p-3 sm:items-center"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <section
              ref={modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-lg overflow-y-auto overscroll-contain rounded-xl bg-ink-900 p-5 text-left text-base shadow-2xl sm:p-7"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <PulseSignal className="mb-3" />
                  <h2 id={titleId} className="text-xl font-bold sm:text-2xl">
                    Comment jouer
                  </h2>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={close}
                  aria-label="Fermer les règles du jeu"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              <ol className="mt-5 space-y-5 text-sm leading-relaxed">
                <li className="flex gap-3">
                  <span
                    className="pt-0.5 font-mono text-signal-coral"
                    aria-hidden="true"
                  >
                    01
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white">Seul ou ensemble.</h3>
                    <p className="mt-1 text-zinc-300">
                      Lance une partie solo ou crée un salon. Tes amis te
                      rejoignent avec son code, son lien ou son QR code. Chacun
                      se met prêt, puis l’hôte lance la partie.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span
                    className="pt-0.5 font-mono text-beat-300"
                    aria-hidden="true"
                  >
                    02
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white">
                      Écoute. Trouve. Réponds.
                    </h3>
                    <p className="mt-1 text-zinc-300">
                      Reconnais l’extrait avant la fin du chrono. Selon les
                      réglages, choisis une proposition (QCM) ou écris ta
                      réponse. Une seule réponse par manche : elle ne peut pas
                      être changée après validation.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span
                    className="pt-0.5 font-mono text-signal-cyan"
                    aria-hidden="true"
                  >
                    03
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white">
                      Vise juste pour marquer.
                    </h3>
                    <dl className="mt-2 space-y-2 text-zinc-300">
                      <div>
                        <dt className="inline font-bold text-beat-300">
                          Classique.
                        </dt>{" "}
                        <dd className="inline">
                          Une bonne réponse rapporte de 500 à 1 000 points :
                          plus tu réponds vite, plus tu marques.
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-signal-cyan">
                          Progressif.
                        </dt>{" "}
                        <dd className="inline">
                          Débloque un extrait plus long si besoin. Plus tu
                          demandes d’audio, moins la bonne réponse rapporte.
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-zinc-400">
                      Une erreur ou un temps écoulé rapporte 0 point.
                    </p>
                  </div>
                </li>
              </ol>

              <div className="mt-6 border-t border-white/10 pt-4 text-sm leading-relaxed">
                <h3 className="font-bold text-white">
                  Une sélection qui varie.
                </h3>
                <p className="mb-4 mt-1 text-zinc-300">
                  Les sélections musicales croisent plusieurs sources lorsque
                  disponibles. Pulse espace les artistes, évite les morceaux
                  déjà joués dans la partie et propose des réponses du même
                  univers. Les réglages permettent aussi de choisir « Mix soirée
                  » ou ta propre playlist.
                </p>
                <h3 className="flex items-center gap-2 font-bold text-white">
                  <Volume2
                    size={18}
                    className="shrink-0 text-signal-coral"
                    aria-hidden="true"
                  />
                  Tu n’entends rien ?
                </h3>
                <p className="mt-1 text-zinc-300">
                  Active la lecture quand Pulse te le propose, vérifie le volume
                  de ton appareil et du lecteur, puis utilise « Réessayer » si
                  l’audio n’a pas chargé.
                </p>
              </div>
              <button
                type="button"
                className="btn-primary mt-6 w-full"
                onClick={close}
              >
                Compris
              </button>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
