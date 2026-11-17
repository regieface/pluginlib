# État du projet

## PluginLib — « Ma collection », chantiers 1A à 1C validés

- **1A** — L’import JSON affiche les ajouts, les changements de droits et le nombre de plugins inchangés. La confirmation applique la fusion. L’annulation et les fichiers invalides laissent la collection intacte.
- **1B** — La vue « Archives » présente les anciens abonnements sans droit actif. La réactivation remet les plugins dans « Ma collection ». Une licence perpétuelle ou un autre abonnement actif maintient l’accès.
- **1C** — Les fiches concernées affichent le badge « Abandonné », vérifié manuellement dans Live Server. Un plugin abandonné encore licencié reste visible dans « Ma collection ». Le catalogue global continue de masquer ces fiches par défaut.

Les trois chantiers ont été validés par l’utilisateur. L’archivage préserve les fiches, les informations de licence et les références PLC.

## Reprise immédiate — sauvegarde du 17 novembre 2026

**Prochaine tâche : intégrer Low Cut / High Cut de Waves F6.** Commencer par
l’inventaire AU HPF/LPF et les preuves de session ; confirmer identifiants,
domaines, polarité, messages physiques et retours avant toute activation.
Disposition cible : B1 Low Cut, B2…B7 Band 1…6, B8 High Cut, B16 On/Off de bande ;
B9…B15 réservés. Les sélections actuelles restent B1…B6 : leur migration vers
B2…B7 doit être explicite, capturée et testée, sans casser les six banques.

- PluginLib et PLC sont sauvegardés ensemble, mais restent deux composants
  séparés, hors ligne à l’exécution. Aucun code applicatif modifié pour cette sauvegarde.
- F6 : E1 Frequency, E2 Q, E3 Gain, E4 Range, E5 Threshold, E6 Attack,
  E7 Release, E8 Output Level global ; mappings continus à préserver.
- B16 implémenté avec appui seul, verrou de maintien, retour OSC par bande et
  blocage sur état inconnu/périmé ou cible AX non confirmée. Captures physiques,
  polarité et six retours réellement validés ; recette finale B16→LP encore à faire.
  F6 reste `draft` ; ni Low Cut / High Cut ni reset ne sont implémentés.
- Sources et preuves durables : `controller/Profiles/`, `controller/Metadata/`,
  tests Swift/Python et `controller/F6_VALIDATION.md`. Les copies `.rack2`, builds,
  caches et collection privée restent locales et exclues du commit ; aucun fichier
  local supprimé. Les fichiers sous `/tmp` ne constituent pas une sauvegarde durable :
  recréer une copie depuis la session locale avec les outils non destructifs si nécessaire.
- Validation de clôture : 141 tests Node, 1864 contrôles Swift, 6 tests Python des
  scripts, 15 tests Python `.rack2` et manifeste réussis via le lanceur local.
  Build release, activation et test OSC dédié déjà réussis pendant l’implémentation B16.
- Pour reprendre : lire cette section, `ARCHITECTURE.md`, puis la recette actuelle
  dans `controller/F6_VALIDATION.md`. Les sections datées plus anciennes ci-dessous
  sont un historique ; cette section et le dernier bilan B16 font foi pour l’état courant.

État vérifié dans le dépôt le 16 novembre 2026. « Confirmé » signifie couvert par le code/tests ou observé dans la session réelle indiquée; cela ne généralise pas à tous les plugins.

## Confirmé

### PluginLib

- Site statique séparé du contrôleur, alimenté par des JSON et des scripts Node sans dépendance npm d’exécution.
- Catalogue généré, corrections manuelles, synthèses françaises, sources éditeurs/revendeurs, collection locale et audits distincts.
- Tests Node exécutés par le workflow avant la collecte; test Python dédié au rapprochement iLok.
- Manifeste version 1 reliant une fiche du catalogue à un ou plusieurs profils/variantes Controller, avec validation croisée hors ligne et sans duplication du catalogue.
- Dans « Ma collection », chaque plugin possédé ou fourni par un abonnement actif affiche « Profil vérifié », « Profil non vérifié » ou « Aucun profil ». Aucun statut Controller n’est affiché ailleurs.

### Controller

