import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  LogOut,
  Music2,
  RefreshCw,
  Send,
  SignalZero,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { useAudio } from "../hooks/useAudio";
import { isCorrectAnswer } from "../domain/answer";
import PulseSignal from "./PulseSignal";
import { useModalFocus } from "../hooks/useModalFocus";
import { api } from "../services/api";
import { socket } from "../services/socketService";
import { storage } from "../services/storage";
import type { QuizData, Reveal, RoomState, Settings } from "../types/game";

type Props = {
  settings: Settings;
  ownerId: string;
  isMultiplayer: boolean;
  room: RoomState | null;
  playerId: string;
  round: QuizData | null;
  reveal: Reveal | null;
  connection: "connected" | "reconnecting" | "offline";
  onSubmitMulti: (answer: string) => void;
  onRequestSegment: (tier: number) => void;
  onSoloEnd: (score: number, history: QuizData[]) => void;
  onExit: () => void;
};
const SEGMENTS = [0.1, 0.5, 2, 5, 10, 15];

export default function GameBoard(props: Props) {
  const { settings, isMultiplayer, room, playerId, reveal, connection } = props;
  const [soloRound, setSoloRound] = useState<QuizData | null>(null);
  const current = isMultiplayer ? props.round : soloRound;
  const [loading, setLoading] = useState(!isMultiplayer);
  const [loadError, setLoadError] = useState("");
  const [activated, setActivated] = useState(isMultiplayer);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [revealDismissed, setRevealDismissed] = useState(false);
  const submittedRef = useRef(false);
  const [result, setResult] = useState<{
    correct: boolean;
    points: number;
  } | null>(null);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [roundNumber, setRoundNumber] = useState(1);
  const historyRef = useRef<QuizData[]>([]);
  const played = useRef<Array<string | number>>([]);
  const [soloRun] = useState(() => {
    let recentIds: Array<string | number> = [];
    try {
      const saved = JSON.parse(storage.get("pulse_recent_tracks") || "[]");
      if (Array.isArray(saved))
        recentIds = saved
          .filter((value) => /^\d{1,16}$/.test(String(value)))
          .slice(-60);
    } catch {
      /* No usable listening history. */
    }
    return { id: crypto.randomUUID(), recentIds };
  });
  const [segmentTier, setSegmentTier] = useState(0);
  const usedTier = useRef(0);
  const transition = useRef<number>();
  const requestVersion = useRef(0);
  const autoPlayed = useRef(false);
  const [now, setNow] = useState(Date.now());
  const {
    status: audioStatus,
    play,
    stop,
    retry,
    volume,
    setVolume,
    muted,
    toggleMute,
  } = useAudio(current?.audioUrl || null);
  const deadline = isMultiplayer
    ? current?.deadline || room?.deadline || 0
    : now + settings.timeLimit * 1000;
  const soloDeadline = useRef(0);
  const effectiveDeadline = isMultiplayer ? deadline : soloDeadline.current;
  const clockOffset = isMultiplayer ? room?.clockOffsetMs || 0 : 0;
  const gameNow = now - clockOffset;
  const timeLeft = effectiveDeadline
    ? Math.max(
        0,
        Math.min(
          settings.timeLimit,
          Math.ceil((effectiveDeadline - gameNow) / 1000),
        ),
      )
    : settings.timeLimit;
  const totalRounds = isMultiplayer
    ? room?.totalRounds || settings.rounds
    : settings.rounds;
  const displayedRound = isMultiplayer
    ? room?.currentRound || current?.currentRound || 1
    : roundNumber;
  const me = room?.players.find((p) => p.playerId === playerId);
  const roundOpen = isMultiplayer
    ? connection === "connected" &&
      room?.phase === "playing" &&
      gameNow >= (current?.startedAt || 0) &&
      timeLeft > 0
    : Boolean(soloDeadline.current && timeLeft > 0);
  const canSubmit = Boolean(
    current && !loading && !submitted && !reveal && roundOpen,
  );
  const canPlaySegment = Boolean(
    current &&
    !loading &&
    !submitted &&
    !reveal &&
    (audioStatus === "ready" || audioStatus === "playing") &&
    (isMultiplayer ? roundOpen : !soloDeadline.current || timeLeft > 0),
  );

  const loadSolo = async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError("");
    setSubmitted(false);
    submittedRef.current = false;
    setResult(null);
    setAnswer("");
    soloDeadline.current = 0;
    try {
      const data = await api.nextQuiz(
        settings,
        played.current,
        props.ownerId,
        soloRun,
      );
      if (version !== requestVersion.current) return;
      played.current.push(data.trackId);
      if (settings.gameType === "music")
        storage.set(
          "pulse_recent_tracks",
          JSON.stringify([...soloRun.recentIds, ...played.current].slice(-60)),
        );
      setSoloRound(data);
      historyRef.current = [...historyRef.current, data];
      setNow(Date.now());
    } catch (e) {
      if (version === requestVersion.current)
        setLoadError(
          e instanceof Error ? e.message : "Impossible de charger la manche.",
        );
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };
  useEffect(
    () => () => {
      requestVersion.current += 1;
      window.clearTimeout(transition.current);
    },
    [],
  );
  useEffect(() => {
    if (!isMultiplayer && activated && !soloRound && !loading) void loadSolo();
  }, [activated]);
  useEffect(() => {
    if (current) {
      setSubmitted(Boolean(isMultiplayer && me?.hasAnswered));
      submittedRef.current = Boolean(isMultiplayer && me?.hasAnswered);
      setResult(null);
      setRevealDismissed(false);
      setAnswer("");
      setSegmentTier(0);
      usedTier.current = 0;
      autoPlayed.current = false;
      if (!isMultiplayer) soloDeadline.current = 0;
    }
  }, [current?.trackId, current?.currentRound]);
  useEffect(() => {
    if (isMultiplayer && me?.hasAnswered) {
      submittedRef.current = true;
      setSubmitted(true);
      stop();
    }
  }, [isMultiplayer, me?.hasAnswered, stop]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (
      !activated ||
      !current ||
      submitted ||
      reveal ||
      audioStatus !== "ready" ||
      settings.mode !== "classic" ||
      autoPlayed.current
    )
      return;
    const wait = Math.max(
      0,
      (current.startedAt || Date.now()) - (Date.now() - clockOffset),
    );
    const id = window.setTimeout(() => {
      autoPlayed.current = true;
      play();
    }, wait);
    return () => window.clearTimeout(id);
  }, [
    activated,
    current?.trackId,
    current?.currentRound,
    audioStatus,
    settings.mode,
    submitted,
    reveal,
    clockOffset,
  ]);
  useEffect(() => {
    if (!isMultiplayer && audioStatus === "playing" && !soloDeadline.current) {
      soloDeadline.current = Date.now() + settings.timeLimit * 1000;
      setNow(Date.now());
    }
  }, [audioStatus, isMultiplayer, settings.timeLimit]);
  useEffect(() => {
    if (reveal) stop();
  }, [reveal, stop]);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    if (!isMultiplayer) return;
    const handler = (data: {
      correct: boolean;
      points: number;
      totalScore: number;
    }) => {
      setResult(data);
      setScore(data.totalScore);
    };
    socket.on("answer_result", handler);
    return () => {
      socket.off("answer_result", handler);
    };
  }, [isMultiplayer]);
  useEffect(() => {
    if (
      isMultiplayer ||
      !current ||
      submitted ||
      !soloDeadline.current ||
      timeLeft > 0
    )
      return;
    submit("");
  }, [timeLeft, isMultiplayer, current, submitted]);
  useEffect(() => {
    if (!current || !canSubmit || settings.answerMode !== "choices") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isMultiplayer && connection !== "connected") return;
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < current.choices.length) {
        event.preventDefault();
        submit(current.choices[index]!);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, canSubmit, settings.answerMode, connection, isMultiplayer]);

  function submit(value: string) {
    if (
      !current ||
      submittedRef.current ||
      reveal ||
      (!isMultiplayer &&
        (!soloDeadline.current ||
          (Boolean(value) && Date.now() >= soloDeadline.current))) ||
      (isMultiplayer &&
        (connection !== "connected" ||
          Date.now() - clockOffset < (current.startedAt || 0) ||
          Date.now() - clockOffset > (current.deadline || Infinity)))
    )
      return;
    submittedRef.current = true;
    setAnswer(value);
    stop();
    setSubmitted(true);
    if (isMultiplayer) {
      props.onSubmitMulti(value || "TEMPS_ECOULE");
      return;
    }
    const correct = isCorrectAnswer(value, current);
    const tierPoints = [1000, 800, 600, 400, 200, 100];
    const points = correct
      ? settings.mode === "progressive"
        ? tierPoints[usedTier.current]!
        : Math.round(500 + (timeLeft / settings.timeLimit) * 500)
      : 0;
    setResult({ correct, points });
    const nextScore = scoreRef.current + points;
    scoreRef.current = nextScore;
    setScore(nextScore);
    transition.current = window.setTimeout(() => {
      if (roundNumber >= settings.rounds)
        props.onSoloEnd(nextScore, historyRef.current);
      else {
        setRoundNumber((n) => n + 1);
        setSoloRound(null);
        void loadSolo();
      }
    }, 3500);
  }
  const formSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (answer.trim()) submit(answer);
  };
  const progress = Math.max(
    0,
    Math.min(100, (timeLeft / settings.timeLimit) * 100),
  );

  if (!activated && !isMultiplayer)
    return (
      <main id="main-content" className="page items-center justify-center">
        <section className="w-full max-w-lg py-8 text-center sm:py-12">
          <span className="mx-auto mb-8 flex size-20 items-center justify-center rounded-md bg-beat-400 text-ink-950">
            <Volume2 size={36} aria-hidden="true" />
          </span>
          <p className="eyebrow mb-3">Vérification audio</p>
          <h1 className="text-5xl font-black tracking-tight sm:text-6xl">
            Monte le son.
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-zinc-400">
            Le premier clic autorise ton navigateur à lire les extraits. Tu
            pourras régler le volume pendant la partie.
          </p>
          <button
            className="btn-primary mt-8 w-full"
            onClick={() => {
              setActivated(true);
              setLoading(false);
            }}
          >
            Activer le son et commencer
          </button>
          <button className="btn-ghost mt-2" onClick={props.onExit}>
            Retour
          </button>
        </section>
      </main>
    );
  if (loading || (!current && isMultiplayer && room?.phase === "loading"))
    return (
      <State
        icon={<PulseSignal animated />}
        title="On prépare la manche"
        text="Sélection et préchargement de l’extrait…"
        action={
          <button className="btn-secondary" onClick={props.onExit}>
            Quitter la partie
          </button>
        }
      />
    );
  if (loadError)
    return (
      <State
        icon={<AlertTriangle />}
        title="L’extrait ne répond pas"
        text={loadError}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <button className="btn-primary" onClick={loadSolo}>
              <RefreshCw size={18} /> Réessayer
            </button>
            <button className="btn-secondary" onClick={props.onExit}>
              Retour à l’accueil
            </button>
          </div>
        }
      />
    );
  if (!current)
    return (
      <State
        icon={<Music2 />}
        title="En attente"
        text="La prochaine manche va commencer."
      />
    );

  return (
    <main id="main-content" className="page max-w-5xl overflow-y-auto">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-4 sm:gap-7">
          <div>
            <p className="eyebrow text-zinc-400">Manche</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {String(displayedRound).padStart(2, "0")}
              <span className="text-sm text-zinc-400">
                {" "}
                / {String(totalRounds).padStart(2, "0")}
              </span>
            </p>
          </div>
          <div className="border-l border-white/10 pl-4 sm:pl-7">
            <p className="eyebrow text-zinc-400">Ton score</p>
            <p className="mt-1 text-2xl font-black tabular-nums">
              {isMultiplayer ? me?.score || 0 : score}{" "}
              <span className="text-sm font-semibold text-zinc-400">pts</span>
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="icon-btn"
            onClick={toggleMute}
            aria-label={muted ? "Activer le son" : "Couper le son"}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <label className="sr-only" htmlFor="volume">
            Volume
          </label>
          <input
            id="volume"
            className="min-h-11 w-20 accent-beat-400 sm:w-24"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <button
            className="icon-btn"
            onClick={props.onExit}
            aria-label="Quitter la partie"
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      {connection !== "connected" && isMultiplayer && (
        <div
          role="status"
          className="mb-4 flex items-center justify-center gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-sm font-semibold text-amber-300"
        >
          <SignalZero size={17} />{" "}
          {connection === "offline"
            ? "Hors ligne — ta place est gardée 30 secondes."
            : "Reconnexion en cours…"}
        </div>
      )}
      <section className="flex flex-1 flex-col items-center justify-center pb-5 pt-1 sm:pb-8 sm:pt-5">
        <div className="w-full max-w-2xl">
          <p className="eyebrow mb-3 text-beat-300">
            {settings.mode === "progressive"
              ? "Écoute progressive"
              : "À toi de jouer"}
          </p>
          <h1 className="max-w-xl text-[clamp(1.9rem,6vw,3rem)] font-black leading-tight tracking-tight">
            {badge(current.questionType)}
          </h1>
        </div>
        <p className="sr-only" role="status">
          Manche {displayedRound} sur {totalRounds}.{" "}
          {badge(current.questionType)}
          {timeLeft <= 5 && timeLeft > 0
            ? " Il reste cinq secondes ou moins."
            : ""}
        </p>
        <div className="my-6 grid w-full max-w-2xl grid-cols-[minmax(0,1fr)_auto] items-center gap-5 sm:my-8 sm:gap-12">
          <div className="min-w-0">
            {["movie", "series"].includes(current.questionType) ? (
              <div className="relative flex h-28 w-24 items-center justify-center overflow-hidden rounded-sm border border-white/10 bg-ink-900 sm:h-36 sm:w-28">
                {current.coverUrl && settings.showPoster ? (
                  <img
                    src={current.coverUrl}
                    alt="Affiche volontairement floutée"
                    className="size-full scale-110 object-cover blur-xl"
                  />
                ) : (
                  <Film
                    className="text-beat-300"
                    size={40}
                    aria-hidden="true"
                  />
                )}
              </div>
            ) : (
              <Equalizer active={audioStatus === "playing"} />
            )}
            <p className="mt-3 text-xs font-medium text-zinc-400">
              {submitted
                ? "Réponse envoyée"
                : audioStatus === "playing"
                  ? "Lecture de l’extrait"
                  : settings.mode === "progressive"
                    ? "Choisis une durée ci-dessous"
                    : "Écoute. Reconnais. Réponds."}
            </p>
          </div>
          <div
            className="border-l border-white/10 pl-5 text-right sm:pl-10"
            aria-hidden="true"
          >
            <p
              className={`font-mono text-[clamp(3.4rem,12vw,5.5rem)] font-semibold leading-none tracking-tighter tabular-nums ${timeLeft <= 5 ? "text-rose-300" : "text-beat-300"}`}
            >
              {String(timeLeft).padStart(2, "0")}
            </p>
            <p className="mt-2 text-xs text-zinc-400">secondes</p>
          </div>
        </div>
        <div
          className="mb-6 h-1 w-full max-w-2xl overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Temps restant"
          aria-valuemin={0}
          aria-valuemax={settings.timeLimit}
          aria-valuenow={timeLeft}
          aria-valuetext={`${timeLeft} secondes restantes`}
        >
          <div
            className={`h-full transition-[width] duration-200 motion-reduce:transition-none ${timeLeft <= 5 ? "bg-rose-400" : "audio-progress"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {audioStatus === "loading" && (
          <p role="status" className="mb-5 text-sm text-zinc-400">
            Chargement de l’extrait…
          </p>
        )}
        {(audioStatus === "error" || audioStatus === "blocked") &&
          !submitted &&
          !reveal && (
            <div
              role="status"
              className="mb-5 flex flex-wrap items-center justify-center gap-3 text-sm text-amber-300"
            >
              <span>
                {audioStatus === "blocked"
                  ? "Ton navigateur attend un clic pour lire l’extrait."
                  : "Cet extrait n’a pas pu être chargé."}
              </span>
              <button
                className="btn-secondary min-h-10 py-2"
                onClick={() => {
                  autoPlayed.current = audioStatus === "blocked";
                  retry();
                }}
              >
                <RefreshCw size={16} />{" "}
                {audioStatus === "blocked" ? "Lire l’extrait" : "Réessayer"}
              </button>
            </div>
          )}
        {settings.mode === "progressive" && !submitted && (
          <div
            className="mb-5 flex flex-wrap justify-center gap-2"
            role="group"
            aria-label="Durées d’extrait"
          >
            {SEGMENTS.map((seconds, tier) => (
              <button
                key={seconds}
                disabled={tier > segmentTier || !canPlaySegment}
                className={`min-h-11 rounded-md border px-4 font-bold transition-colors ${tier === segmentTier ? "border-beat-400 bg-beat-400 text-ink-950" : tier < segmentTier ? "border-beat-400/40 bg-beat-400/10 text-beat-300" : "border-white/10 bg-white/[.03] text-zinc-400"}`}
                onClick={() => {
                  play(seconds);
                  usedTier.current = Math.max(usedTier.current, tier);
                  setSegmentTier((currentTier) =>
                    Math.max(currentTier, Math.min(5, tier + 1)),
                  );
                  if (isMultiplayer) props.onRequestSegment(tier);
                }}
              >
                {seconds} s
              </button>
            ))}
          </div>
        )}
        <div className="w-full max-w-2xl">
          {settings.answerMode === "choices" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {current.choices.map((choice, i) => (
                  <button
                    key={choice}
                    disabled={!canSubmit}
                    onClick={() => submit(choice)}
                    className={`btn-secondary group min-h-16 min-w-0 justify-start break-words text-left text-base sm:text-lg ${submitted && answer === choice ? "border-beat-400/60 bg-beat-400/10 !text-beat-300 disabled:opacity-100" : "enabled:hover:border-beat-400/50"}`}
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 font-mono text-sm text-zinc-400 group-hover:border-beat-400/40 group-hover:text-beat-300"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 break-words">{choice}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 hidden text-center text-xs text-zinc-400 sm:block">
                Astuce clavier : touches 1 à 4
              </p>
            </>
          ) : (
            <form onSubmit={formSubmit} className="relative">
              <label className="sr-only" htmlFor="answer">
                Ta réponse
              </label>
              <input
                id="answer"
                className="field min-h-16 pr-16 text-lg"
                autoComplete="off"
                autoFocus
                value={answer}
                disabled={!canSubmit}
                placeholder={
                  current.questionType === "artist"
                    ? "Nom de l’artiste…"
                    : current.questionType === "both"
                      ? "Artiste et titre…"
                      : "Titre…"
                }
                onChange={(e) => setAnswer(e.target.value)}
              />
              <button
                className="icon-btn absolute right-2 top-2 border-0 bg-beat-400 !text-ink-950 enabled:hover:bg-beat-300"
                disabled={!answer.trim() || !canSubmit}
                aria-label="Valider la réponse"
              >
                <Send size={20} aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
        {isMultiplayer && submitted && !reveal && (
          <p role="status" className="mt-6 text-sm font-semibold text-zinc-400">
            Réponse enregistrée. En attente des autres joueurs…
          </p>
        )}
      </section>
      {!revealDismissed && (reveal || (!isMultiplayer && result)) && (
        <RevealCard
          onClose={() => setRevealDismissed(true)}
          lastRound={displayedRound >= totalRounds}
          reveal={
            reveal || {
              correctAnswer: current.correctAnswer || "",
              artistName: current.artistName,
              trackTitle: current.trackTitle,
              mediaTitle: current.mediaTitle,
              coverUrl: current.coverUrl,
              players: [],
              nextRoundAt: 0,
            }
          }
          result={result}
        />
      )}
    </main>
  );
}

function badge(type: QuizData["questionType"]) {
  return type === "artist"
    ? "Quel est cet artiste ?"
    : type === "title"
      ? "Quel est ce titre ?"
      : type === "movie"
        ? "Quel est ce film ?"
        : type === "series"
          ? "Quelle est cette série ?"
          : "Artiste et titre";
}
function Equalizer({ active }: { active: boolean }) {
  return (
    <div
      className="audio-wave relative flex h-24 w-full max-w-sm items-center gap-[3px] sm:h-28 sm:gap-1"
      data-active={active}
      aria-hidden="true"
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-beat-400/15" />
      {[
        12, 20, 16, 34, 24, 46, 35, 64, 48, 81, 59, 100, 68, 86, 46, 64, 39, 53,
        28, 41, 22, 30, 14, 22, 10,
      ].map((height, index) => (
        <span
          key={index}
          className={`wave-bar relative min-w-0 flex-1 rounded-full ${active ? "animate-pulse motion-reduce:animate-none" : ""}`}
          style={{
            height: `${height}%`,
            animationDelay: `${index * 0.07}s`,
            animationDuration: `${0.7 + (index % 4) * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}
function State({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="page items-center justify-center text-center"
    >
      <div className="mb-5 text-beat-300">{icon}</div>
      <h1 className="text-3xl font-black">{title}</h1>
      <p className="mt-3 max-w-md text-zinc-400">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </main>
  );
}
function RevealCard({
  reveal,
  result,
  onClose,
  lastRound,
}: {
  reveal: Reveal;
  result: { correct: boolean; points: number } | null;
  onClose: () => void;
  lastRound: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(true, dialog, onClose);
  const answerName =
    reveal.trackTitle || reveal.mediaTitle || reveal.correctAnswer;
  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reveal-title"
      aria-describedby="reveal-answer"
    >
      <section className="panel my-auto w-full max-w-md overflow-hidden border-t-2 border-t-beat-400 p-6 text-center sm:p-8">
        {reveal.coverUrl && (
          <img
            src={reveal.coverUrl}
            alt={`Pochette de ${answerName}`}
            className="mx-auto mb-6 size-36 rounded-sm object-cover"
          />
        )}
        <div
          className={`mx-auto mb-3 flex size-12 items-center justify-center rounded-md ${result?.correct ? "bg-beat-400 text-ink-950" : result ? "bg-rose-400/10 text-rose-300" : "bg-beat-400/10 text-beat-300"}`}
          aria-hidden="true"
        >
          {result?.correct ? (
            <CheckCircle2 />
          ) : result ? (
            <XCircle />
          ) : (
            <Music2 />
          )}
        </div>
        <h2 id="reveal-title" className="text-3xl font-black">
          {result
            ? result.correct
              ? "Bien joué !"
              : "Pas cette fois"
            : "La réponse"}
        </h2>
        {result && (
          <p className="mt-2 font-mono text-lg font-semibold text-beat-300">
            +{result.points} points
          </p>
        )}
        <div id="reveal-answer" className="mt-5 border-y border-white/10 py-5">
          <p className="text-xl font-black">
            {reveal.artistName || reveal.mediaTitle || reveal.correctAnswer}
          </p>
          {reveal.trackTitle && (
            <p className="mt-1 text-zinc-400">{reveal.trackTitle}</p>
          )}
        </div>
        <p className="mt-5 text-sm text-zinc-400">
          {lastRound
            ? "Les résultats arrivent dans quelques secondes…"
            : "Prochaine manche dans quelques secondes…"}
        </p>
        <button className="btn-ghost mt-3" onClick={onClose}>
          Fermer
        </button>
      </section>
    </div>
  );
}
