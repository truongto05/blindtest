# Tests et validation

## Vérifications rapides

Après l’installation des trois ensembles de dépendances :

```sh
npm run format:check
npm run check
```

`check` regroupe ESLint, TypeScript strict, tests et builds frontend/backend. Les tests unitaires et HTTP utilisent des fournisseurs simulés ; ils n’exigent ni base ni secret. Les tests Socket.IO ouvrent de vraies connexions locales.

## Parcours navigateur

Les tests Playwright utilisent Express, Socket.IO, Prisma et PostgreSQL réels. Seuls le fournisseur Auth et les médias sont simulés. Chaque exécution crée un schéma aléatoire `pulse_e2e_*`, applique les migrations, puis supprime uniquement ce schéma. Les URLs PostgreSQL distantes sont refusées et `backend/.env` n’est pas chargé par la configuration E2E.

1. Démarrer PostgreSQL local avec `docker compose up -d`, ou utiliser une base locale dédiée.
2. Installer Chromium : `npm --prefix frontend exec playwright install chromium`.
3. Lancer `npm --prefix frontend run test:e2e`.

Par défaut, la connexion est `postgresql://pulse:pulse@localhost:5432/pulse`. Pour une installation différente, définir **les deux variables** `DATABASE_URL` et `DIRECT_URL` vers la même base locale avant la commande. Le rôle de test doit pouvoir créer un schéma.

Exemple PowerShell :

```powershell
$env:DATABASE_URL='postgresql://pulse:pulse@127.0.0.1:5432/pulse'
$env:DIRECT_URL=$env:DATABASE_URL
npm --prefix frontend run test:e2e
```

Les serveurs de test utilisent les ports **3101 et 4175** sans réutiliser les serveurs de développement. En cas d’échec, les captures et traces sont dans `frontend/test-results/`, exclu de Git. Un arrêt brutal peut laisser un schéma temporaire : vérifier son nom avant toute suppression manuelle.

## Résultats de référence

La passe du 22 septembre 2026 après nettoyage du dépôt a réussi **367 tests hors navigateur** (240 serveur, 116 interface, 11 scripts), ainsi que lint, typage et builds, sur Windows/Node 24. Les **40 scénarios navigateur passent** avec PostgreSQL 18.4 local (3,8 minutes). Une installation depuis les seuls fichiers publiables, sans `.env`, a également réussi les trois `npm ci` et les builds. Les résultats de la CI du commit consulté priment sur ce relevé daté.

| Couche          | Ce qui est vérifié                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Domaine         | Correction des réponses, déduplication, diversité, distracteurs QCM, plans de jeu                         |
| HTTP et données | Contrats, validation, autorisations, séparation des bibliothèques, limites, erreurs                       |
| Socket.IO       | Phases, reconnexion, hôte, démarrage protégé, scores et scénario de 24 joueurs                            |
| Interface       | Formulaires, états de chargement, récupération, stockage et changement de compte                          |
| Navigateur      | Solo, multijoueur, playlists, partage/révocation, amis/invitations, déconnexion inter-onglets, responsive |
| Accessibilité   | Clavier, focus, texte agrandi, mouvement réduit et règles axe-core sur les parcours couverts              |

Le workflow [CI](../.github/workflows/ci.yml) vérifie Node 22/24 et les parcours Chromium avec PostgreSQL 16 dans un service éphémère. Il n’utilise pas la base Supabase et n’effectue aucun déploiement. Références d’intégration : [GitHub Actions / Node](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs), [PostgreSQL en CI](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [Playwright CI](https://playwright.dev/docs/ci-intro).

## Captures de documentation

Une exécution ordinaire ne modifie pas les captures suivies. Pour les régénérer volontairement avec les données fictives des tests :

```powershell
$env:PULSE_UPDATE_SCREENSHOTS='1'
npm --prefix frontend run test:e2e
Remove-Item Env:PULSE_UPDATE_SCREENSHOTS
```

Les captures sont prises à l’échelle CSS, sans animation, pour limiter le poids du dépôt. Les relire avant de les commiter.

## Ce que ces tests ne prouvent pas

- Le profil mobile Playwright utilise Chromium : il ne remplace pas Safari sur un vrai iPhone ni un essai audio sur Android.
- Auth simulé ne valide ni la livraison d’un e-mail Supabase ni les redirections de production.
- Le scénario local à 24 joueurs ne mesure pas la capacité ou la latence de Render sous charge soutenue.
- Les contrôles axe-core ne constituent pas une certification WCAG ; les tests ne constituent pas un audit de sécurité indépendant.
- Les builds Docker et la recette de production doivent être vérifiés dans leur environnement. L’audit public du 22 septembre constatait encore l’absence des nouvelles routes ; ne pas présenter cette refonte comme déjà disponible en ligne.