- Résolution explicite `pluginId` → variante du manifeste → `Profile` validé, pour un statut `owned` ou `subscription` fourni par `collectionStatus`; résultat vérifié/non vérifié et erreurs distinctes. Contexte de variante incomplet ou ambigu refusé; aucun transport activé.
- Validation de la résolution : 285 assertions `ControllerChecks` et compilation de `PluginLibController` réussies. Revalidation Codex/VS Code : 136 tests JavaScript (dont le statut Controller), validateur du manifeste, 6 tests Python des scripts (dont 5 du manifeste) et 11 tests des outils `.rack2` réussis. Node existe dans le cache Codex mais manque au PATH; `scripts/with-dev-env.sh` l'expose et redirige les caches Swift/Clang vers le dépôt. Commandes reproductibles dans `AGENTS.md`. Vérification manuelle de cette API dans LiveProfessor non effectuée; aucun transport ni interface modifié.
- Manifeste embarqué à la construction; son absence laisse fonctionner le chargement AX historique F6/kHs. Échange local explicite par fichier JSON ajouté; aucune activation de transport à l’import.

- Application macOS native, flottante, redimensionnable, avec affichages compact et complet.
- Détection par macOS Accessibility de la première fenêtre LiveProfessor et reconnaissance exacte de `F6 (m)UI`, `F6 (s)UI` et `kHs CompressorUI`.
- Réception du X-Touch Mini en mode MC; décodage relatif des huit encodeurs et source CoreMIDI virtuelle vers LiveProfessor.
- Réception OSC locale sur `127.0.0.1`, mémoire des dernières valeurs par profil et affichage d’unités seulement via une échelle déclarée.
- Profil F6 : six banques, sept paramètres propres à chaque bande, sortie globale, noms anglais, couleurs et six boutons appris localement.
- La sélection Band 2 par clic simple protégé dans la fenêtre réelle F6 a été confirmée par l’utilisateur. Le déplacement de la fenêtre est pris en compte à taille identique.
- Génération non destructive d’une copie `.rack2` F6 avec 43 commandes MIDI, 43 retours OSC et 86 affectations; codec et générateur disposent de tests Python.
- Les encodeurs physiques, les changements de banque locaux, le contrôle des paramètres F6 et le retour de valeurs avec unités ont fonctionné dans la session utilisateur.

## Expérimental ou limité

- Le clic F6 utilise des repères mesurés par taille ; hors référence historique 802 × 602, calibrer les six sélecteurs. Aucune extrapolation de la fenêtre AX entière. Recette réelle du calibrage et des clics restant à effectuer.
- La synchronisation de bande va du X-Touch/Controller vers F6 seulement. Un clic manuel dans F6 ne change pas la banque du Controller.
- Les valeurs affichées sont les derniers retours OSC reçus, pas une interrogation de l’état courant du plugin.
- La source CoreMIDI virtuelle peut devoir être réassignée dans LiveProfessor après une relance du Controller.
- Le générateur `.rack2` est validé pour LiveProfessor 2026.1.0, une instance F6 (m) AU et les contrôleurs de référence existants. Plusieurs instances nécessitent une cible explicite.
- La signature ad hoc de l’application peut rendre l’autorisation Accessibility instable entre deux constructions.

## Absent

- Pipeline transformant automatiquement une fiche PluginLib en profil Controller.
- Création automatique de profils pour les plugins du catalogue.
- Profil fonctionnel complet pour `kHs Compressor`; le fichier actuel est une structure de 8 encodeurs et 16 boutons sans banques ni mappings vérifiés.
- Détection d’un plugin sélectionné dans la chaîne LiveProfessor sans ouvrir sa fenêtre.
- Retour MIDI vers les anneaux/boutons physiques du X-Touch Mini.
- Distribution signée/notarisée et installateur.
- Intégration Yamaha DM7, volontairement exclue.

## À vérifier sur matériel ou session réelle

- Recette des six banques, encodeurs/boutons, MIDI, OSC, masquage et reprise confirmée par l’utilisateur. Revalider la sélection visuelle après redimensionnement et le nouvel ordre E1 Freq / E2 Gain.
- Tester la sélection visuelle avec la fenêtre F6 déplacée sur chaque écran, recouverte, puis affichée à une taille différente; les cas dangereux doivent être refusés.
- Mesurer le comportement et la charge dans une session audio longue, avec et sans Controller.
- Vérifier les Spaces, le plein écran, le débranchement de l’écran externe et la restauration de position.
- Confirmer sur un second plugin les règles d’identité d’instance, de paramètres, d’adresses OSC et d’unités avant de généraliser le générateur.

## Passerelle locale — 16 novembre 2026

