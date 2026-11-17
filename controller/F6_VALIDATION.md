# Pilote Waves F6 : état et recette LiveProfessor

## Sélection visuelle après resize — correction du 16 novembre 2026

Cette section remplace le repérage proportionnel décrit dans l’historique ci-dessous.
Les mappings E1…E8, les six banques, les retours OSC et la conservation du profil
sont confirmés manuellement par l’utilisateur ; ils ne sont pas modifiés ici.

Cause logicielle précise : `BandSelectorLayout.point` multipliait les offsets de
référence par `largeurAX/802` et `hauteurAX/602`. Le rectangle AX est celui de la
fenêtre complète, en points écran avec origine en haut à gauche ; ce n’est pas
une mesure du contenu Waves. Les marges LiveProfessor n’étaient ni mesurées ni
retirées. Le projet ne fournit pas de rectangle de contenu F6 vérifié ni de règle
fiable de redimensionnement. L’ampleur réelle du décalage et la répartition des
bordures fixes restent à mesurer, aucune formule de remplacement n’est inventée.
Le relevé AX réel précédent n’expose pas de sélecteurs actionnables ; aucune
commande de sélection F6 indépendante des coordonnées n’est établie dans le projet.

Le chemin F6 n’utilise donc plus la mise à l’échelle : six repères indépendants sont
mesurés par taille AX exacte, sans interpolation. La référence historique reste
utilisable uniquement à 802 × 602. Chaque autre taille nécessite un calibrage ;
retourner à une taille déjà calibrée réutilise ses mesures. Déplacer la fenêtre
translate les repères, y compris sur écran à coordonnées négatives. Les calibrages
sont stockés dans les préférences locales, jamais dans le profil draft. Un autre
zoom, une nouvelle version ou une disposition différente à taille identique exige
un nouveau calibrage. Ce correctif ne prétend pas permettre toutes les tailles
sans préparation ni confirmer la bande réellement sélectionnée par un clic émis.

### Recette manuelle courte

1. Reconstruire et lancer PLC avec `--profiles "$PWD/controller/Profiles"` et
   `--diagnostics-file /tmp/pluginlib-f6-resize.json` selon la procédure de lancement
   ci-dessous. F6 (m) AU au premier plan, routage et sélection visuelle activés.
2. À 802 × 602, sélectionner Band 1…6 ; contrôler le surlignage réel et tourner un
   encodeur. Redimensionner : le MIDI doit continuer même si le clic est refusé.
3. Pour cette taille, choisir dans Options **Repérer Band 1 sous le pointeur dans
   4 s…**, remettre F6 au premier plan et laisser le pointeur au centre du sélecteur
   1, sans cliquer ni maintenir de bouton/modificateur. Répéter dans Options pour
   Band 2…6, sans changer de taille. La capture lit seulement le pointeur ; elle ne
   sélectionne aucune bande. Les six mesures sont enregistrées ensemble.
4. Appuyer sur les six boutons appris, vérifier chaque surlignage réel et le contrôle
   MIDI. Refaire à une seconde taille, puis revenir à la première taille calibrée
   et déplacer la fenêtre sur chaque écran. Consigner taille, bande, surlignage,
   MIDI et retour OSC séparément. Une commande envoyée ne confirme pas son effet.
5. Recouvrir le sélecteur, quitter F6 ou redimensionner pendant la préparation : le
   clic doit être refusé. Vérifier les gardes de routage habituelles ; le resize
   seul n’ajoute aucune garde MIDI. En cas d’erreur de mesure, utiliser **Effacer
   les calibrages visuels F6**, puis recommencer les six captures pour chaque taille.

Le JSON `visualCoordinates` indique le rectangle AX complet, le point écran utilisé,
l’offset relatif et les refus ; `visualSyncStatus` distingue envoi et indisponibilité.
La géométrie AX est relue juste avant envoi et comparée au plan, en plus du contrôle
CG de fenêtre visible et non recouverte. Focus, identité, fraîcheur, souris,
modificateurs et clic simple restent protégés. Aucun transport n’est désarmé pour
une erreur de géométrie visuelle.

Validation automatique : **1648 contrôles Swift**, compilation native,
**`--activation-check`** et manifeste valides. Les nouveaux tests couvrent les six bandes à trois tailles non proportionnelles,
mesures indépendantes, déplacement, taille différente refusée, données invalides,
persistance et indépendance MIDI. Les anciens tests de proportion vérifient encore
l’API générique, pas le chemin F6 qui appelle `measuredPoint`.
**Aucun nouveau clic réel dans LiveProfessor validé pendant cette intervention.**

## Lecture Accessibility en lecture seule — 16 novembre 2026

**Résultat réel : aucune valeur des quatre paramètres accessible dans l’arbre AX
retourné par l’outil de diagnostic de la session graphique.** Fenêtre `F6 (m)UI`
ouverte, Band 6 sélectionnée (soulignement jaune), preset affiché `A: Full Reset*`.
Deux observations, dont une capture simultanée arbre/écran, sans clic, touche,
changement de banque, action AX, MIDI ou émission OSC :

| Paramètre | Affichage réel F6 (Band 6) | Valeur dans l’arbre AX retourné |
| --- | --- | --- |
| Frequency (`Freq`) | 7366 Hz | absente |
| Q | 1.1 | absente |
| Gain | −0.8 dB | absente |
| Output Level (`OUT`, global) | −0.2 dB | absente |

L’arbre retourné contient uniquement `standard window F6 (m)UI` et la barre de
menus LiveProfessor, Project, Plugins, Controllers, View, Options, Help. Aucun
slider, champ numérique ou texte de paramètre n’est retourné. Les nombres ci-dessus
sont une transcription visuelle pour comparaison, **pas une lecture AX** ; aucune
valeur n’est déduite de la position d’un bouton ou de la courbe. Les autres bandes
n’ont pas été sélectionnées/testées. Version Waves non relevée. Ce constat porte
sur cette fenêtre et cette représentation AX, pas sur tous les formats/versions.

### Test local reproductible, sans transports

