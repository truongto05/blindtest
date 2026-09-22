import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowLeft, Copy, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import PulseSignal from "../components/PulseSignal";
import type { AccountState } from "../features/account/useAccount";
import { api } from "../services/api";
import { copyText } from "../services/clipboard";
import type {
  FriendsData,
  PublicProfile,
  RoomInvitation,
} from "../types/account";
import type { RoomState } from "../types/game";

type Props = {
  account: AccountState;
  currentRoom: RoomState | null;
  playerToken: string;
};

const errorMessage = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Cette action n’a pas abouti. Réessaie.";

export default function Friends({ account, currentRoom, playerToken }: Props) {
  return (
    <main id="main-content" className="page max-w-3xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link className="btn-ghost px-0" to="/">
          <ArrowLeft size={18} aria-hidden="true" /> Accueil
        </Link>
        <Link className="btn-secondary" to="/compte">
          Mon compte
        </Link>
        {currentRoom && (
          <Link className="btn-primary" to={`/rooms/${currentRoom.roomCode}`}>
            Retour au salon {currentRoom.roomCode}
          </Link>
        )}
      </header>
      <PulseSignal className="mb-4" />
      <h1 className="text-3xl font-bold">Tes amis.</h1>
      <p className="mt-3 text-zinc-400">
        Échangez vos codes amis, puis retrouvez-vous dans un salon.
      </p>
      {!account.configured ? (
        <section className="mt-8 border-l-2 border-signal-cyan bg-ink-900 p-5">
          <h2 className="text-lg font-bold">
            Les comptes ne sont pas encore activés.
          </h2>
          <p className="mt-2 text-zinc-300">
            Les demandes d’amis seront disponibles une fois la connexion aux
            comptes configurée. Tu peux déjà jouer sans compte.
          </p>
          <Link className="btn-secondary mt-5" to="/compte">
            Voir mon compte
          </Link>
        </section>
      ) : account.initializing ||
        account.loading ||
        (account.session &&
          account.profile &&
          account.session.user.id !== account.profile.id) ? (
        <p role="status" className="mt-8">
          Chargement de ton compte…
        </p>
      ) : account.error ? (
        <div className="mt-8">
          <p role="alert" className="text-signal-coral">
            {account.error}
          </p>
          <button
            className="btn-secondary mt-3"
            onClick={() => void account.reload()}
          >
            Réessayer
          </button>
        </div>
      ) : !account.session ? (
        <section className="mt-8 border-t border-white/10 pt-6">
          <h2 className="text-lg font-bold">
            Connecte-toi pour retrouver tes amis.
          </h2>
          <p className="mt-2 text-zinc-400">
            Un compte permet de recevoir les demandes et les invitations qui te
            sont adressées.
          </p>
          <Link className="btn-primary mt-5" to="/compte">
            Se connecter ou créer un compte
          </Link>
        </section>
      ) : !account.profile ? (
        <section className="mt-8 border-t border-white/10 pt-6">
          <h2 className="text-lg font-bold">Choisis d’abord ton pseudo.</h2>
          <p className="mt-2 text-zinc-400">
            Ton profil te donnera un code ami à partager.
          </p>
          <Link className="btn-primary mt-5" to="/compte">
            Compléter mon profil
          </Link>
        </section>
      ) : (
        <FriendsContent
          key={`${account.session.user.id}:${account.profile.id}`}
          profile={account.profile}
          currentRoom={currentRoom}
          playerToken={playerToken}
        />
      )}
    </main>
  );
}

