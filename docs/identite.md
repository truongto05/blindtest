# Identité Pulse

## Le principe

Un jeu à reconnaître aussi vite qu’un morceau. Ambiance retenue : soirée musicale chaleureuse, entre affiche de concert et commandes de mixage. La signature est « Reconnais le son. Avant les autres. ». Le vocabulaire reste direct : écouter, trouver, rejouer, inviter. Pas de chiffres d’audience inventés, de promesse de classement mondial ou de récompenses qui n’existent pas.

## Les repères visuels

- **Le P lecture** : le monogramme vectoriel de `frontend/public/pulse-icon.svg` comporte une contreforme triangulaire. Le même fichier sert dans l’interface, le favicon et le manifeste installable. Ne pas revenir à une icône de pulsation médicale.
- **Le citron** : `beat-400`, `#d1ed62`, identifie l’action principale, la sélection et le temps de jeu. Sur une surface citron, le texte est en `ink-950`, jamais en blanc.
- **La matière** : `ink-950`, `#171515`, et des surfaces charbon chaud. Grain vectoriel discret et lumière chaude très diffuse sur le fond ; leur contraste reste inférieur à celui du contenu. Pas de grand halo violet ni de vitre floutée sur les textes.
- **Les accents secondaires** : corail `#ed987f` pour les préréglages et cyan `#8ed8d0` pour le son. La progression musicale passe du citron au cyan ; l’urgence reste identifiée par le rouge et une indication textuelle.
- **La typographie** : Unbounded pour les titres, Arial/système pour le texte courant, chiffres de manche et chronomètre à chasse fixe. La police variable latine pèse environ 50 Kio et est servie localement ; sa licence SIL OFL est distribuée dans `frontend/public/fonts`. Aucun appel Google Fonts côté visiteur.
- **Le rythme** : trois traits inclinés corail/cyan/citron sur l’accueil, onde sur l’écran de jeu. Le même signal anime les chargements de page, de salon, de bibliothèque et de manche ; il reste fixe avec la réduction des animations. Les pochettes restent les visuels principaux des playlists.

## Règles d’interface

Une action principale par section. Les explications de saisie restent associées à leur champ ; les boutons indisponibles conservent un libellé explicite. Les playlists et joueurs sont des listes ; les préréglages sont des pads tactiles et les univers/modes des sélecteurs regroupés. Ne pas recréer une grille de cartes de tarification ni de faux potentiomètres sans fonction.

L’accueil est un point d’entrée vers le jeu, pas une longue page commerciale. Il garde la signature et explique le fonctionnement en une phrase. Boutons de jeu à léger biseau et arrondis de 12 px, champs à 6 px, dialogues à 8 px, pochettes à 2 px. Les fonds teintés signalent une sélection réelle, complétée par une coche et `aria-pressed`. Pas de faux témoignages, de logos de partenaires ni de badges de confiance sans fondement.

Le menu de jeu précède la configuration : six sélections (hits, rap français, années 80, rock, films et séries), un lancement solo direct et un espace distinct pour les amis. Les illustrations vectorielles sont propres à Pulse : disque, onde, cassette, éclair, clap et téléviseur. Trois colonnes sur ordinateur, deux sur mobile et une si le texte agrandi manque de place. Le raccourci « Jouer entre amis » amène au pseudo sur mobile. L’aide « Comment jouer » explique les règles réelles dans un dialogue accessible.

La revue de [blindtest.gg](https://blindtest.gg/) du 14 septembre 2026 a orienté cette hiérarchie : mettre les catégories et l’entrée en partie au premier plan. Aucun asset, logo ou catalogue concurrent n’a été repris. Pulse conserve son charbon chaud, ses illustrations et sa palette ; il n’affiche pas de salons publics, de progression ou de classement global tant que ces fonctions n’existent pas.

Une invitation ouvre une entrée dédiée : code prérempli, pseudo, puis « Rejoindre ». Les choix de création et de solo ne s’interposent pas. Le bouton « Choisir une autre partie » rend l’accueil accessible sans perdre le pseudo. Les messages de connexion décrivent l’attente réelle, sans pourcentage inventé ni relance automatique d’une création.

Sur petit écran, les deux options d’univers et de mode restent côte à côte lorsque la place le permet. La grille se calcule en unités de texte : à 200 %, elle les empile pour préserver leur lisibilité.

Les icônes PNG installables et Apple sont dérivées du même SVG ; l’aperçu des liens utilise aussi la police locale. `node frontend/scripts/build-brand-assets.cjs` régénère ces fichiers sans appel externe. La carte sociale ne contient pas de bruit bitmap pour rester sous 100 Kio. En cas de changement du domaine public, actualiser les métadonnées dans `frontend/index.html` et l’adresse de la carte dans le script avant de régénérer les fichiers.

Le mouvement n’est pas nécessaire à la compréhension. Réduction des animations, focus clavier, contraste renforcé et agrandissement du texte doivent rester utilisables à chaque évolution. Un succès ou une erreur n’est jamais indiqué uniquement par une couleur.

Les captures réelles dans `docs/screenshots` servent de référence. Cette direction graphique est une proposition de produit, pas une validation juridique de disponibilité de marque ni une garantie de valeur commerciale.
