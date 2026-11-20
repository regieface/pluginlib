# L-Prep — Vision fonctionnelle et décisions de conception

> **Référence canonique de la conception** — v1.1, 20 novembre 2026
> **Dépôt :** `regieface/pluginlib` — **Périmètre :** L-Prep, LPC et bibliothèque personnelle PluginLib
> **État du développement :** voir [`L-PREP-STATE.md`](L-PREP-STATE.md). Une décision validée ici ne prouve ni son implémentation ni ses tests.

## 0. Règle de lecture et préséance

- **Validée** : choix fonctionnel actuellement applicable, confirmé par l'utilisateur le 20/11/2026 ou repris explicitement d'une décision toujours compatible. **Pas nécessairement développé.**
- **À concevoir** : modalités, interface ou faisabilité à préciser ; aucune solution technique imposée.
- **Reportée** : intention conservée après la V1, sans date ni garantie.
- **Abandonnée/remplacée** : décision qui ne doit plus guider le développement ; son historique est conservé ci-dessous.
- **Développée/testée** : états **réservés à `L-PREP-STATE.md`**, avec référence de code et preuve de validation.

En cas de contradiction, les **décisions datées les plus récentes de ce document** prévalent sur les orientations anciennes de [`../PRODUCT_VISION.md`](../PRODUCT_VISION.md). Pour les faits techniques, la branche et le code vérifiés prévalent sur les descriptions. Ne pas réécrire le code au prétexte de mettre à jour cette vision.

## 1. Produits, responsabilités et principes communs

### L-Prep — constructeur de sessions

**Validé.** Application de préparation **hors ligne** de sessions LiveProfessor (LP), avec **import et export manuels de fichiers `.rack2`**. L'utilisateur prépare, visualise et ajuste une structure dans un constructeur visuel : chaînes, plugins de sa collection, entrées/sorties, connexions audio, patch, AutoPatch et modèles réutilisables. Un même modèle cohérent doit alimenter les différentes vues, sans créer des représentations concurrentes.

- Pas de connexion/synchronisation temps réel ni de synchronisation bidirectionnelle automatique avec LP.
- Pas de gestion d'un parc de machines, d'inventaires « par ordinateur » ni de conversion automatique AU ↔ VST3. **Les entrées et sorties sont définies par session** ; d'éventuelles structures techniques historiques « machine/environnement » sont à examiner avant migration.
- Pas d'édition des **paramètres audio internes des plugins** depuis L-Prep. Les plugins restent identifiables et leurs états encapsulés, mais non modifiés arbitrairement.
- Conserver **les originaux `.rack2`**, les états opaques AU/VST3, les snapshots, les données MIDI et toutes les sections inconnues. Toute édition est explicite, conservatrice, contrôlée et **exportée sous une copie distincte**. Les versions/fonctions non éprouvées sont refusées plutôt que réécrites par supposition.
- Possibilité de travailler dans LP après import ; pas de changement silencieux de la session LP ouverte.
- Conserver les outils existants du constructeur plutôt que créer des moteurs parallèles pour le natif et le modèle JSON. Les adaptations doivent être documentées et testées.

### LPC — L-Prep Controller

**Validé :** l'ancien nom **PLC** est remplacé par **LPC — L-Prep Controller**. LPC est une **application indépendante** de L-Prep, utilisable pendant le concert **sans lancer L-Prep** et sans imposer de connexion à sa bibliothèque.

