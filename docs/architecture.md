# Architecture et décisions

## Vue d’ensemble

```text
Navigateur React
  ├─ HTTP ── app.ts / routes ── services ── Prisma ── PostgreSQL
  │                                ├─ Supabase Auth (vérification de session)
  │                                ├─ Deezer (musique)
  │                                └─ TMDB (cinéma)
  └─ Socket.IO ── gameHandler ── domain (règles et sélection)
                     └─ salons et minuteries en mémoire
```

Le code forme deux applications déployables séparément, avec leurs propres dépendances verrouillées. Les modules restent organisés par responsabilité, sans multiplier les couches abstraites autour de Prisma ou des composants React.

## Frontend

- `pages` : écrans routés, sans logique Socket.IO directe.
- `features/game/useRoom.ts` : connexion, événements, identité publique, historique et commandes de salon. L’identité de reconnexion reste distincte de celle affichée aux joueurs.
- `features/playlists` : chargement avec protection contre les réponses périmées, lecteurs, cartes, accès bibliothèque et partage.
- `hooks` : audio Howler, focus modal, notifications.
- `services/api.ts` : requêtes, délais et erreurs humaines ; `storage.ts` fournit un repli en mémoire si le stockage est bloqué.
- `domain/settings.ts` et `types/game.ts` : vocabulaire, presets et types.

React Router donne de vraies URLs aux bibliothèques et liens de partage. Pas de store global supplémentaire : l’état de session reste au niveau de l’application, l’état d’écran reste local. Les pages bibliothèque et informations sont chargées à la demande.

## Backend

`app.ts` expose une fabrique Express sans ouvrir de port : les en-têtes, routes, contrôles de disponibilité et erreurs se testent via Supertest. `index.ts` ne fait que charger la configuration, assembler HTTP/Socket.IO, écouter et arrêter le processus. Cette séparation évite qu’importer l’application dans un test démarre un serveur de production.

Les routes REST utilisent Zod avant les services. `playlistService.ts` regroupe propriété, visibilité et copie ; `playlistQuizService.ts` transforme une sélection autorisée en source de questions. Les services Deezer/TMDB ont des délais, des vérifications de réponse et des messages d’erreur exploitables.

Le serveur Socket.IO décide des phases, des deadlines, du palier progressif et des scores. Une action doit venir de la socket active du joueur ; une ancienne connexion remplacée ne peut plus agir. Une reconnexion en phase de révélation reçoit la question puis sa réponse. Le client compense le décalage d’horloge à partir de `serverNow`.

## Playlists

`Playlist` possède un UUID interne, un `ownerId`, une visibilité et un `shareId` nullable. Le lien aléatoire utilise 24 octets cryptographiques (192 bits), encodés en 32 caractères. Le retour en privé supprime ce lien ; un nouveau partage crée un nouveau jeton. Une contrainte SQL interdit les combinaisons incohérentes de visibilité et lien.

La copie crée une nouvelle playlist privée et de nouvelles associations. Renommer, retirer des morceaux ou modifier la visibilité de la copie ne modifie pas l’original. Les métadonnées `Track` sont communes et canoniques : après contrôle du propriétaire, chaque ajout résout l’identifiant auprès de Deezer et ignore les titres, artistes et URLs envoyés par le navigateur. Un cache borné à 300 titres pendant cinq minutes évite les appels répétés. Les seules URLs nouvelles acceptées sont des médias HTTPS des domaines Deezer autorisés. L’ajout actualise aussi les anciennes métadonnées d’un morceau, sans toucher aux associations des autres playlists. Les playlists sont limitées à 500 titres et le catalogue à 24 résultats maximum par requête.

Une source Pulse exclut les titres sans extrait HTTPS et les identifiants de films/séries. Le QCM exige quatre réponses distinctes pour chaque élément à deviner. La saisie libre autorise une playlist d’un titre. Le nombre de manches ne peut pas dépasser les titres exploitables. En multijoueur, l’accès est revérifié au départ puis la sélection est conservée pour toute la partie.