- Export discret par variante vérifiée dans « Ma collection », uniquement pour owned/subscription.
- Import explicite dans les Options de Controller; configuration résolue affichée et conservée, routage suspendu, sélection AX F6/kHs préservée.
- Demandes versionnées sans duplication du catalogue ni des profils; erreurs de format, statut, référence et variante refusées.
- Validation : 139 tests JavaScript et 300 contrôles Swift réussis; compilation native et validateur de manifeste réussis.
- Limite : statut de collection déclaré au moment de l’export, sans authentification ni synchronisation avec le navigateur.
- Smoke test graphique tenté : bloqué par les services macOS (LaunchServices/HIServices, connexion invalide) dans cet environnement, instance de test arrêtée.
- À vérifier manuellement : export navigateur, sélection du fichier dans Controller, message de résultat et maintien du routage désactivé en session LiveProfessor.

## Pilote F6 — audit du 16 novembre 2026

- Le manifeste F6 et sa variante mono sont désormais `draft` : les essais réels historiques restent partiels et ne justifient pas `verified`. La passerelle exigeant un profil vérifié ne propose donc plus l’export F6 ; le chargement AX historique reste utilisable.
- Réutilisation intégrale des six banques, 43 cibles, échelles AU et transports existants ; aucune donnée de collection modifiée. Le chargement refuse désormais les retours OSC ambigus entre commandes/banques et les divergences du contrôle OUT partagé.
- Tests ciblés ajoutés : noms natifs, preuves AU de conversion pour les six bandes, bornes normalisées, OUT partagé et rejets des collisions OSC.
- Inventaire opérationnel/simulé/manquant et recette réelle : [controller/F6_VALIDATION.md](controller/F6_VALIDATION.md). Aucun nouvel essai LiveProfessor effectué ; matrice complète, gardes visuelles et reprise matérielle restent à vérifier.
- Validation de cette intervention via `scripts/with-dev-env.sh` : 846 contrôles Swift, 141 tests Node, 6 tests Python des scripts et 11 tests Python des outils réussis ; manifeste valide et compilation native réussie. `git diff --check` sans erreur. Aucun transport/interface native modifié ; pas de nouvelle recette graphique ou matérielle.

## F6 — correction après recette utilisateur

- Recette manuelle F6 (m) AU confirmée par l’utilisateur : six banques, encodeurs, boutons, commandes MIDI et retours OSC, protections au masquage et reprise. Profil et variante conservés `draft`.
- Cause du bug : taille AX imposée à 802 × 602 ; banque locale mise à jour mais clic F6 refusé après resize. Le routage MIDI n’était pas suspendu par cette taille.
- Coordonnées désormais proportionnelles, explicitement déclarées dans le seul profil F6. Titre AX et minimisation recontrôlés avant envoi ; premier plan, fenêtre visible non recouverte, géométrie fraîche et protections souris conservés.
- E1 Freq / E2 Gain dans les six banques ; CC, adresses OSC et cibles AU restent attachés aux paramètres existants. Ancre de préparation Gain historique conservée, aucun remapping LP nécessaire.
- Correction réelle à revalider selon [F6_VALIDATION.md](controller/F6_VALIDATION.md), particulièrement l’effet des bordures de l’hôte sur les proportions AX.
- Validation : 1054 contrôles Swift, 12 tests Python `.rack2`, validateur de manifeste, compilation native et `--activation-check` réussis via le lanceur local. `--transport-checks` échoue sans diagnostic détaillé avant le test final ; ce passage ne confirme donc pas les transports système. Le test graphique échoue après des erreurs LaunchServices/HIServices puis un accès à la liste d’écrans vide (`NSScreen.screens[0]`) dans le banc d’essai ; aucun clic réel F6 validé ici.

## Diagnostic prioritaire — pertes spontanées de sélection F6

