import { Accessibility, Contrast, Text, X, ZapOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useModalFocus } from "../hooks/useModalFocus";
import { storage } from "../services/storage";

type Preferences = {
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
};
const STORAGE_KEY = "pulse_accessibility";
const defaults: Preferences = {
  largeText: false,
  highContrast: false,
  reduceMotion: false,
};

export default function AccessibilityPanel() {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      return {
        ...defaults,
        ...(JSON.parse(
          localStorage.getItem(STORAGE_KEY) || "{}",
        ) as Partial<Preferences>),
      };
    } catch {
      return defaults;
    }
  });
  const trigger = useRef<HTMLButtonElement>(null);
  const modal = useRef<HTMLElement>(null);
  const close = () => setOpen(false);
  useModalFocus(open, modal, close);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("a11y-large-text", preferences.largeText);
    root.classList.toggle("a11y-high-contrast", preferences.highContrast);
    root.classList.toggle("a11y-reduce-motion", preferences.reduceMotion);
    storage.set(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const toggle = (key: keyof Preferences) =>
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  return (
    <>
      <button
        ref={trigger}
        className="inline-flex min-h-11 items-center gap-2 text-xs text-zinc-400 hover:text-white"
        onClick={() => setOpen(true)}
        aria-label="Options d’accessibilité"
        aria-haspopup="dialog"
      >
        <Accessibility size={16} aria-hidden="true" /> Accessibilité
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-ink-950/95 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="accessibility-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            ref={modal}
            tabIndex={-1}
            className="panel relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto p-5 text-left text-base sm:p-7"
          >
            <button
              className="icon-btn absolute right-3 top-3"
              onClick={close}
              aria-label="Fermer les options d’accessibilité"
            >
              <X aria-hidden="true" />
            </button>
            <p className="eyebrow mb-2">Confort</p>
            <h2 id="accessibility-title" className="pr-12 text-2xl font-bold">
              Options d’accessibilité
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Ces préférences restent enregistrées sur cet appareil.
            </p>
            <div className="mt-6 space-y-3">
              <Toggle
                icon={<Text />}
                label="Texte plus grand"
                description="Augmente la taille de tous les textes et contrôles."
                checked={preferences.largeText}
                onClick={() => toggle("largeText")}
              />
              <Toggle
                icon={<Contrast />}
                label="Contraste renforcé"
                description="Éclaircit les textes secondaires et les contours."
                checked={preferences.highContrast}
                onClick={() => toggle("highContrast")}
              />
              <Toggle
                icon={<ZapOff />}
                label="Réduire les animations"
                description="Supprime les déplacements et effets non essentiels."
                checked={preferences.reduceMotion}
                onClick={() => toggle("reduceMotion")}
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Toggle({
  icon,
  label,
  description,
  checked,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="flex min-h-20 w-full items-center gap-3 border-b border-white/15 py-4 text-left hover:bg-white/[.03]"
      onClick={onClick}
    >
      <span
        className="hidden size-10 shrink-0 items-center justify-center text-zinc-400 sm:flex"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-white">{label}</span>
        <span className="mt-0.5 block text-sm leading-snug text-zinc-400">
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-[28px] w-[48px] shrink-0 rounded-full border transition ${checked ? "border-beat-300 bg-beat-500" : "border-white/20 bg-ink-950"}`}
      >
        <span
          className={`absolute top-[4px] size-[18px] rounded-full transition-transform ${checked ? "translate-x-[24px] bg-ink-950" : "translate-x-[4px] bg-white"}`}
        />
      </span>
    </button>
  );
}