function FriendsContent({
  profile,
  currentRoom,
  playerToken,
}: Omit<Props, "account"> & { profile: PublicProfile }) {
  const [friends, setFriends] = useState<FriendsData | null>(null);
  const [invitations, setInvitations] = useState<RoomInvitation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");
  const [friendCode, setFriendCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copying, setCopying] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const active = useRef(false);
  const version = useRef(0);
  const loadingRef = useRef(false);
  const mutationRef = useRef(false);
  const copyingRef = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const roomCode =
    currentRoom?.phase === "lobby" && playerToken ? currentRoom.roomCode : null;

  const refresh = useCallback(async () => {
    if (!active.current || loadingRef.current || mutationRef.current) return;
    const request = ++version.current;
    loadingRef.current = true;
    setLoading(true);
    setNow(Date.now());
    const [friendResult, invitationResult] = await Promise.allSettled([
      api.friends(),
      api.invitations(),
    ]);
    if (!active.current || request !== version.current) return;
    const errors: string[] = [];
    if (friendResult.status === "fulfilled") setFriends(friendResult.value);
    else errors.push(`Amis : ${errorMessage(friendResult.reason)}`);
    if (invitationResult.status === "fulfilled")
      setInvitations(invitationResult.value.invitations);
    else errors.push(`Invitations : ${errorMessage(invitationResult.reason)}`);
    setLoadError(errors.join(" "));
    loadingRef.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    active.current = true;
    void refresh();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(refreshVisible, 30_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      active.current = false;
      version.current += 1;
      loadingRef.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh]);

  const perform = async (
    key: string,
    action: () => Promise<void>,
    success: string,
    onSuccess?: () => void,
  ) => {
    if (mutationRef.current) return;
    mutationRef.current = true;
    version.current += 1;
    loadingRef.current = false;
    setLoading(false);
    setPending(key);
    setActionError("");
    setMessage("");
    try {
      await action();
      if (!active.current) return;
      onSuccess?.();
      setMessage(success);
    } catch (cause) {
      if (active.current) setActionError(errorMessage(cause));
    } finally {
      mutationRef.current = false;
      if (active.current) {
        setPending("");
        void refresh();
      }
    }
  };

  const sendRequest = (event: FormEvent) => {
    event.preventDefault();
    const code = friendCode.trim().toUpperCase();
    if (!/^PULSE-[A-F0-9]{12}$/.test(code)) {
      setCodeError(
        "Le code doit commencer par PULSE- suivi de 12 lettres de A à F ou chiffres.",
      );
      return;
    }
    if (code === profile.friendCode) {
      setCodeError("C’est ton propre code. Demande celui de ton ami.");
      return;
    }
    setCodeError("");
    void perform(
      "request",
      () => api.requestFriend(code),
      "Demande envoyée.",
      () => setFriendCode(""),
    );
  };

  const copyCode = async () => {
    if (copyingRef.current) return;
    copyingRef.current = true;
    setCopying(true);
    setCopyError("");
    try {
      await copyText(profile.friendCode);
      if (active.current) setMessage("Code ami copié.");
    } catch (cause) {
      if (active.current) {
        setCopyError(errorMessage(cause));
        codeInput.current?.focus();
        codeInput.current?.select();
      }
    } finally {
      copyingRef.current = false;
      if (active.current) setCopying(false);
    }
  };

  const forgetRequest = (id: string) =>
    setFriends(
      (previous) =>
        previous && {
          ...previous,
          incoming: previous.incoming.filter((item) => item.id !== id),
          outgoing: previous.outgoing.filter((item) => item.id !== id),
        },
    );
  const visibleInvitations = invitations?.filter(
    (invitation) => Date.parse(invitation.expiresAt) > now,
  );

  return (
    <div className="mt-8 space-y-8">
      <section
        aria-labelledby="friend-code-heading"
        className="border-t border-white/10 pt-6"
      >
        <h2 id="friend-code-heading" className="text-lg font-bold">
          Ton code ami
        </h2>
        <p id="own-code-hint" className="mt-2 text-sm text-zinc-400">
          Ce code public permet de t’envoyer une demande. Ce n’est pas un mot de
          passe ni un code de salon.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={codeInput}
            className="field min-w-0 flex-1 font-mono"
            style={{ flexBasis: "15rem" }}
            aria-label="Ton code ami"
            aria-describedby="own-code-hint"
            value={profile.friendCode}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            className="btn-secondary"
            onClick={() => void copyCode()}
            disabled={copying}
          >
            <Copy size={18} aria-hidden="true" /> Copier le code
          </button>
        </div>
        {copyError && (
          <p role="alert" className="mt-3 text-sm text-signal-coral">
            {copyError}
          </p>
        )}
      </section>

      <form
        onSubmit={sendRequest}
        aria-labelledby="add-friend-heading"
        className="border-t border-white/10 pt-6"
      >
        <h2 id="add-friend-heading" className="text-lg font-bold">
          Ajouter un ami
        </h2>
        <label className="label mt-4" htmlFor="friend-code">
          Son code ami
        </label>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <input
            id="friend-code"
            className="field min-w-0 flex-1 font-mono"
            style={{ flexBasis: "15rem" }}
            value={friendCode}
            onChange={(event) => {
              setFriendCode(event.target.value.toUpperCase());
              setCodeError("");
            }}
            placeholder="PULSE-A1B2C3D4E5F6"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            disabled={Boolean(pending)}
            aria-invalid={Boolean(codeError)}
            aria-describedby={codeError ? "friend-code-error" : undefined}
          />
          <button
            className="btn-primary"
            disabled={Boolean(pending) || !friendCode.trim()}
          >
            {pending === "request" ? "Envoi…" : "Envoyer une demande"}
          </button>
        </div>
        {codeError && (
          <p
            id="friend-code-error"
            role="alert"
            className="mt-3 text-sm text-signal-coral"
          >
            {codeError}
          </p>
        )}
      </form>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-400">
            Les listes s’actualisent pendant que cet onglet est ouvert.
          </p>
          <button
            className="btn-ghost"
            onClick={() => void refresh()}
            disabled={loading || Boolean(pending)}
          >
            <RefreshCw size={16} aria-hidden="true" /> Actualiser
          </button>
        </div>
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-sm text-beat-200"
        >
          {message ||
            (pending
              ? "Action en cours…"
              : loading
                ? "Actualisation des amis et invitations…"
                : "")}
        </p>
        {actionError && (
          <p role="alert" className="mt-3 text-signal-coral">
            {actionError} Tu peux réessayer l’action.
          </p>
        )}
        {loadError && (
          <div className="mt-3 border-l-2 border-signal-coral pl-4">
            <p role="alert" className="text-signal-coral">
              {loadError}
            </p>
            <button
              className="btn-secondary mt-3"
              onClick={() => void refresh()}
              disabled={loading || Boolean(pending)}
            >
              Réessayer le chargement
            </button>
          </div>
        )}
      </div>

      <section
        aria-labelledby="room-invitations-heading"
        className="border-t border-white/10 pt-6"
      >
        <h2 id="room-invitations-heading" className="text-lg font-bold">
          Invitations à jouer
        </h2>
        {visibleInvitations?.length === 0 && (
          <p className="mt-3 text-zinc-400">Aucune invitation en cours.</p>
        )}
        <ul className="mt-3 divide-y divide-white/10">
          {visibleInvitations?.map((invitation) => (
            <li
              key={invitation.id}
              className="flex flex-wrap items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0 basis-48 grow">
                <p className="break-words font-semibold">
                  {invitation.profile.displayName}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  Salon{" "}
                  <span className="font-mono text-signal-cyan">
                    {invitation.roomCode}
                  </span>{" "}
                  · Expire à{" "}
                  <time dateTime={invitation.expiresAt}>
                    {new Date(invitation.expiresAt).toLocaleTimeString(
                      "fr-FR",
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </time>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="btn-primary"
                  to={`/?room=${encodeURIComponent(invitation.roomCode)}`}
                  aria-label={`Rejoindre le salon ${invitation.roomCode} de ${invitation.profile.displayName}`}
                >
                  Rejoindre
                </Link>
                <button
                  className="btn-ghost"
                  disabled={Boolean(pending)}
                  aria-label={`Ignorer l’invitation de ${invitation.profile.displayName}`}
                  onClick={() =>
                    void perform(
                      `dismiss-invite:${invitation.id}`,
                      () => api.dismissInvitation(invitation.id),
                      "Invitation retirée.",
                      () =>
                        setInvitations(
                          (previous) =>
                            previous?.filter(
                              (item) => item.id !== invitation.id,
                            ) ?? null,
                        ),
                    )
                  }
                >
                  Ignorer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="incoming-heading"
        className="border-t border-white/10 pt-6"
      >
        <h2 id="incoming-heading" className="text-lg font-bold">
          Demandes reçues
        </h2>
        {friends?.incoming.length === 0 && (
          <p className="mt-3 text-zinc-400">Aucune demande reçue.</p>
        )}
        <ul className="mt-3 divide-y divide-white/10">
          {friends?.incoming.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-4 py-4"
            >
              <p className="min-w-0 basis-40 grow break-words font-semibold">
                {request.profile.displayName}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={Boolean(pending)}
                  aria-label={`Accepter la demande de ${request.profile.displayName}`}
                  onClick={() =>
                    void perform(
                      `accept:${request.id}`,
                      () => api.acceptFriend(request.id),
                      `${request.profile.displayName} fait maintenant partie de tes amis.`,
                      () => {
                        forgetRequest(request.id);
                        setFriends(
                          (previous) =>
                            previous && {
                              ...previous,
                              friends: [
                                ...previous.friends.filter(
                                  (friend) => friend.id !== request.profile.id,
                                ),
                                request.profile,
                              ],
                            },
                        );
                      },
                    )
                  }
                >
                  Accepter
                </button>
                <button
                  className="btn-ghost"
                  disabled={Boolean(pending)}
                  aria-label={`Refuser la demande de ${request.profile.displayName}`}
                  onClick={() =>
                    void perform(
                      `dismiss:${request.id}`,
                      () => api.dismissFriend(request.id),
                      "Demande refusée.",
                      () => forgetRequest(request.id),
                    )
                  }
                >
                  Refuser
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="friends-heading"
        className="border-t border-white/10 pt-6"
      >
        <h2 id="friends-heading" className="text-lg font-bold">
          Tes amis
        </h2>
        {!roomCode && (
          <p className="mt-3 text-sm text-zinc-400">
            Crée ou rejoins un salon en attente pour inviter tes amis.{" "}
            <Link className="text-beat-200 underline underline-offset-4" to="/">
              Aller à l’accueil
            </Link>
          </p>
        )}
        {friends?.friends.length === 0 && (
          <p className="mt-3 text-zinc-400">
            Pas encore d’amis ici. Partage ton code ou envoie une demande
            ci-dessus.
          </p>
        )}
        <ul className="mt-3 divide-y divide-white/10">
          {friends?.friends.map((friend) => (
            <li key={friend.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="min-w-0 basis-40 grow break-words font-semibold">
                  {friend.displayName}
                </p>
                <div className="flex flex-wrap gap-2">
                  {roomCode && (
                    <button
                      className="btn-secondary"
                      disabled={Boolean(pending)}
                      aria-label={`Inviter ${friend.displayName} dans ${roomCode}`}
                      onClick={() =>
                        void perform(
                          `invite:${friend.id}`,
                          () =>
                            api.inviteFriend(friend.id, roomCode, playerToken),
                          `Invitation envoyée à ${friend.displayName}.`,
                        )
                      }
                    >
                      Inviter dans {roomCode}
                    </button>
                  )}
                  <button
                    id={`remove-friend-${friend.id}`}
                    className="btn-ghost"
                    disabled={Boolean(pending)}
                    aria-expanded={removing === friend.id}
                    aria-label={`Retirer ${friend.displayName} de mes amis`}
                    onClick={() =>
                      setRemoving((previous) =>
                        previous === friend.id ? null : friend.id,
                      )
                    }
                  >
                    Retirer
                  </button>
                </div>
              </div>
              {removing === friend.id && (
                <div className="mt-4 border-l-2 border-signal-coral pl-4">
                  <p className="break-words">
                    Retirer {friend.displayName} de tes amis ? Les invitations
                    entre vous seront aussi supprimées.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="btn-secondary"
                      disabled={Boolean(pending)}
                      onClick={() =>
                        void perform(
                          `remove:${friend.id}`,
                          () => api.removeFriend(friend.id),
                          `${friend.displayName} ne figure plus dans tes amis.`,
                          () => {
                            setRemoving(null);
                            setFriends(
                              (previous) =>
                                previous && {
                                  ...previous,
                                  friends: previous.friends.filter(
                                    (item) => item.id !== friend.id,
                                  ),
                                },
                            );
                            setInvitations(
                              (previous) =>
                                previous?.filter(
                                  (item) => item.profile.id !== friend.id,
                                ) ?? null,
                            );
                          },
                        )
                      }
                    >
                      Confirmer le retrait
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={Boolean(pending)}
                      onClick={() => {
                        setRemoving(null);
                        document
                          .getElementById(`remove-friend-${friend.id}`)
                          ?.focus();
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="outgoing-heading"
        className="border-t border-white/10 pt-6"
      >
        <h2 id="outgoing-heading" className="text-lg font-bold">
          Demandes envoyées
        </h2>
        {friends?.outgoing.length === 0 && (
          <p className="mt-3 text-zinc-400">Aucune demande en attente.</p>
        )}
        <ul className="mt-3 divide-y divide-white/10">
          {friends?.outgoing.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-4 py-4"
            >
              <p className="min-w-0 basis-40 grow break-words font-semibold">
                {request.profile.displayName}
              </p>
              <button
                className="btn-ghost"
                disabled={Boolean(pending)}
                aria-label={`Annuler la demande à ${request.profile.displayName}`}
                onClick={() =>
                  void perform(
                    `dismiss:${request.id}`,
                    () => api.dismissFriend(request.id),
                    "Demande annulée.",
                    () => forgetRequest(request.id),
                  )
                }
              >
                Annuler la demande
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
