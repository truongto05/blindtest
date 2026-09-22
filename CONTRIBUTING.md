# Développer sur Pulse

Le [README](README.md) décrit l’installation et les fonctionnalités. Utiliser Node 24 (`.nvmrc`) ; la CI vérifie également Node 22.12+.

## Avant une modification

- Partir d’une branche dédiée et décrire le problème traité.
- Garder les règles du jeu dans `backend/src/domain`, les accès externes dans `services` et les validations d’entrée dans `validation`.
- Ne pas ouvrir de connexion réseau dans un composant d’affichage : les appels passent par les services ou les hooks de fonctionnalité.
- Ajouter un test de régression pour un correctif. Pour une évolution HTTP ou Socket.IO, vérifier aussi les erreurs et les autorisations.
- Créer une migration additive pour toute évolution Prisma ; ne jamais réinitialiser une base existante pour faire passer les tests.

## Vérifier avant de proposer

```sh
npm run format
npm run check
```

Exécuter également les [tests navigateur](docs/validation.md) pour une évolution des parcours. Ils nécessitent PostgreSQL local et Chromium, pas de compte Supabase ni de clé de production.

Une proposition décrit le changement, les tests exécutés et les limites connues. Ajouter une capture réelle si l’interface évolue. Les messages de commit peuvent suivre `feat:`, `fix:`, `refactor:`, `test:` ou `docs:` avec un sujet précis.

## Données et captures

Ne jamais commiter de `.env`, jeton, export SQL, code privé de bibliothèque réelle ou trace contenant des données personnelles. Les captures du README utilisent exclusivement des données fictives. Leur régénération est volontaire via `PULSE_UPDATE_SCREENSHOTS=1`, puis elles doivent être relues avant publication.

Une faille de sécurité se signale par le canal privé de [SECURITY.md](SECURITY.md), pas dans une issue publique contenant des identifiants.
