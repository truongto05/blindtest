import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, Library, Loader2, Users } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import Brand from "../components/Brand";
import PulseSignal from "../components/PulseSignal";
import SelectionShelf from "../components/SelectionShelf";
import type { HomeSelectionId } from "../domain/selections";
import type { Settings } from "../types/game";

type Props = {
  accountName?: string;
  username: string;
  setUsername: (value: string) => void;
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onSolo: () => void;
  onPlaylists: () => void;
  settings: Settings;
  onSelect: (id: HomeSelectionId) => void;
  onQuickPlay: () => void;
  pending?: boolean;
  canJoin?: boolean;
};

export default function Home({
  accountName,
  username,
  setUsername,
  onCreate,
  onJoin,
  onSolo,
  onPlaylists,
  settings,
  onSelect,
  onQuickPlay,
  pending = false,
  canJoin = true,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sharedCode = searchParams.get("room")?.trim().toUpperCase() || "";
  const invitationCode = /^[A-Z0-9]{6}$/.test(sharedCode) ? sharedCode : "";
  const [manualCode, setManualCode] = useState("");
  const code = invitationCode || manualCode;
  const usernameInput = useRef<HTMLInputElement>(null);
  const previousInvitation = useRef(invitationCode);
  useEffect(() => {
    if (previousInvitation.current && !invitationCode)
      usernameInput.current?.focus();
    previousInvitation.current = invitationCode;
  }, [invitationCode]);
  const validName =
    username.trim().length >= 2 &&
    username.trim().length <= 24 &&
    /^[\p{L}\p{N} _.-]+$/u.test(username.trim());
  const validCode = /^[A-Z0-9]{6}$/.test(code);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (validName && validCode && canJoin && !pending) onJoin(code, username);
  };
  const leaveInvitation = () => {
    if (pending) return;
    setManualCode("");
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("room");
      return next;
    });
  };
  const nicknameField = (
    <>
      <label className="label" htmlFor="username">
        Ton pseudo
      </label>
      <input
        ref={usernameInput}
        id="username"
        className="field"
        value={username}
        maxLength={24}
        autoComplete="nickname"
        placeholder="Ex. Nina"
        disabled={pending}
        aria-describedby="username-hint"
        aria-invalid={username.length > 0 && !validName}
        onChange={(event) => setUsername(event.target.value)}
      />
      <p
        id="username-hint"
        className="mt-2 text-xs leading-relaxed text-zinc-400"
      >
        Pour les salons : 2 à 24 caractères, lettres, chiffres, espaces, tirets,
        points ou underscores.
      </p>
    </>
  );
  const joinFeedback = pending ? (
    <p className="mt-3 text-sm text-zinc-300" role="status">
      Connexion au salon…
    </p>
  ) : !canJoin ? (
    <p className="mt-3 text-sm text-amber-200" role="status">
      La connexion au serveur doit être rétablie pour entrer.
    </p>
  ) : null;
  return (
    <main id="main-content" className="page py-5 sm:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-5 sm:mb-8">
        <div className="flex items-center gap-5">
          <Brand />
          <span className="hidden border-l border-white/15 pl-5 text-xs font-semibold uppercase tracking-[.14em] text-zinc-400 sm:block">
            Le blind test
          </span>
        </div>
        <nav
          className="flex flex-wrap items-center gap-1"
          aria-label="Navigation principale"
        >
          <Link className="btn-ghost px-3 text-sm" to="/amis">
            Amis
          </Link>
          <Link className="btn-ghost px-3 text-sm" to="/compte">
            {accountName ? "Mon compte" : "Connexion"}
          </Link>
          <button
            className="btn-ghost px-3"
            onClick={onPlaylists}
            disabled={pending}
          >
            <Library size={19} aria-hidden="true" /> Bibliothèque
          </button>
        </nav>
      </header>
      {invitationCode ? (
        <section
          className="mx-auto w-full max-w-xl pb-9"
          aria-labelledby="invitation-title"
        >
          <p className="eyebrow mb-3">Invitation</p>
          <h1
            id="invitation-title"
            className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Rejoins la partie.
          </h1>
          <div className="play-desk">
            <div className="mb-5 border-b border-white/15 pb-5">
              <label className="label" htmlFor="room-code">
                Code du salon
              </label>
              <input
                id="room-code"
                className="w-full min-w-0 bg-transparent font-mono text-[clamp(1rem,7vw,1.5rem)] font-semibold tracking-[.14em] text-beat-300"
                value={invitationCode}
                readOnly
                disabled={pending}
                tabIndex={-1}
                aria-describedby="invitation-code-hint"
              />
              <p
                id="invitation-code-hint"
                className="mt-2 text-sm text-zinc-400"
              >
                Le code est déjà renseigné. Il ne manque que ton pseudo.
              </p>
            </div>
            <form onSubmit={submit} aria-busy={pending}>
              {nicknameField}
              <button
                className="btn-primary mt-5 min-h-14 w-full"
                disabled={!validName || !canJoin || pending}
              >
                {pending ? (
                  <Loader2
                    size={19}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowRight size={19} aria-hidden="true" />
                )}{" "}
                Rejoindre
              </button>
              {joinFeedback}
            </form>
          </div>
          <button
            className="btn-ghost mt-5 px-0"
            disabled={pending}
            onClick={leaveInvitation}
          >
            Choisir une autre partie
          </button>
        </section>
      ) : (
        <>
          <div className="home-intro">
            <p className="eyebrow mb-3 flex items-center gap-3">
              <PulseSignal />
              Musique, films & séries
            </p>
            <h1 className="home-headline">
              Reconnais le son.
              <br />
              <span className="text-beat-400">Avant les autres.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              Des hits, des génériques, des refrains sur le bout de la langue.
              Choisis ta sélection et entre dans la partie.
            </p>
            <button
              className="btn-ghost mt-2 px-0 text-sm lg:hidden"
              disabled={pending}
              onClick={() => usernameInput.current?.focus()}
            >
              <Users size={17} aria-hidden="true" /> Jouer entre amis{" "}
              <span aria-hidden="true">↓</span>
            </button>
          </div>
          <div className="home-game-grid">
            <SelectionShelf
              settings={settings}
              onSelect={onSelect}
              onPlay={onQuickPlay}
              onCustomize={onSolo}
              pending={pending}
              connected={canJoin}
            />
            <aside
              className="play-desk self-start"
              aria-labelledby="friends-title"
            >
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h2
                    id="friends-title"
                    className="text-xl font-bold tracking-tight"
                  >
                    Place aux amis.
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Crée ton salon ou rejoins le leur.
                  </p>
                </div>
              </div>
              {nicknameField}
              <div className="my-5 grid gap-2">
                <button
                  className="btn-primary min-h-14 justify-between"
                  disabled={!validName || pending}
                  onClick={() => onCreate(username)}
                >
                  <span className="flex items-center gap-3">
                    <Users size={19} aria-hidden="true" /> Créer un salon
                  </span>
                  <ArrowRight size={19} aria-hidden="true" />
                </button>
              </div>
              <form
                onSubmit={submit}
                className="border-t border-white/15 pt-5"
                aria-busy={pending}
              >
                <label className="label" htmlFor="room-code">
                  Code du salon
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex-1">
                    <input
                      id="room-code"
                      className="field font-mono uppercase tracking-[.18em]"
                      value={code}
                      maxLength={6}
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={pending}
                      aria-describedby="room-code-hint"
                      placeholder="ABC123"
                      onChange={(e) =>
                        setManualCode(
                          e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, ""),
                        )
                      }
                    />
                  </div>
                  <button
                    className="btn-secondary sm:px-4"
                    disabled={!validName || !validCode || !canJoin || pending}
                  >
                    Rejoindre <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </div>
                <p id="room-code-hint" className="mt-2 text-xs text-zinc-400">
                  Les 6 caractères partagés par ton hôte.
                </p>
                {joinFeedback}
              </form>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
