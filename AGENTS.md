# Consignes de développement

Ce dépôt contient deux composants liés mais exécutés séparément : le catalogue web PluginLib à la racine et l’application macOS dans `controller/`. Toute intervention doit préserver cette séparation et rester entièrement hors ligne à l’exécution.

## Inspection ciblée

- Commencer par `STATUS.md`, `TASKS.md` et `ARCHITECTURE.md`, puis ouvrir seulement les fichiers associés à la tâche.
- Pour les décisions de conception, consulter `PRODUCT_VISION.md`, référence produit évolutive de PluginLib et PLC. Ce document ne décrit pas l’état du code : ne pas considérer ses fonctionnalités comme développées ni transformer automatiquement ses objectifs en tâches de développement.
- Pour PluginLib, privilégier `app.js`, les modules `*.mjs`, `data/overrides.json`, `data/descriptions-fr.json`, `sources/vendors.json` et le script concerné. Ne pas charger tout `data/plugins.json` sans besoin précis.
- Pour Controller, partir de `controller/Profiles/`, puis de `ControllerCore`; n’ouvrir les adaptateurs AppKit/CoreMIDI/OSC/Accessibility utiles qu’ensuite.
- Chercher avec `rg` avant d’ajouter un type, un protocole, une adresse OSC, un mapping MIDI ou un outil déjà présent.
- Ne pas inspecter ni modifier `controller/dist/`, `controller/.build/`, `controller/generated/` ou `collection-privee/` comme sources de référence.

## Modifications

- Réutiliser le modèle de profil, les transports, les barrières de sécurité et les outils `.rack2` existants.
- Faire la modification minimale demandée; ne pas refactoriser les zones voisines sans nécessité démontrée.
- Modifier les profils sources dans `controller/Profiles/`, jamais leur copie dans l’application construite.
- Ne pas éditer directement `data/plugins.json`, qui est régénéré. Mettre les corrections durables dans les sources ou fichiers d’override appropriés.
- Préserver les changements utilisateur déjà présents dans l’arbre Git et ne pas toucher aux fichiers hors périmètre.
- Ne jamais inventer une unité, une conversion OSC, un identifiant de paramètre, une affectation MIDI ou une fonction de plugin. Une valeur inconnue reste inconnue.
- Les noms de paramètres de plugins restent ceux exposés par l’éditeur/hôte; l’interface et la documentation peuvent être en français.
- Ne jamais inclure d’intégration Yamaha DM7 dans ce projet.
- Les profils Controller sont créés et gérés uniquement pour les plugins que `collectionStatus` classe `owned` ou `subscription`. Réutiliser ce calcul; ne jamais créer une liste parallèle de plugins possédés.
- La sortie de « Ma collection » ne supprime jamais un profil ni une entrée du manifeste. Elle retire seulement l’éligibilité à une future proposition de création.

## Sécurité du contrôleur

- Le contrôleur ne doit pas entrer dans le chemin audio ni charger les plugins pendant son fonctionnement normal.
- Maintenir les gardes existantes : LiveProfessor au premier plan, profil reconnu, lecture AX récente et routage explicitement activé.
- Toute préparation LiveProfessor écrit une nouvelle copie et refuse l’écrasement; elle ne doit pas ouvrir ni modifier silencieusement le projet actif.
- Ne pas déduire l’état interne d’un plugin d’un clic envoyé ou d’une valeur MIDI. Distinguer commande émise, retour OSC reçu et état confirmé.

## Tests proportionnés

- Changement web ou données : exécuter le ou les tests Node ciblés; utiliser `node --test scripts/*.test.mjs` pour une modification transversale.
- Rapprochement iLok : `python3 -m unittest scripts/reconcile_ilok_test.py`.
- Cœur/profils Controller : `swift run --package-path controller --disable-sandbox ControllerChecks`.
- Codec ou préparation `.rack2` : `python3 -m unittest discover -s controller/tools -p 'test_*.py'`.
- Transport ou interface native : ajouter selon le risque `--transport-checks`, `--smoke-test`, `--activation-check` ou `--visual-click-check` après construction.
- Les essais synthétiques ne remplacent pas une vérification manuelle dans LiveProfessor; consigner explicitement ce qui reste à vérifier.
- Toujours terminer par `git diff --check` et examiner `git diff --stat` sans inclure les changements hors tâche.

## Commandes fiables depuis Codex / VS Code

Depuis la racine du dépôt, utiliser le lanceur local (aucune installation ni
modification du shell global) :

```sh
sh scripts/with-dev-env.sh node --version
sh scripts/with-dev-env.sh node --test scripts/*.test.mjs
sh scripts/with-dev-env.sh swift run --package-path controller --disable-sandbox \
  --cache-path controller/.build/dev-swiftpm-cache \
  --config-path controller/.build/dev-swiftpm-config \
  --security-path controller/.build/dev-swiftpm-security ControllerChecks
python3 scripts/validate_controller_manifest.py
python3 -m unittest discover -s scripts -p '*_test.py'
python3 -m unittest discover -s controller/tools -p 'test_*.py'
```

Le lanceur conserve le Node du PATH s'il existe, sinon expose le binaire déjà
présent dans `$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`.
Il place les caches de modules Clang/Swift dans `controller/.build/`, ignoré par
Git et accessible au sandbox. Les options SwiftPM ci-dessus y placent aussi ses
caches, configuration et sécurité. Ne pas enlever ces réglages dans Codex :
`--disable-sandbox` désactive le sandbox SwiftPM, pas celui de Codex.

Diagnostic du 16 novembre 2026 : zsh login (commande Codex par défaut), non-login
et interactif ne trouvent ni `node` ni `npm`. `.zprofile` ajoute seulement
`~/.local/bin`; aucun gestionnaire Node n'est initialisé. Node 24.22.1 est pourtant
disponible dans le cache Codex ci-dessus, et le workflow CI fournit séparément
Node 22 via `actions/setup-node`. Le succès antérieur des tests n'implique donc
pas un Node installé dans le PATH de VS Code; l'environnement exact de cette
ancienne exécution n'est pas établi. npm est absent du PATH et du runtime Codex
vérifié; il n'est pas requis pour les tests de ce dépôt, sans dépendances à installer.
Swift 6.3.3, Clang 21, l'éditeur de liens et le SDK macOS sont disponibles via
`/Library/Developer/CommandLineTools`. Ne rien réinstaller.

## Compte rendu

- Réponse finale courte : résultat, fichiers modifiés, tests exécutés, puis au plus une prochaine étape.
- Ne pas recopier l’historique ni décrire toutes les commandes lancées.
- Signaler clairement une hypothèse, une limitation ou une validation manuelle manquante.
