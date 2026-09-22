# Sources du catalogue musical Pulse

Registre initial `2026-09-15.1`. Vérification en lecture seule le **14 septembre 2026** sur l’API publique Deezer : existence, titre, caractère public et présence d’extraits sur les nouvelles sources. Aucune connexion privée, aucun téléchargement audio et aucune écriture distante. Les contenus peuvent changer après cette date.

Contrôle du loader réel le **20 septembre 2026** : les 13 sélections ont chargé avec succès, soit les 19 sources du registre. À cet instant, Hits contenait 233 identifiants jouables issus de trois sources et Mix 384 issus de six sources/familles. Ces nombres sont des observations après filtrage des extraits et déduplication des IDs, avant regroupement éventuel des versions d’un même enregistrement ; ils ne sont ni des quotas garantis ni des compteurs à afficher en dur.

« Sélections officielles » signifie **sélections proposées par Pulse**, pas partenariat avec Deezer. Les deux sélections Digster sont des sources éditoriales tierces, explicitement identifiées.

## Sources publiques vérifiées

| Source                                        | Identifiant et référence primaire                        | Utilisation        |
| --------------------------------------------- | -------------------------------------------------------- | ------------------ |
| Top Worldwide                                 | [3155776842](https://api.deezer.com/playlist/3155776842) | Hits               |
| Pop Essentials                                | [1036183001](https://api.deezer.com/playlist/1036183001) | Hits, Mix, Pop     |
| Poptop                                        | [1083902971](https://api.deezer.com/playlist/1083902971) | Pop                |
| Rapstars                                      | [3272614282](https://api.deezer.com/playlist/3272614282) | Rap français       |
| Rap Français - Les Classiques, Digster France | [1999435002](https://api.deezer.com/playlist/1999435002) | Rap français, Mix  |
| Hot Urban                                     | [1677006641](https://api.deezer.com/playlist/1677006641) | Rap US             |
| Hip Hop : Essentials, Digster ZA              | [2054469264](https://api.deezer.com/playlist/2054469264) | Rap US             |
| En mode 80                                    | [1163842311](https://api.deezer.com/playlist/1163842311) | Années 80          |
| 80s Hits                                      | [867825522](https://api.deezer.com/playlist/867825522)   | Années 80, Mix     |
| Rock Essentials                               | [1306931615](https://api.deezer.com/playlist/1306931615) | Rock, Mix          |
| 2000s Rock                                    | [1419215845](https://api.deezer.com/playlist/1419215845) | Rock               |
| Electronic Hits                               | [1902101402](https://api.deezer.com/playlist/1902101402) | Électro            |
| Electronic Essentials                         | [3801761042](https://api.deezer.com/playlist/3801761042) | Électro, Mix       |
| Essentiels variété française                  | [1420459465](https://api.deezer.com/playlist/1420459465) | Variété, Hits, Mix |
| Les Variétés françaises                       | [788022051](https://api.deezer.com/playlist/788022051)   | Variété            |
| R&B Hits                                      | [1999466402](https://api.deezer.com/playlist/1999466402) | R&B                |
| Metal Hits                                    | [1388965575](https://api.deezer.com/playlist/1388965575) | Metal              |
| Reggae Essentials                             | [2448918882](https://api.deezer.com/playlist/2448918882) | Reggae             |
| Jazz Essentials                               | [1615514485](https://api.deezer.com/playlist/1615514485) | Jazz               |

## Chargement et provenance

- `Hits` associe trois sources ; `Mix` associe six familles distinctes. Le chargement refuse un Mix réduit à moins de trois familles/sources disponibles et des Hits réduits à moins de deux sources. Les autres sélections acceptent une source restante de leur propre registre ; aucune substitution par un autre genre.
- Pour chaque source : au maximum trois pages de 100 entrées, requêtes construites sur `https://api.deezer.com/playlist/ID/tracks`, délai maximal de quatre secondes par requête. L’URL `next` reçue n’est jamais suivie directement.
- Cache mémoire des succès : cinq minutes, 64 sources au maximum ; regroupement des requêtes simultanées, au maximum 32 sources en cours. Pas de cache persistant ni de récupération depuis une copie expirée. Un échec de page invalide la source entière pour cet appel.
- Les titres sans extrait HTTPS sur un domaine Deezer/DZCDN de confiance, sans métadonnées nécessaires ou marqués non lisibles sont exclus. Une pochette invalide devient vide. Le loader déduplique les IDs et conserve toutes leurs provenances ; la composition du jeu peut ensuite regrouper les enregistrements/versions.
- `genres` décrit la **provenance éditoriale de la source**, pas une annotation vérifiée de chaque morceau. `popularity` conserve le `rank` Deezer quand il est fourni et valide : ce n’est pas une mesure de difficulté. `artistId` et `isrc` sont conservés quand ils sont valides ; `year` seulement si une date de sortie est effectivement fournie. Une réédition peut avoir une date différente de l’enregistrement original.
- Les poids de sources du registre sont tous égaux à 1 dans cette version. Le loader fusionne les sources ; il ne garantit pas à lui seul une proportion de genres ou un niveau de difficulté dans une partie.

## Limites

Les droits de diffusion, restrictions géographiques, évolutions du fournisseur et la qualité éditoriale des playlists doivent rester surveillés. Présence d’une URL d’extrait ne garantit pas sa lecture sur chaque appareil. Aucune difficulté par morceau, préférence utilisateur ni télémétrie de réussite n’est inventée ou collectée par ce chargement. La disponibilité observée lors de la vérification ne constitue pas une garantie future.
