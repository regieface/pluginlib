# L-Prep — État technique et passation

> **Référence canonique du développement** — v1.1, 20 novembre 2026
> **Vision applicable :** [`L-PREP-VISION.md`](L-PREP-VISION.md), version **1.1 du 20/11/2026**
> **Périmètre :** dépôt `regieface/pluginlib` (L-Prep, LPC, bibliothèque PluginLib). Ce document enregistre des **faits observés**, des **résultats rapportés** et des **points inconnus** séparément.

## 0. Synthèse de reprise — à lire en premier

- **Chantier actif :** `RACK2-PATCH-01` — **édition conservatrice des connexions audio existantes** dans un `.rack2` natif. **Ce n'est pas** l'ancien jalon « S2 — création de sessions ».
- **Référence GitHub contrôlée le 20/11/2026 :** `main`, dernier commit public **`db35382`** — `L-Prep: add rack2 session reader and native workspace`. Point de restauration connu, confirmé par l'historique GitHub et le `git push` communiqué par l'utilisateur.
- **Modifications locales rapportées par le Terminal utilisateur le 20/11/2026, non vérifiées directement par Dev :** `lprep/lprep-rack2-native.mjs` (**modifié, +117 lignes**), `scripts/lprep-rack2-native.test.mjs` (**modifié, +60 lignes**) et `note.md` (**modifié, +2 lignes**) ; **3 fichiers modifiés, 179 insertions rapportées**. Ces chiffres proviennent de l'utilisateur, **pas d'une inspection locale directe** ; ne pas supposer la teneur exacte du diff ni qu'il n'existe aucun autre état local plus récent.
- **Correctif non confirmé :** un patch correctif du `ReferenceError` a été fourni, mais **sa présence dans `lprep-rack2-native.mjs`, son application et l'absence de nouvelles erreurs ne sont pas confirmées**. `note.md` reste hors du périmètre documentaire et ne doit pas être indexé par inadvertance.
- **Derniers tests réellement exécutés et communiqués par l'utilisateur :** `node --test scripts/lprep-rack2-*.test.mjs`, **20 tests, 18 réussis, 2 échoués**, le 20/11/2026. **Ne pas annoncer 20/20.** Voir §4.
- **Prochaine action exacte :** **vérifier l'état du dépôt local et la présence du correctif**, puis relancer les 20 tests avant de toucher au Patch natif. Commandes sûres au §9 ; **aucun commit, aucun push**, aucune réinitialisation.
- **Nouvelles décisions produit non intégrées :** neuf familles/sous-familles configurables, première correspondance gauche→droite, validation immédiate des noms inconnus, formats explicites, **lots transactionnels**, retrait futur du catalogue général après migration, collection iLok à droits multiples, LPC indépendant avec ciblage GUI/profils sécurisés. Voir §7 et la Vision.

## 1. Sources examinées et degré de preuve

### A. Dépôt distant réellement consulté

- Historique des commits GitHub `main` du 20/11/2026 (dernier : `db35382`) : <https://github.com/regieface/pluginlib/commits>.
- Documents racine examinés : `PRODUCT_VISION.md` (v0.1 du 17/11), `STATUS.md`, `TASKS.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CLASSIFICATION_MODEL.md`, `README.md`.
- Code source du dépôt distant consulté : `lprep/app.mjs`, `lprep/lprep-rack2-reader.mjs`, `lprep/lprep-rack2-native.mjs`, `lprep/lprep-rack2-workspace.mjs`, `lprep/lprep-chain-colors.mjs`, `lprep/lprep-session-draft.mjs`, `lprep/lprep-audio-graph.mjs`, `lprep/lprep-patch-edit.mjs`, `lprep/lprep-patch.mjs`, et tests `.rack2` publiés.
- **Limite** : une consultation GitHub ne donne **ni le `git status` Mac, ni l'arbre non commité**, ni les fichiers de session réels. Les éléments locaux proviennent de messages de l'utilisateur. Aucun test n'a été exécuté par l'assistant sur le dépôt local dans cette opération documentaire.

