# L-Prep pour macOS

Electron est la cible principale. L-Prep dans le navigateur sert aux tests et utilise les mêmes modules et le même format de projet.

Ouvrez `lprep-desktop/dist/L-Prep.app` dans le Finder. Cette version expérimentale est signée localement et destinée à ce Mac. Elle fonctionne sans serveur, Chrome ou installation Node au lancement.

## Transférer un projet

Dans L-Prep sur Chrome, utilisez **Projet → Exporter JSON**. Dans l’application Mac, utilisez **Projet → Importer un JSON**, puis cliquez sur **Sauvegarder**. La même procédure fonctionne dans l’autre sens. Les sauvegardes Chrome restent dans Chrome. Le JSON contient le projet et ses sessions. Les préférences restent propres à chaque environnement.

## Bibliothèque et collection

Dans L-Prep, ouvrez **⋯ → Bibliothèque complète**. Utilisez le catalogue, les fiches, le comparateur, **Ma collection**, **Archives** ou **Mes abonnements**. Les changements sont disponibles immédiatement dans le panneau Plugins. Le bouton **← Constructeur** réaffiche la session au même endroit.

La bibliothèque complète utilise le catalogue public et les mêmes clés locales PluginLib que le panneau Plugins. Les collections Electron existantes restent accessibles dans le nouveau bundle. Dans Chrome, PluginLib et L-Prep partagent la collection s’ils sont servis par la même origine, avec le même hôte et le même port.

Pour reprendre volontairement une collection Chrome dans l’application Mac, utilisez **Exporter ma collection** dans PluginLib, puis **⋯ → Bibliothèque complète → Importer ma collection** sur Mac. Vérifiez le récapitulatif et confirmez la fusion. Vous pouvez exporter la collection Mac avant la fusion pour conserver une copie. Les projets L-Prep se transfèrent séparément depuis le menu Projet.

## Reconstruire

Depuis la racine du dépôt, lancez `sh lprep-desktop/build-mac.sh`. Le script télécharge Electron 45.4.1 et vérifie son SHA-256. Il accepte aussi le chemin de l’archive officielle en argument. Déplacez l’ancien bundle avant de reconstruire. Cette opération préserve les projets enregistrés par l’application.

Le bundle embarque l’interface partagée, le catalogue public, la démo et les moteurs existants. Les projets gardent le format JSON L-Prep et l’application emploie le même adaptateur IndexedDB, sur l’origine locale `lprep://app`. Les miniatures distantes utilisent le cache existant. Les liens éditeurs s’ouvrent dans le navigateur par défaut. Le rendu tourne dans un bac à sable isolé, sans Node.js ni fenêtre distante.
