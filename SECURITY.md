# Sécurité

Pour signaler une vulnérabilité, contacter [Toan TRUONG](mailto:truong_toan@hotmail.com) en privé. Décrire le parcours, l’impact et une reproduction avec des données fictives. Ne pas envoyer de mot de passe, de jeton actif ni de données d’un autre utilisateur. Ce projet personnel ne propose pas de programme de récompense ou de délai de réponse garanti.

## Frontières de confiance

- Le serveur calcule les scores multijoueurs et contrôle les actions du joueur connecté.
- Une bibliothèque invitée est protégée par un code-capacité confidentiel ; ce n’est pas une identité vérifiée. Une bibliothèque de compte exige en plus une session validée auprès de Supabase Auth.
- Les rôles navigateur Supabase n’accèdent pas directement aux tables applicatives. Les migrations activent RLS ; l’API constitue le point d’accès aux données.
- Les clés PostgreSQL, TMDB et administratives restent côté serveur. Seules l’URL et la clé publique Auth peuvent être préfixées `VITE_`.
- Les journaux applicatifs ne doivent pas contenir de corps de requête, jeton ou exception brute. Les logs de l’hébergeur nécessitent leur propre configuration.

## Limites

Les tests automatisés et scans de dépendances ne sont ni un audit indépendant ni une certification de sécurité. Le solo n’empêche pas l’inspection des réponses dans le navigateur. Les salons sont en mémoire et ne survivent pas à un redémarrage.

Si un secret est publié, le révoquer ou le renouveler chez le fournisseur : le supprimer du dernier commit ne suffit pas. Une éventuelle réécriture d’historique doit être coordonnée avec les personnes qui ont cloné le dépôt.
