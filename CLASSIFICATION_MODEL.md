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

## Production transitoire — étape C

La collecte rapproche les fiches par ID ou par URL unique chez le même
éditeur. Elle conserve les fiches historiques, y compris les alias et les
exclusions. Les enrichissements continuent d’appliquer les preuves et les
corrections historiques pour les lecteurs actuels. Les valeurs de latence
manquantes dans un relevé partiel conservent leurs valeurs documentées.
Les relevés de sources différentes ne sont pas fusionnés sous une même
source. Une preuve historique devenue inactive à la réévaluation est
conservée dans `unverifiedFeatureEvidence`, hors des critères actifs.

`scripts/audit-catalog.mjs`, exécuté après les enrichissements par le workflow
manuel, matérialise la classification v1 des fiches qui en sont dépourvues
via `normalizeClassification`. Il publie le vocabulaire dans
`meta.classification` et maintient les libellés historiques dans `meta.labels`.
Une classification déjà renseignée reste prioritaire, même si une déduction
historique change. Un classement sans traitement établi ou une divergence
entre les deux modèles est signalé dans les rapports d’audit. Les traitements
secondaires et les cas ambigus demandent une correction explicite.

Une future entrée `classification` d’override utilise le même schéma v1.
La fusion exige des assertions vérifiées et sourcées. Elle combine les
traitements par type, les listes par ID, les fonctions par clé et les
mesures par critère, unité et conditions. Une correction remplace uniquement
les assertions qu’elle cible. Les identifiants et les champs opaques de la
fiche restent disponibles. Les rapports de présentation et de prix
réécrivent leurs propres champs en conservant le bloc de classification.

Le nettoyage des anciens zéros s’applique aux paires 48/96 kHz au format de
l’ancien extracteur et sans source dans les cellules. Il vérifie tous les
relevés, dont `latencyInfo.reports`, avant d’écarter une valeur. Une annonce
qualitative identifiable peut expliquer un zéro synthétique. En l’absence
d’une provenance suffisante, ou si les preuves divergent par fréquence ou
mode, la valeur d’origine est gardée dans `latency[rate].history` et signalée
par `conflict`. Elle ne renseigne alors pas le zéro global courant. Une
paire sans marquage d’origine peut rester impossible à attribuer avec certitude.

`latency-resolution.mjs` résout les relevés pour l’extraction, la fusion, le
nettoyage, la projection v1 et l’audit. Les relevés indépendants restent dans
`latencyInfo.reports` ou dans l’historique d’une cellule. La résolution
compare les mesures de même fréquence, portée, mode, unité et conditions.
Une preuve revue ou un tableau officiel prime sur une affirmation plus
faible. La date départage des relevés comparables de la même source.
Des valeurs contradictoires sans priorité établie donnent une cellule de
conflit dont la valeur globale est inconnue. Les modes indépendants et
résolus restent disponibles. L’audit peut retrouver le conflit dans les
relevés même sans cellule. Les unités et contextes incompatibles restent
en revue sans conversion automatique.

Les données par mode sont résolues à partir des observations courantes et
historiques, regroupées par fréquence, libellé, unité et conditions. La
fiabilité et la date servent uniquement au sein d’une même portée. Une valeur
globale ou à mode inconnu reste distincte des variantes nommées. Un relevé
peut préciser plusieurs modes dans `conditions.modes` ou les exposer en
variantes distinctes. Les conflits par mode restent dans l’historique et
l’audit indique leur fréquence et leurs libellés. Les modes résolus restent
disponibles pour cette même fréquence, avec une valeur globale indisponible.
Le relevé principal et les citations sont sélectionnés de manière
déterministe. Un relevé chiffré n’est éligible comme résumé que si ses
valeurs et sa portée correspondent au résultat résolu. Sans relevé
éligible et en présence d’un conflit, le résumé signale l’incertitude et
garde les citations d’origine, sans publier de valeur globale.
