# Tâches

## PluginLib — « Ma collection », chantiers terminés

- **1A** — Aperçu et confirmation avant import JSON.
- **1B** — Archives des abonnements inactifs et retour dans la collection active après réactivation.
- **1C** — Visibilité des plugins abandonnés encore licenciés et badge « Abandonné », vérifié dans Live Server.

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

Chaque tâche doit rester petite, indépendante et validable. Ne pas introduire d’intégration Yamaha DM7.

## Prochaine tâche recommandée

### F6 — recette du repérage visuel par taille

- Calcul proportionnel de la fenêtre AX entière retiré du chemin de clic F6 ; six repères mesurés indépendamment et mémorisés par taille exacte. Aucun modèle des bordures LiveProfessor supposé.
- Tester les six bandes à 802 × 602 puis à deux autres tailles après calibrage dans Options ; déplacer sur chaque écran. Vérifier le surlignage réel et la continuité MIDI avant/après resize, y compris taille non calibrée et clic refusé.
- Vérifier cible recouverte, focus, resize entre préparation/envoi ; conserver `visualCoordinates` du diagnostic JSON. Effacer/recalibrer si zoom ou disposition change à taille identique.
- 1648 contrôles Swift, compilation, `--activation-check` et manifeste valides ; validation manuelle LiveProfessor encore requise, profil `draft`. Les mappings et la conservation du profil validés par l’utilisateur restent intégralement préservés.

### Diagnostic AX — essai réel effectué, relevé brut local restant

- Fenêtre mono F6, Band 6 : Frequency 7366 Hz, Q 1.1, Gain −0.8 dB, Output Level −0.2 dB visibles ; aucune valeur retournée dans l’arbre AX (fenêtre et menus seuls). Aucun clic ni commande MIDI/OSC/AX.
- Test reproductible `--probe-ax-values` compilé/exécuté sans transports ; shell Codex : `trusted=false`, `hostAbsent`, donc attributs bruts non validés dans ce contexte.
- Prochaine étape : exécuter ce diagnostic depuis un Terminal local autorisé, F6 au premier plan, comparer aux affichages sans écriture selon [F6_VALIDATION.md](controller/F6_VALIDATION.md). Aucun lecteur AX à intégrer sans preuve réelle. Conserver le fallback et les mappings.

### Priorité — Confirmer une lecture d’état LP sans écriture

- Huit encodeurs, six banques, affectations physiques et OSC du nouvel ordre sont maintenant confirmés par les essais manuels utilisateur ; conserver ces acquis et F6 en `draft`.
- Lecture initiale des 43 paramètres non confirmée : aucune requête documentée ; essai OSC Reconnect sans dump observé. Ne pas contourner en manipulant les paramètres.
- Fallback livré : états inconnue / reçue par OSC / périmée, mémoire par adresse et E8 global, invalidation focus/snapshot et purge à reconnexion de l’écoute. Seuil de fraîcheur 5 s purement conservateur ; UDP silencieux et rappel plugin non notifié restent indétectables.
- Suivre l’expérience ciblée de F6_VALIDATION.md et obtenir d’Audioström la syntaxe de lecture des Hardware Controls, le cas échéant. Confirmer les retours réels de snapshots séparément des tests simulés.

### Historique — Frequency / Q / Gain désormais confirmé par l’utilisateur

- Pertes temporaires : conservation du profil, pause sécurisée et reprise désormais confirmées par l’utilisateur. Conserver cette logique ; traces disponibles si une nouvelle anomalie apparaît.
- Routes effectives du `.rack2` six bandes contrôlées : les CC et indices AU/OSC sont corrects. Ancienne instance Controller constatée puis remplacée par une reconstruction ; aucune seconde inversion ni modification LP.
- 1087 contrôles Swift, 13 tests `.rack2`, manifeste et build release réussis ; tests effectifs de la map binaire et affichages Hz/dB ajoutés.
- Réautoriser Accessibility après reconstruction (`AX -25211` observé), puis suivre la procédure exacte de [controller/F6_VALIDATION.md](controller/F6_VALIDATION.md) pour les douze essais physiques E1/E2 et leurs valeurs OSC. L’activation-check release a échoué (134), ne pas le compter comme réussi.
- Revalider le surlignage aux tailles réduite/agrandie si nécessaire ; garder profil et variante `draft` jusqu’à recette documentée.

### T13 — Proposer explicitement la création d’un profil manquant

- Ajouter ultérieurement une action seulement pour un plugin que `collectionStatus` classe `owned` ou `subscription` et dont le statut Controller vaut `none` ou `unverified`.
- Ne créer ni supprimer automatiquement de profil et ne jamais proposer cette action hors de « Ma collection ».
- Critère : l’action est absente pour les plugins non possédés et ne modifie pas les droits de collection.

## Intégration progressive

### T1 — Définir un manifeste de liaison PluginLib ↔ Controller — terminé

- `controller/profile-manifest.json` utilise les identifiants existants, accepte plusieurs profils et variantes, et consigne les champs non résolus.

### T2 — Ajouter un validateur croisé hors ligne — terminé

- `scripts/validate_controller_manifest.py` vérifie le catalogue, les profils, les chemins, variantes et doublons sans réécrire les données.

### T3 — Exposer le lien dans PluginLib — terminé