La sonde PLC existante `AccessibilityProbe` ne lisait que premier titre, focus et
minimisation ; `F6VisualSelection` lit aussi la géométrie pour préparer ses clics,
sans lecture de paramètre. Les diagnostics du modèle décrivent les derniers retours
OSC, pas les valeurs AX. Aucun autre outil de parcours AX n’a été trouvé dans les
sources. Le mode ponctuel `--probe-ax-values` étend la sonde et le point d’entrée
existants ; il quitte avant création du modèle, des récepteurs MIDI/OSC et du panneau.
Le fonctionnement normal de PLC et ses mappings restent inchangés.

Depuis un Terminal local autorisé à l’Accessibilité, laisser `F6 (m)UI` au premier
plan pendant le lancement (un lancement différé peut être préparé au Terminal) :

```sh
sh scripts/with-dev-env.sh swift run --package-path controller --disable-sandbox \
  --cache-path controller/.build/dev-swiftpm-cache \
  --config-path controller/.build/dev-swiftpm-config \
  --security-path controller/.build/dev-swiftpm-security \
  PluginLibController --probe-ax-values > /tmp/pluginlib-f6-ax-values.txt
```

Aucune demande automatique d’autorisation, activation/focus, écriture d’attribut ou
action AX. Le mode exige la première fenêtre mono reconnue au premier plan, relit
son titre, parcourt `AXChildren`, `AXContents`, `AXVisibleChildren`, journalise noms
d’attributs et codes AX, rôles, titres, descriptions, `AXValue`, description de
valeur et bornes. Parcours dédupliqué, limité à 20 niveaux, 500 éléments et environ
10 secondes (plus lectures en cours) ; toute troncature est explicite. Une erreur,
une cible changée ou un arbre partiel ne prouve pas l’absence des valeurs.
Comparer les attributs aux quatre nombres affichés au même moment, sans toucher
aux paramètres ; si des valeurs existent, vérifier aussi leur association à la
bande et leurs unités avant toute utilisation dans PLC.

**Exécution Codex :** compilation réussie, diagnostic exécuté ; sortie
`trusted=false`, `hostPID=-1`, `reason=hostAbsent`. Le processus lancé depuis ce
contexte ne voit pas la session graphique LiveProfessor observée par l’outil UI.
Ce n’est ni une erreur AX lue sur F6, ni une preuve que les attributs bruts de sa
fenêtre sont vides. Le relevé Swift brut depuis un contexte local autorisé reste
à faire ; aucune application distribuée n’a été reconstruite/remplacée/relancée.

**Décision :** ne pas intégrer de lecture initiale AX sur la base de cet essai.
Aucun des quatre paramètres n’est confirmé lisible par AX. Compléter le relevé brut
local ; si lui aussi ne fournit que le conteneur, demander à Audioström/Waves une
interface documentée en lecture seule. Conserver les états inconnue/reçue/périmée.

## Valeurs initiales F6 — lecture non confirmée, fraîcheur explicite

Les essais manuels de l’utilisateur confirment désormais les huit encodeurs, les six
banques, les affectations physiques et les retours OSC après réordonnancement.
Ces acquis sont préservés ; le profil et sa variante restent `draft`.

