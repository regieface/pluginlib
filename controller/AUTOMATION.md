# Préparation automatique LiveProfessor

La commande **Options → Préparer les affectations F6…** crée une copie `.rack2` du projet choisi. Le module prépare six banques de F6 (m) : sept paramètres propres à chaque bande, plus OUT partagé. Cela représente 43 commandes MIDI distinctes, 43 retours OSC et 86 affectations, résolues par les noms exacts de l’AU. Il garde le projet source, les plugins, les presets, les snapshots, le routage et les réglages audio. Aucun projet n’est chargé automatiquement dans LP.

Première version validée structurellement sur LiveProfessor 2026.1.0 : une instance **F6 (m) Audio Unit**, le contrôleur Mackie MCU existant et le contrôleur PluginLib OSC, avec l’affectation E1 de référence déjà enregistrée. Il reste à charger la copie dans une session de test LP et à confirmer les huit commandes sur le matériel. Le fichier `.rack2` ne constitue pas un export individuel « Save To File » de contrôleur : ce format séparé reste à vérifier avant de le générer.

## Utilisation

1. Enregistrer le projet LP pour inclure les dernières modifications.
2. Dans Controller, choisir **Préparer les affectations F6…**, sélectionner ce projet, puis un nouveau nom de sortie.
3. Ouvrir la copie dans LP dans une session de test, puis utiliser **Options → Apprendre les six boutons de bande** une fois : appuyer successivement sur les six boutons physiques choisis, un pour Band 1 à Band 6. Les messages sont appris sans supposer les numéros MC. Les associations sont mémorisées dans les préférences locales ; l’annulation conserve les anciennes associations. Activer ensuite les encodeurs dans Controller.
4. Vérifier les huit paramètres, les deux sens MIDI, les valeurs OSC et les unités. Les contrôles E1 existants sont conservés. L’ensemble des contrôleurs se trouve dans la copie : il n’est plus nécessaire de créer les 42 nouveaux Knobs OSC et les 84 nouvelles affectations à la main.
5. Si le port MIDI reste muet après une relance de Controller, réassocier `pluginlib` à `No Device` puis à `PluginLib Controller E1`, comme lors du premier test.

Le générateur refuse d’écraser un fichier existant, un conflit d’affectation, un nom de paramètre inconnu, un catalogue incompatible ou une cible ambiguë. Il ne remplace pas arbitrairement des affectations. Une copie déjà préparée ne reçoit pas de doublons.

## CLI

Python 3 standard, sans dépendances ni réseau :

```sh
python3 controller/tools/prepare_lp_project.py \
  --project '/chemin/source.rack2' \
  --profile controller/Profiles/waves-f6.json \
  --catalogue controller/Metadata/waves-f6-au.json \
  --output '/chemin/source-PluginLib.rack2'
```

Sans `--output`, la commande vérifie et produit seulement un rapport JSON. Avec plusieurs F6 mono, `--target-uid` doit préciser l’instance. Les fichiers personnels de test dans `controller/generated/` sont ignorés par Git.

## Métadonnées et unités

`au_parameters.swift --list` énumère les composants installés sans les instancier. `--name` ouvre une instance auxiliaire pour lire sa liste de paramètres ; il n’appelle ni `AudioUnitInitialize`, ni rendu audio, ni ouverture de périphérique. Il reste un outil de préparation hors du processus Controller et de LiveProfessor. L’instanciation auxiliaire exécute du code du plugin et consomme des ressources système ; elle ne fait pas partie du suivi normal de Controller.

```sh
swift controller/tools/au_parameters.swift --list
swift controller/tools/au_parameters.swift \
  --name 'Waves: F6 (m)' --output '/chemin/f6-catalogue.json'
```

Les indices du catalogue sont comparés au paramètre E1 déjà affecté dans LP. Le catalogue F6 mono contient 124 paramètres ; `Band 1 Gain` est l’index 12, la fréquence 10 et `OUT` 81. Aucun index de sortie n’a été deviné.

Les valeurs F6 ont été vérifiées avec `kAudioUnitProperty_ParameterStringFromValue` : sur l’entrée normalisée 0,5, F6 fournit `578`, `4.6`, `0.0`, `0.0`, `-30.0`, `15.8`, `158`, `0.0` pour les huit commandes. Les unités correspondent aux paramètres du guide Waves. Les conversions de fréquence et Q ont aussi été vérifiées avec `ParameterValueFromString` à trois points ; les bornes affichées arrondies ne suffisent pas à déduire la courbe. Les observations sont conservées dans `Metadata/waves-f6-au.json`. Les tests comparent les valeurs du profil aux chaînes réellement renvoyées par F6. Q est sans unité ; une unité vide est explicite, pas un formatage par défaut.

Ces échelles concernent F6 (m) AU testé ; elles ne sont pas transférables automatiquement à un autre plugin ou format. Un nouveau plugin demande un catalogue vérifié et un profil de paramètres, puis le générateur peut être étendu. Cette première version ne prépare pas encore toute la bibliothèque ni les boutons.

## Couleurs

`accentColor` dans le profil et `color` dans un contrôle acceptent `#RRGGBB`. F6 bande 1 utilise un rouge-orangé de repérage ; E1 à E7 le reprennent, E8 (sortie globale) garde un repère turquoise. Le bandeau, les anneaux, les cadres et les valeurs suivent la couleur de la banque sélectionnée. Band 2 utilise un jaune-vert, Band 3 un turquoise, Band 4 un cyan, Band 5 un bleu-violet et Band 6 un rose. C’est une palette de profil inspirée de F6, pas une mesure exacte de pixels, ni une couleur transmise par OSC.