- Prioritaires : contrôle de LiveProfessor et des plugins actifs, transport/feedback MIDI, profils de plugins et de surfaces de contrôle, ciblage sûr de l'instance et préservation du travail déjà réalisé (notamment les profils et expériences F6).
- **Cible active :** la GUI du plugin **ouverte, affichée et effectivement active** dans LiveProfessor. Sélectionner seulement un plugin dans la liste d'une chaîne ne suffit pas. Si plusieurs GUI sont ouvertes, **une seule instance active** reçoit les commandes ; jamais toutes les instances d'un même plugin. Les modifications doivent correspondre à la GUI regardée.
- **Changement automatique et immédiat de cible et de profil** lorsque la GUI active change, sans opération manuelle dans LPC ; s'il manque une preuve fiable de l'instance ou du profil, refuser le mapping plutôt que piloter la mauvaise cible.
- **Profils réutilisables par plugin**, indépendants d'une session LiveProfessor et partageables avec les outils de préparation sans dépendance d'exécution à L-Prep. Distinguer description des paramètres du plugin, profil de contrôle, mapping du contrôleur et liaison à l'instance cible. Plusieurs pages par plugin sont possibles.
- **Sécurité des mappings :** la création et toute reconfiguration sont volontaires, avec sauvegarde préalable et validation ; ne pas déduire un état confirmé d'un simple message envoyé. Préserver les protections AX/MIDI/OSC déjà développées et l'historique de validation F6, sans les déclarer achevées.
- **X-Touch Mini, ergonomie validée :** huit encodeurs pour les paramètres du plugin actif ; seize boutons inférieurs pour ses fonctions ; bouton **A = page précédente**, bouton **B = page suivante** (navigation entre pages utilisées, sans pages vides). Les poussoirs des encodeurs, le fader et certains retours visuels restent à concevoir. Vérifier les messages réels en mode MC/Mackie Control, sans présumer des layers A/B ordinaires.
- **Pas de gestion générale des cues ni des ViewSets par LPC** ; ils restent hors de son périmètre. Ne pas réintroduire de bascule « Plugin/LiveProfessor » sur les boutons.
- Les informations de profil peuvent être préparées et réutilisées entre applications, **sans dépendance d'exécution** ; aucune transmission ou écriture structurelle silencieuse dans LP.
- L'éditeur graphique avancé de surfaces MIDI est **reportable** après la V1.
- LPC reste agnostique vis-à-vis du matériel ; l'actuel X-Touch Mini est une référence de test, non une restriction produit.

### PluginLib — bibliothèque personnelle

**Validé :** le **catalogue général ne doit plus être accessible depuis L-Prep**. La partie utile à L-Prep est la **bibliothèque des plugins personnels**, avec des droits explicites et des informations sourcées. Le site/catalogue historique du dépôt n'est **pas à supprimer ni à migrer immédiatement** : procéder à un audit de dépendances et à une migration non destructive.

- Constituer d'abord la collection par **import manuel CSV iLok** ; ne pas présumer d'une synchronisation API iLok ni de droits à partir d'une simple installation. **Validation groupée** du lot après aperçu des ajouts/changements ; chaque correspondance **ambiguë** (identité de plugin, édition, bundle, licence) exige un **examen individuel** et une décision humaine, jamais une fusion silencieuse.
- Ajouter une référence par **nom** ou **URL officielle**, proposer un enrichissement assisté, afficher les sources, séparer fait/vérifié/à confirmer/inconnu ; **validation humaine avant ajout ou modification sensible**.
- Un plugin peut posséder **plusieurs droits/licences indépendants** (perpétuels, abonnements, bundles, etc.) ; les conserver séparément avec leurs sources et leur historique. Si **au moins un droit valide subsiste**, le plugin reste dans la collection active, même si un autre droit cesse d'être valable.
- **Ne jamais déduire une expiration ou une perte de droit** de l'absence d'une licence dans un nouveau CSV iLok, d'une date d'expiration incertaine ou d'une information manquante : conserver le statut antérieur ou signaler « à vérifier ». Aucun retrait automatique sur présomption.
- **Archiver seulement lorsqu'il est établi qu'aucun droit valide ne subsiste**, avec validation et sans perte de données. Conserver fiches, licences, observations, incidents, références de profils LPC et historique. Un plugin commercialement abandonné peut rester actif si sa licence l'est.
- **Gestion avancée des abonnements : reportable** après V1. Ne pas supprimer les mécanismes actuels avant migration vérifiée.
- **Destination après migration sûre :** retirer le catalogue général historique du **périmètre actif** des applications concernées. Il ne doit pas subsister comme **bibliothèque cachée permanente**. Avant toute dépose : auditer ses consommateurs, migrer non destructivement les données et dépendances utiles, démontrer la parité puis décider explicitement de l'archivage/suppression du code devenu inutile. **Aucune suppression de données ni de code maintenant.**
- Métadonnées techniques sourcées (fabricant, URL, images, traitement, latences 48/96 kHz quand connues, modes, fiabilité, etc.), sans inventer de caractéristiques. Préserver les mesures personnelles, leurs conditions et les avertissements de fiabilité live.
- Le classement des traitements PluginLib demeure **type de traitement → famille/sous-type facultatif → caractéristiques pertinentes**. Ne pas réintroduire « Analog Modeled Plugins » ou « Surround » comme familles de traitement. **Ne pas confondre cette taxonomie avec les neuf familles musicales de chaînes L-Prep.**