- Symptôme utilisateur : huit `Unassigned`, F6 toujours visible, clic F6 rétablit le profil. Cause logicielle de l’effacement identifiée : `apply` remplaçait le profil par nil à chaque détection invalide. Le déclencheur AX exact sur machine réelle n’est pas encore capturé.
- Aucun observateur AX : polling 0,5 s, première fenêtre AXWindows uniquement. Trace ajoutée : premier titre, titre focalisé (diagnostic uniquement), erreurs AX, PID, fraîcheur et raison de chaque transition.
- Dernier profil affiché séparé de l’identité autorisant le routage. Perte transitoire : présentation conservée, bande mémorisée, bandeau de pause ; zéro droit de commande hérité du cache. Vrai plugin reconnu : remplacement immédiat. Fenêtre inconnue : pause sans repli vers F6. Aucun délai de grâce.
- Génération de suivi et date de lecture contrôlées pour refuser les résultats périmés après arrêt/rechargement. Diagnostic JSON avec 100 dernières transitions, journal console `PLC sélection`. Procédure de capture dans F6_VALIDATION.md ; profil toujours `draft`.
- Validation de la séparation : 1075 contrôles Swift et `--activation-check` natif réussis, compilation comprise. Traces JSON générées par le test ; tests synthétiques, aucune reproduction LiveProfessor de la perte spontanée dans cette intervention.

## F6 — vérification effective E1/E2

- Pertes temporaires : profil conservé, pause et reprise confirmés par les nouveaux essais utilisateur ; logique de détection/focus inchangée.
- `.rack2` six bandes indiqué par l’utilisateur inspecté : map active, CC→indices AU et indices AU→OSC corrects pour Freq/Gain dans les six banques. Aucune modification ni régénération du projet nécessaire.
- Instance Controller observée antérieure aux sources actuelles (ancienne interface et effacement du profil). Instance quittée, application reconstruite et relancée ; inversion déjà présente dans les sources désormais embarquée. Profil toujours `draft`, E3…E8 inchangés.
- Diagnostic enrichi du répertoire de profils et des mappings actifs pour distinguer configuration chargée et sources. Tests renforcés sur le binaire `.rack2` et les valeurs Hz/dB distinctes des six banques.
- Validation : 1087 contrôles Swift, 13 tests Python des outils, manifeste et construction release réussis. `--activation-check` release : arrêt 134 sans diagnostic, non validé. Relance graphique observée, mais lecture AX refusée (`-25211`) après signature : réautorisation Accessibility et confirmation physique restent manuelles, procédure dans F6_VALIDATION.md.

## E8 — Output Level global

E8 reste attribué au paramètre AU natif `OUT` (Output Level), commun aux six
banques : canal MIDI 1 / CC23, retour `/pluginlib/waves-f6/e8`, échelle linéaire
normalisée 0…1 vers −18…+18 dB. Le changement de banque ne purge pas sa dernière
valeur OSC. Aucun mapping ni profil modifié ; test de non-régression sur un parcours
des six banques avec un retour unique à +9,0 dB. Une valeur inconnue reste `—` tant
qu’aucun retour n’a été reçu ; cela ne désattribue pas E8.

## F6 — ordre Frequency / Q / Gain livré

- Comparaison avec l’ordre précédent Freq/Gain/Q : Q passe en E2, Gain en E3, dans les six banques et le profil initial. E1, E4…E8 inchangés ; E8 global confirmé par l’utilisateur.
- Identifiants AU, CC de destination, échelles, OSC et mémoire E8 conservés ; aucune modification AX/focus/protection/générateur. Ni nouvelle génération `.rack2` ni apprentissage MIDI nécessaires.
- Tests effectifs des sept commandes × six banques dans le binaire généré et routage physique Swift : 1126 contrôles Swift, 13 tests Python, manifeste et build release réussis. Projet six bandes actuel compatible sans ajout d’affectation.
- PLC reconstruit et relancé ; F6 affiché, lecture AX refusée (`-25211`) après signature. Réautorisation Accessibility et recette physique du nouvel ordre restent manuelles. Profil et variante maintenus `draft`.

## F6 — valeurs initiales et fraîcheur des retours

- Recette manuelle du nouvel ordre terminée : huit encodeurs, six banques, affectations physiques et retours OSC confirmés par l’utilisateur, à préserver. Profil toujours `draft`.
- Aucune lecture initiale fiable confirmée dans la configuration LP actuelle. Documentation OSC et réglages réels inspectés ; Reconnect n’a pas envoyé de dump pendant l’observation. AX n’expose pas les valeurs F6 ; une autre instance AU ou le `.rack2` sauvegardé ne représente pas l’état actif.
- Modèle et affichage distinguent inconnue, confirmée à réception OSC et périmée ; conservation pendant perte de focus, aucun rafraîchissement fictif au retour. Vieillissement conservateur après 5 s, sans prétendre détecter une déconnexion UDP silencieuse. Purge aux changements de session/reconnexion de l’écoute.
- Notification globale de rappel reçue : invalidation puis confirmation des seules valeurs retransmises, E8 partagé préservé. Réception réelle des notifications et exhaustivité des retours de snapshots à vérifier ; aucune écriture audio ni modification des mappings/protections.
- Protocole expérimental sans écriture et blocage décrits dans controller/F6_VALIDATION.md. La lecture initiale/reconnexion exhaustive reste non implémentée faute de preuve de protocole.

