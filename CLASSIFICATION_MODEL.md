# Modèle de classification PluginLib — étape B

`treatment-taxonomy.mjs` définit les identifiants des 17 traitements, les
familles autorisées par traitement et la liste ordonnée des critères essentiels
pour le futur comparateur. Les clés des critères indiquent leur emplacement,
leur unité si elle est numérique et leur fréquence nominale pour la latence.
La conception d’un Channel Strip se renseigne dans `features.design`.

`classification.mjs` valide et normalise une fiche. La propriété
`classification` de version 1 contient un tableau `treatments` à un élément
maximum par type. Chaque traitement peut avoir ses propres `families`,
`technologies`, `architectures`, `processes`, `features` et `measurements`.
Une famille est facultative. Le multibande appartient aux architectures et le
waveshaping aux procédés. Les technologies utilisent des IDs extensibles.
Les formats comme `multi-effects` et les propriétés communes à la fiche sont
placés à la racine de `classification`.

Une assertion porte son état et peut contenir `confidence`, `origin`,
`evidence` et `conditions`. Les listes de familles, de technologies, etc.
utilisent `id`. Les drapeaux s’expriment par leur état. Les détails portent
une valeur textuelle ou une liste de valeurs. Les mesures sont des listes
d’assertions, ce qui permet de conserver plusieurs modes. Une valeur numérique
s’écrit `{ value, unit }` ou `{ min, max, unit }`. Les conditions peuvent
indiquer le mode, la fréquence d’échantillonnage en kHz ou le contexte de mesure.

| État | Sens |
|---|---|
| `present` | Présence documentée, avec source et confiance `verified` ou `reported`. |
| `absent` | Absence documentée, avec les mêmes exigences de provenance. |
| `unknown` | Information inconnue. Une propriété omise a ce sens par défaut. |
| `not-applicable` | Critère explicitement sans objet pour le cas décrit. |
| `pending` | Information à confirmer. Un tag automatique sourcé reste à confirmer, avec confiance `reported`. |
| `estimated` | Estimation explicite, avec confiance `estimated` et conditions si connues. |

`normalizeClassification(plugin)` valide une classification v1 déjà fournie
et la conserve. Pour une fiche historique, il retourne une vue enrichie en
mémoire qui conserve tous les champs originaux. Les correspondances directes
reprennent le classement avec sa preuve. Les anciennes cases ambiguës
restent sans traitement sauf désignation explicite suffisamment précise.
StandardCLIP s’appuie sur la déclaration de l’éditeur stockée dans la
description. Les racks peuvent recevoir un format lorsqu’il est attesté,
sans attribution automatique des traitements intégrés. Les tags non projetés,
notamment les critères descriptifs, restent accessibles dans la fiche originale.

La lecture des latences reprend les valeurs à 48 et 96 kHz liées à une source
et à une fréquence, avec leurs unités et modes. Les annonces sans fréquence
et les extraits suspects restent dans les champs historiques. Un mode à zéro
échantillon conserve sa condition. Une mesure omise reste inconnue.

Les nouveaux modules sont autonomes. Le site, le comparateur et la collecte
continuent à lire les champs historiques à cette étape.