## Base et sécurité

Les migrations ajoutent visibilité/liens aux playlists existantes, qui restent privées par défaut. La migration suivante active RLS sur les trois tables applicatives. Aucune politique d’accès navigateur n’est créée : seule la connexion du serveur, propriétaire des tables, accède directement aux données. Sur Supabase, ne pas distribuer la clé `service_role` ni les chaînes PostgreSQL au frontend. Un rôle PostgreSQL personnalisé non propriétaire nécessite une configuration explicite de ses accès.

Une bibliothèque invitée utilise une clé d’accès locale avec un UUID complet. Une bibliothèque liée à `AccountProfile` exige en plus un jeton vérifié auprès de Supabase Auth, appartenant au propriétaire. Les profils, amitiés et invitations restent dans PostgreSQL ; les e-mails et mots de passe restent dans Auth. Les DTO sociaux publics n’exposent ni e-mail ni clé de bibliothèque ; les DTO visiteurs de playlists n’exposent ni `ownerId` ni UUID interne. Les journaux du reverse proxy doivent masquer les paramètres d’identité et ne pas conserver les corps de requêtes. Les logs applicatifs 5xx ne contiennent que des métadonnées techniques bornées.

Le catalogue officiel fusionne plusieurs sources éditoriales vérifiées, avec cache borné et regroupement des chargements simultanés. Le plan musical est figé pour la partie : regroupement des versions d’un enregistrement, espacement des artistes quand le catalogue le permet, équilibre des provenances et propositions QCM proches mais non ambiguës selon le véritable correcteur. Les 60 derniers IDs locaux du solo servent de préférence anti-répétition. Un cache solo de 200 plans maximum expire après 45 minutes ; aucune difficulté mesurée ou statistique de réussite n’est fabriquée.

CORS ne remplace pas ces contrôles d’accès. Les requêtes HTTP et événements sockets sont limités. Les erreurs externes et DB ne doivent pas dévoiler les identifiants de connexion.

## Déploiement et limites

Le serveur est mono-instance par choix. Passer à plusieurs instances demanderait de partager état, timers et événements ; ajouter Redis uniquement pour une démonstration aurait compliqué l’installation. Docker fournit un processus Node persistant et Nginx assure REST, WebSocket et fallback SPA.

Vercel sert l’interface ; Render héberge le processus Node permanent. Aucun déploiement n’est effectué par les scripts de développement ou la CI. Les variables sont documentées dans [le guide de déploiement](deploiement.md).

## Compromis à expliquer

| Choix                               | Bénéfice                                                                    | Limite / évolution                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| État de salon en mémoire            | Synchronisation simple, scores et timers centralisés                        | Redémarrage destructeur pour les parties ; stockage partagé nécessaire avant plusieurs instances |
| Comptes facultatifs                 | Accès immédiat au jeu, migration explicite de la bibliothèque invitée       | Deux formes de propriété à protéger et tester                                                    |
| API comme point d’accès aux données | Même contrôle de visibilité sur HTTP, copie et lancement de partie          | Responsabilité de validation et de journalisation côté backend                                   |
| Plan musical figé                   | Pas de changement de titres lors d’une requête répétée ou d’une reconnexion | Cache mémoire borné ; pas de reprise après redémarrage                                           |
| Tests de fournisseurs simulés       | Parcours reproductibles sans secrets ni dépendance à leur disponibilité     | Recette réelle indispensable pour Auth, audio et APIs externes                                   |

Les fonctions de correction existent côté client (solo) et serveur (multijoueur) ; un test de parité vérifie leur cohérence. Un package partagé pourra remplacer cette duplication si le domaine se développe. Le contrôleur de salon et certains écrans restent les modules les plus importants : les séparer davantage se justifiera avec de nouvelles responsabilités, pas uniquement pour réduire leur nombre de lignes.