Validation de cette intervention : **1525 contrôles Swift**, **13 tests Python .rack2**,
validateur de manifeste, compilation native et **--activation-check réussis** via
`scripts/with-dev-env.sh`. Application release reconstruite/signée et relancée ;
affichage des huit états « Inconnue » au démarrage observé. Aucun paramètre audio
modifié pendant l’inspection. La lecture initiale et le comportement réel des
snapshots restent à confirmer selon la procédure, sans les déclarer fonctionnels.

## F6 — diagnostic des valeurs AX, 16 novembre 2026

- Essai réel strictement en lecture seule : `F6 (m)UI`, Band 6 ; écran Freq 7366 Hz, Q 1.1, Gain −0.8 dB, OUT −0.2 dB. Arbre AX retourné : fenêtre et menus seulement ; aucune de ces quatre valeurs accessible. Valeurs transcrites visuellement, aucune déduction par coordonnées, aucune commande émise.
- Mode ponctuel `--probe-ax-values` ajouté à la sonde/entrée diagnostic existantes, avant tout modèle ou transport ; attributs et erreurs AX, parcours borné. Fonctionnement normal, profils et mappings inchangés.
- Compilation et exécution du diagnostic réussies, mais contexte shell sans accès à la session : `trusted=false`, `hostPID=-1`, `hostAbsent`. Relevé Swift des attributs bruts encore à effectuer depuis un Terminal local autorisé ; ne pas généraliser le constat de l’outil UI à tous les attributs/versions/bandes.
- Aucun paramètre confirmé lisible par AX ; procédure et comparaison dans [controller/F6_VALIDATION.md](controller/F6_VALIDATION.md). Pas de remplacement/reconstruction de l’application distribuée ni de modification audio.

## F6 — sélection visuelle après redimensionnement (16 novembre 2026)

- Défaut identifié dans le calcul : facteurs X/Y de la fenêtre AX entière appliqués à des repères historiques ; aucune mesure de contenu ni soustraction des bordures LiveProfessor. Le comportement exact des bordures/du zoom reste inconnu : aucun décalage fixe ni nouveau facteur inventé. Les tests proportionnels antérieurs ne prouvaient pas le dessin réel.
- Aucune sélection sémantique de bande fiable trouvée ; le relevé AX réel précédent n’exposait que fenêtre et menus. Solution conservatrice : six positions du pointeur mesurées sans clic, mémorisées localement par titre et taille AX exacte, translatées seulement lors d’un déplacement. Référence historique à sa taille exacte seulement ; pas d’extrapolation.
- Options : « Repérer Band N sous le pointeur dans 4 s… », six fois ; calibrages locaux distincts pour plusieurs tailles. Taille inconnue : refus visuel explicite, jamais suspension MIDI pour ce motif. Géométrie AX et CG revalidée avant envoi ; protections de focus, cible recouverte, souris et double clic conservées. Diagnostic JSON `visualCoordinates` : rectangle AX écran, point, offset et motif de refus.
- Profil source, mappings E1…E8, six banques, OSC, conservation du profil et statut `draft` inchangés. Pas de catalogue modifié.
- Validation : 1648 contrôles Swift, compilation native, `--activation-check` et manifeste valides via le lanceur local. Recette réelle non effectuée : toute nouvelle taille nécessite un calibrage ; à taille égale, un changement de zoom/disposition/version exige un nouveau calibrage. Voir F6_VALIDATION.md.


## F6 — bypass par bande et reset sur pression (16 novembre 2026)

- Recette utilisateur acquise : six banques, sélection après resize, ordre Frequency,
  Q, Gain, Range, Threshold, Attack, Release, Output Level, MIDI/OSC et gardes AX.
- AU On/Off identifié pour chaque bande : IDs/indices 8, 20, 32, 44, 56, 68, domaine
  0…1. Polarité, routes LP/OSC et messages physiques des pressions non confirmés.
- Capture passive bornée des messages MIDI ajoutée au diagnostic ; probe AU enrichi
  de `defaultValue`, sans l’assimiler à un reset vérifié. Aucun bypass/reset activé,
  aucune modification du profil, des 43 cibles ou de la session ; F6 reste `draft`.
