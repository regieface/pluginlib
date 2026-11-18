# Référence de l’étape A de la classification

`migration-baseline.json` fixe l’état public avant migration. Les trois premières
empreintes SHA-256 portent sur les ensembles triés d’IDs bruts et chargés ainsi
que sur les références et membres calculés des plans publics. Les tests
contrôlent séparément les relations de doublons, les exclusions, la jointure
des descriptions et les identifiants du lien PLC F6.

Chaque entrée de `facts` contient un masque de présence compressé (DEFLATE brut
puis Base64) et une empreinte SHA-256 des valeurs protégées. Le masque suit
l’ordre trié des IDs, bit de poids faible en premier. Il permet de vérifier
chaque valeur déjà présente même si une autre fiche reçoit le même champ
ou si de nouvelles preuves sont ajoutées. Les valeurs protégées sont définies
explicitement dans `migration-baseline.test.mjs`. Elles couvrent l’identité de
rapprochement, les sources, l’audit, les preuves par tag, les descriptions
françaises et les données de latence chiffrées ou publiées, y compris les
extraits suspects. La référence ne contient aucune donnée de collection
personnelle. Les tests de droits utilisent des déclarations fictives.

Une modification approuvée de l’identité, d’une valeur protégée ou du
catalogue public peut nécessiter une révision de la référence. Examiner
d’abord les changements de données par ID et les champs signalés par les
tests. Si le modèle déplace une valeur, adapter d’abord la projection pour
retrouver la même information et faire passer l’ancienne référence. Pour
un changement volontaire de contenu, produire une nouvelle référence dans
un fichier temporaire, vérifier les écarts attendus, puis remplacer le fichier
suivi et relancer la suite. Une collecte peut modifier des valeurs protégées
comme les dates de vérification. Le prochain passage des tests signalera alors
l’écart tant que la référence n’aura pas été révisée. Depuis la racine du dépôt, la commande suivante
écrit la référence sur la sortie standard.

```sh
sh scripts/with-dev-env.sh node scripts/migration-baseline.test.mjs --print-reference
```

Le test de persistance du comparateur exécute les gestionnaires de l’interface
avec des éléments simulés et des données en mémoire. Une recette navigateur
reste nécessaire pour le rendu et les interactions réelles.