Les boutons choisissent la bande pilotée dans Controller. Les noms de paramètres restent ceux de F6, en anglais (`Band 2 Gain`, `Band 2 Freq`, etc.). La navigation et les messages de l’application peuvent être en français ; les paramètres ne sont pas traduits.

La sélection par bouton ou par le menu Band pilote aussi le sélecteur visuel de F6, via un clic simple repéré relativement à sa fenêtre UI. Le test sur la fenêtre réelle a sélectionné Band 2, confirmé par l’utilisateur. Les pseudo-paramètres `Graph` et `Marker` de F6 sont en lecture seule et les trois éléments AX exposés ne contiennent pas les boutons : ils n’ont pas été utilisés comme commandes de sélection.

Le repérage `bandSelectorLayout` du profil correspond à F6 (m)UI de 802 × 602 points : premier sélecteur (160, 409), dernier (410, 409). La position écran est relue à chaque sélection ; déplacer la fenêtre ou la placer sur un écran à coordonnées négatives est pris en compte. Un autre titre, une fenêtre recouvrant le bouton, un glissement de souris ou des touches de modification actives suspendent le clic et affichent un diagnostic. Les six positions proviennent de la capture fournie, et la position Band 2 a été testée en session. Le profil déclare désormais une mise à l’échelle proportionnelle des positions selon la fenêtre AX ; les profils sans cette déclaration gardent la taille stricte. Une autre disposition ou des bordures fixes demandent un repérage vérifié (voir F6_VALIDATION.md).

Chaque événement fixe le compteur de clics à 1, et les répétitions rapides du même sélecteur sont écartées, car F6 utilise le double clic pour activer/désactiver la bande. Le pointeur est restauré après le clic seulement s’il n’a pas été déplacé par l’utilisateur. Cette fonction utilise l’autorisation Accessibilité existante, sans capture d’écran ni permission d’enregistrement d’écran. Elle s’exécute seulement quand F6 est reconnu au premier plan, et jamais dans les modes de démonstration/test de banques.

**Options → Désactiver la sélection visuelle F6** permet de conserver uniquement le routage des encodeurs. Le diagnostic indique la dernière sélection envoyée et la raison d’un refus. La confirmation d’un clic signifie que l’événement a été émis ; aucun état interne de bande sélectionnée n’est lisible pour confirmer automatiquement le surlignage.

Cliquer une autre bande directement à la souris dans F6 ne change pas encore la banque de Controller : la synchronisation est du X-Touch/Controller vers F6, pas dans l’autre sens.

## Routage des six banques

Les encodeurs physiques MC restent CC16…23. Pour les sept paramètres de bande, Controller remplace uniquement le numéro CC selon la banque : Band 1 = CC16…22, Band 2 = CC24…30, Band 3 = CC32…38, Band 4 = CC40…46, Band 5 = CC48…54, Band 6 = CC56…62. OUT reste CC23 dans toutes les banques. Canal et encodage relatifs sont déclarés dans le profil ; la vitesse/sens reçus sont conservés.

Le générateur ajoute les 35 contrôles MIDI supplémentaires et les retours OSC correspondants au contrôleur LP, sans réaffecter sa map active à chaque appui. Il associe le contrôleur MCU à l’entrée virtuelle PluginLib déjà déclarée dans le projet. Les boutons de sélection sont consommés localement et ne sont pas envoyés comme commandes de transport dans LP.

Chaque bande possède ses adresses OSC et sa mémoire de valeurs ; OUT est partagé. La banque choisie est conservée lors d’un passage sur un autre plugin et restaurée au retour dans F6. Une banque sans retour connu affiche **—** plutôt que la valeur de la bande précédente. Le menu Band et les boutons affichés permettent aussi de choisir la banque à l’écran.

## Vérifications

```sh
python3 -m unittest discover -s controller/tools -p 'test_*.py'
swift run --package-path controller --disable-sandbox ControllerChecks
```

Le codec conserve intégralement les données de variantes opaques des plugins. Une lecture/réécriture du projet de test original a produit exactement les mêmes octets. Les tests couvrent la préservation des sections audio/plugins/snapshots, les affectations des six banques, les transformations relatives distinctes MIDI/OSC, les conflits, les fichiers tronqués, les cibles multiples et l’idempotence.

Références : [contrôleurs LP](https://intercom.help/audiostrom/en/articles/8318600-hardware-controllers), [Controller Maps](https://intercom.help/audiostrom/en/articles/8318601-controller-maps), [structure du flux ValueTree JUCE](https://github.com/juce-framework/JUCE/blob/master/modules/juce_data_structures/values/juce_ValueTree.cpp), [variants JUCE](https://github.com/juce-framework/JUCE/blob/master/modules/juce_core/containers/juce_Variant.cpp), [guide Waves F6](https://www.waves.com/1lib/pdf/plugins/f6.pdf).

`--visual-click-check` ouvre une fenêtre auxiliaire propre au processus et vérifie la réception d’un seul clic via le même moteur, sans interagir avec LiveProfessor. Le contrôle géométrique du cœur couvre déplacement, coordonnées négatives, taille différente et bandes hors limites.

## Ordre Freq/Gain après recette

E1 = Freq, E2 = Gain dans les six banques. Les CC de destination et les retours
OSC restent ceux des paramètres historiques : E1 physique vise CC17 (+ décalage
de banque), E2 vise CC16 (+ décalage). Les autres encodeurs sont inchangés.
L’ancre de préparation reste Gain/CC16/index AU 12 ; un projet déjà préparé
ne demande pas de réaffectation. La formule proportionnelle et ses limites de
validation sont détaillées dans [F6_VALIDATION.md](F6_VALIDATION.md).
