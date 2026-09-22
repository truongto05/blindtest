import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

type Kind = "privacy" | "cookies" | "terms" | "legal";
const contact =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ||
  "truong_toan@hotmail.com";
const host =
  (import.meta.env.VITE_HOSTING_PROVIDER as string | undefined) ||
  "Vercel Inc. — 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis";
const titles: Record<Kind, string> = {
  privacy: "Confidentialité",
  cookies: "Stockage & cookies",
  terms: "Conditions d’utilisation",
  legal: "Mentions légales",
};

export default function LegalPage({ kind }: { kind: Kind }) {
  return (
    <main id="main-content" className="page max-w-3xl">
      <header className="mb-8">
        <Link className="btn-ghost w-fit px-3" to="/">
          <ArrowLeft size={18} aria-hidden="true" /> Accueil
        </Link>
      </header>
      <p className="eyebrow mb-3">Pulse · Informations</p>
      <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">
        {titles[kind]}
      </h1>
      <p className="mt-3 text-sm text-zinc-400">
        Mise à jour : 21 septembre 2026
      </p>
      <div className="legal-content mt-8 space-y-7 leading-relaxed text-zinc-300">
        {kind === "legal" && (
          <>
            <section>
              <h2>Éditeur</h2>
              <p>
                Pulse est un projet personnel de blind test édité par Toan
                TRUONG.
              </p>
              <p>
                Contact public : <a href={`mailto:${contact}`}>{contact}</a>
              </p>
              <p>
                Les informations de domiciliation et les mentions applicables au
                statut de l’éditeur restent à définir avant publication.
              </p>
            </section>
            <section>
              <h2>Hébergement</h2>
              <p>Hébergement de l’interface : {host}.</p>
              <p>
                <a
                  href="https://vercel.com/legal/privacy-notice"
                  target="_blank"
                  rel="noreferrer"
                >
                  Coordonnées et politique de Vercel
                </a>
                .
              </p>
              <p>
                Le serveur de jeu et l’API sont hébergés sur Render. La base
                PostgreSQL est hébergée sur Supabase. Les régions de traitement
                et les durées de journalisation de ces services restent à
                documenter pour ce déploiement.
              </p>
              <p>
                <a
                  href="https://render.com/privacy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Politique de Render
                </a>
                {" · "}
                <a
                  href="https://supabase.com/privacy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Politique de Supabase
                </a>
              </p>
            </section>
            <section>
              <h2>Contenus et services tiers</h2>
              <p>
                Les métadonnées musicales et extraits proviennent de Deezer. Les
                données de films et séries proviennent de TMDB ; les extraits
                associés sont recherchés sur Deezer. Pulse n’est ni affilié ni
                approuvé par ces services. Les œuvres et illustrations restent
                la propriété de leurs ayants droit.
              </p>
              <p>
                This product uses the TMDB API but is not endorsed or certified
                by TMDB.
              </p>
            </section>
          </>
        )}
        {kind === "privacy" && (
          <>
            <section>
              <h2>Ce que Pulse utilise</h2>
              <p>
                Le jeu utilise un pseudo, un identifiant technique de joueur et
                les réponses et scores de la partie. La bibliothèque conserve un
                identifiant local, les noms de playlists, leurs titres musicaux,
                leurs dates de création et modification, leur visibilité et,
                lorsqu’elles sont partagées, un identifiant de partage
                aléatoire.
              </p>
              <p>
                Le compte est facultatif. S’il est activé sur cette
                installation, Supabase Auth gère l’adresse e-mail, le mot de
                passe et la session. Pulse conserve un profil (pseudo,
                identifiant et code ami), les relations et demandes d’amis, les
                invitations et les imports de bibliothèque. Aucun paiement n’est
                demandé. Sans compte, le code privé de bibliothèque permet
                toujours d’accéder aux playlists invitées et de les modifier :
                ne le publie pas. Une bibliothèque liée à un compte exige sa
                session authentifiée.
              </p>
            </section>
            <section>
              <h2>Pourquoi et pendant combien de temps</h2>
              <p>
                Ces données servent à fournir les parties, reconnecter un joueur
                et retrouver ses playlists, à la demande de l’utilisateur. Les
                salons sont conservés en mémoire sur le serveur ; les salons
                inactifs expirent après deux heures et disparaissent lors d’un
                redémarrage. Une déconnexion conserve la place du joueur pendant
                trente secondes. Les séquences solo musicales préparées sur le
                serveur expirent après 45 minutes et disparaissent au
                redémarrage.
              </p>
              <p>
                Les playlists restent en base jusqu’à leur suppression par le
                détenteur du code de bibliothèque. Les préférences locales
                restent sur l’appareil jusqu’à leur effacement. Pulse ne fixe
                pas encore de purge automatique des bibliothèques inactives :
                cette durée devra être précisée avant une exploitation publique
                durable. Les profils et relations d’amis restent enregistrés
                jusqu’à leur retrait ou une demande d’effacement. Une invitation
                de salon expire après dix minutes ; les anciennes invitations et
                traces anti-abus sont nettoyées lors des opérations sociales
                selon les règles du serveur. L’historique musical local est
                limité aux 60 derniers identifiants, pour varier les parties
                solo.
              </p>
            </section>
            <section>
              <h2>Qui peut voir quoi</h2>
              <p>
                Une playlist privée invitée est accessible avec le code de sa
                bibliothèque ; celle d’un compte exige la connexion du
                propriétaire. Une playlist partagée par lien est consultable par
                toute personne possédant ce lien. Une playlist publique figure
                également dans le catalogue. Les visiteurs ne reçoivent jamais
                le code de bibliothèque.
              </p>
              <p>
                Une copie est indépendante de l’original : rendre l’original
                privé ou le supprimer ne supprime pas les copies déjà faites.
                Les pseudos et scores sont visibles des participants au salon.
                Les amis voient le pseudo et le code ami, jamais l’adresse
                e-mail, le jeton de connexion ou le code privé de bibliothèque.
              </p>
            </section>
            <section>
              <h2>Services externes</h2>
              <p>
                Le serveur interroge Deezer et TMDB pour fournir le jeu. Lors du
                chargement d’une image ou d’un extrait, le navigateur contacte
                leurs hébergeurs et leur transmet les données de connexion
                nécessaires, dont l’adresse IP. Le serveur du jeu et l’hébergeur
                de base de données traitent également les connexions techniques.
                Leurs conditions et durées de journalisation doivent être
                vérifiées pour le déploiement retenu.
              </p>
              <p>
                Pulse n’intègre pas d’outil publicitaire ni d’outil de mesure
                d’audience dans cette version.
              </p>
              <p>
                Le serveur journalise les erreurs techniques HTTP 5xx avec la
                date, la catégorie d’API, la durée et un identifiant de requête.
                Ces journaux applicatifs ne contiennent pas les corps de
                requête, adresses e-mail, codes de bibliothèque ou jetons. Les
                journaux propres aux hébergeurs restent distincts.
              </p>
            </section>
            <section>
              <h2>Garder le contrôle</h2>
              <p>
                Tu peux renommer, retirer des morceaux, changer la visibilité et
                supprimer tes playlists depuis la bibliothèque. Conserve ton
                code avant d’effacer les données du navigateur : l’effacement
                local ne supprime pas les playlists du serveur. Les
                bibliothèques invitées n’ont pas de récupération par e-mail ;
                les comptes ont une procédure de réinitialisation du mot de
                passe. La copie volontaire d’une bibliothèque invitée dans un
                compte conserve les originaux et crée des copies privées
                indépendantes.
              </p>
              <p>
                Pour les demandes d’accès, de rectification, d’effacement ou de
                limitation concernant des données personnelles, le responsable
                est Toan TRUONG. Tu peux le contacter à{" "}
                <a href={`mailto:${contact}`}>{contact}</a>. Tu peux également
                adresser une réclamation à la{" "}
                <a
                  href="https://www.cnil.fr/fr/plaintes"
                  target="_blank"
                  rel="noreferrer"
                >
                  CNIL
                </a>
                .
              </p>
            </section>
          </>
        )}
        {kind === "cookies" && (
          <>
            <section>
              <h2>Un stockage lié au jeu</h2>
              <p>
                Pulse utilise le stockage local du navigateur pour retrouver le
                code de bibliothèque, l’identité du joueur, son pseudo, le
                dernier salon, les réglages de jeu, le volume et les préférences
                d’accessibilité. Ce sont des informations utilisées pour le
                fonctionnement et le confort du service, pas pour te suivre sur
                d’autres sites.
              </p>
              <p>
                Les réglages et les 60 derniers identifiants de morceaux joués
                en solo utilisent des clés préfixées par <code>pulse_</code>.
                Ils restent sur cet appareil jusqu’à leur suppression dans les
                paramètres du navigateur. Si ce stockage est bloqué, les données
                de session peuvent être perdues à l’actualisation.
              </p>
              <p>
                Si tu te connectes, Supabase Auth utilise aussi des clés
                <code> sb-…-auth-token</code> et un code de vérification
                temporaire pour les liens de connexion. La session permet de
                rester connecté et peut être renouvelée. « Me déconnecter de cet
                appareil » retire la session locale ; cela ne supprime ni ton
                compte ni tes playlists. Ces jetons ne doivent jamais être
                partagés.
              </p>
            </section>
            <section>
              <h2>Installation et cache</h2>
              <p>
                La version installable conserve les fichiers de l’interface et
                peut mettre en cache jusqu’à 80 pochettes pendant sept jours.
                Elle ne rend pas les parties ou la bibliothèque disponibles hors
                ligne : elles ont besoin du serveur. Le cache se supprime depuis
                les données du site dans le navigateur.
              </p>
            </section>
            <section>
              <h2>Pas de suivi publicitaire intégré</h2>
              <p>
                Cette version n’ajoute ni publicité ciblée ni mesure d’audience.
                Aucun bandeau « Tout accepter » n’est donc ajouté
                artificiellement. Toute introduction de traceurs non nécessaires
                devra faire l’objet d’une information et d’un mécanisme de choix
                adapté avant leur activation.
              </p>
              <p>
                Le stockage local est également concerné par les règles sur les
                traceurs. Voir les{" "}
                <a
                  href="https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/comment-mettre-mon-site-web-en-conformite"
                  target="_blank"
                  rel="noreferrer"
                >
                  explications de la CNIL
                </a>
                .
              </p>
            </section>
            <section>
              <h2>Avant d’effacer</h2>
              <p>
                Copie ton code dans la bibliothèque si tu souhaites retrouver
                tes playlists. Effacer les données du site réinitialise les
                préférences sur cet appareil, mais ne supprime pas les playlists
                enregistrées en base.
              </p>
              <Link to="/playlists">Ouvrir ma bibliothèque</Link>
            </section>
          </>
        )}
        {kind === "terms" && (
          <>
            <section>
              <h2>Jouer sur Pulse</h2>
              <p>
                Pulse propose des blind tests solo ou entre amis. Il s’agit d’un
                projet personnel de démonstration, sans paiement ni promesse de
                disponibilité continue. Les extraits, le catalogue et les salons
                peuvent devenir indisponibles lorsque le serveur ou un
                fournisseur externe ne répond pas.
              </p>
            </section>
            <section>
              <h2>Respecter les autres</h2>
              <p>
                Utilise un pseudo et des noms de playlists respectueux. Ne
                publie pas d’informations personnelles, de contenu illicite ou
                portant atteinte aux droits d’autrui. Ne tente pas d’accéder aux
                bibliothèques des autres, de deviner leurs codes ou de perturber
                les parties. L’hôte peut retirer un participant de son salon.
              </p>
            </section>
            <section>
              <h2>Bibliothèque et partage</h2>
              <p>
                Garde ton code de bibliothèque privé. Partager une playlist
                autorise les personnes ayant le lien à la consulter et à en
                créer une copie indépendante dans Pulse. La rendre publique
                l’ajoute au catalogue. Revenir en privé invalide le lien en
                cours ; cela ne retire pas les copies déjà créées.
              </p>
            </section>
            <section>
              <h2>Œuvres et extraits</h2>
              <p>
                Les titres, pochettes, affiches et extraits restent soumis aux
                droits de leurs ayants droit et aux conditions de leurs
                fournisseurs. Pulse n’accorde aucun droit de téléchargement, de
                redistribution ou d’exploitation commerciale sur ces contenus.
              </p>
            </section>
            <section>
              <h2>Disponibilité et signalement</h2>
              <p>
                Les salons sont temporaires et peuvent disparaître après
                inactivité ou redémarrage du serveur. Ne confie pas à cette
                démonstration l’unique copie de données importantes. Pour
                signaler un problème ou un contenu :{" "}
                <a href={`mailto:${contact}`}>{contact}</a>.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
