import {
  ArrowLeft,
  Check,
  Clapperboard,
  Clock3,
  Gamepad2,
  Gauge,
  ListChecks,
  Music2,
  Play,
  SlidersHorizontal,
  Type,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { usePlaylistQuery } from "../features/playlists/usePlaylistQuery";
import { GENRES, PRESETS, settingLabels } from "../domain/settings";
import type { Settings } from "../types/game";

type Props = {
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  onSave: () => void;
  onBack: () => void;
  isMultiplayer: boolean;
  isEditing?: boolean;
  ownerId: string;
  pending?: boolean;
  multiplayerConnected?: boolean;
};

export default function SettingsPage({
  settings,
  setSettings,
  onSave,
  onBack,
  isMultiplayer,
  isEditing = false,
  ownerId,
  pending = false,
  multiplayerConnected = true,
}: Props) {
  const [roundsDraft, setRoundsDraft] = useState(String(settings.rounds));
  const [timeDraft, setTimeDraft] = useState(String(settings.timeLimit));
  useEffect(() => setRoundsDraft(String(settings.rounds)), [settings.rounds]);
  useEffect(
    () => setTimeDraft(String(settings.timeLimit)),
    [settings.timeLimit],
  );
  const validRounds =
    /^\d+$/.test(roundsDraft) &&
    Number(roundsDraft) >= 1 &&
    Number(roundsDraft) <= 30;
  const validTime =
    /^\d+$/.test(timeDraft) &&
    Number(timeDraft) >= 5 &&
    Number(timeDraft) <= 60;
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const applyPreset = (preset: (typeof PRESETS)[number]) =>
    setSettings((current) => ({ ...current, ...preset.settings }));
  const activePreset =
    validRounds && validTime
      ? PRESETS.find((preset) =>
          (Object.keys(preset.settings) as Array<keyof Settings>).every(
            (key) => settings[key] === preset.settings[key],
          ),
        )
      : undefined;
  const music = settings.gameType === "music";
  const customPlaylistValid =
    !music ||
    settings.genre !== "custom" ||
    /^\s*(?:\d+|https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?playlist\/\d+(?:[/?#]\S*)?)\s*$/i.test(
      settings.customPlaylistUrl,
    );
  const usesPulse = music && settings.genre === "pulse";
  const loadPlaylists = useCallback(
    () => (usesPulse ? api.playlists(ownerId) : Promise.resolve([])),
    [usesPulse, ownerId],
  );
  const playlists = usePlaylistQuery(loadPlaylists);
  const loadSource = useCallback(
    () =>
      usesPulse && settings.pulsePlaylistId
        ? api.quizSource(settings.pulsePlaylistId, ownerId, settings)
        : Promise.resolve(null),
    [
      usesPulse,
      settings.pulsePlaylistId,
      settings.rounds,
      settings.answerType,
      settings.answerMode,
      ownerId,
    ],
  );
  const source = usePlaylistQuery(loadSource);
  const pulseValid =
    !usesPulse ||
    Boolean(
      settings.pulsePlaylistId &&
      !playlists.loading &&
      !playlists.error &&
      playlists.data?.some(
        (playlist) => playlist.id === settings.pulsePlaylistId,
      ) &&
      !source.loading &&
      !source.error &&
      source.data &&
      !source.data.issues.length,
    );
  const submitLabel = isEditing
    ? "Enregistrer les réglages"
    : isMultiplayer
      ? "Créer le salon"
      : "Lancer la partie";

  return (
    <main id="main-content" className="page max-w-6xl">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost px-3" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" /> Retour
        </button>
        <span className="eyebrow">
          <SlidersHorizontal
            className="mr-1 inline"
            size={15}
            aria-hidden="true"
          />{" "}
          Configuration
        </span>
      </header>

      <div className="mb-7">
        <p className="eyebrow mb-3">
          {isMultiplayer ? "Salon multijoueur" : "Partie solo"}
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Compose ta partie
        </h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Choisis un préréglage ou ajuste les options ci-dessous.
          {isMultiplayer &&
            " L’hôte pourra encore modifier ces choix depuis le salon."}
        </p>
      </div>

      <div className="grid items-start gap-8 border-t border-white/10 pt-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <section
          className="min-w-0 space-y-8"
          aria-label="Paramètres de la partie"
        >
          <fieldset className="border-b border-white/10 pb-8">
            <legend className="label mb-3 flex items-center gap-2">
              Préréglages
            </legend>
            <div className="flex flex-wrap gap-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-pad min-w-0 flex-1 basis-28 ${activePreset?.id === preset.id ? "preset-pad-selected" : ""}`}
                  aria-pressed={activePreset?.id === preset.id}
                  onClick={() => applyPreset(preset)}
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-semibold">
                      {preset.name}
                    </span>
                    <Check
                      size={16}
                      className={`shrink-0 ${activePreset?.id === preset.id ? "opacity-100" : "opacity-0"}`}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-zinc-300">
                    {preset.settings.rounds} manches ·{" "}
                    {preset.settings.timeLimit} s
                  </span>
                  <span className="mt-1 block text-xs text-zinc-400">
                    {preset.settings.answerMode === "input"
                      ? "Saisie libre"
                      : "QCM"}
                  </span>
                </button>
              ))}
            </div>
            {activePreset && (
              <p className="mt-3 text-sm text-zinc-400" role="status">
                {activePreset.description}
              </p>
            )}
          </fieldset>

          <fieldset className="border-b border-white/10 pb-8">
            <legend className="label mb-3">Univers</legend>
            <div className="mixer-switch">
              <MixerOption
                selected={music}
                icon={<Music2 />}
                title="Musique"
                describedBy="universe-description"
                onClick={() => update("gameType", "music")}
              />
              <MixerOption
                selected={!music}
                icon={<Clapperboard />}
                title="Cinéma & TV"
                describedBy="universe-description"
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    gameType: "screen",
                    mode: "classic",
                  }))
                }
              />
            </div>
            <p id="universe-description" className="mt-3 text-sm text-zinc-400">
              {music
                ? "Titres, artistes et playlists"
                : "Bandes originales de films et séries"}
            </p>
          </fieldset>

          <fieldset className="border-b border-white/10 pb-8">
            <legend className="label mb-3">Déroulement</legend>
            <div className="mixer-switch">
              <MixerOption
                selected={settings.mode === "classic"}
                icon={<Play />}
                title="Classique"
                describedBy="mode-description"
                onClick={() => update("mode", "classic")}
              />
              <MixerOption
                selected={settings.mode === "progressive"}
                icon={<Gauge />}
                title="Progressif"
                describedBy="mode-description"
                onClick={() => update("mode", "progressive")}
                disabled={!music}
              />
            </div>
            <p id="mode-description" className="mt-3 text-sm text-zinc-400">
              {!music
                ? "Le mode cinéma et TV utilise le déroulement classique."
                : settings.mode === "progressive"
                  ? "Débloque des extraits plus longs contre moins de points"
                  : "Un extrait continu, réponds le plus vite possible"}
            </p>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Format de réponse"
              id="answerMode"
              hint="Choisis parmi quatre propositions ou écris ta réponse."
            >
              <div className="relative">
                <ListChecks
                  className="field-icon"
                  size={18}
                  aria-hidden="true"
                />
                <select
                  id="answerMode"
                  className="field pl-11"
                  value={settings.answerMode}
                  onChange={(event) =>
                    update(
                      "answerMode",
                      event.target.value as Settings["answerMode"],
                    )
                  }
                >
                  <option value="choices">QCM — 4 choix</option>
                  <option value="input">Saisie libre</option>
                </select>
              </div>
            </Field>
            {music ? (
              <Field
                label="Élément à deviner"
                id="answerType"
                hint="Le mode aléatoire alterne artiste et titre."
              >
                <div className="relative">
                  <Type className="field-icon" size={18} aria-hidden="true" />
                  <select
                    id="answerType"
                    className="field pl-11"
                    value={settings.answerType}
                    onChange={(event) =>
                      update(
                        "answerType",
                        event.target.value as Settings["answerType"],
                      )
                    }
                  >
                    <option value="random">Artiste ou titre</option>
                    <option value="artist">Artiste</option>
                    <option value="title">Titre</option>
                    <option value="both">Artiste et titre</option>
                  </select>
                </div>
              </Field>
            ) : (
              <Field
                label="Catégorie"
                id="gameType"
                hint="Le mode mix alterne films et séries."
              >
                <select
                  id="gameType"
                  className="field"
                  value={settings.gameType}
                  onChange={(event) =>
                    update(
                      "gameType",
                      event.target.value as Settings["gameType"],
                    )
                  }
                >
                  <option value="screen">Films et séries</option>
                  <option value="movie">Films uniquement</option>
                  <option value="series">Séries uniquement</option>
                </select>
              </Field>
            )}

            {music ? (
              <Field
                label="Sélection musicale"
                id="genre"
                hint="Choisis un genre, une playlist Deezer publique ou une playlist de ta bibliothèque."
              >
                <select
                  id="genre"
                  className="field"
                  value={settings.genre}
                  onChange={(event) => update("genre", event.target.value)}
                >
                  {GENRES.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field
                label="Indice visuel"
                id="poster"
                hint="L’affiche reste fortement floutée avant la révélation."
              >
                <select
                  id="poster"
                  className="field"
                  value={String(settings.showPoster)}
                  onChange={(event) =>
                    update("showPoster", event.target.value === "true")
                  }
                >
                  <option value="true">Affiche floutée</option>
                  <option value="false">Aucune affiche</option>
                </select>
              </Field>
            )}
          </div>

          {music && settings.genre === "custom" && (
            <Field
              label="Playlist Deezer"
              id="playlist"
              hint="Colle une URL publique Deezer ou son identifiant numérique."
            >
              <input
                id="playlist"
                className="field"
                value={settings.customPlaylistUrl}
                aria-invalid={!customPlaylistValid}
                aria-describedby={
                  customPlaylistValid
                    ? "playlist-hint"
                    : "playlist-hint playlist-error"
                }
                placeholder="https://www.deezer.com/playlist/…"
                onChange={(event) =>
                  update("customPlaylistUrl", event.target.value)
                }
              />
              {!customPlaylistValid && (
                <p
                  id="playlist-error"
                  role="alert"
                  className="mt-2 text-sm font-semibold text-rose-300"
                >
                  L’URL ou l’identifiant Deezer n’est pas valide.
                </p>
              )}
            </Field>
          )}

          {usesPulse && (
            <Field
              label="Playlist de ma bibliothèque"
              id="pulse-playlist"
              hint="Les playlists privées fonctionnent aussi. Seuls les morceaux musicaux avec extrait sont jouables."
            >
              {playlists.loading ? (
                <p role="status" className="text-zinc-300">
                  Chargement de ta bibliothèque…
                </p>
              ) : playlists.error ? (
                <div role="alert">
                  <p className="text-rose-200">{playlists.error}</p>
                  <button
                    className="btn-secondary mt-3"
                    onClick={playlists.reload}
                  >
                    Réessayer
                  </button>
                </div>
              ) : (
                <>
                  <select
                    id="pulse-playlist"
                    className="field"
                    value={settings.pulsePlaylistId}
                    onChange={(event) =>
                      update("pulsePlaylistId", event.target.value)
                    }
                    aria-describedby="pulse-playlist-hint pulse-source-status"
                    aria-invalid={Boolean(
                      source.error || source.data?.issues.length,
                    )}
                  >
                    <option value="">Choisis une playlist</option>
                    {(playlists.data || []).map((playlist) => (
                      <option value={playlist.id} key={playlist.id}>
                        {playlist.name} — {playlist.playableTrackCount} extrait
                        {playlist.playableTrackCount !== 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                  {!playlists.data?.length && (
                    <p className="mt-3 text-zinc-400">
                      Aucune playlist.{" "}
                      <Link className="text-beat-300 underline" to="/playlists">
                        Ouvrir la bibliothèque
                      </Link>{" "}
                      pour en créer ou en copier une.
                    </p>
                  )}
                </>
              )}
              <div
                id="pulse-source-status"
                className="mt-3 space-y-2 text-sm"
                role="status"
              >
                {settings.pulsePlaylistId && source.loading && (
                  <p className="text-zinc-300">
                    Vérification des extraits et du nombre de manches…
                  </p>
                )}
                {source.error && (
                  <>
                    <p className="text-rose-200">{source.error}</p>
                    <button className="btn-secondary" onClick={source.reload}>
                      Revérifier la playlist
                    </button>
                  </>
                )}
                {!source.loading && source.data && (
                  <>
                    <p className="text-zinc-300">
                      {source.data.playableCount} extrait
                      {source.data.playableCount !== 1
                        ? "s exploitables"
                        : " exploitable"}{" "}
                      sur {source.data.trackCount} morceau
                      {source.data.trackCount !== 1 ? "x" : ""}.
                    </p>
                    {source.data.issues.map((issue) => (
                      <p className="text-amber-200" key={issue}>
                        {issue}
                      </p>
                    ))}
                  </>
                )}
              </div>
            </Field>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Nombre de manches"
              id="rounds"
              hint="Entre 1 et 30 manches."
            >
              <div className="relative">
                <Gamepad2 className="field-icon" size={18} aria-hidden="true" />
                <input
                  id="rounds"
                  className="field pl-11"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={30}
                  value={roundsDraft}
                  aria-invalid={!validRounds}
                  aria-describedby="rounds-hint"
                  onChange={(event) => {
                    const value = event.target.value;
                    setRoundsDraft(value);
                    if (
                      /^\d+$/.test(value) &&
                      Number(value) >= 1 &&
                      Number(value) <= 30
                    )
                      update("rounds", Number(value));
                  }}
                />
              </div>
            </Field>
            <Field
              label="Temps par manche"
              id="time"
              hint="Entre 5 et 60 secondes."
            >
              <div className="relative">
                <Clock3 className="field-icon" size={18} aria-hidden="true" />
                <input
                  id="time"
                  className="field pl-11"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={60}
                  value={timeDraft}
                  aria-invalid={!validTime}
                  aria-describedby="time-hint"
                  onChange={(event) => {
                    const value = event.target.value;
                    setTimeDraft(value);
                    if (
                      /^\d+$/.test(value) &&
                      Number(value) >= 5 &&
                      Number(value) <= 60
                    )
                      update("timeLimit", Number(value));
                  }}
                />
              </div>
            </Field>
          </div>
        </section>

        <aside
          className="top-6 border-t border-white/10 pt-6 lg:sticky lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0"
          aria-labelledby="summary-title"
        >
          <h2 id="summary-title" className="text-xl font-bold">
            Ta partie
          </h2>
          <dl className="mt-6 space-y-4 text-sm">
            <Summary label="Univers" value={settingLabels.universe(settings)} />
            <Summary label="Mode" value={settingLabels.mode(settings)} />
            <Summary
              label="Sélection"
              value={settingLabels.selection(settings)}
            />
            {music && (
              <Summary
                label="À deviner"
                value={settingLabels.answerType(settings)}
              />
            )}
            <Summary
              label="Réponses"
              value={settingLabels.answerMode(settings)}
            />
            <Summary
              label="Rythme"
              value={`${settings.rounds} manche${settings.rounds !== 1 ? "s" : ""} · ${settings.timeLimit} s`}
            />
          </dl>
          <p className="mt-5 text-sm leading-relaxed text-zinc-400">
            Les réglages sont sauvegardés sur cet appareil.
          </p>
          <button
            className="btn-primary mt-5 w-full"
            disabled={
              !customPlaylistValid ||
              !pulseValid ||
              !validRounds ||
              !validTime ||
              pending ||
              (isMultiplayer && !multiplayerConnected)
            }
            onClick={onSave}
          >
            <Play size={19} fill="currentColor" aria-hidden="true" />{" "}
            {pending ? "Enregistrement…" : submitLabel}
          </button>
          {isMultiplayer && !multiplayerConnected && (
            <p className="mt-3 text-sm text-zinc-300" role="status">
              Tu peux modifier tes réglages. La connexion au serveur doit être
              rétablie pour{" "}
              {isEditing ? "les enregistrer dans le salon" : "créer le salon"}.
            </p>
          )}
          {(!validRounds || !validTime) && (
            <p role="alert" className="mt-3 text-sm text-rose-200">
              Choisis 1 à 30 manches et 5 à 60 secondes, sans décimales.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

function MixerOption({
  selected,
  icon,
  title,
  describedBy,
  onClick,
  disabled = false,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  describedBy: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-describedby={describedBy}
      disabled={disabled}
      className={`mixer-option ${selected ? "mixer-option-selected" : ""}`}
      onClick={onClick}
    >
      <span
        aria-hidden="true"
        className={`shrink-0 ${selected ? "text-beat-300" : "text-zinc-400"}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 break-words text-left font-semibold">
        {title}
      </span>
      <Check
        size={16}
        className={`shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      />
    </button>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <p
          id={`${id}-hint`}
          className="mt-2 text-xs leading-relaxed text-zinc-400"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[.06] pb-3 last:border-0">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="max-w-[60%] text-right font-bold text-zinc-100">
        {value}
      </dd>
    </div>
  );
}
