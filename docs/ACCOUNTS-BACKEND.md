# Comptes, amis et invitations — serveur

## Activation

Les comptes utilisent le projet **Supabase Auth existant**. Aucun service externe supplémentaire ni compte fictif n’est créé par le serveur Pulse.

Variables du backend :

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<cle-publique-du-projet>
# Ancien projet : SUPABASE_ANON_KEY peut remplacer la clé publishable.
```

Ne jamais utiliser une clé `service_role`/`sb_secret_*` dans cette configuration ou dans le frontend. `DATABASE_URL` reste uniquement côté serveur. La configuration du frontend et les redirections de confirmation d’adresse e-mail doivent pointer vers ce même projet Supabase.

Ordre de déploiement :

1. Sauvegarder la base et vérifier que la connexion de migration cible l’environnement voulu.
2. Appliquer les migrations Prisma, dont `20260915000000_accounts_and_friends`, avec le processus habituel de déploiement (`npm --prefix backend run db:migrate`). Ne pas employer `db push`, `migrate reset` ou recréer les tables existantes.
3. Générer le client Prisma puis déployer le backend avec les variables ci-dessus.
4. Vérifier un parcours réel avec une adresse e-mail confirmée avant d’activer l’interface de compte.

La migration est additive : cinq tables applicatives, un enum, clés étrangères et index. Elle ne modifie pas `auth.users` ni les playlists existantes. RLS est activée sur les nouvelles tables ; aucun accès direct Data API n’est autorisé aux rôles `anon`, `authenticated` ou `PUBLIC`. Le rôle Prisma doit être propriétaire des tables ou disposer d’un accès backend explicite compatible avec RLS.

L’application de la migration ne configure ni Supabase Auth ni le déploiement Render/Vercel. Chaque installation doit vérifier sa propre cible, ses sauvegardes et ses variables.

**Important :** la protection des bibliothèques consulte désormais `AccountProfile`, y compris pour déterminer si une clé est invitée. Si la migration manque, cet accès échoue avec 503 ; il ne retombe pas sur un accès invité non vérifié. L’absence de configuration Supabase rend les routes de compte indisponibles sans empêcher l’usage invité une fois la migration appliquée.

## Authentification et données privées

Chaque route `/api/account/*` exige `Authorization: Bearer <access_token>`. Le backend vérifie le jeton via `GET /auth/v1/user`, avec sa clé **publique**, sans cache et sans autoriser à partir d’un JWT simplement décodé. Délai maximum 8 secondes ; redirections refusées ; réponse JSON limitée à 256 Kio. L’utilisateur doit avoir une adresse e-mail confirmée et ne pas être anonyme.

Le sujet vérifié constitue l’identifiant de profil. Le client ne choisit jamais cet identifiant. Le profil est créé par `PUT /me` uniquement, avec un pseudo de 2 à 24 caractères. Le code ami aléatoire public ressemble à `PULSE-A1B2C3D4E5F6`. La nouvelle clé de bibliothèque est indépendante, aléatoire et privée (`LIB-` suivi de 32 chiffres hexadécimaux).

Profil public : `{ id, displayName, friendCode, createdAt }`. Aucun e-mail, jeton, clé de bibliothèque ou statut de présence n’est diffusé dans les listes d’amis et invitations. Seules les réponses `/me` du propriétaire contiennent `libraryOwnerId`. Les réponses de ces routes portent `Cache-Control: no-store`.

Les anciennes bibliothèques invitées restent accessibles par leur clé-capacité confidentielle. Pour toute bibliothèque liée à un compte, `protectLibraryOwner` impose un jeton vérifié dont le sujet correspond au propriétaire. Le contrôle s’applique aux lectures privées et aux mutations, y compris la copie d’une playlist partagée vers une bibliothèque de compte. Les liens explicitement partagés/publics conservent leur consultation publique.

## Contrat HTTP

Toutes les dates sont des chaînes ISO en JSON.

| Route sous `/api/account`                                      | Résultat                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /me`                                                      | `{ profile: null }` ou `{ profile: PublicProfile, libraryOwnerId }`      |
| `PUT /me` avec `{ displayName }`                               | Profil et clé privée du propriétaire                                     |
| `POST /import-library` avec `{ ownerId }`                      | `{ importedCount, alreadyImported }`                                     |
| `GET /friends`                                                 | `{ friends: PublicProfile[], incoming: Request[], outgoing: Request[] }` |
| `POST /friends/requests` avec `{ friendCode }`                 | 201, `{ request: { id, profile: PublicProfile, createdAt } }`            |
| `POST /friends/requests/:id/accept`                            | 204 ; destinataire uniquement                                            |
| `DELETE /friends/requests/:id`                                 | 204 ; annuler/refuser une demande en attente dont on est participant     |
| `DELETE /friends/:profileId`                                   | 204 ; retirer une amitié et supprimer ses invitations de salon           |
| `GET /invitations`                                             | `{ invitations: [{ id, profile: PublicProfile, roomCode, expiresAt }] }` |
| `POST /invitations` avec `{ friendId, roomCode, playerToken }` | 201, `{ id, roomCode, expiresAt }`                                       |
| `DELETE /invitations/:id`                                      | 204 ; expéditeur ou destinataire uniquement                              |

`Request` vaut `{ id, profile: PublicProfile, createdAt }`. La recherche d’amis accepte uniquement un code exact, jamais un e-mail. Une demande croisée n’est pas acceptée implicitement : la demande déjà reçue doit être acceptée explicitement.

Statuts attendus : 400 saisie invalide ; 401 session absente/invalide ; 403 e-mail non confirmé ou opération non autorisée ; 404 ressource inaccessible/introuvable ; 409 conflit ou profil manquant ; 429 limite atteinte ; 503 dépendance/configuration indisponible. Les erreurs brutes de base ou d’authentification ne sont pas exposées.

## Import et concurrence

L’import doit être demandé explicitement. Il copie les playlists de la bibliothèque invitée dans la bibliothèque du compte, **toujours en privé**, sans conserver leurs liens de partage et sans modifier les originaux. Les associations de playlists sont indépendantes ; les morceaux conservent le catalogue canonique commun existant.

Un reçu unique `(profileId, sourceOwnerId)` rend le premier import non vide idempotent. Un nouvel appel ne duplique pas les playlists et ne synchronise pas les modifications ultérieures de la source : c’est un instantané, pas une liaison permanente. Une bibliothèque vide n’est pas marquée comme importée. Une bibliothèque liée à un autre compte ne peut jamais être importée, même si sa clé privée est connue.

Les imports, demandes d’amis, acceptations et invitations utilisent des transactions `Serializable`, avec au maximum trois tentatives en cas de conflit. La paire d’amis est canonique et unique en base ; une contrainte impose que l’expéditeur soit membre de cette paire. Les limites sont revérifiées dans la transaction.

## Limites appliquées

| Élément                         | Limite                                                 |
| ------------------------------- | ------------------------------------------------------ |
| Amis acceptés                   | 200 par profil                                         |
| Demandes sortantes en attente   | 50                                                     |
| Demandes reçues en attente      | 100                                                    |
| Nouvelles demandes d’amis       | 20 par heure et par expéditeur                         |
| Nouvelles invitations de salon  | 5 par tranche glissante de 5 minutes et par expéditeur |
| Durée d’une invitation          | 10 minutes                                             |
| Import invité                   | 200 playlists, 500 titres par playlist                 |
| Jeton/header d’authentification | 8 Kio maximum                                          |

Les suppressions/annulations ne réinitialisent pas les compteurs d’envoi : ils s’appuient sur un journal séparé. Les anciennes tentatives de l’expéditeur (plus de 24 h) sont nettoyées lors de son prochain envoi. Les invitations expirées sont exclues des lectures et nettoyées lors d’un nouvel envoi de leur expéditeur ; il ne s’agit pas d’une purge globale planifiée.

Une invitation exige une amitié acceptée et la preuve confidentielle `playerToken` d’un joueur connecté dans un salon en attente, avec une place libre. Cette preuve n’est ni stockée en base ni retournée. Une invitation encore active pour le même expéditeur/destinataire/salon est réutilisée sans prolonger son expiration. Les salons démarrés, pleins ou disparus ne figurent plus dans les invitations renvoyées. Les salons étant en mémoire du backend, un redémarrage les invalide sans créer une fausse présence.

## Vérifications locales

```sh
npm --prefix backend run typecheck
npm --prefix backend test -- src/services/authService.test.ts src/services/accountService.test.ts src/routes/socialRoutes.test.ts src/routes/playlistRoutes.test.ts
```

Ces tests utilisent des mocks Prisma/Auth et vérifient les frontières HTTP, l’isolation des DTO, les limites et les autorisations. Ils ne remplacent pas un test d’intégration PostgreSQL des contraintes de migration, ni un essai de connexion Supabase réel sur une instance de préproduction correctement configurée.
