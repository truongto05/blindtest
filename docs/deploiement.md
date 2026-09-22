# Mettre Pulse en ligne

## Environnements

- Frontend Vercel : <https://blindtest-tt.vercel.app>.
- Serveur HTTP/Socket.IO Render : <https://blindtest-s3ow.onrender.com>.

Ces adresses ne garantissent pas la version publiée. Au contrôle du 22 septembre 2026, les nouvelles routes répondaient encore 404 : la recette distante reste à effectuer après publication. Les tests locaux sont décrits dans [validation.md](validation.md).

Le serveur est **un processus Node permanent, en une seule instance** : les salons et leurs minuteries vivent en mémoire. Ne pas augmenter le nombre d’instances sans partager cet état. La CI vérifie le code mais ne déclenche pas de déploiement.

## 1. Base PostgreSQL

- Garder `DATABASE_URL` et `DIRECT_URL` uniquement côté backend.
- Utiliser une connexion directe ou un pooler en mode session pour les migrations.
- Exécuter `npm run db:migrate`, puis `npm run db:check`. Ne pas utiliser `prisma migrate reset` sur les données existantes.
- Conserver les tables sous RLS et ne pas ajouter de politique publique permissive. Le navigateur passe par l’API Express, pas par un client Supabase avec une clé privilégiée.
- Vérifier les sauvegardes et leur restauration avant d’accueillir des données importantes.

L’outil `node backend/scripts/backup-db.cjs --pg-bin=<dossier-des-clients-PostgreSQL>` crée une archive privée du schéma `public` dans un nouveau dossier temporaire et en vérifie la lecture. Il ne sauvegarde **pas** Supabase Auth et ne remplace pas une stratégie de sauvegarde complète. La procédure et les limites figurent dans [sauvegarde.md](sauvegarde.md). `node backend/scripts/db-inventory.cjs` compare les cibles Supabase application/migration et affiche uniquement des comptes de lignes, migrations et droits de tables.

## 2. Serveur Node sur Render

Vérifier le dépôt, la branche suivie et la présence des fichiers de la refonte dans le commit à publier. Le tableau de bord ne déploie pas les modifications restées uniquement sur le poste local.

Publier le serveur avant l’interface : les créations, entrées et changements de réglages portent désormais un identifiant de requête, renvoyé dans leur réponse. Cela empêche une ancienne réponse de valider une nouvelle action. Le nouveau serveur accepte encore les requêtes sans identifiant, mais le nouveau frontend attend ce protocole ; ne pas l’associer à un ancien backend.

| Paramètre Render   | Valeur                                               |
| ------------------ | ---------------------------------------------------- |
| Type de service    | Web Service, environnement Node                      |
| Root Directory     | `backend`                                            |
| Build Command      | `npm ci --include=dev && npm run build`              |
| Start Command      | `npm start`                                          |
| Health Check Path  | `/api/health`, une fois la nouvelle version déployée |
| Nombre d’instances | Une seule tant que les salons vivent en mémoire      |

Le Dockerfile fournit aussi une image de production exécutée sans utilisateur root. La configuration ci-dessus concerne le déploiement Node, pas un service Docker.

Variables à configurer :

```dotenv
NODE_ENV=production
DATABASE_URL=<connexion PostgreSQL de l’application>
DIRECT_URL=<connexion réservée aux migrations>
ALLOWED_ORIGINS=https://blindtest-tt.vercel.app
TMDB_API_KEY=<clé côté serveur, facultative pour jouer uniquement en musique>
TRUST_PROXY=true
SUPABASE_URL=<URL HTTPS du projet>
SUPABASE_PUBLISHABLE_KEY=<clé publique du même projet>
```

Laisser Render fournir `PORT` : le serveur utilise cette variable et écoute sur `0.0.0.0`. Ne pas fixer le port local 3001 dans la configuration publique. La compilation utilise TypeScript et Prisma ; `--include=dev` installe aussi les outils de construction nécessaires avec `NODE_ENV=production`.