### B. Éléments rapportés par l'utilisateur, non revérifiés dans son arbre actuel

- `git commit` et `git push` réussis de `db35382` sur `main`, le 20/11/2026.
- Installation locale de Node `v26.13.1`, npm `11.20.0` (ancienne documentation `AGENTS.md` parlant d'un Node absent du PATH au 16/11 désormais obsolète pour ce Mac, **à recontrôler si environnement différent**).
- Avant le patch expérimental : **17/17 tests natifs réussis**.
- Après le premier patch local : **18/20**, avec deux échecs identiques (voir §4).
- **Dernier relevé d'état local fourni par l'utilisateur** : 3 fichiers modifiés (`lprep/lprep-rack2-native.mjs` +117 lignes, `scripts/lprep-rack2-native.test.mjs` +60 lignes, `note.md` +2 lignes), soit **179 insertions annoncées**. Information **rapportée par le terminal utilisateur, non vérifiée directement par Dev**. Aucun résultat de tests postérieur à 18/20 n'a été communiqué ; **la présence du correctif `connection is not defined` reste inconnue**.
- L'utilisateur a été invité à appliquer un second correctif et des documents de passation ; **aucune sortie de terminal n'en confirme encore l'application**.

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
- **`AGENTS.md`** : consignes techniques existantes toujours utiles ; son renvoi vers `PRODUCT_VISION.md` devient secondaire. Prévoir un en-tête court vers les deux nouveaux documents (patch documentaire proposé séparément).
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
| **RACK2-PATCH-01** — reroutage de destinations de connexions audio existantes | **En cours localement, non validé** | Modifications rapportées : moteur **+117**, tests **+60** (non vérifiées) ; **18/20**, correctif `connection` non confirmé |
| **RACK2-PATCH-02** — UI du patch natif | **Non entamé / non démontré** | À commencer **après** `RACK2-PATCH-01` validé ; réutiliser l'UI, sans modélisation parallèle |
| **RACK2-PATCH-03** — ajout/suppression de connexions | **Futur** | Nécessite formats et invariants prouvés ; pas de mutation silencieuse |
| **LPC-F6-NEXT** — Low Cut / High Cut | **Chantier antérieur à reprendre, pas supprimé** | `STATUS.md`, `TASKS.md`, `controller/F6_VALIDATION.md` ; validations B16 historiques, suite à tester séparément |
| **LIB-MIGRATION-01** — collection personnelle uniquement | **Décision reçue, pas intégrée** | Audit de dépendances puis migration non destructive |
| **FAMILY-01 / BATCH-01** — familles et ajout groupé | **Décisions reçues, non validées en code** | Compatibilités partielles existantes (palette, session draft), nouveau comportement non implémenté dans sa totalité |

## 4. Derniers tests, bugs et risques

### Journal des exécutions **rapportées**

| Date | Commande / portée | Résultat | Fiabilité de l'assertion |
| --- | --- | --- | --- |
| 20/11/2026, avant patch local | `node --test scripts/lprep-rack2-*.test.mjs` | **17/17, 0 échec** | Sortie utilisateur : tests natifs du commit `db35382` |
| 20/11/2026, après premier patch `RACK2-PATCH-01` | Même commande | **20 tests, 18 réussis, 2 échoués** | Sortie utilisateur ; aucun test vert après correctif communiqué |
| Phases antérieures | Suite plus large Node (jusqu'à **181** tests selon passation conversationnelle antérieure) | **Historique uniquement** | Ni commande ni résultat actuel vérifiés ici ; **ne pas présenter comme bilan de cette branche modifiée** |

**Deux échecs actuellement documentés :**

1. `S2 patch : rerouter une destination existante puis restaurer tous les octets` — **ReferenceError** `connection is not defined`.
2. `S2 patch : changer le destinataire d’une connexion existante sans toucher aux plugins` — même erreur.

Point commun : `lprep/lprep-rack2-native.mjs:323`, dans `rewriteRack2PatchDestinations`, patch **local non commité**. Un correctif ciblé a été préparé et envoyé, **mais son application/résultat n'ont pas été reçus**. Le troisième test ajouté (« versions, canaux, destinations inconnues et reroutages ambigus bloqués ») est vert ; ceci **ne valide pas** la réécriture effective. Le relevé de fichiers locaux communiqué ensuite **ne constitue pas** une nouvelle exécution des tests : le dernier verdict demeure **18/20**.

**Risques à maintenir ouverts :**

- Recomposer ou modifier un ValueTree avec données opaques peut altérer des chunks/snapshots/MIDI ; inspecter les octets et valider dans le vrai LiveProfessor, jamais sur l'original.
- Les tests UI du natif sont en partie **structurels/statistiques** (lecture du code HTML/JS) ; ne remplacent pas une recette manuelle.
- Nœuds inconnus, routages audio complexes, entrées/sorties multicanaux et versions LP nouvelles : **refuser l'écriture** quand les invariants ne sont pas démontrés.
- Aucune mesure de résultats après l'application du correctif ; bug potentiellement multiple une fois l'exception réparée.
- Une modification de la palette/familles peut casser les couleurs manuelles ou modifier silencieusement le routing ; **ne pas introduire ces changements pendant le Patch natif**.

## 5. Protections et règles de travail

1. **Ne jamais écraser** le `.rack2` chargé ni les projets privés ; générer uniquement une copie à nom distinct.
2. Préserver snapshots, states AU/VST3, MIDI, métadonnées inconnues et éléments hors périmètre, de préférence octet par octet sur les zones non modifiées.
3. Sans modification, la sortie doit être **strictement identique** ; refus atomique des paramètres invalides/versions non testées.
4. Ne jamais supprimer ou écraser des changements locaux, y compris `note.md`, fichiers tests, correctifs et fixtures privées.
5. **Aucun commit ou push sans autorisation** ; ignorer normalement `note.md`, builds, caches, copies `.rack2`, données privées.
6. Les tâches de documentation ne doivent changer **aucun code fonctionnel** ; les correctifs `.rack2` sont un chantier séparé et reprennent seulement après l'installation des documents.
7. Une **décision de Vision** ≠ une fonction développée ; un test synthétique vert ≠ une validation manuelle LP.
8. Adapter la méthode aux quotas Codex/Work disponibles : patchs minimaux et vérifiables si ces outils ne sont pas accessibles, jamais laisser supposer une modification du Mac depuis le cloud.

## 6. Travaux actifs, interrompus, futurs

### Actif maintenant — `RACK2-PATCH-01`

Vérifier le correctif `connection is not defined`, l'écriture ciblée des destinations existantes, la restauration exacte après aller-retour et la conservation des parties opaques ; **ne pas encore créer/supprimer de connexions ni ouvrir un chantier famille/migration**.

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
| `L-PREP-VISION.md` v1.1, 20/11 | L-Prep et LPC indépendants ; PLC renommé LPC | Préserver `controller/` et profils ; changement de noms public/UI plus tard, pas de renommage brutal de fichiers |
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

1. **État local exact** : le Terminal utilisateur annonce **trois fichiers modifiés et +179 lignes**, mais leurs contenus précis, ainsi que la **présence du correctif** `connection is not defined`, demeurent inconnus côté Dev ; impossible de les inférer du commit `db35382`.
2. **Évolution S3** : l'ancienne passation affirmait « pas commencé », mais GitHub porte `feat: finalize S3` au commit `038365d` ; le document présent retient le **commit** comme fait, pas une validation de tous les scénarios.
3. **Couleurs et rôles** : les neuf familles et leurs sous-familles sont bien dans `lprep-chain-colors.mjs` (palette numérique vérifiée sur `db35382`), mais la priorité de reconnaissance actuelle ne suit pas encore la nouvelle règle ; les rôles techniques Insert/FX/Monitoring restent distincts des familles musicales. Décision applicable ≠ implémentation.
4. **Machines** : l'ancien modèle `machineId` et les environnements sont présents, contrairement à la nouvelle vision ; **migration à concevoir**, pas remplacement immédiat.
5. **Catalogue** : le site et la navigation catalogue restent fonctionnels ; la nouvelle vision vise la bibliothèque personnelle dans L-Prep, **sans catalogue général caché permanent après migration** ; ne pas supprimer le catalogue existant sans audit, migration vérifiée et décision explicite.
6. **Documentation racine** : `PRODUCT_VISION.md` annonce encore une sync LP ; `STATUS.md`/`TASKS.md` pointent vers F6 ; `AGENTS.md` recommande l'ancienne vision. Ajouter seulement des **bannières de renvoi documentaires** ; **toutes les consignes techniques de `AGENTS.md` (sécurité, tests, environnement, interdits) restent applicables**. Aucune ligne ancienne retirée par le patch documentaire.
7. **Vérifications LiveProfessor réelles** de l'édition native du Patch après correction : **non démontrées**.
8. **Cohérence du modèle mémoire/JSON et natif** : `lprep-patch-edit.mjs` édite le modèle de session interne, mais ne constitue pas une preuve que la même mutation est sûre dans le ValueTree `.rack2`.

## 9. Action exacte à la prochaine reprise

**Dans le Terminal de VS Code du vrai Mac, sans modifier aucun fichier :**

```sh
cd ~/Documents/pluginlib
git status --short
git log -1 --oneline
git diff --stat
git diff --check
node --test scripts/lprep-rack2-*.test.mjs
```

**Interprétation :**

1. Comparer `git log` au commit de référence `db35382`; toute divergence doit être examinée avant de poursuivre.
2. Examiner les modifications `lprep/lprep-rack2-native.mjs` et `scripts/lprep-rack2-native.test.mjs` sans les effacer et vérifier si le correctif du `ReferenceError` a été appliqué.
3. Si **20/20** : exécuter ensuite `node --test scripts/lprep*.test.mjs`, puis la suite générale pertinente. Si échec : corriger le premier problème **dans un chantier séparé** et retester ; **ne pas certifier le moteur natif avant réussite**.
4. Vérifier les exports `.rack2` sur **des copies de test** dans le vrai LP, en comparant chaînes, connexions, états et snapshots. **Aucun `.rack2` original écrasé**.
5. Quand le moteur est confirmé : planifier le raccordement à l'interface ; les choix familles/catalogue restent en attente dans Vision.

## 10. Procédure documentaire et passation

- **Ce fichier = état technique canonique ;** [`L-PREP-VISION.md`](L-PREP-VISION.md) = décisions fonctionnelles canoniques. `STATUS.md`/`TASKS.md`/`PRODUCT_VISION.md` restent historiques et compatibles avec des bannières de renvoi.
- Après un jalon ou avant de changer de discussion : mettre à jour **date, branche/commit, modifications locales, commandes/résultats, risques, prochaine action, version de Vision applicable**. Ne jamais écrire « validé » sans preuve.
- Actualiser les fichiers référencés dans le projet ChatGPT après une mise à jour versionnée. En cas d'écart entre une copie ChatGPT et Git, **privilégier la version Git vérifiée**, puis signaler la divergence.
- **Journal :** 20/11/2026 — révision documentaire v1.1 après relecture « Vision & Conception », avec état local **rapporté** (+117/+60/+2), maintien du résultat **18/20**, correctif non confirmé. Vision v1.1 intègre sous-familles, LPC, CSV iLok, transaction des lots, retrait futur du catalogue actif. **Aucun code fonctionnel, commit ni push dans ce chantier documentaire.**
