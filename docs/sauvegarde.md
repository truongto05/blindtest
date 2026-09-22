# Sauvegarde avant migration

L’outil local `backend/scripts/backup-db.cjs` utilise `DIRECT_URL` (ou `DATABASE_URL`) depuis `backend/.env`. Il n’écrit rien dans la base et transmet les identifiants aux outils PostgreSQL via leur environnement, jamais dans la ligne de commande ou la sortie.

```powershell
node backend/scripts/db-inventory.cjs
node backend/scripts/backup-db.cjs --pg-bin="C:\chemin\vers\postgresql\bin"
```

Installer ou extraire les clients `pg_dump` et `pg_restore` depuis une distribution officielle compatible avec la version du serveur. L’archive est créée sans écraser de fichier existant dans un dossier `pulse-db-backup-*` du répertoire temporaire utilisateur. Conserver cette archive **hors du dépôt**, dans un emplacement privé durable adapté aux données personnelles ; un dossier temporaire n’est pas un stockage de sauvegarde pérenne.

Le contrôle `pg_restore --list` vérifie la lisibilité, **pas la restauration**. Restaurer ensuite dans une nouvelle base locale de validation dédiée, jamais dans la base d’origine. Comparer schéma, migrations et nombres de lignes avant d’autoriser la migration. Une restauration de production exige un plan séparé, une vérification des droits et une fenêtre de maintenance ; ne pas y copier une commande `--clean` de test.

## Périmètre et limites

- Format PostgreSQL personnalisé, schéma `public` uniquement ; aucun utilisateur Supabase Auth, objet Storage ou configuration d’hébergement n’est inclus.
- Les propriétaires et permissions de rôles ne sont pas restaurés automatiquement (`--no-owner`, `--no-privileges`). Les migrations et contrôles RLS restent nécessaires dans l’environnement cible.
- Une migration additive n’exige pas de supprimer les anciennes tables ni de réinitialiser Prisma.
- Définir séparément une sauvegarde complète, un accès restreint, une rétention et des exercices périodiques. Aucun abonnement ou service payant n’a été créé ici.

## Essai du 22 septembre 2026

Clients PostgreSQL 18.6 issus des [binaires officiels EDB](https://www.enterprisedb.com/download-postgresql-binaries), restauration dans PostgreSQL 18.4 local. Archive `public.dump` de 9 594 octets, lisible et restaurée sans erreur ; 1 playlist et 0 titre retrouvés.

La migration `20260915000000_accounts_and_friends` a ensuite été appliquée au projet Supabase vérifié. Les comptes de playlists et titres sont identiques après migration. L’emplacement de l’archive est conservé dans les notes d’exploitation locales, pas dans la documentation publique.
