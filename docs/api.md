# API playlists

Toutes les routes sont préfixées par `/api/playlists`. Les réponses ne doivent pas être mises en cache. `ownerId` est une clé privée de bibliothèque, jamais une preuve d’identité personnelle. Pour les lectures et suppressions, le frontend envoie `X-Library-Id` sans clé dans l’URL. L’ancien paramètre `?ownerId=…` reste accepté pour compatibilité, mais n’est plus utilisé par l’interface.

Pour une bibliothèque liée à un compte, un jeton `Authorization: Bearer …` validé auprès de Supabase Auth et appartenant au propriétaire est exigé en plus. Cela concerne toutes les lectures privées, mutations et sources de quiz. Les accès visiteurs aux liens partagés/publics restent publics. Une session absente/expirée renvoie 401 ; celle d’un autre compte renvoie 403.

| Méthode et route                        | Entrée                                                     | Résultat                                     |
| --------------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| `GET /?ownerId=…`                       | Code privé                                                 | Playlists de la bibliothèque                 |
| `POST /`                                | `{ownerId, name}`                                          | Nouvelle playlist privée, 201                |
| `GET /:id?ownerId=…`                    | UUID + code privé                                          | Détail propriétaire                          |
| `PATCH /:id`                            | `{ownerId, name}`                                          | Playlist renommée                            |
| `DELETE /:id?ownerId=…`                 | UUID + code privé                                          | Suppression, 204                             |
| `POST /:id/tracks`                      | `{ownerId, deezerId, title, artist, coverUrl, previewUrl}` | Association, 201 ; ajout existant idempotent |
| `DELETE /:id/tracks/:trackId?ownerId=…` | Identifiant de morceau                                     | Retrait, 204                                 |
| `PATCH /:id/visibility`                 | `{ownerId, visibility}`                                    | Playlist et lien actualisés                  |
| `GET /public?page=1&limit=12`           | Page 1–10000, limite 1–24                                  | `{items, total, page, pageSize}`             |
| `GET /share/:shareId`                   | Jeton de 32 caractères                                     | Détail visiteur, sans code ni UUID interne   |
| `POST /share/:shareId/copy`             | `{ownerId}` du visiteur                                    | Nouvelle copie privée, 201                   |

`visibility` accepte uniquement `PRIVATE`, `UNLISTED`, `PUBLIC`. Le nom est limité à 60 caractères. Les corps et paramètres inattendus sont rejetés. Pour compatibilité, le corps d’ajout contient encore les métadonnées, mais le serveur ne leur fait pas confiance : il résout le `deezerId` numérique auprès de Deezer et enregistre uniquement ses valeurs canoniques (médias HTTPS des hôtes autorisés). Les identifiants de films/séries ne sont pas des morceaux sauvegardables. Une indisponibilité Deezer est signalée sans enregistrer de contenu non vérifié.

Les DTO contiennent nom, visibilité, lien éventuel, dates, titres, nombre total et nombre de titres jouables. Le DTO propriétaire ajoute `id`. Le DTO visiteur ne contient jamais `ownerId` ni `id`.

## Erreurs

- `400` : paramètres invalides.
- `404` : playlist absente, mauvais propriétaire, lien privé/révoqué. Ces réponses ne permettent pas de distinguer un UUID existant mais inaccessible.
- `409` : conflit de modification ou limite de titres.
- `503` : bibliothèque ou service externe indisponible.

Corps : `{ "error": "Message lisible par l’utilisateur." }`.

## Source de jeu

`GET /api/quiz/source?playlistId=…&rounds=…&answerType=…&answerMode=…` utilise le header privé `X-Library-Id`. La réponse `{name, trackCount, playableCount, issues}` permet de désactiver le lancement avec une explication.

`GET /api/quiz/next` conserve les sources Deezer/cinéma et accepte `genre=pulse`, `playlistId`, `rounds`, `answerMode` et le même header pour le solo.

Les événements `create_room` et `update_settings` acceptent `libraryOwnerId` au premier niveau, séparé de `settings`. La clé est conservée uniquement sur le serveur. `joined_room` répond avec l’ID public du joueur ; `settings_updated` confirme l’enregistrement des réglages.

`create_room`, `update_settings` et `start_game` acceptent `accessToken` pour les sources Pulse de compte. Le serveur le vérifie avant chaque nouvelle lecture privée et ne le stocke ni ne le diffuse dans le salon. Le démarrage revérifie l’hôte, les réglages et les joueurs prêts après cette vérification asynchrone. Le plan de manches est ensuite figé pour cette partie.

Le solo musical peut fournir `runId` (UUID) et `recentIds` (au plus 60 identifiants utilisés). Les manches sont préparées une fois et gardées au plus 45 minutes en mémoire ; réessayer une même manche rend la même question. Un redémarrage peut nécessiter une nouvelle partie. Le cache de plan ne remplace jamais le contrôle d’accès à une playlist privée.

Les routes comptes, amis, imports et invitations sont documentées dans [ACCOUNTS-BACKEND.md](ACCOUNTS-BACKEND.md).
