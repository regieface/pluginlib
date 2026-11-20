# L-Prep — État technique et passation

> **Référence canonique du développement** — v1.3, 20 novembre 2026
> **Vision applicable :** [`L-PREP-VISION.md`](L-PREP-VISION.md), version **1.2 du 20/11/2026**
> **Périmètre :** dépôt `regieface/pluginlib` (L-Prep, LPC, bibliothèque PluginLib). Ce document enregistre des **faits observés**, des **résultats rapportés** et des **points inconnus** séparément.

## 0. Synthèse de reprise — à lire en premier

- **Chantier actif :** `RACK2-PATCH-01` — **édition conservatrice des connexions audio existantes** dans un `.rack2` natif. **Ce n'est pas** l'ancien jalon « S2 — création de sessions ».
- **Références Git confirmées le 20/11/2026 :** branche `main`, **dernier commit publié `4de503f`** (`docs: finalize L-Prep continuity v1.2`), confirmé par le `git push` du Terminal utilisateur et consulté sur GitHub ; **dernier commit fonctionnel publié `db35382`** (`L-Prep: add rack2 session reader and native workspace`). Le moteur de reroutage reste **local, non commité** ; `0f2440c` et `4de503f` sont des commits documentaires.
- **Modifications locales :** au dernier relevé `git status` transmis **avant les deux correctifs**, `lprep/lprep-rack2-native.mjs` (+117 lignes), `scripts/lprep-rack2-native.test.mjs` (+60 lignes) et `note.md` (+2 lignes) : **3 fichiers modifiés, 179 insertions**. Depuis, **deux patchs correctifs ciblés ont été appliqués au module natif**, d’après les résultats des tests. **Aucun nouveau `git status` / `git diff --stat` n’a été communiqué après leur application** : ne pas traiter les anciennes statistiques comme le diff actuel. Préserver les trois fichiers. L’état du disque n’a pas été inspecté directement par Dev.
- **Bugs de test résolus dans l’état local exécuté :** `ReferenceError: connection is not defined`, puis rejet erroné d’invariants dû à une comparaison `JSON.stringify()` sensible à l’ordre des propriétés. Les **trois tests expérimentaux de reroutage passent** désormais. Cette réussite ne prouve pas la compatibilité du fichier exporté avec le **vrai LiveProfessor**. `note.md` reste exclu des commits.
- **Derniers tests réellement exécutés et communiqués par l’utilisateur le 20/11/2026 :** **20/20** sur `node --test scripts/lprep-rack2-*.test.mjs` et **401/401** sur `node --test scripts/*.test.mjs` (tests directement sous `scripts/` correspondant au glob). **Aucun échec** dans ces deux sorties ; tests automatisés seulement. Voir §4.
- **Prochaine action exacte :** mettre à jour ce document, **revérifier le `git status` et les diffs locaux sans les modifier**, puis proposer un **commit de jalon** avec autorisation explicite ; ensuite préparer le raccordement au constructeur visuel et la validation dans le **vrai LiveProfessor sur copies**. Le chantier `RACK2-PATCH-01` n’est **pas terminé**. Voir §9 ; aucune réinitialisation ni écrasement.
- **Nouvelles décisions produit non intégrées :** neuf familles/sous-familles configurables, première correspondance gauche→droite, validation immédiate des noms inconnus, formats explicites, **lots transactionnels**, retrait futur du catalogue général après migration, collection iLok à droits multiples, LPC indépendant avec ciblage GUI/profils sécurisés. Voir §7 et la Vision.

## 1. Sources examinées et degré de preuve

### A. Dépôt distant réellement consulté