## 2. Gestionnaire des familles musicales de chaînes L-Prep

### 2.1 Familles et couleurs

**Validées : neuf familles principales**, dans cet ordre de référence initial (ordre réorganisable par l'utilisateur) :

1. RYTHMIQUE
2. BASSE
3. KEYS / SYNTH
4. GUITARES
5. INSTRU
6. CUIVRES / VENTS
7. VOIX
8. FX
9. MONITORING

**Sous-familles déjà validées — état du référentiel existant vérifié dans `COLOR_GROUPS` au commit `db35382` :**

| Famille musicale | Sous-familles / variantes reconnues |
| --- | --- |
| RYTHMIQUE | **DRUM**, **PERCUS**, **SPD** |
| BASSE | **BASS**, **SYNTH BASS**, **SUB** |
| KEYS / SYNTH | **KEYS**, **SYNTH**, **SAMPLES** |
| GUITARES | **GTR ÉLECTRIQUE**, **GTR ACOUSTIQUE**, **AUTRES GTR** |
| INSTRU | **INSTRU**, **CORDES**, **AUTRES INSTRU** |
| CUIVRES / VENTS | **CUIVRES**, **SAX / BOIS**, **AUTRES VENTS** |
| VOIX | **LEAD**, **BV / CHŒURS**, **VOIX FX** |
| FX | **REVERB**, **DELAY**, **AUTRES FX** |
| MONITORING | **Aucune sous-famille** : une seule entrée technique `MONITORING` dans la palette actuelle, sans subdivision à créer |

**Particularités validées :** **LEAD blanc (`#ffffff`)** ; autres voix **bleues** (BV / CHŒURS et VOIX FX) ; MONITORING sans sous-famille. Les **valeurs numériques exactes des couleurs ont été vérifiées** dans le module existant [`../lprep/lprep-chain-colors.mjs`](../lprep/lprep-chain-colors.mjs), `COLOR_GROUPS` et `COLOR_CATEGORIES` au commit `db35382`. **Ce module demeure la source technique des couleurs** : ne pas dupliquer une seconde palette ni modifier des valeurs au cours de la documentation. Les choix manuels de couleur et d'ordre priment sur les automatismes.

**Deux axes indépendants à ne pas confondre :** la **famille musicale** (RYTHMIQUE, VOIX, etc.) classe et colore une chaîne d'après son nom ; le **rôle technique** (`Insert`, `FX`, `Monitoring`) décrit sa fonction dans le graphe/routage audio. Ni l'un ni l'autre ne déduit le format mono/stéréo. Le code actuel possède aussi `ROLE_DEFAULT_COLORS` et un comportement prioritaire de certains rôles : auditer cet arbitrage avant d'implémenter les nouvelles règles, sans supposer qu'une famille et un rôle sont interchangeables.

Les **familles, sous-familles, labels et synonymes** se configurent dans les **Paramètres**. Les sous-familles structurent l'identification/couleur, **pas** un second tri automatique. Ne pas reclasser ni recolorer rétroactivement les sessions anciennes lors d'une mise à jour du dictionnaire.

### 2.2 Reconnaissance hors ligne des noms

**Règles validées :**

- Analyse automatique **locale/hors ligne**, sans dépendance serveur.
- **Le premier label reconnu dans le nom, de gauche à droite, détermine la famille.** Il ne s'agit pas de la première catégorie dans une liste de priorité interne.
- Les mots inconnus précédant le premier label reconnu **n'empêchent pas** sa reconnaissance : **aucune interruption** ni fenêtre d'erreur si un label reconnu se trouve plus loin dans le nom.
- Les **expressions composées explicitement définies** sont reconnues en tant que telles. La résolution exacte d'éventuels chevauchements à même position reste à spécifier (voir questions ouvertes).
- Si **aucun label** n'est reconnu, **dès la validation du nom**, proposer immédiatement une **correction orthographique**, une **association à une famille existante** ou **Ignorer**. Ne pas attendre la création finale de la session pour signaler un nom inconnu ; en ajout groupé, voir la fenêtre commune de vérification à §3.
- Une correction orthographique acceptée **modifie le nom** de la chaîne et **n'ajoute pas** de label. **Aucun label ou synonyme nouveau n'est enregistré sans validation explicite.**
- Renommer une chaîne relance la reconnaissance et propose/applique sa couleur automatique **sauf couleur manuelle prioritaire**, **sans déplacer la chaîne**.
- Nouvelles chaînes : insertion selon **l'ordre personnalisable des familles** ; **à l'intérieur d'une famille, conserver l'ordre de création**. Les déplacements manuels sont prioritaires.
- **L'AutoPatch dépend exclusivement de l'ordre visuel réel** des chaînes, non d'un ordre recalculé par familles ou labels.
- **Interdiction de déduire ou modifier le format mono/stéréo à partir d'une famille, d'un label ou d'un nom.** Les formats sont des décisions explicites de session.

### 2.3 Compatibilité avec l'implémentation actuelle

Le module historique de couleurs fait déjà de la reconnaissance d'alias et dispose des neuf familles ; sa logique actuelle privilégie certains alias personnalisés ou catégories prédéfinies. **Elle n'implique pas que la règle « premier label de gauche à droite » est déjà réalisée.** Avant toute adaptation : auditer les priorités, les surnoms composés, la provenance d'une couleur manuelle et les tests de non-régression. **Aucune modification ici ne doit interrompre le chantier `.rack2`.**

## 3. Création de session et ajout groupé

**Validé :**

- Réutiliser **le même tableau de création de session** pour **ajouter plusieurs chaînes** dans une session existante. Les capacités du tableau d'origine sont conservées dans les deux contextes (noms, rôles/formats explicites, couleurs, possibilités existantes), sans doublon de logique.
- Permettre le **glisser-déposer des lignes** dans les deux tableaux : création et ajout groupé.
- Pendant un ajout groupé, regrouper les labels inconnus dans **une seule fenêtre de vérification** (correction, association, ignorer), plutôt que des dialogues répétés.
- L'ajout conserve **toutes les chaînes, connexions et affectations préexistantes**, sans changement implicite de l'ordre manuel ni des états opaques.
- **Création transactionnelle du lot — décision validée :** si une erreur bloquante subsiste, **aucune chaîne du lot n'est créée partiellement** ; toutes les validations obligatoires précèdent la création, et un échec doit préserver l'état antérieur. Cela s'applique à la création groupée de session et à l'ajout groupé. **La stratégie technique et l'ergonomie de confirmation/annulation restent à concevoir.**
- **Pas de boutons `+` entre les chaînes** du constructeur.

**À concevoir :** disposition de la fenêtre collective de vérification, traitement des doublons/collisions, aperçu du placement, mécanisme transactionnel, rollback et modalités d'annulation. Les détails ne sont pas des choix techniques déjà validés.

## 4. Routage audio, Patch et modèles

- **Validé :** représentation explicite des ports, canaux, destinations, chaînes, routages et AutoPatch. Différencier chemin principal, auxiliaires et sidechains si le format le permet réellement ; éviter toute modification non demandée.
- **Validé :** les entrées/sorties, formats mono/stéréo et ressources sont configurables **par session**. Ni famille ni label ne déterminent la largeur audio.
- **Validé :** les modèles de chaînes / ensembles de chaînes et routages sont réutilisables ; préserver ce qui est techniquement récupérable. Le détail d'un rappel partiel des états reste **à concevoir/tester**, non promis en V1.
- **Validé :** le Patch natif `.rack2` et l'import/export sûr sont **prioritaires immédiatement** ; construire d'abord des opérations minimales prouvées par tests, puis les relier à l'UI.
- **À concevoir :** gestion des connexions complexes/multicanaux, sidechains, différences entre snapshots, représentation des ambiguïtés, règles de création/suppression de points ; les fichiers incompatibles restent en lecture seule.

## 5. Priorités et frontière V1

| Priorité | Périmètre | Statut produit |
| --- | --- | --- |
| P0 — Continuité | Sécurisation `.rack2` : lecture, copie, métadonnées, Patch natif et tests réels LP | **En cours en développement** (voir STATE) |
| P0 — LPC | Maintenir le contrôle LiveProfessor, MIDI et profils, poursuivre les validations F6 sans détruire les acquis | **Priorité majeure parallèle** |
| P1 — L-Prep | Constructeur visuel fiable, chaînes, formats explicites, AutoPatch, modèles, import/export manuel | **Socle V1** ; état détaillé dans STATE |
| P1 — Bibliothèque | Collection personnelle, import CSV iLok manuel, enrichissement sourcé et validation | **Socle V1**, migration à planifier |
| P1 — Familles | Reconnaissance hors ligne, Paramètres, ordre, couleur manuelle, vérification labels inconnus | **Planifier progressivement**, sans bloquer P0 |
| P1 — Lot | Réutilisation du tableau pour ajout groupé et réordonnancement des lignes | **À intégrer après cadrage** |
| P2 — Après V1 | Éditeur graphique MIDI avancé, abonnements avancés, analyse CPU/latence, comparaison et diagnostics enrichis | **Reportables / à reprioriser** |

La migration de l'ancien catalogue global doit être **non destructive après audit des dépendances** : conserver données et fonctionnalités historiques tant que les usages actuels ne sont pas remplacés et vérifiés. **L'état final visé est son retrait du périmètre actif**, sans catalogue caché permanent. Aucune suppression massive du code ou des données sur la seule base de la vision.

## 6. Orientations remplacées ou abandonnées

| Ancienne orientation | Décision actuelle | Source historique |
| --- | --- | --- |
| « PluginLib » comme application globale de catalogue et conception de mix | **L-Prep** = constructeur ; **PluginLib personnel** = bibliothèque de L-Prep ; **LPC** = contrôleur indépendant | `PRODUCT_VISION.md`, sections 1–5 |
| PLC / PluginLib Controller (nom provisoire) | **LPC / L-Prep Controller** (nom validé) ; préserver les chemins et identifiants techniques jusqu'à migration explicite | `PRODUCT_VISION.md`, sections 4–5 |
| Synchronisation structurelle bidirectionnelle LP ↔ application | **Écartée du périmètre** : import/export manuel `.rack2` ; pas de sync temps réel | `PRODUCT_VISION.md`, 3.2 et 5 |
| Catalogue global consultable depuis L-Prep | **Bibliothèque personnelle uniquement** dans L-Prep ; après migration sûre, retrait du catalogue général du périmètre actif, **pas** de bibliothèque cachée permanente ; aucune suppression immédiate | `PRODUCT_VISION.md`, 2.1–2.3 |
| Détection/synchronisation iLok automatique envisagée | **Import manuel CSV iLok prioritaire** ; éventuelle automatisation non engagée | `PRODUCT_VISION.md`, 2.4 |
| Gestion de plusieurs machines, profils d'inventaire par ordinateur | **Abandonnée** pour L-Prep ; entrées/sorties définies par session | Structures techniques actuelles de L-Prep |
| Conversion AU/VST3 automatique | **Abandonnée** | Nouvelle décision du 20/11/2026 |
| Edition des paramètres internes des plugins depuis L-Prep | **Hors périmètre** ; états préservés de façon opaque | Nouvelle décision du 20/11/2026 |
| Déduire automatiquement mono/stéréo d'une famille ou d'un label | **Abandonné explicitement** ; format saisi explicitement | Nouvelle décision du 20/11/2026 |
| Tri automatique à l'intérieur d'une famille | **Écarté** : conserver l'ordre de création, sauf déplacement manuel | Nouvelle décision du 20/11/2026 |
| Ajouter des boutons `+` entre chaînes | **Écarté** : tableau commun et ajout groupé | Nouvelle décision du 20/11/2026 |
| PLC contrôleur général des cues et ViewSets | **Toujours écarté** : LPC centré plugins/MIDI ; ne pas réintroduire une intégration console particulière | `PRODUCT_VISION.md`, 4.1/8 |
| Suggestions de latence/CPU, analyse sidechain, « Save All Recall Partial » comme livrables immédiats | **À requalifier ultérieurement** ; conserver l'idée si compatible, sans la présenter comme V1 validée | `PRODUCT_VISION.md`, 3.3–3.6 |

Les règles historiques compatibles (fiabilité live, ciblage d'une instance, niveaux de preuve, protection des profils, mesures sourcées) demeurent des **principes de précaution** et non des fonctionnalités considérées comme livrées.

## 7. Questions ouvertes et sujets de conception

1. **Chevauchement de labels** : si deux règles débutent au même caractère, comment départager un label composé explicite et un synonyme court ? Proposition à valider : préférer la plus longue expression explicite à position égale, sans modifier la règle globale gauche → droite.
2. **Preuve de couleur manuelle** : où mémoriser ce choix pour qu'un renommage ou un import ne l'efface pas, tout en préservant les `.rack2` ?
3. **Fenêtre de vérification d'ajout groupé** : ordre, annulation, erreurs partielles, correction orthographique versus association ; quel niveau de prévisualisation ?
4. **Migrations** : comment démanteler progressivement les notions « machine » et catalogue global dans l'UI de L-Prep sans supprimer des projets, ressources ni réglages existants ?
5. **Patch `.rack2` complexe** : étendre les opérations testées au-delà du format LP 2026.1.0 sans altérer snapshots, points MIDI ou données inconnues ; validation manuelle LP obligatoire.
6. **LPC** : maintenir les profils historiques pendant le renommage public ; planifier la vérification OSC/AX et les capacités réelles de LiveProfessor actuel ou futur.
7. **Après V1** : arbitrer l'intérêt du tableau de raccordement, de l'analyse de latence/CPU, de l'éditeur MIDI avancé et de la gestion fine des abonnements.

### Prochaine décision de conception proposée

**Valider l'ergonomie et le contrat de la fenêtre commune de vérification des labels inconnus**, y compris les collisions de labels composés et la persistance d'une couleur manuelle. **Ne pas traiter cette décision avant la stabilisation du chantier `.rack2` en cours si cela risque d'interrompre le développement.**

## 8. Références, compatibilité et journal

- **Canonique conception :** ce fichier `docs/L-PREP-VISION.md`.
- **Canonique technique et reprise :** [`docs/L-PREP-STATE.md`](L-PREP-STATE.md).
- **Héritage produit :** [`PRODUCT_VISION.md`](../PRODUCT_VISION.md), v0.1 du 17/11/2026. Il contient des détails historiques utiles, **non prescriptifs** lorsqu'ils divergent de ce document.
- **Architecture :** [`ARCHITECTURE.md`](../ARCHITECTURE.md) ; **état/tâches historiques :** [`STATUS.md`](../STATUS.md), [`TASKS.md`](../TASKS.md) ; **modèle de classement des traitements PluginLib :** [`CLASSIFICATION_MODEL.md`](../CLASSIFICATION_MODEL.md).
- La palette source de L-Prep ne doit pas être copiée en constantes dans les documents : [`lprep/lprep-chain-colors.mjs`](../lprep/lprep-chain-colors.mjs).

**Journal des décisions**

- **2026-11-17** — Ancienne vision `PRODUCT_VISION.md` v0.1 : catalogue global et PLC ; certaines orientations sont désormais remplacées.
- **2026-11-20** — Consolidation des décisions de « Vision & Conception » : L-Prep hors ligne `.rack2`, LPC autonome, bibliothèque personnelle, neuf familles et reconnaissance gauche→droite, ajout groupé, formats explicites, suppression des orientations écartées.
- **2026-11-20 (révision v1.1)** — Sous-familles vérifiées dans la palette existante, rôles distincts, clarification de la reconnaissance des noms, création groupée transactionnelle, héritage LPC préservé, gestion prudente des droits iLok et retrait futur du catalogue général actif. **Aucun changement fonctionnel dans cette révision documentaire.**
- **2026-11-20** — Création de deux références canoniques séparées (vision / état). Cette mise à jour **ne modifie pas le code** et ne prouve pas l'intégration des nouvelles décisions.

**Entretien :** mettre à jour ce document à chaque décision validée/abandonnée importante et avant passation ; reporter dans `STATE` toute décision reçue mais encore non intégrée. Les documents historiques ne doivent pas être effacés ni servir de deuxième source de vérité active.
