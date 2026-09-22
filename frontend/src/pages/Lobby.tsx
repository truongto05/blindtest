import { useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  Crown,
  Gamepad2,
  Link2,
  Play,
  QrCode,
  Settings2,
  Music2,
  Signal,
  SignalZero,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { settingLabels } from "../domain/settings";
import { useModalFocus } from "../hooks/useModalFocus";
import { copyText } from "../services/clipboard";
import type { Player, RoomState } from "../types/game";

type Props = {
  room: RoomState;
  me?: Player;
  connection: "connected" | "reconnecting" | "offline";
  onBack: () => void;
  onConfigure: () => void;
  onToggleReady: () => void;
  onStart: () => void;
  onKick: (id: string) => void;
  onInviteFriends?: () => void;
};

export default function Lobby({
  room,
  me,
  connection,
  onBack,
  onConfigure,
  onToggleReady,
  onStart,
  onKick,
  onInviteFriends,
}: Props) {
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qrTrigger = useRef<HTMLButtonElement>(null);
  const qrModal = useRef<HTMLElement>(null);
  const closeQr = () => setShowQr(false);
  useModalFocus(showQr, qrModal, closeQr);
  const invitationUrl = `${window.location.origin}/?room=${room.roomCode}`;
  const isHost = Boolean(me?.isHost);
  const waitingPlayers = room.players.filter(
    (player) => player.connected && !player.isHost && !player.ready,
  );
  const readyCount = room.players.filter((player) => player.ready).length;

  const copy = async () => {
    setCopyError(false);
    try {
      await copyText(room.roomCode);
      setCopied("Code copié");
    } catch (error) {
      setCopyError(true);
      setCopied(
        error instanceof Error
          ? error.message
          : "Sélectionne le code pour le copier.",
      );
    }
  };
  const share = async () => {
    setCopyError(false);
    const shareData = {
      title: "Pulse Blind Test",
      text: `Rejoins mon blind test Pulse avec le code ${room.roomCode}`,
      url: invitationUrl,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await copyText(invitationUrl);
        setCopied("Lien copié");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setCopyError(true);
        setCopied("Partage indisponible — copie le code.");
      }
    }
  };

  return (
    <main id="main-content" className="page">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost px-3" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" /> Quitter
        </button>
        <div className="flex flex-wrap items-center gap-3">
          {onInviteFriends && (
            <button className="btn-secondary text-sm" onClick={onInviteFriends}>
              <Users size={18} aria-hidden="true" /> Inviter mes amis
            </button>
          )}
          <Connection state={connection} />
        </div>
      </header>

      <section className="my-7 border-y border-white/10 py-6 text-center sm:my-9">
        <p className="eyebrow mb-3">Code du salon</p>
        <button
          onClick={copy}
          className="group inline-flex min-h-16 max-w-full items-center gap-3 rounded-md px-3 py-2 font-mono text-[clamp(28px,10vw,72px)] font-bold leading-none tracking-[-.04em] text-white hover:bg-white/[.04]"
          aria-label={`Copier le code ${room.roomCode}`}
        >
          {room.roomCode}
          <Copy
            className="size-[20px] shrink-0 text-zinc-400 transition group-hover:text-white"
            aria-hidden="true"
          />
        </button>
        <p className="mt-3 text-sm text-zinc-400">
          Envoie ce code ou le lien aux autres joueurs.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button className="btn-secondary min-h-11 py-2" onClick={share}>
            <Link2 size={17} aria-hidden="true" /> Partager
          </button>
          <button
            ref={qrTrigger}
            className="btn-secondary min-h-11 py-2"
            onClick={() => setShowQr(true)}
          >
            <QrCode size={17} aria-hidden="true" /> Afficher le QR
          </button>
        </div>
        <p
          className={`mt-2 min-h-5 text-sm ${copyError ? "text-amber-200" : "text-emerald-300"}`}
          role={copyError ? "alert" : "status"}
        >
          {copied}
        </p>
      </section>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0" aria-labelledby="players-title">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 id="players-title" className="text-2xl font-bold">
                Les joueurs
              </h1>
            </div>
            <span className="text-sm font-medium text-zinc-400">
              <Users className="mr-1 inline" size={16} aria-hidden="true" />{" "}
              {room.players.length}/24
            </span>
          </div>
          <ul
            className="grid gap-x-6 sm:grid-cols-2"
            aria-label="Joueurs dans le salon"
          >
            {room.players.map((player) => (
              <li
                key={player.playerId}
                className="flex min-h-20 min-w-0 flex-wrap items-center gap-3 border-b border-white/10 py-4"
              >
                <span
                  aria-hidden="true"
                  className={`w-9 shrink-0 font-mono text-lg font-bold ${player.playerId === me?.playerId ? "text-beat-300" : "text-zinc-400"}`}
                >
                  {player.username.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {player.username}
                    {player.playerId === me?.playerId && (
                      <span className="font-medium text-zinc-400"> · toi</span>
                    )}
                  </p>
                  <p
                    className={`flex items-center gap-1 text-xs font-semibold ${!player.connected ? "text-amber-300" : player.ready ? "text-emerald-300" : "text-zinc-400"}`}
                  >
                    {!player.connected ? (
                      "Reconnexion…"
                    ) : player.ready ? (
                      <>
                        <Check size={13} aria-hidden="true" /> Prêt
                      </>
                    ) : (
                      "Se prépare"
                    )}
                  </p>
                </div>
                {player.isHost && (
                  <Crown
                    aria-label="Hôte"
                    className="text-amber-300"
                    size={19}
                  />
                )}
                {isHost && !player.isHost && (
                  <button
                    className="icon-btn size-10"
                    onClick={() => onKick(player.playerId)}
                    aria-label={`Retirer ${player.username}`}
                  >
                    <UserX size={17} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <aside
          className="flex flex-col border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0"
          aria-labelledby="room-settings-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="room-settings-title" className="text-xl font-bold">
                Réglages du salon
              </h2>
            </div>
            {isHost && (
              <button
                className="icon-btn size-10"
                onClick={onConfigure}
                aria-label="Modifier tous les réglages"
              >
                <Settings2 size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          <dl className="mt-6 space-y-4 text-sm">
            <Row
              icon={<Gamepad2 />}
              label="Univers"
              value={settingLabels.universe(room.settings)}
            />
            <Row
              icon={<Play />}
              label="Mode"
              value={settingLabels.mode(room.settings)}
            />
            <Row
              icon={<Check />}
              label="Réponse"
              value={settingLabels.answerMode(room.settings)}
            />
            <Row
              icon={<Music2 />}
              label="Sélection"
              value={settingLabels.selection(room.settings)}
            />
            {room.settings.gameType === "music" && (
              <Row
                icon={<Check />}
                label="À deviner"
                value={settingLabels.answerType(room.settings)}
              />
            )}
            <Row
              icon={<Clock3 />}
              label="Rythme"
              value={`${room.settings.rounds} × ${room.settings.timeLimit} s`}
            />
          </dl>
          <div className="mt-5 border-t border-white/10 pt-4 text-sm">
            <p className="font-bold text-white">
              {readyCount}/{room.players.length} prêt{readyCount > 1 ? "s" : ""}
            </p>
            <p className="mt-1 text-zinc-400">
              Si les réglages changent, chacun doit confirmer à nouveau.
            </p>
          </div>

          <div className="mt-auto space-y-3 pt-6">
            {!isHost && (
              <button
                className={
                  me?.ready
                    ? "btn-secondary w-full border-emerald-400/30 text-emerald-200"
                    : "btn-primary w-full"
                }
                disabled={!me?.connected || connection !== "connected"}
                onClick={onToggleReady}
              >
                <UserCheck size={19} aria-hidden="true" />{" "}
                {me?.ready ? "Je ne suis plus prêt" : "Je suis prêt"}
              </button>
            )}
            {isHost ? (
              <>
                <button
                  className="btn-primary w-full"
                  disabled={
                    !room.players.length ||
                    connection !== "connected" ||
                    waitingPlayers.length > 0
                  }
                  onClick={onStart}
                >
                  <Play size={19} fill="currentColor" aria-hidden="true" />{" "}
                  Lancer la partie
                </button>
                {waitingPlayers.length > 0 && (
                  <p
                    className="text-center text-xs font-semibold text-amber-300"
                    role="status"
                  >
                    En attente de {waitingPlayers.length} joueur
                    {waitingPlayers.length > 1 ? "s" : ""}.
                  </p>
                )}
              </>
            ) : (
              <p className="text-center text-sm text-zinc-400">
                Une fois prêt, attends le lancement par l’hôte.
              </p>
            )}
          </div>
        </aside>
      </div>

      {showQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeQr();
          }}
        >
          <section
            ref={qrModal}
            tabIndex={-1}
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-md border border-white/10 bg-ink-900 p-6 text-center sm:p-8"
          >
            <button
              className="icon-btn absolute right-3 top-3"
              onClick={closeQr}
              aria-label="Fermer le QR code"
            >
              <X aria-hidden="true" />
            </button>
            <h2 id="qr-title" className="px-8 text-xl font-bold">
              Scanner pour rejoindre
            </h2>
            <div className="mx-auto my-6 w-fit max-w-full rounded-sm bg-white p-4">
              <QRCodeSVG
                className="h-auto max-w-full"
                value={invitationUrl}
                size={220}
                level="M"
                marginSize={1}
                title={`Rejoindre le salon ${room.roomCode}`}
              />
            </div>
            <p className="font-mono text-xl font-bold tracking-widest">
              {room.roomCode}
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Scanne le QR code avec l’appareil photo de ton téléphone.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactElement;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <dt className="flex min-w-0 flex-1 items-start gap-3 text-zinc-400">
        <span className="mt-0.5 text-zinc-500" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="max-w-[55%] text-right font-bold">{value}</dd>
    </div>
  );
}
function Connection({ state }: { state: Props["connection"] }) {
  const ok = state === "connected";
  return (
    <div
      role="status"
      className={`flex items-center gap-2 text-sm font-semibold ${ok ? "text-emerald-300" : "text-amber-300"}`}
    >
      {ok ? (
        <Signal size={17} aria-hidden="true" />
      ) : (
        <SignalZero size={17} aria-hidden="true" />
      )}{" "}
      {ok ? "Connecté" : state === "offline" ? "Hors ligne" : "Reconnexion…"}
    </div>
  );
}