- À faire : capture press/release E1…E8, On/Off et reset natif dans une copie LP selon
  [F6_VALIDATION.md](controller/F6_VALIDATION.md), puis seulement implémenter les
  mappings confirmés et la migration non destructive.

Validation de cette extension : 1658 contrôles Swift, 13 tests Python `.rack2`,
validateur de manifeste, compilation native et `--activation-check` réussis via
`scripts/with-dev-env.sh` ; `git diff --check` réussi. Captures matérielles, défauts
AU et essais bypass/reset dans LiveProfessor non effectués.


## F6 B16 — 17 novembre 2026

- Bypass inactif et état On/Off inconnu affichés explicitement ; diagnostic enrichi
  des affectations de boutons effectivement chargées. B1…B6 et apprentissage
  conservés ; disposition cible B1 Low Cut, B2…B7 Band 1…6, B8 High Cut,
  B9…B15 réservés, B16 On/Off documentée sans migration ni filtre activé.
- Notes enregistrées Band 1…6 : 89/90/40/41/42/43 canal 1 ; positions physiques
  non prouvées. Capture B16, polarité et mappings LP/OSC encore manquants.
- À faire : capture courte de deux appuis/relâchements B16 selon
  [F6_VALIDATION.md](controller/F6_VALIDATION.md), puis vérification dans une copie LP.
  IDs AU On/Off 8/20/32/44/56/68 conservés ; profil et variante restent `draft`.

Validation B16 : 1799 contrôles Swift, compilation native, `--activation-check`,
validateur de manifeste et `git diff --check` réussis via le lanceur local.
Essais synthétiques ; aucune capture physique ni validation On/Off LP effectuée.


### Capture physique B16 — 17 novembre 2026

Capture arrêtée et preuve conservée dans
`controller/Metadata/waves-f6-b16-midi-capture.json` : source X-TOUCH MINI,
8 messages, soit 4 cycles appui/relâchement. Appui `90 5F 7F`, relâchement
`90 5F 00` (Note On canal 1, note 95 décimale, vélocités 127/0).
Durées observées : 0,396 / 1,505 / 0,371 / 2,028 secondes ; les deux derniers
cycles correspondent à la dernière paire demandée, sans marqueur physique
permettant une attribution plus forte. Aucun message répété pendant les maintiens
observés. Aucun conflit avec les notes enregistrées 89/90/40/41/42/43 canal 1.
Capture strictement en réception, aucun port de sortie MIDI ou OSC créé ; aucune
instance Controller détectée au lancement. Réglages LP consultés puis annulés sans
sauvegarde ; entrée MCU observée `pluginlib`, pas X-TOUCH MINI.
B16 est désormais identifié physiquement pour cette configuration, mais bypass
encore inactif : polarité et mappings/retours On/Off LP restent à vérifier dans une
copie de session. F6 reste draft. Aucun code de routage modifié par cette capture.


### Test de polarité On/Off préparé — 17 novembre 2026

Copie de la session enregistrée `test OSC pluginlib-6-Bands.rack2` préparée dans
`/tmp/pluginlib-f6-b16-tests/F6-B16-test.rack2`, sans ouverture automatique dans LP.
Source SHA256 `935e4489c3673d69d8a71d59df9a2d6d74d5dbd426baed2a7966a6e2ca09a761`,
copie SHA256 `b422438edfdc74effeb2a3467cca6a5964f10f2acec64be1196427b87f1dbee6`.
Original vérifié inchangé ; les changements non enregistrés de LP ne sont pas
inclus dans cette copie. Aucun mapping On/Off dans la session source. Métadonnées :
IDs 8/20/32/44/56/68 et plage 0…1, aucune preuve de polarité.

Outil ciblé `controller/tools/prepare_f6_onoff_probe.py` : clone les six retours
OSC depuis l’affectation absolue Gain vérifiée ; nouvelles adresses configurées
`/pluginlib/diagnostic/f6/bandN/onoff` (N=1…6), vers 127.0.0.1:9001.
Ces adresses sont une configuration de test, pas des adresses natives découvertes.
86 affectations existantes conservées octet pour octet, 6 contrôles/affectations
OSC ajoutés ; aucun MIDI ajouté ni état de plugin modifié. Écriture exclusive,
refus de doublon et d’instance ambiguë ; aucune copie ouverte automatiquement.
Les routes OSC restent bidirectionnelles dans LP ; l’outil de capture n’émet rien.

