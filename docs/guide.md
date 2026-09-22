# Utiliser Pulse

## Créer ou rejoindre une partie

Saisis un pseudo puis choisis **Créer un salon**. Tous les réglages sont disponibles avant la création, puis via le bouton de réglages du salon. Les autres joueurs rejoignent avec le code, le lien ou le QR et confirment qu’ils sont prêts. Un changement de configuration remet leur statut à confirmer.

Sur l’accueil, choisis une des six sélections illustrées, puis **Jouer en solo** et active le son. Le récapitulatif indique le mode, les manches, la durée et le type de réponse conservés de tes réglages. **Personnaliser la partie** donne accès à tous les genres, aux playlists et aux options détaillées. Une sélection de l’accueil est aussi reprise lorsque tu crées un salon. Sur mobile, **Jouer entre amis** amène directement au champ pseudo.

**Comment jouer** ouvre les règles et l’aide audio sans quitter l’accueil. Sur certains mobiles, le navigateur demande un clic supplémentaire sur « Lire l’extrait ». Les touches 1 à 4 correspondent aux réponses du QCM, sauf lorsqu’un champ ou un dialogue a le focus. La saisie libre applique la même tolérance aux petites fautes et aux accents en solo et en multijoueur.

## Retrouver ses playlists

**Avec un compte** : connecte-toi sur l’autre appareil, puis ouvre Bibliothèque. L’accès aux playlists du compte exige ta session ; aucun code privé n’est à partager. Depuis Mon compte, tu peux copier volontairement ta bibliothèque invitée : les copies sont privées, les originaux restent inchangés et un second import ne duplique pas la même bibliothèque.

**Sans compte** : depuis Bibliothèque, ouvre « Retrouver ma bibliothèque sur un autre appareil » et conserve le code `LIB-…`. Sur le second appareil, colle-le dans « Ouvrir une autre bibliothèque ». Ce code permet de lire et modifier les playlists invitées : il doit rester secret.

Un code invité syntaxiquement valide mais inconnu ouvre une bibliothèque vide. Les codes invités perdus ne se récupèrent pas par e-mail ; les comptes disposent d’une récupération de mot de passe. Copier le code invité actuel avant d’en saisir un autre évite de perdre l’accès à cette collection.

## Comptes et amis

Sur Mon compte, inscris-toi par e-mail, confirme ton adresse dans le même navigateur puis choisis ton pseudo. Sur Amis, échange ton code public `PULSE-…` et envoie une demande avec le code exact de l’autre personne. Le destinataire doit l’accepter ; aucun e-mail ni code privé de bibliothèque n’est visible par les amis.

Depuis un salon en attente, **Inviter mes amis** permet d’envoyer une invitation valable dix minutes. L’ami suit le lien puis confirme **Rejoindre** ; il n’est jamais ajouté automatiquement. Le lien **Retour au salon** te ramène à la partie. Une invitation vers un salon plein, démarré ou fermé n’est plus proposée. Tu peux refuser/annuler une demande et retirer un ami avec confirmation.

La suppression de compte se demande par e-mail depuis Mon compte et reste traitée par l’éditeur après vérification. Le bouton ne prétend pas supprimer automatiquement les données. Ne joins jamais de mot de passe ou de jeton de connexion à cette demande.

## Garder les découvertes d’une partie

Les résultats affichent les titres joués. Crée une playlist ou choisis une destination, puis utilise la sauvegarde individuelle ou **Tout enregistrer**. Une interruption n’efface pas les titres déjà sauvés : réessaie pour les suivants. Les films et séries restent dans le récapitulatif, sans être ajoutés comme morceaux musicaux.

## Partager

- **Privée** : accessible avec la session de son propriétaire si liée à un compte, ou avec le code privé de sa bibliothèque invitée.
- **Partagée par lien** : toute personne ayant le lien peut écouter et copier ; elle n’apparaît pas au catalogue.
- **Publique** : accessible par lien et listée dans **Playlists publiques**.

Dans le détail, **Partager** ouvre les trois choix. Enregistre la visibilité avant de copier le lien. Revenir en privé désactive l’ancien lien. Les copies déjà créées chez les visiteurs restent indépendantes.

**Ajouter à ma bibliothèque**, sur une page partagée, crée une copie privée. Elle peut être renommée et modifiée sans toucher à l’original.

## Jouer une playlist Pulse

Dans son détail, **Jouer avec cette playlist** prépare un solo. Pour un salon, choisis **Ma playlist** dans la sélection musicale. Une playlist privée fonctionne sans la publier. Pulse affiche le nombre d’extraits exploitables et bloque les configurations impossibles : trop de manches, aucun extrait ou pas assez de réponses distinctes pour un QCM.

## En cas de problème

- **Bibliothèque indisponible** : réessayer ; en développement, exécuter `npm run db:check` et vérifier les migrations.
- **Supabase « tenant/user not found »** : vérifier projet actif, région, hôte et identifiant de l’URL copiée depuis le panneau Connect. Ne pas deviner l’hôte du pooler. Garder le mot de passe uniquement dans `.env`.
- **Audio bloqué** : utiliser « Lire l’extrait » ; si le chargement échoue, réessayer ou quitter la partie.
- **Connexion perdue** : la reconnexion est automatique ; la place dans un salon est gardée trente secondes.
- **Copie automatique indisponible** : sélectionner le lien ou le code dans le champ puis copier manuellement.

Les options d’accessibilité restent disponibles en bas de l’écran. Les pages de confidentialité, stockage/cookies, conditions et mentions légales sont accessibles depuis le pied de page.
