import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Mail, UserRound, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { AccountState } from "../features/account/useAccount";
import { api } from "../services/api";
import { authMessage, getAuthClient } from "../services/auth";
import PulseSignal from "../components/PulseSignal";

type Props = {
  account: AccountState;
  guestOwnerId: string;
  onSignedOut: () => void;
};
type View = "signin" | "signup" | "forgot";

export default function Account({ account, guestOwnerId, onSignedOut }: Props) {
  const location = useLocation();
  const recovery = location.pathname.endsWith("/reinitialiser");
  const [view, setView] = useState<View>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(
    account.profile?.displayName || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmImport, setConfirmImport] = useState(false);
  useEffect(() => {
    setDisplayName(account.profile?.displayName || "");
  }, [account.profile?.id, account.profile?.displayName]);
  const validName =
    displayName.trim().length >= 2 &&
    displayName.trim().length <= 24 &&
    /^[\p{L}\p{N} _.-]+$/u.test(displayName.trim());

  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Cette action n’a pas abouti.",
      );
    } finally {
      setBusy(false);
    }
  };
  const authenticate = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const auth = getAuthClient();
      if (!auth)
        throw new Error(
          "Les comptes ne sont pas encore activés sur cette installation.",
        );
      if (view === "forgot") {
        const { error: cause } = await auth.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/compte/reinitialiser` },
        );
        if (cause) throw new Error(authMessage(cause));
        setMessage(
          "Si cette adresse correspond à un compte, un lien de récupération sera envoyé. Ouvre-le dans ce navigateur et vérifie tes courriers indésirables.",
        );
      } else if (view === "signup") {
        const { error: cause, data } = await auth.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/compte` },
        });
        if (cause) throw new Error(authMessage(cause));
        setPassword("");
        setMessage(
          data.session
            ? "Connexion réussie. Choisis maintenant ton pseudo."
            : "Consulte ta boîte e-mail pour confirmer ton inscription, si elle peut être créée. Ouvre le lien dans ce navigateur.",
        );
      } else {
        const { error: cause } = await auth.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (cause) throw new Error(authMessage(cause));
        setPassword("");
      }
    });
  };
  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    if (!validName) return;
    void perform(async () => {
      await api.saveProfile(displayName.trim());
      await account.reload();
      setMessage("Ton profil est enregistré.");
    });
  };

  return (
    <main id="main-content" className="page max-w-3xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link className="btn-ghost px-0" to="/">
          <ArrowLeft size={18} aria-hidden="true" /> Accueil
        </Link>
        {account.profile && (
          <Link className="btn-secondary" to="/amis">
            <Users size={18} aria-hidden="true" /> Mes amis
          </Link>
        )}
      </header>
      <PulseSignal className="mb-4" />
      <h1 className="text-3xl font-bold">
        {recovery
          ? "Nouveau mot de passe"
          : account.session
            ? "Ton compte Pulse"
            : "Retrouve ta bande."}
      </h1>
      <p className="mt-3 text-zinc-400">
        Un compte pour retrouver tes playlists et inviter tes amis. Tu peux
        toujours jouer sans compte.
      </p>
      {!account.session && account.error && (
        <p role="alert" className="mt-4 text-rose-200">
          {account.error}
        </p>
      )}
      {!account.configured ? (
        <section
          className="mt-8 border-l-2 border-signal-cyan bg-ink-900 p-5"
          role="status"
        >
          <h2 className="text-lg font-bold">
            Les comptes arrivent sur cette installation.
          </h2>
          <p className="mt-2 text-zinc-300">
            La connexion Supabase Auth n’est pas encore configurée. Les parties
            et ta bibliothèque invitée restent disponibles.
          </p>
          <Link className="btn-primary mt-5" to="/">
            Continuer sans compte
          </Link>
        </section>
      ) : account.initializing || account.loading ? (
        <div className="mt-8" role="status">
          <PulseSignal animated />
          <p className="mt-3">Chargement de ton compte…</p>
        </div>
      ) : account.session ? (
        <>
          <p className="mt-6 flex flex-wrap items-center gap-2 break-all text-sm text-zinc-300">
            <Mail size={16} aria-hidden="true" /> {account.session.user.email}
          </p>
          {recovery ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  const auth = getAuthClient()!;
                  const { error: cause } = await auth.auth.updateUser({
                    password,
                  });
                  if (cause) throw new Error(authMessage(cause));
                  setPassword("");
                  setMessage("Ton mot de passe est mis à jour.");
                });
              }}
            >
              <label className="label" htmlFor="new-password">
                Nouveau mot de passe
              </label>
              <input
                id="new-password"
                className="field"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                aria-describedby="password-hint"
              />
              <p id="password-hint" className="text-sm text-zinc-400">
                Au moins 12 caractères. Une phrase facile à retenir fonctionne
                bien.
              </p>
              <button
                className="btn-primary"
                disabled={busy || password.length < 12}
              >
                Enregistrer le mot de passe
              </button>
              <Link className="btn-ghost" to="/compte">
                Retour au compte
              </Link>
            </form>
          ) : account.error ? (
            <section className="mt-6">
              <p role="alert" className="text-rose-200">
                {account.error}
              </p>
              <button
                className="btn-secondary mt-3"
                onClick={() => void account.reload()}
              >
                Réessayer
              </button>
            </section>
          ) : (
            <>
              <form
                onSubmit={saveProfile}
                className="mt-8 border-y border-white/10 py-6"
              >
                <h2 className="mb-4 text-xl font-bold">
                  {account.profile ? "Ton profil" : "Choisis ton pseudo"}
                </h2>
                <label className="label" htmlFor="account-name">
                  Pseudo public
                </label>
                <input
                  id="account-name"
                  className="field"
                  autoComplete="nickname"
                  maxLength={24}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={busy}
                  required
                  aria-describedby="account-name-hint"
                />
                <p
                  id="account-name-hint"
                  className="mt-2 text-sm text-zinc-400"
                >
                  De 2 à 24 caractères. Ton adresse e-mail reste privée.
                </p>
                <button
                  className="btn-primary mt-4"
                  disabled={busy || !validName}
                >
                  <UserRound size={18} aria-hidden="true" />{" "}
                  {account.profile
                    ? "Enregistrer le pseudo"
                    : "Créer mon profil"}
                </button>
              </form>
              {account.profile && (
                <>
                  <section className="mt-6">
                    <h2 className="text-xl font-bold">
                      Ta bibliothèque suit ton compte.
                    </h2>
                    <p className="mt-2 text-zinc-400">
                      Connecte-toi sur un autre appareil pour retrouver les
                      playlists de ton compte. La bibliothèque invitée de ce
                      navigateur reste séparée.
                    </p>
                    <Link className="btn-secondary mt-4" to="/playlists">
                      Ouvrir ma bibliothèque
                    </Link>
                    {!confirmImport ? (
                      <button
                        className="btn-ghost mt-3"
                        onClick={() => setConfirmImport(true)}
                      >
                        Copier ma bibliothèque invitée dans mon compte
                      </button>
                    ) : (
                      <div className="mt-4 rounded-lg bg-ink-900 p-4">
                        <p>
                          Copier les playlists invitées de ce navigateur dans
                          ton compte ? Les originaux sont conservés et les
                          copies seront privées. Une bibliothèque déjà importée
                          n’est pas recopiée.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            className="btn-primary"
                            disabled={busy}
                            onClick={() =>
                              void perform(async () => {
                                const result =
                                  await api.importLibrary(guestOwnerId);
                                setConfirmImport(false);
                                setMessage(
                                  result.alreadyImported
                                    ? "Cette bibliothèque a déjà été importée."
                                    : `${result.importedCount} playlist(s) copiée(s) dans ton compte.`,
                                );
                              })
                            }
                          >
                            Confirmer la copie
                          </button>
                          <button
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() => setConfirmImport(false)}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <section className="mt-8 border-t border-white/10 pt-6">
            <h2 className="text-xl font-bold">Supprimer mon compte</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              La suppression est traitée par l’éditeur après vérification de ton
              identité. Elle retire ton compte, ses playlists et ses liens
              d’amitié. Les copies faites par d’autres joueurs et ta
              bibliothèque invitée restent séparées. Le lien ci-dessous ouvre ta
              messagerie : rien n’est envoyé sans ton action.
            </p>
            <a
              className="btn-secondary mt-4"
              href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL || "truong_toan@hotmail.com"}?subject=${encodeURIComponent("Demande de suppression de mon compte Pulse")}&body=${encodeURIComponent(`Bonjour, je souhaite supprimer mon compte Pulse et ses données. Identifiant du compte : ${account.session.user.id}. Merci de m’indiquer la vérification nécessaire avant l’effacement.`)}`}
            >
              Demander la suppression par e-mail
            </a>
          </section>
          <button
            className="btn-ghost mt-8"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const { error: cause } = await getAuthClient()!.auth.signOut({
                  scope: "local",
                });
                if (cause) throw new Error(authMessage(cause));
                setPassword("");
                onSignedOut();
              })
            }
          >
            Me déconnecter de cet appareil
          </button>
        </>
      ) : (
        <>
          <div
            className="mt-7 flex flex-wrap gap-2"
            role="group"
            aria-label="Accès au compte"
          >
            <button
              className={view === "signin" ? "btn-primary" : "btn-secondary"}
              aria-pressed={view === "signin"}
              disabled={busy}
              onClick={() => {
                setView("signin");
                setError("");
                setMessage("");
              }}
            >
              Se connecter
            </button>
            <button
              className={view === "signup" ? "btn-primary" : "btn-secondary"}
              aria-pressed={view === "signup"}
              disabled={busy}
              onClick={() => {
                setView("signup");
                setError("");
                setMessage("");
              }}
            >
              Créer un compte
            </button>
          </div>
          {recovery && (
            <p className="mt-4 text-zinc-300">
              Ouvre le lien reçu par e-mail dans le navigateur où tu l’as
              demandé. Si ta session n’est pas retrouvée, demande un nouveau
              lien.
            </p>
          )}
          <form onSubmit={authenticate} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="account-email">
                Adresse e-mail
              </label>
              <input
                id="account-email"
                className="field"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </div>
            {view !== "forgot" && (
              <div>
                <label className="label" htmlFor="account-password">
                  Mot de passe
                </label>
                <input
                  id="account-password"
                  className="field"
                  type="password"
                  autoComplete={
                    view === "signup" ? "new-password" : "current-password"
                  }
                  minLength={view === "signup" ? 12 : 1}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                  aria-describedby={
                    view === "signup" ? "signup-password-hint" : undefined
                  }
                />
                {view === "signup" && (
                  <p
                    id="signup-password-hint"
                    className="mt-2 text-sm text-zinc-400"
                  >
                    Au moins 12 caractères. Confirme ensuite ton adresse e-mail.
                  </p>
                )}
              </div>
            )}
            <button className="btn-primary w-full sm:w-auto" disabled={busy}>
              {busy
                ? "Un instant…"
                : view === "forgot"
                  ? "Envoyer le lien de récupération"
                  : view === "signup"
                    ? "M’inscrire"
                    : "Connexion"}
            </button>
            {view !== "forgot" && (
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => {
                  setView("forgot");
                  setPassword("");
                  setError("");
                  setMessage("");
                }}
              >
                Mot de passe oublié ?
              </button>
            )}
            <p className="text-xs leading-relaxed text-zinc-400">
              Consulte les{" "}
              <Link className="underline" to="/conditions">
                conditions d’utilisation
              </Link>{" "}
              et la{" "}
              <Link className="underline" to="/confidentialite">
                confidentialité
              </Link>
              . Les mots de passe sont gérés par Supabase Auth.
            </p>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="mt-5 text-rose-200">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-5 text-beat-300">
          {message}
        </p>
      )}
    </main>
  );
}