Récepteur passif lancé en session Codex 65603, fichier de capture
`/tmp/pluginlib-f6-b16-tests/osc-capture.json` (paquets bruts hexadécimaux).
Ne pas lancer Controller en parallèle sur le port 9001. Après les essais, arrêter
ce récepteur et analyser les paquets, sans conclure avant la concordance visuelle.
Dossier temporaire : conserver les preuves utiles après validation.

Manipulations requises dans LP : ouvrir soi-même la copie, sans perdre les
changements non enregistrés du projet actuel ; garder Controller fermé.
Pour Band 1 puis 2…6, utiliser explicitement son interrupteur On/Off : mettre la
bande visuellement désactivée, attendre une seconde, puis visuellement activée,
attendre une seconde. Noter toute bande déjà désactivée avant le premier clic.
Ne pas utiliser B16 à ce stade. Laisser la copie ouverte et annoncer la fin ;
les valeurs seront rapprochées des deux états observés pour chaque bande.
Aucune modification audio déclenchée par l’agent. F6 reste draft, bypass inactif.

Validation : 15 tests Python des outils via `scripts/with-dev-env.sh`, manifeste
valide, contrôle SHA256 de l’original et `git diff --check` réussis. Aucun changement
Swift/profil/catalogue ; essai réel des six retours et polarité encore à faire.


### Résultat réel polarité F6 — 17 novembre 2026

Utilisateur : six bandes désactivées puis réactivées à la souris dans la copie.
Capture OSC arrêtée (session 65603). 115 paquets bruts, dont 24 messages On/Off :
deux séries groupées de six valeurs 1, puis chaque bande 1…6 successivement 0 → 1.
Les séries groupées ne sont pas interprétées comme douze gestes utilisateur.
Concordance avec l’ordre annoncé : **0 = bande désactivée, 1 = bande activée**,
retours OSC float32 `,f` pour chacune des six adresses de diagnostic.
Les six paramètres AU 8/20/32/44/56/68 ont donc un retour réel distinct vérifié.
Dernier état reçu : six bandes activées ; capture désormais arrêtée, ne pas en
faire un état courant confirmé pour une future session.
Preuve durable : `controller/Metadata/waves-f6-onoff-feedback-capture.json`,
avec horodatages, messages diagnostiques décodés et empreinte du fichier brut.
Brut conservé dans `/tmp/pluginlib-f6-b16-tests/osc-capture.json`.
Vérification automatique des six séquences [1,1,0,1] et types float réussie ;
`git diff --check` réussi. Aucun paramètre modifié par l’agent.

Reste à faire : implémentation B16 avec front d’appui seul, protection anti-répétition,
ciblage de la bande confirmée, état inconnu/périmé et gardes existantes ; tester
ensuite explicitement la réception des commandes par LP et les changements de
banque. Le test présent prouve les retours et la polarité, pas l’action B16.
Aucun mapping E1…E8 modifié. F6 reste draft et B16 reste inactif à ce stade.


## B16 On/Off implémenté — 17 novembre 2026

Le contrat spécialisé `ControllerCore/F6BandBypass.swift` réutilise les preuves
physiques et les six routes OSC réelles : appui exact `90 5F 7F`, relâchement
`90 5F 00` (Note Off accepté pour libérer le verrou), paramètres AU
8/20/32/44/56/68, 0 désactivé / 1 activé. Aucun Low Cut, High Cut ni reset ajouté.
Aucun encodeur, CC, échelle, banque, profil JSON ou catalogue modifié.

- B16 cible la banque sélectionnée **dans Controller**, exactement comme E1…E7,
  et seulement F6 mono `F6 (m)UI` reconnu par une lecture AX fraîche, LP au premier
  plan, routage explicitement activé. Même barrière que les encodeurs ; aucun clic
  AX supplémentaire, aucune relaxation des protections existantes. Le suivi inverse
  d’un clic de sélection dans F6 reste absent : sélectionner la bande dans Controller.
- L’armement utilise le bouton existant de routage, désormais libellé
  « Encodeurs + B16 → LP ». Démarrage désarmé. Relâcher B16 une fois après
  démarrage/reconnexion avant son premier appui effectif. Le verrou consomme aussi
  les appuis refusés, y compris pendant apprentissage/pause : revenir sur une cible
  ou changer de banque pendant un maintien ne réémet pas de commande.