Appliquer les migrations avec `npm run db:migrate` depuis `backend`, dans une étape contrôlée disposant des variables de production, avant la recette de la nouvelle version. Puis vérifier avec `node scripts/db-check.cjs`. Ne pas placer les migrations dans le traitement des requêtes HTTP ni lancer de réinitialisation de la base. Configurer une étape pré-déploiement si l’offre d’hébergement le permet, sinon les exécuter explicitement depuis un environnement de confiance. Les quatre migrations présentes sont déjà appliquées au projet Supabase contrôlé le 22 septembre ; vérifier que Render cible bien ce même projet avant sa publication.

`ALLOWED_ORIGINS` doit contenir l’origine exacte, sans slash final. Pour un aperçu de préproduction, ajouter explicitement son origine, séparée par une virgule. Ne pas remplacer cette liste par `*` ou autoriser tous les domaines `vercel.app`. Une API de préproduction séparée évite de relier les aperçus aux données réelles.

`TRUST_PROXY=true` ne convient que derrière un reverse proxy maîtrisé (un seul saut). Sinon, garder `false`. Autoriser les WebSockets et utiliser HTTPS. Ne pas augmenter le nombre d’instances sans déplacer l’état des salons vers un stockage partagé.

- `GET /api/health` : processus HTTP vivant, sans dépendre de la base.
- `GET /api/ready` : vérifie aussi la connexion et les colonnes de bibliothèque ; répond 503 si elles ne sont pas disponibles. Ne divulgue aucune configuration.

Ne pas enregistrer les corps de requêtes ni le header privé `X-Library-Id` dans les logs. Les anciens clients peuvent encore envoyer `ownerId` en query : masquer également ce paramètre dans les journaux d’accès.

## 3. Frontend Vercel

Choisir le projet Vite et `frontend` comme **Root Directory**. Les commandes et les redirections d’URLs sont décrites dans `frontend/vercel.json`.

| Paramètre Vercel | Valeur                 |
| ---------------- | ---------------------- |
| Framework Preset | Vite                   |
| Root Directory   | `frontend`             |
| Install Command  | `npm ci --include=dev` |
| Build Command    | `npm run build`        |
| Output Directory | `dist`                 |

```dotenv
VITE_API_URL=https://blindtest-s3ow.onrender.com
VITE_SOCKET_URL=https://blindtest-s3ow.onrender.com
VITE_SUPABASE_URL=<même URL HTTPS Supabase que le backend>
VITE_SUPABASE_PUBLISHABLE_KEY=<clé publique du même projet>
```

Ces variables ne sont pas des secrets. Ne jamais leur substituer l’URL de base de données ou une clé API privée. Vite les intègre lors du build : les modifier nécessite une nouvelle construction.

Les renseigner pour l’environnement **Production** de Vercel. Ne pas ajouter `/api` ni `/socket.io` à ces deux valeurs : les chemins sont ajoutés par l’application. Ne configurer Preview que si son origine est explicitement autorisée côté API.

Le contact `truong_toan@hotmail.com`, l’éditeur Toan TRUONG et Vercel sont déjà renseignés dans les pages d’information. Les variables `VITE_CONTACT_EMAIL` et `VITE_HOSTING_PROVIDER` permettent de remplacer les coordonnées publiques si elles changent.

### Activer Supabase Auth

`DATABASE_URL` seule ne suffit pas pour les comptes. Les deux paires de variables Auth ci-dessus sont nécessaires ; ne jamais y mettre une clé `service_role` ou `sb_secret_*`. En local, les variables `VITE_` vont dans `frontend/.env.local`, les variables serveur dans `backend/.env`.