La configuration actuelle fournit des retours de changement, pas une lecture initiale
prouvée. Aucun message de lecture de paramètre mappé n’a été trouvé dans la
[documentation officielle des commandes OSC](https://intercom.help/audiostrom/en/articles/8319137-list-of-osc-commands)
ni dans la [documentation actuelle des contrôleurs](https://docs.audiostrom.com/articles/defining-a-new-controller).
`/Init` renvoie les noms de ViewSets/snapshots, `/StatusPoll` le niveau DSP,
`/GlobalSnapshots/Refresh` la liste des snapshots. Aucun ne documente une lecture des
43 paramètres F6. Le ping maintient une connexion ; il ne lit pas l’état.

Inspection réelle : PluginLib OSC utilise 127.0.0.1, entrée 9000, sortie 9001, ping
désactivé. Aucun bouton de lecture/dump n’est exposé dans ses réglages. Un clic
sur **Reconnect**, sans changer de réglage ni de paramètre audio, n’a produit aucun
nouveau retour pendant l’observation : compteur OSC 561 avant/après. Ce résultat
ponctuel ne démontre pas une impossibilité générale. Les dialogues ont été refermés
sans changement des réglages et F6 réaffiché. Son arbre AX expose un conteneur,
pas les valeurs des paramètres. L’outil AU du dépôt charge une autre instance et
ne lit donc pas celle de LP ; le fichier `.rack2` sauvegardé n’est pas l’état courant
en mémoire. Ces mécanismes ne peuvent pas fournir les valeurs initiales fiables.
Aucune adresse de requête supposée, écriture audio, nouvelle dépendance ou modification
MIDI/AU/profil/`.rack2`/garde AX n’est introduite.

### Ce que PLC peut garantir

- **Inconnue** (`unknown`) : aucun retour pour cette adresse dans la session ; `—`.
- **Reçue par OSC** (`confirmed`) : valeur confirmée au moment de sa réception,
  pas une garantie de lecture continue ni une connexion UDP démontrée.
- **Périmée** (`stale`) : dernière valeur conservée mais non garantie à jour.
  Perte de cible/focus ou changement d’état MIDI invalident les valeurs connues ;
  revenir au premier plan ne les confirme pas. Un retour de plus de 5 secondes est
  aussi périmé : seuil de présentation conservateur, pas une mesure de déconnexion.
  Aucun délai n’est ajouté aux protections de routage.

Les valeurs et leurs dates de réception sont mémorisées par adresse, pour les six
banques. E8 conserve sa cible et sa dernière valeur globales ; un nouveau retour E8
actualise toutes les banques. Changer de banque ne crée aucune valeur ni interrogation.
Un arrêt/redémarrage de l’écoute OSC, rechargement de profils ou changement de processus
LP purge l’ancienne session : les valeurs redeviennent inconnues jusqu’aux retours.
Une interruption UDP silencieuse ne peut pas être détectée formellement sans heartbeat
ou lecture documentés ; l’ancien retour devient périmé après le seuil ci-dessus.

La notification documentée `/GlobalSnapshots/Recalled`, **si reçue sur le port PLC**,
invalide toutes les valeurs connues. Seuls les retours de paramètres reçus ensuite
les confirment à nouveau. Dans un bundle immédiat, l’invalidation est traitée avant
les valeurs du même paquet. Le port global de LP n’a pas été reconfiguré ; réception
réelle de cette notification et retours lors de snapshots globaux/plugin restent à
vérifier. Pas de détection prétendue d’un rappel de snapshot plugin non notifié.

### Expérience ciblée restante (sans écriture de paramètre)

1. Conserver le projet validé. Quitter toute autre instance PLC, lancer la version
   reconstruite avec `--profiles "$PWD/controller/Profiles"` et
   `--diagnostics-file /tmp/pluginlib-f6-initial-values.json`. Garder l’émission MIDI
   désactivée pour ce diagnostic. Ne tourner aucun encodeur ni paramètre.
2. Ouvrir F6 et parcourir les banques localement : relever les adresses, compteurs,
   valeurs et `displayedValueStates`. Attendre 5 secondes : un retour ancien doit
   être marqué périmé, pas présenté comme une lecture actuelle.
3. Contrôler sans modification les ports des réglages **PluginLib OSC**, puis
   essayer une seule fois **Reconnect**. Capturer les retours éventuels et vérifier
   si les 43 adresses distinctes sont réellement émises. Répéter après redémarrage
   de PLC pour écarter le cache. L’essai effectué ici n’a pas révélé de dump.
4. Demander à Audioström si LiveProfessor **2026.1.0** dispose d’une requête de lecture
   des Hardware Controls mappés, et sa syntaxe exacte, son port, sa portée et sa
   garantie d’absence d’écriture. Ne pas envoyer `/get`, `/query`, une adresse de
   contrôle sans argument, zéro ou un delta nul pour deviner le protocole.
5. Si l’éditeur confirme une lecture, la tester dans une copie de session à état
   connu, sans toucher aux commandes, comparer les 43 valeurs aux affichages LP,
   puis vérifier ouverture de profil, six banques, E8 et reconnexion. Si un snapshot
   doit être rappelé pour la recette, l’utilisateur réalise ce rappel dans la session
   de test ; PLC reste uniquement en réception. Capturer notification globale et
   retours de paramètres, y compris ceux qui n’ont pas changé. Aucun rappel audio
   n’a été effectué pendant cette intervention.

Le remplissage initial et la réactualisation exhaustive après snapshot/reconnexion
restent **bloqués par l’absence de lecture fiable confirmée**. Le fallback explicite
est livré ; il ne remplace pas cette fonctionnalité. Les simulations couvrent les
six banques, E8, valeurs inconnues/confirmées/périmées, perte/reprise de cible,
reconnexion, silence OSC, snapshots partiels et ordre d’un bundle. Elles ne prouvent
pas ce que LP émet réellement sur un rappel de snapshot.

## Ordre actuel — Frequency, Q, Gain (16 novembre 2026)

Cette disposition remplace les ordres historiques décrits plus bas. Seules les
positions de Q et Gain ont changé par rapport à Freq/Gain/Q. Les noms natifs restent
`Freq`, `Q`, `Gain`, `Range`, `Threshold`, `Attack`, `Release`, `OUT`.

| Encodeur physique | Paramètre | CC destination Band 1 | Index AU Band 1 | Suffixe OSC |
| --- | --- | --- | --- | --- |
| E1 / CC16 | Frequency (`Freq`) | 17 | 10 | e2 |
| E2 / CC17 | Q | 18 | 11 | e3 |
| E3 / CC18 | Gain | 16 | 12 | e1 |
| E4 / CC19 | Range | 19 | 13 | e4 |
| E5 / CC20 | Threshold | 20 | 14 | e5 |
| E6 / CC21 | Attack | 21 | 15 | e6 |
| E7 / CC22 | Release | 22 | 16 | e7 |
| E8 / CC23 | Output Level (`OUT`), global | 23 | 81 | e8 |

Pour Band N, ajouter `8 × (N−1)` au CC et `12 × (N−1)` à l’index AU
pour E1…E7 seulement ; préfixe OSC `/pluginlib/waves-f6/` pour Band 1,
`/pluginlib/waves-f6/bandN/` pour les autres. E8 reste strictement partagé.
Échelles et retours restent attachés au paramètre. Aucun changement AX, focus,
barrière de sécurité, transport ni générateur ; profil et variante toujours `draft`.

Le profil source et sa banque initiale sont corrigés. Les tests vérifient les
routes physiques dans les deux sens et le binaire généré pour les sept commandes
des six banques, ainsi que les valeurs Freq/Q/Gain et la mémoire globale E8.
Validation : 1126 contrôles Swift, 13 tests Python, manifeste valide et build release
signé réussis. Contrôle du projet six bandes existant : 42 routes de bande conformes,
zéro contrôle/affectation à ajouter. Aucun nouvel apprentissage MIDI ni nouvelle
génération `.rack2` nécessaire : le remapping physique est fait dans PLC.

PLC a été quitté proprement, reconstruit et relancé depuis
`controller/dist/PluginLib Controller.app`. F6 a été affiché dans LiveProfessor ;
la lecture AX par PLC est refusée (`-25211`) après signature. Réautoriser PLC dans
Accessibilité puis le relancer, conserver le projet actuel et réassigner si nécessaire
le MCU à `PluginLib Controller E1` (No Device puis la source). Activer explicitement
le routage. Parcourir les six banques : tourner E1…E7 dans les deux sens et observer
le seul paramètre attendu ; vérifier les retours Hz, Q sans unité, dB et ms. Modifier
aussi ces paramètres à la souris pour vérifier le retour indépendamment du MIDI.
Vérifier qu’E8 conserve sa valeur au changement de banque. Recette physique à faire ;
le test automatisé ne la remplace pas. Commandes de reconstruction et lancement dans
la section « Reconstruction et confirmation manuelle » ci-dessous.

Le profil et sa variante mono restent `draft` dans le manifeste. La recette manuelle
F6 (m) AU rapportée par l’utilisateur confirme les six banques, encodeurs, boutons,
commandes MIDI, retours OSC, protections lors du masquage et reprise du contrôle.
Le redimensionnement a révélé un refus du clic visuel ; les corrections ci-dessous
reste à revalider en session réelle. Le nouvel ordre fréquence/gain doit être confirmé
avec l’application reconstruite (voir le diagnostic E1/E2 ci-dessous). La version
Waves exacte reste à consigner. Aucun passage automatique à `verified`.

## Correction du redimensionnement et nouvel ordre

Cause : `BandSelectorLayout.point` exigeait 802 × 602 points (tolérance 0,5).
`selectBank` changeait bien la banque locale, ses libellés et sa couleur, puis le
plan de clic était refusé. Le MIDI et les retours OSC restaient actifs : ce n’était
pas une suspension générale du contrôle, mais une sélection F6 non synchronisée.

L’utilisateur a précisé finalement que **toute l’interface change proportionnellement**.
Le profil déclare désormais `resizing: proportional` : les positions de référence
sont multipliées par largeur/802 et hauteur/602, puis translatées à la position AX
actuelle. Les profils sans cette déclaration gardent la taille stricte. Aucun état
interne F6 n’est déduit du clic émis. La fenêtre est recontrôlée juste avant envoi
(titre AX, non minimisée, processus au premier plan, fenêtre visible sous le point,
géométrie inchangée depuis la préparation). Un resize pendant la préparation refuse
ce clic périmé ; l’appui suivant relit la géométrie. Le MIDI reste indépendant de
cette erreur visuelle et conserve ses autres gardes.

Limite à vérifier : la formule suppose que les sélecteurs suivent les proportions
de la fenêtre AX entière, y compris les éventuelles marges de l’hôte. Un autre zoom,
des bordures fixes ou une disposition différente nécessiteraient un repérage du
contenu vérifié ; ne pas conclure au succès sur les seuls tests synthétiques.

E1 est maintenant **Freq**, E2 **Gain** dans les six banques. Le contrôle complet
(nom AU, échelle, couleur, CC de destination et adresse OSC) change de position.
Les affectations LP restent inchangées : E1 physique CC16 est routé vers CC17
(fréquence), E2 physique CC17 vers CC16 (gain), avec le décalage de banque habituel.
Les suffixes OSC restent liés aux paramètres historiques : `e2` = Freq, `e1` = Gain.
Il n’est pas nécessaire de régénérer un projet déjà préparé ; le générateur conserve
l’ancre historique Gain/CC16/index 12 même lorsque Gain est affiché en deuxième.

## Inventaire

| Fonction | État et limite |
| --- | --- |
| Chargement JSON, titres AX exacts, 6 banques × 8 encodeurs | Implémenté, tests automatiques ; reconnaissance réelle dépend des fenêtres LP |
| E1…E7 : Freq, Gain, Q, Range, Threshold, Attack, Release | Noms et conversions comparés aux preuves locales AU des six bandes |
| E8 : OUT | Même cible, CC23 et retour partagés dans toutes les banques |
| MIDI MC relatif et routage par banque | Recette réelle confirmée par l’utilisateur ; nouvel ordre à revalider |
| Réception OSC locale et mémoire par adresse | Implémenté ; dernière valeur reçue, aucune interrogation ni confirmation d'état par MIDI |
| Six boutons de banque | Sélection locale implémentée ; notes physiques apprises dans les préférences, jamais inventées dans le profil |
| Sélection visuelle F6 | Six banques confirmées ; nouvelle géométrie proportionnelle à revalider |
| Copie .rack2, 43 MIDI + 43 OSC / 86 affectations | Tests sur fixtures et recette utilisateur ; ancre Gain historique préservée |
| Démo et tests de transport | Simulations ; ne prouvent pas le comportement de F6 dans LP |
| Boutons 7…16, HPF/LPF, solo/bypass et autres paramètres | Non affectés dans ce pilote ; aucune commande implicite |
| Suivi inverse d'un clic dans F6, anneaux/LED du matériel | Absent |
| F6 stéréo/autres formats, plusieurs instances | Non validés ; recette limitée à une instance F6 (m) AU |

## Préparation exacte

1. Utiliser une session de test sauvegardée, avec **LiveProfessor 2026.1.0**, une seule
   instance **F6 (m) Audio Unit**. Noter la version Waves réelle (encore inconnue dans
   les métadonnées). Réduire le niveau d'écoute avant de modifier gains et dynamique.
2. Lancer Controller avec les profils sources (`--profiles /chemin/du/depot/controller/Profiles`),
   autoriser l'Accessibilité macOS et choisir **Recharger les profils**. Désactiver la
   démo. Le routage doit rester en pause au démarrage. Ouvrir **Afficher le diagnostic**.
3. Le projet source doit déjà contenir les contrôleurs Mackie MCU, PluginLib OSC,
   l'entrée virtuelle `PluginLib Controller E1`, les huit encodeurs MCU et les
   affectations MIDI/OSC E1 de référence vers `Band 1 Gain` (index AU 12).
   Ce générateur complète une configuration existante ; il ne crée pas ce socle.
4. Enregistrer ce projet dans LP. Choisir **Options → Préparer les affectations F6…**,
   sélectionner ce fichier et un **nouveau** nom `.rack2`. Un conflit ou une cible
   ambiguë doit être refusé. Le source ne doit pas changer. Ouvrir soi-même la copie
   dans LP ; vérifier que plugins, presets et routage audio sont conservés.
5. Dans LP, associer le MCU à `PluginLib Controller E1` (si nécessaire passer par
   `No Device` après une relance). Configurer la sortie du contrôleur OSC vers
   `127.0.0.1:9001`, ou le port choisi dans Controller. Son entrée doit utiliser un
   autre port libre, par exemple 9000. Ne pas envoyer directement le X-Touch à LP
   en parallèle : éviter les doubles commandes.
6. Mettre le X-Touch Mini en mode MC. Choisir **Apprendre les six boutons de bande…**
   et appuyer une fois sur chacun des six boutons choisis, dans l'ordre Band 1…6.
   Ouvrir `F6 (m)UI` au premier plan, taille de référence **802 × 602 points**, puis tailles réduite/agrandie pour la recette.
   Activer explicitement **Encodeurs → LiveProfessor** et la sélection visuelle F6.

## Matrice de contrôle

Pour chacune des bandes 1 à 6 : appuyer son bouton appris, vérifier nom/couleur
Controller **et surlignage réel F6**, puis tester chacun des huit encodeurs.
E1 = Freq, E2 = Q, E3 = Gain, E4 = Range, E5 = Threshold, E6 = Attack,
E7 = Release, E8 = OUT. Tourner lentement dans les deux sens, puis avec accélération.
Vérifier dans F6 que seul le paramètre attendu bouge ; OUT doit rester global.

Pour chaque cellule Band × E, consigner : `bande | encodeur | sélection locale |
surlignage F6 observé | commande MIDI +/− | paramètre réel +/− | adresse/valeur OSC |
valeur F6 | valeur Controller | résultat/écart`. Utiliser les compteurs MIDI et OSC
séparément : un message envoyé ou un compteur OSC augmenté ne prouve pas que la
bonne commande a été appliquée. Aucun résultat n'est prérempli comme réussi.

Adresses Band 1 : `/pluginlib/waves-f6/e1`…`e7` ; Band N (2…6) :
`/pluginlib/waves-f6/bandN/e1`…`e7`. OUT : `/pluginlib/waves-f6/e8` partout.
Les CC de destination E1/E2 sont 17/16, 25/24, 33/32, 41/40, 49/48, 57/56.
E3…E7 et OUT conservent leurs routes.

Comparer aussi bas/milieu/haut de chaque plage, dans cette session de test :
Gain/Range/OUT −18…+18 dB ; Threshold −60…0 dB ; Attack 0,5…500 ms ;
Release 5…5000 ms ; Freq environ 15,625…21357,437 Hz ; Q environ 0,35…60.
Les bornes fréquence/Q sont des conversions natives AU, avec arrondi d'affichage.
Un retour hors domaine doit afficher `brut`, jamais une extrapolation.
Modifier ensuite un paramètre avec la souris dans F6 : vérifier son retour OSC
indépendamment de l'émission MIDI. Sans retour reçu, `—` reste légitime.

## Gardes et reprise

- Passer sur la fenêtre principale LP, un dialogue ou une autre application : aucune
  commande ne doit passer. Revenir sur F6 : reprise seulement avec lecture AX récente.
- Déplacer F6 sur chaque écran : vérifier la sélection visible des six bandes.
  Réduire puis agrandir F6, sélectionner successivement les six bandes : nom, couleur
  et paramètres Controller doivent suivre, ainsi que le surlignage réel F6.
  Recouvrir la cible, maintenir une touche de modification ou glisser la souris :
  clic refusé avec diagnostic. Ne pas confondre changement de
  banque locale et sélection réelle lorsque le clic est refusé.
- Appuyer rapidement deux fois sur une même bande : aucun double clic ne doit
  activer/désactiver la bande. Vérifier l'état réel dans F6.
- Changer de banque sans retour connu : `—`, jamais les valeurs de la précédente.
  Revenir à une banque renseignée : dernière valeur reçue, sans prétendre relire F6.
- Masquer/arrêter Controller ou relancer LP : routage désarmé et mémoire purgée.
  Relancer Controller : vérifier le port virtuel et les boutons appris avant réactivation.
- Cliquer une autre bande dans F6 : le Controller ne suit pas ce clic, limitation connue.

Conserver le journal, les versions et les échecs reproductibles. Ne passer à `verified`
qu'après validation réelle de la matrice, des retours et des gardes pour cette variante.

## Résultats automatiques de la correction

Via `scripts/with-dev-env.sh` : 1054 contrôles Swift, 12 tests Python des outils
`.rack2`, validateur du manifeste, compilation native et `--activation-check` réussis.
Le test d’activation couvre aussi l’affichage des six banques après calcul sur une
fenêtre redimensionnée, sans émettre de clic. Les tests du cœur couvrent les facteurs
0,75 / 1 / 1,25 / 2, les coordonnées négatives, les cibles masquées/incorrectes,
les changements de géométrie entre préparation et clic et les routes Freq/Gain.

`--transport-checks` retourne un échec sans détail avant son bilan final ; les
transports système ne sont donc pas revalidés par cette exécution.
`--visual-click-check` échoue dans le banc graphique (erreurs LaunchServices/HIServices,
puis liste d’écrans vide) ; la recette LiveProfessor reste nécessaire.

## Perte spontanée du profil : diagnostic prioritaire

Symptôme rapporté : tous les contrôles deviennent `Unassigned` alors que F6 reste
visible ; cliquer F6 restaure immédiatement le contrôle. Le chemin logiciel est
identifié : chaque `apply(ProbeResult)` affectait `profile = selection.profile`,
puis `activeEncoders` devenait vide et `ControllerView` fabriquait ses huit contrôles
`Unassigned`. Le polling tourne toutes les 0,5 seconde en mode RunLoop `common`.
Il n’existe aucun AXObserver ni notification AX de sélection dans ce code.

Le déclencheur exact de la session réelle reste à capturer : perte de premier plan,
erreur AXWindows, liste vide, erreur/titre vide, minimisation, premier titre inconnu
ou résultat périmé. La visibilité de F6 ne prouve pas que LiveProfessor l’expose
comme première fenêtre AX. `AXFocusedWindow` est désormais relevé pour diagnostic
uniquement : aucune recherche d’une ancienne fenêtre F6 derrière une autre cible.

Le dernier profil chargé et l’identité confirmée sont maintenant distincts. Une
perte conserve noms, couleurs, banque et derniers retours OSC avec un bandeau
**profil mémorisé, cible non confirmée, routage en pause**. Ces valeurs restent des
derniers retours, pas un état courant relu. Le routage et les clics ne consultent
jamais le seul profil mémorisé. Seule une nouvelle lecture reconnue et fraîche peut
confirmer la cible ; aucun délai arbitraire ni conservation temporaire du droit de
commander. La limite de fraîcheur existante de 0,8 seconde est conservée.
Un vrai changement vers un autre plugin reconnu remplace immédiatement le profil ;
une fenêtre inconnue laisse la présentation mémorisée mais interdit le routage.
Les sondages lancés avant arrêt/rechargement ne peuvent plus rétablir une sélection.

### Reproduction avec trace

Après reconstruction, lancer depuis la racine du dépôt (quitter l’autre PLC pour
éviter deux ports virtuels/écoutes OSC) :

```sh
sh scripts/with-dev-env.sh swift run --package-path controller --disable-sandbox \
  --cache-path controller/.build/dev-swiftpm-cache \
  --config-path controller/.build/dev-swiftpm-config \
  --security-path controller/.build/dev-swiftpm-security \
  PluginLibController --profiles "$PWD/controller/Profiles" \
  --diagnostics-file /tmp/pluginlib-f6-diagnostic.json
```

1. Ouvrir F6, activer explicitement le routage, sélectionner une bande autre que 1.
2. Reproduire la perte spontanée **avant de recliquer F6**. Lire le bandeau et
   conserver le JSON : `selectionReason`, `lastProbe` et `selectionTrace`.
3. Vérifier que les huit libellés et la banque restent affichés en mode mémorisé,
   mais qu’aucune commande MIDI ni aucun clic n’est émis tant que la cible n’est
   pas confirmée. Les retours OSC peuvent continuer à actualiser leur mémoire.
4. Cliquer F6 puis vérifier la transition vers `targetConfirmed` et la reprise sur
   lecture fraîche, sans remise de banque à 1.
5. Ouvrir une autre fenêtre/plugin reconnu, puis un dialogue non reconnu : vérifier
   respectivement le changement réel de profil et la pause immédiate sans repli F6.
6. Masquer/arrêter puis relancer PLC ; recharger les profils pendant le suivi :
   aucun ancien sondage ne doit réactiver une cible. Réactivation explicite après
   arrêt/masquage comme auparavant.

Les 100 dernières transitions sont conservées dans le JSON ; chaque transition
est aussi envoyée à la console macOS avec le préfixe `PLC sélection`. Les raisons
comprennent `hostNotFrontmost`, `windowsReadFailed`, `windowsEmpty`, `titleReadFailed`,
`titleEmpty`, `windowMinimized`, `unrecognizedFirstWindow`, `frontmostChangedDuringPoll`,
`stalePoll`, `snapshotExpired`, `hostProcessChanged`, `profilesReloaded`, `controllerStopped` et
`targetConfirmed`. La trace conserve les états précédent/suivant et les codes AX
bruts. Des sondages identiques successifs sont regroupés, pas les transitions.
Le JSON est un diagnostic local de la dernière session, pas une preuve de vérification F6.

Validation de cette séparation : 1075 contrôles Swift et test natif `--activation-check` réussis (compilation comprise), via `scripts/with-dev-env.sh`. Les pertes transitoires et changements reconnus sont simulés ; le déclencheur de la perte spontanée réelle reste à capturer.

## Diagnostic E1/E2 — session du 16 novembre 2026

Les pertes temporaires, la présentation conservée, la pause sécurisée et la reprise
sont désormais confirmées par les essais réels rapportés par l’utilisateur. Leur
logique n’a pas été modifiée pendant cette intervention.

Le dossier `controller/generated` a été inspecté uniquement comme preuve de session,
à la demande explicite de l’utilisateur, sans modification. Le fichier sauvegardé
`test OSC pluginlib-6-Bands.rack2` (SHA256
`564777d57f1c518c6f3f3b37814be0812d7000ae882985661aa2a73bc3f3fcee`)
utilise la map active `15483222` et la cible `Processor15597550` :

| Banque | E1 physique CC16 → CC destination → index AU Freq | E2 physique CC17 → CC destination → index AU Gain |
| --- | --- | --- |
| 1 | 17 → 10 | 16 → 12 |
| 2 | 25 → 22 | 24 → 24 |
| 3 | 33 → 34 | 32 → 36 |
| 4 | 41 → 46 | 40 → 48 |
| 5 | 49 → 58 | 48 → 60 |
| 6 | 57 → 70 | 56 → 72 |

Les affectations OSC visent les mêmes indices AU : suffixe `e2` pour Freq,
`e1` pour Gain, préfixes par banque indiqués plus haut. Les indices sont ceux du
catalogue AU existant, pas des identifiants inventés. Le projet initial
`test OSC pluginlib-PluginLib.rack2` ne possède que les affectations de bande 1.
La vérification du six bandes par `prepare()` réussit sans ajout de contrôle ni
d’affectation : aucune régénération nécessaire. Cette inspection prouve le fichier
sauvegardé ; elle ne lit pas d’éventuelles modifications non enregistrées en mémoire LP.

Parcours : `ControllerView` choisit le contrôle par son `id`; `ControllerModel`
transmet les octets du X-Touch à `MIDIStream.routedEncoder`. Celui-ci reconnaît
CC16/17 physiques comme E1/E2, cherche leur `id` dans la banque du profil chargé et
émet le CC déclaré, avec sens/amplitude conservés. La map MCU LP associe ce CC à
`ParameterId`. Le générateur résout `hostParameter` dans le catalogue AU, conserve
l’ancre historique Gain/CC16/index12 et refuse un conflit existant. La map OSC
associe ce même index à son adresse ; `FeedbackBank` mémorise par adresse et
l’affichage applique l’échelle du contrôle : Hz pour E1, dB pour E2.

Cause du décalage observé : l’application ouverte était une ancienne construction
(interface sans import PluginLib, effacement en `Unassigned` à la fenêtre Controllers),
alors que les sources contiennent déjà le nouvel ordre et la conservation du profil.
Le correctif nécessaire est la livraison/recharge de ces sources dans l’application
exécutée, sans seconde inversion du profil ni du `.rack2`. L’ancienne instance a été
quittée proprement, l’application reconstruite et relancée. Le diagnostic JSON expose
désormais `profilesDirectory` et `activeEncoderMappings` (paramètre, CC, OSC, unité)
pour rendre vérifiable le contrat réellement chargé, plutôt que son seul libellé.

### Reconstruction et confirmation manuelle

Depuis la racine, quitter Controller par Options → Quitter, puis :

```sh
sh scripts/with-dev-env.sh sh controller/scripts/build-app.sh
open "$PWD/controller/dist/PluginLib Controller.app" --args \
  --profiles "$PWD/controller/Profiles" \
  --diagnostics-file /tmp/pluginlib-f6-e1-e2.json
```

Quitter toute autre instance avant le lancement : `--profiles` désigne explicitement
les sources et évite une ancienne préférence de répertoire. Après reconstruction,
macOS a retourné `AX -25211` : réautoriser Controller dans Réglages Système →
Confidentialité et sécurité → Accessibilité, puis relancer. Cette autorisation
n’a pas été changée automatiquement. Choisir Recharger les profils si nécessaire.

Conserver le projet six bandes actuel ; aucune recharge LP n’est nécessaire pour
une inversion réalisée dans Controller. Réassigner si besoin le MCU à la nouvelle
source virtuelle `PluginLib Controller E1` après relance (No Device puis la source).
Si une nouvelle copie est nécessaire depuis le socle de bande 1, commande exacte
(sortie nouvelle, refus d’écrasement ; ouvrir ensuite la copie soi-même dans LP) :

```sh
sh scripts/with-dev-env.sh python3 controller/tools/prepare_lp_project.py \
  --project "$PWD/controller/generated/test OSC pluginlib-PluginLib.rack2" \
  --profile "$PWD/controller/Profiles/waves-f6.json" \
  --catalogue "$PWD/controller/Metadata/waves-f6-au.json" \
  --output "$PWD/controller/generated/test OSC pluginlib-Freq-Gain-validation.rack2"
```

Ouvrir F6 au premier plan et réactiver explicitement le routage. Pour les six banques,
contrôler les lignes E1/E2 du JSON puis tourner physiquement chacun dans les deux sens :
E1 déplace seulement Freq et affiche le retour `e2` en Hz ; E2 déplace seulement Gain
et affiche `e1` en dB. Modifier aussi ces paramètres à la souris pour contrôler le
retour indépendamment du MIDI. Vérifier E3…E8 inchangés. Consigner les douze résultats ;
la confirmation matérielle finale reste à faire, profil et variante toujours `draft`.

Validation : 1087 contrôles Swift, 13 tests Python `.rack2`, validateur de manifeste et
construction release/signature réussis. Le nouveau test Python relit le ValueTree
binaire et vérifie les 24 associations MIDI/OSC→AU de Freq/Gain dans la map active ;
les tests Swift vérifient CC physiques→CC de destination et des retours distincts
avec affichages `16 Hz` / `+9,0 dB` dans chaque banque. `--activation-check` sur le
binaire release s’est arrêté avec le code 134 sans diagnostic : il n’est pas compté
comme réussi. Aucun test matériel n’est déduit de ces simulations.

## E8 — Output Level global

E8 reste attribué au paramètre AU natif `OUT` (Output Level), commun aux six
banques : canal MIDI 1 / CC23, retour `/pluginlib/waves-f6/e8`, échelle linéaire
normalisée 0…1 vers −18…+18 dB. Le changement de banque ne purge pas sa dernière
valeur OSC. Aucun mapping ni profil modifié ; test de non-régression sur un parcours
des six banques avec un retour unique à +9,0 dB. Une valeur inconnue reste `—` tant
qu’aucun retour n’a été reçu ; cela ne désattribue pas E8.

Validation de cette intervention : **1525 contrôles Swift**, **13 tests Python .rack2**,
validateur de manifeste, compilation native et **--activation-check réussis** via
`scripts/with-dev-env.sh`. Application release reconstruite/signée et relancée ;
affichage des huit états « Inconnue » au démarrage observé. Aucun paramètre audio
modifié pendant l’inspection. La lecture initiale et le comportement réel des
snapshots restent à confirmer selon la procédure, sans les déclarer fonctionnels.


## Extension bypass/reset — vérification du 16 novembre 2026

La recette utilisateur confirme désormais les six banques, le redimensionnement,
l’ordre E1 Frequency / E2 Q / E3 Gain / E4 Range / E5 Threshold / E6 Attack /
E7 Release / E8 Output Level, MIDI/OSC et gardes AX. Les sections historiques
ci-dessus décrivent des étapes antérieures. F6 reste `draft`.

Commandes AU identifiées dans `Metadata/waves-f6-au.json` :

| Bande | Nom natif | ID AU | Index LP du catalogue | Domaine AU |
| --- | --- | --- | --- | --- |
| 1 | Band 1 On/Off | 8 | 8 | 0…1 |
| 2 | Band 2 On/Off | 20 | 20 | 0…1 |
| 3 | Band 3 On/Off | 32 | 32 | 0…1 |
| 4 | Band 4 On/Off | 44 | 44 | 0…1 |
| 5 | Band 5 On/Off | 56 | 56 | 0…1 |
| 6 | Band 6 On/Off | 68 | 68 | 0…1 |

Cela confirme les cibles, pas la polarité ni le comportement toggle dans LP.
Les 43 cibles préparées sont les 42 paramètres continus de bandes + OUT ;
le générateur ne prépare que les encodeurs relatifs. Aucun mapping de bouton
On/Off ou reset n’est prouvé par ces sources. Les boutons de sélection sont
appris dans les préférences ; kHs ne fournit aucun précédent vérifié.
Aucun fichier de session actif ni matériel n’a été interrogé durant cet audit.
Les preuves historiques de session décrites plus haut concernent les rotations.

Le catalogue ne contient pas de valeurs par défaut. Le probe AU existant omettait
`AudioUnitParameterInfo.defaultValue` ; il l’exporte maintenant. Cette valeur native
reste à comparer au reset réel du plugin : ni milieu de plage, ni valeur de preset,
ni valeur courante ne doit être substituée à une valeur de reset confirmée.
Aucune méthode native de reset par MIDI/OSC ou geste souris n’est vérifiée ici.

### Capture ciblée à réaliser

1. Quitter toute autre instance de Controller. Lancer avec les sources et
   `--diagnostics-file /tmp/pluginlib-f6-press.json` selon la commande de diagnostic
   plus haut. Désactiver le routage, la sélection visuelle et tout apprentissage.
   Le diagnostic conserve les **256 derniers messages MIDI assemblés** avec uptime
   et octets décimaux, et `midiCaptureTotal` permet de détecter une troncature.
   Il ne s’agit pas d’un journal durable : copier le JSON après chaque série.
2. En mode MC, appuyer puis relâcher E1…E8 séparément, sans rotation ; noter les
   heures/uptimes et l’ordre. Pour chaque encodeur, faire un appui bref, un maintien
   de deux secondes, deux appuis, puis une rotation. Relever canal, type, numéro,
   valeur pressée, valeur relâchée et répétitions. Ne supposer aucun numéro MCU.
   Vérifier les collisions avec les six boutons appris. Aucun reset n’est émis.
3. Dans LP, enregistrer **une nouvelle copie** de la session six bandes, puis y
   apprendre manuellement une commande et un retour OSC pour `Band 1 On/Off`.
   Noter l’adresse réellement configurée, le type d’argument, les valeurs reçues
   lors des changements souris actif/inactif et l’index de cible. Répéter pour les
   six bandes. Tester le comportement absolu/toggle et la séparation press/release.
   Sauvegarder cette copie et conserver les preuves de mapping pour une migration.
   Le préparateur actuel ne sait pas ajouter ces commandes : ne pas lui attribuer
   cette capacité, ne pas modifier son schéma sur la base d’une hypothèse.
4. Pour relever les défauts AU hors session (outil explicite qui instancie puis
   libère le plugin, sans initialisation audio), utiliser un nouveau fichier :

   ```sh
   sh scripts/with-dev-env.sh swift controller/tools/au_parameters.swift \
     --name "Waves: F6 (m)" --output /tmp/pluginlib-f6-au-defaults.json
   ```

   Sur la copie de test, vérifier le geste de reset natif réellement disponible
   et comparer sa valeur avec `defaultValue` pour les sept paramètres de chacune
   des six bandes et OUT. Consigner version Waves, valeur AU, texte affiché et
   retour OSC. Une absence ou divergence bloque le reset concerné.

### Contrat de l’implémentation suivante

Le bypass de bande active devra cibler son On/Off et afficher inconnu avant retour,
confirmé uniquement après un retour interprétable, puis périmé après rupture de
continuité. Un envoi ne doit jamais inverser optimistement l’état affiché. Le reset
nécessitera un front d’appui explicite appris et validé, un verrou jusqu’au
relâchement, aucun déclenchement sur maintien/répétition, et les gardes AX/routage
existantes. Un changement de banque ou une reconnexion pendant un maintien ne
doit pas réarmer ce même appui. Le niveau OUT reste global.

**Livré maintenant :** capture MIDI passive, export du défaut AU par l’outil hors
session et tests de capture/identifiants. Aucun bypass/reset activé, aucune adresse
OSC ou note ajoutée, aucun profil ni `.rack2` modifié. Migration différée jusqu’aux
preuves ci-dessus ; elle devra produire une copie nouvelle, refuser l’écrasement
et préserver les 86 affectations continues existantes. Ouvrir la copie manuellement.

Validation de cette extension : 1658 contrôles Swift, 13 tests Python `.rack2`,
validateur de manifeste, compilation native et `--activation-check` réussis via
`scripts/with-dev-env.sh` ; `git diff --check` réussi. Captures matérielles, défauts
AU et essais bypass/reset dans LiveProfessor non effectués.


## B16 — préparation du 17 novembre 2026

Bypass **inactif**, état On/Off **inconnu** explicitement affiché pour la banque
locale. Cela ne confirme pas que la bande visible dans F6 est sélectionnée : le
suivi inverse souris est absent. Aucun changement de profil ni de session.

Audit : les slots UI B1…B6 sélectionnent Band 1…6 ; B7…B16 sont sans affectation.
Les préférences locales `controller.f6BandButtons` du domaine
`fr.regieface.pluginlib.controller` contiennent, pour Band 1…6, les notes décimales
89, 90, 40, 41, 42, 43, canal 1. Elles ne constituent pas une capture des positions
physiques. Le diagnostic `activeButtonMappings` donne les affectations réellement
chargées dans le processus, y compris lors d’un lancement en ligne de commande.
Pas de capture B16 trouvée dans les preuves consultées ; aucun numéro déduit du MC.

Disposition future réservée (non appliquée) :

| Position physique cible | Fonction future | État actuel |
| --- | --- | --- |
| B1 | Low Cut | futur, ne pas déplacer Band 1 maintenant |
| B2…B7 | Band 1…6 | migration différée, apprentissage actuel conservé |
| B8 | High Cut | futur, inactif |
| B9…B15 | Réserve | sans commande |
| B16 | On/Off de la bande confirmée | inactif, message et mapping non vérifiés |

### Prochaine manipulation exacte — capture B16 (moins d’une minute)

Quitter les autres instances puis lancer depuis la racine :

```sh
sh scripts/with-dev-env.sh swift run --package-path controller --disable-sandbox \
  --cache-path controller/.build/dev-swiftpm-cache \
  --config-path controller/.build/dev-swiftpm-config \
  --security-path controller/.build/dev-swiftpm-security \
  PluginLibController --profiles "$PWD/controller/Profiles" \
  --diagnostics-file /tmp/pluginlib-f6-b16.json
```

Sans activer le routage ni l’apprentissage, en mode MC : appuyer brièvement B16,
relâcher, attendre une seconde, maintenir B16 deux secondes puis relâcher.
Copier immédiatement `/tmp/pluginlib-f6-b16.json` vers un nouveau fichier de preuve,
sans toucher aux autres boutons. Fournir `midiCapture` et `activeButtonMappings`.
La capture doit distinguer les deux appuis, les deux relâchements et toute répétition ;
vérifier qu’aucun message n’est partagé avec une sélection apprise. Si un autre
logiciel reçoit directement le X-Touch, le déconnecter de cette entrée pour ce test.

### Vérification LP suivante, avant toute activation

Dans une copie nouvelle de la session six bandes, relever pour chaque `Band N On/Off`
les IDs 8/20/32/44/56/68, la polarité réellement observée actif/inactif, les messages
acceptés par le mapping LP, l’adresse/type/valeur OSC et le comportement au maintien
et au relâchement. Aucun mapping ou adresse n’est fourni artificiellement ici.
Le préparateur actuel ne crée pas ces six nouvelles commandes. Ne pas écraser le
source et ne pas modifier silencieusement le projet actif.

Avant de déplacer les sélections, sauvegarder les préférences et relever les six
boutons physiques actuels ; apprendre B2…B7 dans l’ordre seulement lors d’une
migration explicite, vérifier les six sélections visuelles et l’absence de collision
B16, puis adapter les slots UI dans la même intervention. B1/B8 restent inactifs.
Une simple reconnaissance AX de F6 ou une banque locale ne suffira pas au bypass :
il faudra une preuve récente de sélection réelle ; un clic émis ne confirme pas
l’état du plugin. Échec de sélection, état inconnu/périmé ou perte AX : aucune
inversion calculée. Aucun envoi sur relâchement ou répétition d’appui.

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