- Toute collision avec une sélection apprise sur note 95 canal 1 bloque B16 ;
  aucun apprentissage de sélection sur B16 n’est désormais accepté. Les anciennes
  préférences ne sont ni réécrites ni migrées ; B1…B6 restent comme auparavant.
- Mémoire On/Off par bande mise à jour par OSC même si une autre banque est affichée.
  Seuls les retours numériques exacts 0/1 sont interprétés. Valeur invalide : état
  périmé. Démarrage/arrêt/rechargement/réouverture OSC : état inconnu ; pertes de
  cible/connexion, rappel snapshot et âge ≥ 5 secondes : périmé (même délai
  conservateur que les valeurs existantes). Aucun état initial déduit du `.rack2`.
- Envoi absolu float32 vers 127.0.0.1:9000, adresse existante
  `/pluginlib/diagnostic/f6/bandN/onoff`. L’écoute doit être sur un autre port,
  normalement 9001. Aucun état changé par l’envoi : « Commande émise · attente OSC »
  jusqu’au retour correspondant. Nouvel appui sur cette bande bloqué pendant
  l’attente. Un ancien retour opposé ne déverrouille pas l’attente. Échec UDP :
  invalidation conservatrice. Envoi UDP réussi ne signifie jamais succès du plugin.

### Copie et migration

La copie de validation est prête :
`/tmp/pluginlib-f6-b16-tests/F6-B16-validation.rack2`. Identique à la copie de
polarité validée (SHA256 `b422438edfdc74effeb2a3467cca6a5964f10f2acec64be1196427b87f1dbee6`).
86 affectations originales et six routes On/Off absolues revérifiées. Aucune
nouvelle affectation MIDI LP : B16 est consommé par Controller et émet l’OSC absolu.
Le projet original n’a pas été modifié ni ouvert par l’agent. Aucun envoi à LP
pendant l’implémentation ou les tests. Application release reconstruite et signée,
non lancée ; profil et variante F6 restent `draft`.

Pour migrer un autre projet enregistré, `tools/prepare_f6_onoff_probe.py` prépare
une nouvelle copie avec les six routes, refuse les doublons et les instances
ambiguës, préserve les autres sections et refuse l’écrasement. Ne pas l’appliquer
à nouveau à une copie qui contient déjà ces routes ; utiliser celle-ci directement.
L’outil conserve son nom historique « probe », mais les routes sont celles utilisées
par B16. Les ports de la copie validée sont 9000 entrée LP et 9001 retour Controller.

### Recette manuelle indispensable

1. Ouvrir soi-même la copie B16 de validation et l’application reconstruite.
   Ne pas ouvrir en parallèle un autre Controller ou l’ancien récepteur de capture.
   Vérifier le MCU vers la source virtuelle Controller pour garder E1…E8 opérationnels.
2. F6 au premier plan, activer explicitement « Encodeurs + B16 → LP », puis relâcher
   B16 une fois. Pour chacune des six bandes, sélectionner sa banque dans Controller
   et vérifier la sélection visuelle F6. Si état inconnu/périmé, modifier son On/Off
   à la souris pour recevoir un nouvel état, puis appuyer sur B16 sous cinq secondes.
3. Observer que seule cette bande change, que le relâchement ne change rien, qu’un
   maintien ne répète pas, et que l’affichage n’est confirmé qu’après le retour OSC.
   Relâcher/appuyer de nouveau pour tester l’autre sens ; tester aussi la souris.
4. Vérifier blocage à l’état inconnu/périmé, hors F6, routage désactivé, fenêtre
   masquée et reconnexion pendant maintien. Revenir sur F6 ne doit pas déclencher
   une commande. Revalider E1…E8 et OUT global. Consigner toute absence de retour.

Validation automatique : contrôles Swift incluant B16, 15 tests Python `.rack2`,
manifeste, compilation native, build release/signature et `--activation-check`.
`--f6-osc-command-check` vérifie le nouvel envoi/réception UDP sur ports éphémères
uniquement (aucun envoi vers LP). Nécessite l’accès CoreUDP hors sandbox : premier
essai refusé EPERM, nouvelle exécution autorisée réussie. Les essais réels B16→LP
restent à effectuer ; les retours et la polarité seuls sont déjà validés.

Bilan final B16 : **1864 contrôles Swift**, **15 tests Python**, manifeste,
compilation native, release/signature, `--activation-check` et test UDP dédié
réussis ; `git diff --check` sans erreur. Validation B16 dans LP encore manuelle.