- `controller-status.mjs` réutilise `collectionStatus` et le manifeste pour afficher les trois états uniquement dans « Ma collection ».
- Un profil doit être marqué `verified` et posséder au moins une variante `verified`; sa simple présence ne suffit pas.

### T4 — Résoudre un profil existant depuis PluginLib — terminé

- Lecture directe du manifeste existant, sans index ni duplication des noms/mappings.
- API `CollectionProfileLoader.load` et point d’entrée du modèle recevant le statut calculé par `collectionStatus` et une variante explicite.
- Chargement validé avec état vérifié/non vérifié; absence, référence invalide, contexte incomplet et ambiguïté signalés séparément.
- Chargement AX historique indépendant du manifeste; aucun profil créé et aucune communication activée.
- Tests ciblés intégrés à `ControllerChecks`. L’échange local explicite est réalisé par T14.

## Fiabilisation du Controller

### T5 — Ajouter un diagnostic de validation des six bandes F6

- Compter séparément sélection de banque, message MIDI transmis et retour OSC reçu.
- Critère : le diagnostic permet de vérifier les six banques sans conclure qu’un clic envoyé est un état confirmé.

### T6 — Trajet matériel des six banques — confirmé par l’utilisateur, retest des corrections requis

- Suivre une matrice Band 1…6 × E1…E8 × deux sens, puis vérifier les retours OSC.
- Critère : consigner les résultats réels et les échecs reproductibles; aucune modification de code requise si tout passe.

### T7 — Décider le suivi inverse de la bande F6

- Étudier d’abord si LiveProfessor ou F6 expose un état lisible fiable; ne pas utiliser de capture d’écran ou de clic déduit comme état.
- Critère : note de décision courte avec API/événement vérifié, ou classement explicite « non réalisable de façon fiable ».

### T8 — Stabiliser l’identité de l’application

- Préparer une procédure de signature de développement locale sans ajouter de secret au dépôt.
- Critère : deux constructions successives conservent l’autorisation Accessibility sur la machine de test.

## Nouveau plugin pilote

### T9 — Choisir un seul second plugin

- Choisir une instance disponible dans LiveProfessor avec fenêtre détectable et paramètres documentés; `kHs Compressor` est candidat mais pas encore validé.
- Critère : titre AX, format, version, paramètres prioritaires et instance de test consignés.

### T10 — Cataloguer ses paramètres sans supposition

- Utiliser l’outil AU existant si le format le permet; vérifier noms, identifiants, plages et chaînes natives.
- Critère : métadonnées reproductibles et aucune unité extrapolée depuis F6.

### T11 — Créer son profil minimal

- Commencer par une seule banque de huit encodeurs et les retours OSC nécessaires.
- Critère : validation `ControllerChecks`, test MIDI dans les deux sens et retour OSC réel pour chaque contrôle déclaré.

### T12 — Étendre le générateur seulement après validation

- Remplacer les hypothèses F6 par des capacités explicites du profil, sans refactorisation générale préalable.
- Critère : F6 reste idempotent et le second plugin génère une copie `.rack2` testable sans toucher au projet source.

### T14 — Première passerelle locale PluginLib → Controller — terminé

- Demande JSON versionnée avec pluginId, statut de collection calculé et variante explicite.
- Export réservé aux owned/subscription disposant d’une variante vérifiée; import depuis le sélecteur de fichier des Options.
- Réutilisation du résolveur sans activation MIDI/OSC ni changement du profil actif AX; refus des demandes invalides/non autorisées.
- Tests JavaScript et Swift valides/invalides exécutés; parcours réel navigateur/Controller/LiveProfessor restant à vérifier manuellement.

## Évolutions F6 futures — non implémentées

- Bypass par bande.
- Reset par pression d’encodeur.
- Low Cut et High Cut.
- Mode Stereo/Mid/Side.
- Type de filtre par bande.
- Source sidechain par bande.

Avant chaque commande : relever le paramètre natif et son domaine, vérifier son
identifiant et le mapping dans LiveProfessor ; ne pas déduire d’affectation MIDI.

### E8 — invariant conservé

E8 reste attribué au paramètre AU natif `OUT` (Output Level), commun aux six
banques : canal MIDI 1 / CC23, retour `/pluginlib/waves-f6/e8`, échelle linéaire
normalisée 0…1 vers −18…+18 dB. Le changement de banque ne purge pas sa dernière
valeur OSC. Aucun mapping ni profil modifié ; test de non-régression sur un parcours
des six banques avec un retour unique à +9,0 dB. Une valeur inconnue reste `—` tant
qu’aucun retour n’a été reçu ; cela ne désattribue pas E8.

### Réordonnancement F6 — livré, recette matérielle à terminer

- Six banques : E1 Freq, E2 Q, E3 Gain, E4 Range, E5 Threshold, E6 Attack, E7 Release ; E8 Output Level global confirmé par l’utilisateur et préservé.
- Profil source corrigé ; cibles AU, CC de destination, échelles et OSC conservés par paramètre. Aucun apprentissage MIDI ni nouveau `.rack2` requis.
- 1126 contrôles Swift, 13 tests Python, manifeste et construction release réussis ; PLC relancé. Réautoriser Accessibility (`AX -25211` après signature), puis tester les sept encodeurs dans les six banques selon F6_VALIDATION.md. Profil toujours `draft`.


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
