import { Check, Play, SlidersHorizontal } from "lucide-react";
import {
  HOME_SELECTIONS,
  selectedHomeSelection,
  type HomeSelection,
  type HomeSelectionId,
} from "../domain/selections";
import { settingLabels } from "../domain/settings";
import type { Settings } from "../types/game";
import HowToPlay from "./HowToPlay";

type Props = {
  settings: Settings;
  onSelect: (id: HomeSelectionId) => void;
  onPlay: () => void;
  onCustomize: () => void;
  pending: boolean;
  connected: boolean;
};

export default function SelectionShelf({
  settings,
  onSelect,
  onPlay,
  onCustomize,
  pending,
  connected,
}: Props) {
  const selected = selectedHomeSelection(settings);
  return (
    <section className="min-w-0" aria-labelledby="selections-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="selections-title" className="text-lg font-bold">
          Choisis ton terrain.
        </h2>
        <HowToPlay className="text-sm" />
      </div>
      <div
        className="selection-grid"
        role="group"
        aria-label="Sélection pour la partie"
      >
        {HOME_SELECTIONS.map((selection) => (
          <button
            key={selection.id}
            className="selection-card"
            data-tone={selection.tone}
            type="button"
            aria-pressed={selected?.id === selection.id}
            aria-label={`Choisir ${selection.name}`}
            disabled={pending}
            onClick={() => onSelect(selection.id)}
          >
            <span className="selection-cover" aria-hidden="true">
              <SelectionArtwork selection={selection} />
            </span>
            <span className="flex min-w-0 items-center justify-between gap-2 px-3 pb-3 pt-3 sm:px-4">
              <span className="min-w-0 text-left">
                <span className="block font-display text-sm font-bold sm:text-base">
                  {selection.name}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-400">
                  {selection.caption}
                </span>
              </span>
              <Check
                size={18}
                className={`shrink-0 text-beat-300 ${selected?.id === selection.id ? "visible" : "invisible"}`}
                aria-hidden="true"
              />
            </span>
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
        <div className="min-w-0" role="status">
          <p className="font-semibold">
            {selected?.name || "Ta sélection personnalisée"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            {settingLabels.mode(settings)} · {settings.rounds} manches ·{" "}
            {settings.timeLimit} s · {settingLabels.answerMode(settings)}
          </p>
        </div>
        <button
          className="btn-primary min-h-14 grow sm:grow-0"
          disabled={!selected || !connected || pending}
          onClick={onPlay}
        >
          <Play size={19} fill="currentColor" aria-hidden="true" /> Jouer en
          solo
        </button>
      </div>
      {!selected && (
        <p className="mt-3 text-sm text-zinc-400">
          Choisis un thème pour jouer directement, ou retrouve tes réglages
          ci-dessous.
        </p>
      )}
      {!connected && (
        <p className="mt-3 text-sm text-zinc-400">
          Le jeu sera disponible dès que le serveur sera connecté.
        </p>
      )}
      <button
        className="btn-ghost mt-2 px-0 text-sm"
        onClick={onCustomize}
        disabled={pending}
      >
        <SlidersHorizontal size={17} aria-hidden="true" /> Personnaliser la
        partie
      </button>
    </section>
  );
}

function SelectionArtwork({ selection }: { selection: HomeSelection }) {
  return (
    <svg viewBox="0 0 280 118" fill="none" focusable="false">
      {selection.id === "hits" ? (
        <>
          <circle cx="232" cy="61" r="86" fill="currentColor" />
          {[38, 51, 66, 79].map((radius) => (
            <circle
              key={radius}
              cx="232"
              cy="61"
              r={radius}
              stroke="var(--sleeve-color)"
              strokeOpacity=".3"
            />
          ))}
          <circle cx="232" cy="61" r="18" fill="var(--sleeve-color)" />
          <circle cx="232" cy="61" r="4" fill="currentColor" />
        </>
      ) : selection.id === "eighties" ? (
        <>
          <path
            d="M164 23h91v77h-91z"
            stroke="currentColor"
            strokeWidth="5"
            transform="rotate(-9 210 61)"
          />
          <path
            d="M159 48h94M173 88h65"
            stroke="currentColor"
            strokeWidth="4"
          />
          <circle
            cx="188"
            cy="65"
            r="9"
            stroke="currentColor"
            strokeWidth="4"
          />
          <circle
            cx="230"
            cy="65"
            r="9"
            stroke="currentColor"
            strokeWidth="4"
          />
        </>
      ) : selection.id === "rap" ? (
        <>
          {[34, 65, 95, 76, 44].map((height, index) => (
            <rect
              key={index}
              x={174 + index * 19}
              y={(118 - height) / 2}
              width="10"
              height={height}
              fill="currentColor"
              transform="skewX(-8)"
            />
          ))}
        </>
      ) : selection.id === "rock" ? (
        <>
          <path
            d="m202 -8-41 79h42l-16 57 78-92h-46l26-44z"
            fill="currentColor"
          />
          <path
            d="m245 103 30-12M151 15l-17-9M154 96l-23 13"
            stroke="currentColor"
            strokeWidth="4"
          />
        </>
      ) : selection.id === "films" ? (
        <>
          <path d="M163 44h97v63h-97z" fill="currentColor" />
          <path d="m159 37 95-24 5 20-95 24z" fill="currentColor" />
          {[174, 202, 230].map((x) => (
            <path
              key={x}
              d={`m${x} 35 11-17`}
              stroke="var(--sleeve-color)"
              strokeWidth="7"
            />
          ))}
          <path d="m203 61 25 13-25 15z" fill="var(--sleeve-color)" />
        </>
      ) : (
        <>
          <rect
            x="160"
            y="23"
            width="105"
            height="76"
            rx="10"
            stroke="currentColor"
            strokeWidth="5"
          />
          <path
            d="m189 5 22 18 20-18M194 110h37"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path d="m200 42 30 19-30 19z" fill="currentColor" />
        </>
      )}
      <text
        x="16"
        y="75"
        fill="currentColor"
        fontFamily="Unbounded, sans-serif"
        fontSize={selection.artwork.length > 4 ? "25" : "38"}
        fontWeight="900"
        letterSpacing="-2"
      >
        {selection.artwork}
      </text>
      <path d="M18 94h40" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}