Dans les réglages Auth du **même projet Supabase**, configurer le Site URL `https://blindtest-tt.vercel.app` et autoriser les retours exacts `/compte` et `/compte/reinitialiser` sur cette origine. Pour le développement, autoriser aussi ces deux chemins sur `http://localhost:5173`. Ne pas ouvrir toutes les URLs d’aperçu par un joker global. Vérifier le fournisseur e-mail, la confirmation d’adresse, un envoi SMTP adapté au public visé et une récupération réelle avant l’ouverture. Le flux PKCE nécessite d’ouvrir le lien dans le navigateur ayant lancé la demande.

La migration `20260915000000_accounts_and_friends` doit précéder la nouvelle API, **même si l’on conserve seulement le mode invité** : les contrôles de bibliothèque consultent `AccountProfile`. La migration additive a été testée localement puis appliquée au projet Supabase configuré le 22 septembre 2026. Sur tout autre environnement, l’appliquer avant publication après les vérifications habituelles.

Références : [authentification par mot de passe](https://supabase.com/docs/guides/auth/passwords), [URLs de redirection](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp). L’effacement est une demande traitée par l’éditeur selon [la procédure opérateur](effacement-compte.md), pas une suppression automatique.

### Surveillance après publication

Surveiller `/api/health` et `/api/ready` : le second vérifie aussi les cinq tables de comptes/amis. Les réponses portent un `X-Request-Id` généré côté serveur ; les erreurs HTTP 5xx produisent un événement JSON `http_failure` avec catégorie, statut, durée et identifiant de requête. Aucun corps de requête, header de connexion ni exception brute n’est ajouté dans ce journal applicatif. Configurer les alertes et la rétention des logs sur l’hébergement ; aucun service de surveillance externe n’a été provisionné pendant cette intervention.

## 4. Vérifier les URLs publiques

Après publication de la même refonte sur les deux services, lancer depuis la racine du dépôt :

```sh
node frontend/scripts/audit-live.cjs
```

Le script nécessite les dépendances de `frontend` et le navigateur Playwright Chromium installé (`npx --prefix frontend playwright install chromium`). Il contrôle les réponses `health`, `ready` et du catalogue, l’origine CORS et l’accès direct aux pages. Il attend les titres de pages après chargement, bloque les écritures HTTP dans le navigateur et termine avec un code non nul si les routes attendues manquent ou si la base n’est pas prête. Il ne crée ni partie ni playlist, ne sauvegarde pas de capture et n’affiche pas le contenu des playlists, les en-têtes privés ou les erreurs brutes.

Pour un autre environnement, fournir `PULSE_AUDIT_SITE` et `PULSE_AUDIT_API` au processus, avec des origines HTTP(S) sans chemin ni identifiants. Ce contrôle de disponibilité **ne remplace pas** les essais fonctionnels suivants, qui écrivent volontairement des données et doivent être effectués avec une bibliothèque de test identifiée.

Avant d’annoncer le site :

- Ouvrir directement `/playlists/public`, une playlist partagée et `/mentions-legales`, puis actualiser : pas de 404 d’hébergeur.
- Créer une partie depuis un ordinateur et la rejoindre depuis un téléphone ; modifier un mode, confirmer les joueurs, jouer jusqu’au classement et tester une reconnexion.
- Jouer en solo, créer une playlist depuis les résultats, sauvegarder un titre et le retrouver après actualisation.
- Partager puis remettre en privé : l’ancien lien ne doit plus fonctionner. Une copie créée auparavant doit rester indépendante.
- Vérifier l’activation audio sur de vrais appareils iOS/Safari et Android, le focus clavier, les textes agrandis et la préférence système de réduction des animations.
- Vérifier `/api/ready`, CORS, les logs et le comportement après un redémarrage du backend.
- Confirmer les informations légales applicables à l’éditeur, l’hébergement réel du serveur, la conservation des données et les droits d’usage des médias. Les pages présentes ne remplacent pas cette validation.

Les tests automatisés et leurs limites sont consignés dans `docs/validation.md`.