- Historique GitHub `main` du 20/11/2026 : commit documentaire [`0f2440c`](https://github.com/regieface/pluginlib/commit/0f2440c), puis publication documentaire v1.2 [`4de503f`](https://github.com/regieface/pluginlib/commit/4de503f) (push confirmé par le Terminal utilisateur) ; dernier commit de code fonctionnel publié [`db35382`](https://github.com/regieface/pluginlib/commit/db35382). Références canoniques et bannières existantes conservées.
- Documents racine examinés : `PRODUCT_VISION.md` (v0.1 du 17/11), `STATUS.md`, `TASKS.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CLASSIFICATION_MODEL.md`, `README.md`.
- Code source du dépôt distant consulté : `lprep/app.mjs`, `lprep/lprep-rack2-reader.mjs`, `lprep/lprep-rack2-native.mjs`, `lprep/lprep-rack2-workspace.mjs`, `lprep/lprep-chain-colors.mjs`, `lprep/lprep-session-draft.mjs`, `lprep/lprep-audio-graph.mjs`, `lprep/lprep-patch-edit.mjs`, `lprep/lprep-patch.mjs`, et tests `.rack2` publiés.
- **Limite** : une consultation GitHub ne donne **ni le `git status` Mac, ni l'arbre non commité**, ni les fichiers de session réels. Les éléments locaux proviennent de messages de l'utilisateur. Aucun test n'a été exécuté par l'assistant sur le dépôt local dans cette opération documentaire.

### B. Éléments rapportés par l'utilisateur, non revérifiés dans son arbre actuel

- `git commit` et `git push` réussis de `db35382`, `0f2440c`, puis **`4de503f`** sur `main` ; dernier push `0f2440c..4de503f main -> main` communiqué par l’utilisateur. Pas de nouvelle inspection de la branche locale depuis ce push.
- Installation locale de Node `v26.13.1`, npm `11.20.0` (ancienne documentation `AGENTS.md` parlant d'un Node absent du PATH au 16/11 désormais obsolète pour ce Mac, **à recontrôler si environnement différent**).
- Avant le patch expérimental : **17/17 tests natifs réussis**.
- **Après le premier patch local :** **18/20**, avec deux échecs identiques ; après deux correctifs successifs : **20/20 ciblés**, puis **401/401 tests de régression** (voir §4).
- **Dernière inspection locale communiquée :** `git status --short`, `git diff --stat`, `git diff --check` et `git log -1 --oneline` confirment **3 fichiers modifiés / 179 insertions**, `main` à `0f2440c` et aucune erreur de whitespace rapportée. Cette preuve vient du **Terminal utilisateur**, non d'une inspection directe par Dev. Le `git diff` des deux modules a été transmis seulement en **extrait** : il ne prouve pas la présence ou l'absence de toutes les lignes du correctif.
- **Exécutions postérieures à v1.2 :** premier correctif : `connection is not defined` disparaît, mais les deux tests refusent à tort les invariants ; second correctif : **20/20 tests natifs réussis** ; enfin **401/401** sur `node --test scripts/*.test.mjs`. Sorties complètes transmises par l’utilisateur. Aucun contrôle du diff final local ou test d’ouverture dans LiveProfessor encore communiqué.

## 2. Topologie du dépôt et responsabilité des composants

| Composant | Sources existantes | État établi sur `main` | Limites |
| --- | --- | --- | --- |
| **L-Prep (web / constructeur)** | `lprep/`, `lprep/app.mjs`, `lprep/lprep-*.mjs`, `lprep/index.html`, `lprep/styles.css` | Constructeur UI, révisions/JSON, session et graphe audio, AutoPatch, glisser-déposer, couleurs et opérations de patch du modèle interne présents dans le code | Ne pas confondre moteur du modèle JSON avec le sérialiseur natif `.rack2` |
| **Lecture `.rack2` native** | `lprep/lprep-rack2-reader.mjs` | Lecture ValueTree, chaînes, formats, plugins AU/VST3 référencés, points `AudioPatch` audio, sans parcourir les chunks opaques | La lecture d'autres versions LP ne vaut **pas** autorisation d'écriture |
| **Métadonnées `.rack2` natives** | `lprep/lprep-rack2-native.mjs`, `lprep/lprep-rack2-workspace.mjs` | Réécriture contrôlée noms/couleurs/ordre, conservation du reste ; téléchargement d'une copie dans l'UI | Sur `main`, **pas d'édition du Patch natif** ; le code local expérimental n'y est pas publié |
| **LPC (ancien code PLC)** | `controller/`, `controller/Profiles/`, `controller/Metadata/`, `controller/F6_VALIDATION.md` | Application macOS Swift distincte, profils, MIDI/OSC/AX et essais F6 historiques documentés | Nom public LPC nouvellement validé ; état de la compilation actuelle **non retesté** ici |
| **PluginLib historique** | racine `index.html`, `app.js`, modules collection/catalogue, `data/`, `scripts/`, `sources/` | Catalogue/site/collection historiques et classification des traitements présents | Nouvelle cible « bibliothèque personnelle dans L-Prep » **non migrée** ; auditer les dépendances avant changement |

### Compatibilité des docs existants

- **`PRODUCT_VISION.md`** : **archive de conception v0.1** ; sa synchronisation LP et son catalogue global sont remplacés par la Vision canonique. Conserver pour la traçabilité, éviter de le supprimer.
- **`STATUS.md` / `TASKS.md`** : historique technique et backlog général (notamment **F6 de LPC**) ; leurs phrases « Prochaine tâche » datées du 17/11 ne déterminent **plus** le point de reprise de L-Prep. Ne pas perdre le chantier F6.
- **`ARCHITECTURE.md`** : description de l'architecture historique catalogue/controller et du codec Python. Son « Hors périmètre : traitement ou routage audio » concerne **le contrôleur**, pas le constructeur L-Prep. La section L-Prep devra être actualisée lors d'une révision d'architecture, sans renommer les répertoires.
- **`AGENTS.md`** : consignes techniques existantes toujours utiles ; la bannière vers les deux références canoniques a **été publiée dans `0f2440c`**, sans supprimer les consignes historiques.
- **`CLASSIFICATION_MODEL.md`** : classification **des traitements/plugins** distincte des **neuf familles musicales de chaînes** ; conserver, sans les fusionner.

## 3. Jalons vérifiés sans mélange de numérotation

L'ancienne série **S0/S1/S2/S3** nommait des étapes **de création de session**. Elle ne doit **plus** être réutilisée pour nommer l'édition native du Patch.

| Identifiant | État honnête | Preuve et réserve |
| --- | --- | --- |
| **SESSION-S0-A** — formats audio | Code historique présent | Formats indépendants exposés dans `lprep/lprep-audio-graph.mjs` et `lprep/lprep-session-draft.mjs` ; couverture exhaustive et tests actuels à revérifier |
| **SESSION-S0-B** — AutoPatch partiel | Implémentation historique présente | `lprep/lprep-patch.mjs`, graphe audio, travaux d'interface ; ne pas annoncer toutes les variantes natives prises en charge |
| **SESSION-S1 / S2** — création de session | **Ancien jalon annoncé finalisé** par le commit `6284c43` du 19/11/2026 | Contenu présent dans le constructeur et les modules session ; non retesté ici sur le Mac |
| **SESSION-S3** — cohérence du constructeur | **Ancien jalon annoncé finalisé** par le commit `038365d` du 20/11/2026 | Contredit l'ancienne passation « S3 pas commencé » ; conserver la preuve Git et vérifier les cas d'usage avant fermeture fonctionnelle définitive |
| **RACK2-READ-01** — lecture / workspace natif | **Présent sur `main` ; 17 tests verts avant expérimentation, rapportés** | Commit `db35382`, lecture, protections, panneaux natifs ; validation d'ouverture de copies modifiées en vrai LP restant à établir selon cas |
| **RACK2-META-01** — noms, couleurs, ordre natifs | **Présent sur `main`, tests synthétiques verts rapportés** | Préservation testée octet par octet, rejets de valeurs incohérentes ; ne pas extrapoler au patch audio |
| **RACK2-PATCH-01** — reroutage de destinations de connexions audio existantes | **Moteur local : tests automatisés réussis, chantier en cours** | **20/20** tests ciblés et **401/401** tests `scripts/*.test.mjs` rapportés ; pas encore commité, pas encore validé dans le vrai LP ni raccordé à l’UI native |
| **RACK2-PATCH-02** — UI du patch natif | **Non entamé / non démontré** | À commencer **après** `RACK2-PATCH-01` validé ; réutiliser l'UI, sans modélisation parallèle |
| **RACK2-PATCH-03** — ajout/suppression de connexions | **Futur** | Nécessite formats et invariants prouvés ; pas de mutation silencieuse |
| **LPC-F6-NEXT** — Low Cut / High Cut | **Chantier antérieur à reprendre, pas supprimé** | `STATUS.md`, `TASKS.md`, `controller/F6_VALIDATION.md` ; validations B16 historiques, suite à tester séparément |
| **LIB-MIGRATION-01** — collection personnelle uniquement | **Décision reçue, pas intégrée** | Audit de dépendances puis migration non destructive |
| **FAMILY-01 / BATCH-01** — familles et ajout groupé | **Décisions reçues, non validées en code** | Compatibilités partielles existantes (palette, session draft), nouveau comportement non implémenté dans sa totalité |

**Correctif historique à ne pas perdre :** l’ancienne discussion de développement mentionne un correctif `draft-chain` lié à l’affichage du Patch stéréo. **Statut : antécédent rapporté, non revalidé sur le dépôt local dans cet audit** ; conserver sa traçabilité et vérifier l’état actuel du rendu uniquement si une régression apparaît. Cela ne constitue pas le chantier actif.

## 4. Derniers tests, bugs et risques

### Journal des exécutions **rapportées**

| Date | Commande / portée | Résultat | Fiabilité de l'assertion |
| --- | --- | --- | --- |
| 20/11/2026, avant patch local | `node --test scripts/lprep-rack2-*.test.mjs` | **17/17, 0 échec** | Sortie utilisateur : tests natifs du commit `db35382` |
| 20/11/2026, après premier patch `RACK2-PATCH-01` | Même commande | **20 tests, 18 réussis, 2 échoués** | Sortie utilisateur avant passation |
| 20/11/2026, **après commit documentaire `0f2440c`** | Même commande | **20 tests, 18 réussis, 2 échoués : mêmes erreurs ligne 323** | Historique avant les deux correctifs ciblés |
| 20/11/2026, après correctif `connection` et correctif de comparaison des invariants | `node --test scripts/lprep-rack2-*.test.mjs` | **20/20 réussis, 0 échec** | Sortie Terminal utilisateur (dont 3 tests de reroutage verts) |
| 20/11/2026, régression étendue | `node --test scripts/*.test.mjs` | **401/401 réussis, 0 échec** | Sortie utilisateur fournie en fichier texte ; portée : glob direct `scripts/*.test.mjs` |
| Phases antérieures | Suite plus large Node (jusqu'à **181** tests selon passation conversationnelle antérieure) | **Historique uniquement** | Ni commande ni résultat actuel vérifiés ici ; **ne pas présenter comme bilan de cette branche modifiée** |

**Historique des deux échecs, désormais résolus dans les tests :** les deux scénarios `S2 patch` de reroutage échouaient d’abord sur `ReferenceError: connection is not defined` (ligne 323 de l’ancien extrait). Après ce correctif, le contrôle final rejetait les connexions à cause d’une comparaison `JSON.stringify()` sensible à l’ordre des clés. Un second correctif a conservé le garde-fou en comparant les quatre champs des connexions. Les **20 tests ciblés passent**, notamment le reroutage et la restauration d’octets après aller-retour.

**Limite :** les deux changements restent **locaux et non commités** ; ni inspection complète du diff final ni validation du `.rack2` réécrit par le vrai LiveProfessor n’ont été communiquées.

**Risques à maintenir ouverts :**

- Recomposer ou modifier un ValueTree avec données opaques peut altérer des chunks/snapshots/MIDI ; inspecter les octets et valider dans le vrai LiveProfessor, jamais sur l'original.
- Les tests UI du natif sont en partie **structurels/statistiques** (lecture du code HTML/JS) ; ne remplacent pas une recette manuelle.
- Nœuds inconnus, routages audio complexes, entrées/sorties multicanaux et versions LP nouvelles : **refuser l'écriture** quand les invariants ne sont pas démontrés.
- Les exceptions et faux rejets précédents ont été corrigés dans les scénarios automatisés, mais d’autres cas de routage et incompatibilités LiveProfessor peuvent subsister sans test d’intégration réel.
- Une modification de la palette/familles peut casser les couleurs manuelles ou modifier silencieusement le routing ; **ne pas introduire ces changements pendant le Patch natif**.

## 5. Protections et règles de travail

1. **Ne jamais écraser** le `.rack2` chargé ni les projets privés ; générer uniquement une copie à nom distinct.
2. Préserver snapshots, states AU/VST3, MIDI, métadonnées inconnues et éléments hors périmètre, de préférence octet par octet sur les zones non modifiées.
3. Sans modification, la sortie doit être **strictement identique** ; refus atomique des paramètres invalides/versions non testées.
4. Ne jamais supprimer ou écraser des changements locaux, y compris `note.md`, fichiers tests, correctifs et fixtures privées.
5. **Aucun commit ou push sans autorisation** ; ignorer normalement `note.md`, builds, caches, copies `.rack2`, données privées.
6. Les tâches de documentation ne doivent changer **aucun code fonctionnel** ; les correctifs `.rack2` restent un chantier distinct. L'installation des documents canoniques a été publiée en `0f2440c`. Toute sécurité de remplacement éventuel doit rester inactive tant qu'une décision et des tests spécifiques n'existent pas.
7. Une **décision de Vision** ≠ une fonction développée ; un test synthétique vert ≠ une validation manuelle LP.
8. Adapter la méthode aux quotas Codex/Work disponibles : patchs minimaux et vérifiables si ces outils ne sont pas accessibles, jamais laisser supposer une modification du Mac depuis le cloud.

## 6. Travaux actifs, interrompus, futurs

### Actif maintenant — `RACK2-PATCH-01`

**Moteur de reroutage local : tests ciblés et régression étendue verts.** Vérifier maintenant les diffs non commités, préparer un jalon conservateur et la validation sur copies dans le vrai LiveProfessor, puis raccorder le reroutage au constructeur en réutilisant les structures existantes. **Ne pas encore créer/supprimer de connexions ni ouvrir de chantier familles/migration.**

### Interrompus mais conservés

- **LPC-F6-NEXT :** fins de validation du bouton B16, Low Cut/High Cut et réponses LP/OSC selon `controller/F6_VALIDATION.md` et `TASKS.md`. Historique précieux à ne pas effacer malgré le renommage LPC.
- **SESSION** : les anciens jalons de création sont enregistrés comme commits ; ne pas les refaire. Les correctifs ponctuels restent possibles si des tests réels révèlent une régression.
- **Catalog/classification historiques** : site actuel, données, scripts et classification v1 présents. Décisions de périmètre nouvelles **sans migration automatique**.

### Futurs dans l'ordre de priorité produit

1. `RACK2-PATCH-02` — intégrer la manipulation native dans l'UI après validation du moteur.
2. `RACK2-PATCH-03` — création/suppression de points, si sûres et testées, puis validation LP.
3. `LPC-F6-NEXT` — poursuivre en parallèle lorsque les essais sont possibles.
4. `LIB-MIGRATION-01` — audit des consommateurs du catalogue, stratégie bibliothèque personnelle et CSV iLok ; pas de suppression de données.
5. `FAMILY-01` — nouveaux algorithmes/options, protection des couleurs et ordre visuel ; `BATCH-01` — tableau réutilisé, ajout groupé.
6. Après V1 : abonnements avancés, éditeur graphique MIDI, fonctions avancées non prioritaires.

## 7. Décisions fonctionnelles reçues mais **non intégrées**

| Source | Décision | Impact probable / contrôle nécessaire |
| --- | --- | --- |
| `L-PREP-VISION.md` v1.2, 20/11 | L-Prep et LPC indépendants ; PLC renommé LPC | Préserver `controller/` et profils ; changement de noms public/UI plus tard, pas de renommage brutal de fichiers |
| Idem | L-Prep hors ligne `.rack2`, pas de sync temps réel ni conversion AU/VST3 | Compatible en partie avec natif actuel ; recenser d'éventuelles anciennes promesses d'intégration |
| Idem | Pas d'inventaires par machine ; E/S définies **par session** | **Écart explicite** : `lprep-session-draft.mjs` expose `machineId` et les modules d'environnement ; audit de dépendances avant migration |
| Idem | Bibliothèque personnelle seulement, **validation groupée CSV iLok**, revue individuelle des ambiguïtés, plusieurs droits indépendants, pas d'expiration présumée | Le site/catalogue et la navigation historique existent ; auditer les dépendances, puis **retirer l'ancien catalogue du périmètre actif après migration sûre**, pas de bibliothèque cachée pérenne ; aucune suppression maintenant |
| Idem | Neuf familles musicales/sous-familles validées, **LEAD blanc**, autres voix bleues, **MONITORING sans sous-famille** ; rôle technique Insert/FX/Monitoring distinct | `lprep/lprep-chain-colors.mjs` contient la palette vérifiée sur `db35382` ; réutiliser les valeurs numériques, auditer priorité de rôle (`ROLE_DEFAULT_COLORS`) avant changement, **ne pas réinventer de palette** |
| Idem | Premier label **de gauche à droite** ; les inconnus précédents n'interrompent pas ; sans label, proposition **immédiate dès validation du nom** | **Écart explicite** : reconnaissance actuelle priorisée par ordre des alias et longueur des personnalisés, pas position globale gauche→droite ; vérifier déclencheur de validation dans l'UI |
| Idem | Renommage sans déplacement, couleur manuelle prioritaire, pas de rétroclassement, AutoPatch selon ordre visuel | Vérifier l'état de persistance du choix manuel et les effets au renommage/import |
| Idem | **Aucune** déduction mono/stéréo par famille/label | Départager suggestions de couleur et formats ; vérifier qu'aucune fonction ne crée un lien implicite |
| Idem | Ajout groupé réutilise le tableau de création ; fenêtre commune ; **lots transactionnels : une erreur bloquante ⇒ zéro chaîne créée** | `lprep-session-draft.mjs` existe ; fonctionnalité transactionnelle non démontrée ; mécanisme/UX à concevoir, conserver les chaînes/routages existants, refuser un second tableau divergent |
| Idem | Pas de boutons `+` entre chaînes ; préserver chaînes et routages existants | Contrôle UX et intégrité à prévoir lors de `BATCH-01` |
| Idem | **LPC : GUI active, cible unique, changement automatique de profil, profils réutilisables, mappings sûrs, X-Touch Mini E1–E8 / 16 boutons / navigation A/B** | Conserver les règles héritées de `PRODUCT_VISION.md`, les garde-fous et les profils existants dans `controller/` ; contrôles et tests à poursuivre séparément, **pas** de cues/ViewSets généraux dans LPC |

## 8. Questions techniques ouvertes / contradictions

1. **État local exact** : la liste des trois fichiers modifiés (+179 insertions) est celle du **dernier `git status` avant les deux correctifs** ; le diff complet, l’index Git et le nouveau décompte sont **à revérifier**. Les sorties **20/20** et **401/401** attestent de l’exécution des correctifs dans l’arbre testé, sans inspection directe du Mac.
2. **Évolution S3** : l'ancienne passation affirmait « pas commencé », mais GitHub porte `feat: finalize S3` au commit `038365d` ; le document présent retient le **commit** comme fait, pas une validation de tous les scénarios.
3. **Couleurs et rôles** : les neuf familles et leurs sous-familles sont bien dans `lprep-chain-colors.mjs` (palette numérique vérifiée sur `db35382`), mais la priorité de reconnaissance actuelle ne suit pas encore la nouvelle règle ; les rôles techniques Insert/FX/Monitoring restent distincts des familles musicales. Décision applicable ≠ implémentation.
4. **Machines** : l'ancien modèle `machineId` et les environnements sont présents, contrairement à la nouvelle vision ; **migration à concevoir**, pas remplacement immédiat.
5. **Catalogue** : le site et la navigation catalogue restent fonctionnels ; la nouvelle vision vise la bibliothèque personnelle dans L-Prep, **sans catalogue général caché permanent après migration** ; ne pas supprimer le catalogue existant sans audit, migration vérifiée et décision explicite.
6. **Documentation racine** : `PRODUCT_VISION.md` annonce encore une sync LP ; `STATUS.md`/`TASKS.md` pointent vers F6. Les **bannières de renvoi vers Vision et State sont déjà publiées** en `0f2440c`, sans supprimer les anciennes lignes ; **toutes les consignes techniques de `AGENTS.md` restent applicables**.
7. **Vérifications LiveProfessor réelles** de l'édition native du Patch après correction : **non démontrées**.
8. **Cohérence du modèle mémoire/JSON et natif** : `lprep-patch-edit.mjs` édite le modèle de session interne, mais ne constitue pas une preuve que la même mutation est sûre dans le ValueTree `.rack2`.
9. **Remplacement futur éventuel d'un `.rack2`** : la Vision v1.2 conserve des exigences historiques de sauvegarde et d'atomicité, **sans autoriser actuellement** l'écrasement de l'original. Cette fonction n'est pas développée et n'est pas une étape de `RACK2-PATCH-01`.

## 9. Action exacte à la prochaine reprise

**État de départ :** dernier commit GitHub confirmé `4de503f` (**documentation v1.2**), dernier commit de code fonctionnel publié `db35382`. Code expérimental **local, non commité** ; dernier relevé Git des trois fichiers antérieur aux correctifs. **20/20 tests ciblés** puis **401/401 tests `scripts/*.test.mjs` réussis** selon les sorties utilisateur. **Ne pas recommencer le chantier depuis `db35382`**.

**Prochain geste — poursuivre `RACK2-PATCH-01` :**

1. Vérifier **sans réinitialiser** l’état local à jour : `git status --short`, `git diff --stat`, `git diff --check` ; vérifier le diff des **deux fichiers `.mjs`** et laisser `note.md` intact. Comparer au dernier commit `4de503f` ; ne pas réappliquer un patch correctif déjà en place.
2. Appliquer le **patch documentaire v1.3 seulement à `docs/L-PREP-STATE.md`**, vérifier `git apply --check` puis le diff documentaire. Le document Vision v1.2 demeure applicable ; **aucune modification de code** pour tenir l’état.
3. Préparer, avec **autorisation explicite avant commit/push**, le jalon de reroutage (module natif et tests) et l’état documentaire, en excluant **`note.md`** et les fichiers `.rack2` originaux. La réussite des tests automatisés ne dispense pas des essais réels.
4. Tester une **copie de sortie distincte** dans le vrai LiveProfessor : ouverture, chaînes, connexions, snapshots, états AU/VST3, MIDI, données opaques. Documenter les résultats ou les bloqueurs sans déclarer la validation réelle avant preuve.
5. **Après contrôle du moteur**, préparer le raccordement au constructeur visuel (étape `RACK2-PATCH-02`), sans moteur parallèle ; laisser création/suppression de points (`RACK2-PATCH-03`), familles, collection et lots hors du chantier présent.

**Ne jamais écraser l’original, effacer les modifications locales, ni faire un commit ou push sans accord explicite.**

## 10. Procédure documentaire et passation

- **Ce fichier = état technique canonique ;** [`L-PREP-VISION.md`](L-PREP-VISION.md) = décisions fonctionnelles canoniques. `STATUS.md`/`TASKS.md`/`PRODUCT_VISION.md` restent historiques et compatibles avec des bannières de renvoi.
- Après un jalon ou avant de changer de discussion : mettre à jour **date, branche/commit, modifications locales, commandes/résultats, risques, prochaine action, version de Vision applicable**. Ne jamais écrire « validé » sans preuve.
- Actualiser les fichiers référencés dans le projet ChatGPT après une mise à jour versionnée. En cas d'écart entre une copie ChatGPT et Git, **privilégier la version Git vérifiée**, puis signaler la divergence.
- **Journal :** 20/11/2026 — v1.1 publiée dans le commit documentaire `0f2440c`, à partir de `db35382` (dernier commit fonctionnel), avec six redirections historiques.
- **Journal :** 20/11/2026 — v1.2 publiée dans le commit documentaire **`4de503f`**, sur `main`, confirmée par le Terminal utilisateur et GitHub ; Vision v1.2 reste applicable.
- **Journal :** 20/11/2026 — v1.3 **préparée, non commitée** : deux correctifs locaux de `RACK2-PATCH-01` ont conduit à **20/20 tests natifs** et **401/401 tests `scripts/*.test.mjs`** verts, selon sorties utilisateur. Reste à contrôler le diff local post-correctifs, l’export sur copies et la validation par le vrai LiveProfessor. Ce document v1.3 seul est modifié par le patch documentaire.
