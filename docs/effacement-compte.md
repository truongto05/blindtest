# Effacement d’un compte

Cette version propose une **demande par e-mail, traitée par l’éditeur**, pas une suppression automatique en un clic. Le lien du compte prépare l’e-mail ; l’utilisateur doit l’envoyer. Aucun message ni demande n’est envoyé automatiquement par Pulse.

## Procédure opérateur

1. Vérifier l’identité du demandeur via l’adresse confirmée du compte. Un UUID, un pseudo ou un code ami seul n’est pas une preuve de propriété. Ne jamais demander le mot de passe, le jeton de session ou la clé privée de bibliothèque.
2. Prévoir une fenêtre de maintenance et arrêter les écritures de Pulse pendant le nettoyage, pour éviter une requête concurrente ayant déjà été authentifiée. Prévenir que les salons en mémoire seront interrompus. Ne pas arrêter un service sans coordination préalable.
3. Dans un environnement serveur de confiance, vérifier que `DATABASE_URL` et `SUPABASE_URL` visent le même projet et disposer d’une clé administrative `SUPABASE_SECRET_KEY` pour ce seul outil. **Jamais de variable `VITE_` pour cette clé**, jamais dans Git, les journaux ou le navigateur. La clé publique utilisée par l’application ne permet pas d’effacer une identité Auth.
4. Depuis `backend`, lancer la simulation :

```sh
node scripts/delete-account.cjs --id=<UUID vérifié>
```

5. Vérifier la cible et le nombre de playlists, puis confirmer uniquement cette cible :

```sh
node scripts/delete-account.cjs --id=<UUID vérifié> --confirm=<même UUID>
```

L’outil supprime d’abord l’identité via l’API administrative Supabase, puis ses playlists et son profil dans une transaction PostgreSQL. Les demandes/amitiés, invitations, reçus d’import et journaux liés au profil sont supprimés en cascade. Les copies indépendantes appartenant à d’autres personnes, les originaux invités et le catalogue commun de morceaux sont conservés. Les logs/sauvegardes des hébergeurs ont leur propre cycle de rétention : ne pas promettre leur purge immédiate.

Si Auth refuse la suppression, aucune donnée Pulse n’est effacée. Si Auth réussit mais que PostgreSQL échoue, l’accès est retiré mais les données peuvent subsister : **reprendre avec le même UUID**, en maintenant les écritures arrêtées. Un Auth 404 permet cette reprise. Après succès, vérifier l’absence du profil et des playlists ciblées, puis reprendre le service et informer le demandeur. Aucune suppression réelle n’a été effectuée lors du développement de cet outil.

Référence : [gestion des utilisateurs Supabase](https://supabase.com/docs/guides/auth/managing-user-data). Supabase signale notamment que supprimer un compte ne rend pas rétroactivement invalide un JWT déjà émis ; Pulse interroge Auth directement pour vérifier ses comptes. Les appels déjà en cours nécessitent la fenêtre de maintenance ci-dessus.

## Validation locale

`node --test backend/scripts/delete-account.test.cjs` vérifie la simulation, la confirmation exacte, l’ordre Auth → nettoyage, le périmètre et la conservation en cas de panne Auth. Ce sont des tests avec dépendances simulées, pas une validation de suppression d’un véritable compte Supabase.
