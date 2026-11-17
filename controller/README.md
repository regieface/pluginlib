# PluginLib Controller — macOS 0.1

Module natif du dépôt PluginLib. Le site et son catalogue restent indépendants et inchangés. macOS 13 ou ultérieur, outils de compilation Swift/Command Line Tools. Aucun téléchargement de dépendance et aucun service distant.

## Construire et ouvrir

Depuis la racine du dépôt :

```sh
./controller/scripts/build-app.sh
open "controller/dist/PluginLib Controller.app"
```

La version construite utilise l’architecture du Mac de compilation. La signature est locale (ad hoc), sans notarisation ni certificat de distribution. L’application n’est pas installée dans `/Applications`.

Pour une démonstration sans accès à LiveProfessor, quitter préalablement toute instance du Controller puis lancer :

```sh
open "controller/dist/PluginLib Controller.app" --args --demo
```

La mention **DÉMO** distingue cette simulation. Pour revenir à la détection réelle, quitter via Options et rouvrir l’application sans `--demo`.

Le bouton rouge masque la fenêtre sans quitter l’application. Un nouveau double-clic sur le `.app` la réaffiche et reprend la détection. **PLC** dans la barre des menus permet également de la réafficher ou de quitter. Glisser la barre de titre pour déplacer la fenêtre et ses bords pour la redimensionner. **Compact / Complet** change l’affichage. **Écran ↓** place la fenêtre en bas de l’écran choisi, au-dessus du Dock. La position est sauvegardée ; une fenêtre hors écran est ramenée sur un écran disponible. La fenêtre est non activante pour éviter de voler le premier plan à LiveProfessor.

## Autorisation et détection

Dans **Options → Autoriser l’accessibilité…**, autoriser **PluginLib Controller** dans Réglages Système → Confidentialité et sécurité → Accessibilité. Aucune autorisation de capture d’écran, extension Chrome ou autorisation de contrôle pour ChatGPT n’est nécessaire au Controller. Après une recompilation, macOS peut demander de retirer/réajouter l’application à cette liste. Garder le chemin du `.app` stable.

L’identifiant de l’installation locale de LiveProfessor a été lu dans son bundle : `com.audiostrom.LiveProfessor2`. Le Controller n’interroge que cet hôte, lorsqu’il est au premier plan. Il lit la **première fenêtre de `AXWindows`**, puis son `AXTitle`, et compare le titre aux alias explicites du profil. Il ne recherche pas un ancien plugin derrière une fenêtre inconnue. Un titre inconnu, une fenêtre sans titre, un refus d’accès ou une autre application au premier plan désactive le profil et masque les valeurs. Les derniers retours OSC sont conservés séparément pour chaque profil pendant la session, puis restaurés quand ce profil revient au premier plan.

La lecture a lieu au maximum deux fois par seconde, sur une file utilitaire, sans lectures concurrentes. Les appels AX ont des délais d’attente bornés. Aucune arborescence de paramètres n’est parcourue et aucune propriété AX n’est écrite. Le processus Controller n’ouvre pas de flux audio et ne charge pas de plugin. Les actions utilisateur peuvent transmettre les encodeurs MIDI et cliquer les sélecteurs visuels F6 repérés, comme décrit dans AUTOMATION.md. Cela évite une intégration dans son moteur audio ; le coût CPU système et le comportement AX restent à mesurer sur une session réelle. Quand la fenêtre est masquée, la lecture est suspendue.

**Options → Afficher le diagnostic** montre le titre effectivement lu et le profil choisi. La sélection d’un plugin dans la chaîne, sans fenêtre ouverte, ne fait pas partie de cette version. L’ordre exposé par LiveProfessor est à confirmer sur la machine/session réelle, notamment avec ses fenêtres flottantes et ses dialogues. Deux instances du même plugin partagent encore le même profil : aucune association OSC à une instance n’est supposée.

## Profils et MIDI/OSC

Deux fichiers sources dans `controller/Profiles/` :

- `waves-f6.json` : `F6 (m)UI`, `F6 (s)UI`.
- `khs-compressor.json` : `kHs CompressorUI`.

Chaque profil contient exactement 8 encodeurs et 16 boutons. E1 du profil F6 pilote `Band 1 Freq` via `/pluginlib/waves-f6/e2` ; E2 pilote `Band 1 Gain` via `/pluginlib/waves-f6/e1`. Les adresses historiques restent attachées aux paramètres. Cette affectation doit être créée dans LiveProfessor : sa présence dans le profil ne prouve pas que LP soit configuré. Les encodeurs E2 à E8 sont également préparés pour les paramètres de la bande 1 et le gain de sortie (table ci-dessous). Les six premiers boutons sélectionnent les banques après apprentissage local ; les dix autres restent non affectés. **— signifie inconnu**, pas zéro ou bouton désactivé. Les anneaux restent neutres tant qu’un domaine de valeur n’est pas documenté.

Modifier les fichiers sources dans `controller/Profiles/`, puis reconstruire. **Ne pas éditer uniquement les copies dans `dist/`**, remplacées à la compilation. Ne pas modifier les ressources signées du bundle. Pour des essais sans reconstruction, lancer avec `--profiles /chemin/du/dossier`, puis utiliser **Recharger les profils**. Le dossier choisi est mémorisé pour les lancements suivants. Dans cette session de développement, utiliser le dossier `controller/Profiles` du dépôt : les ajustements d’échelle se font dans les sources JSON, sans toucher au bundle signé ni interrompre le MIDI. **Ouvrir les profils** ouvre le dossier actuellement utilisé. Un profil invalide ou un alias ambigu désactive les affectations plutôt que conserver un profil périmé.

Un contrôle peut recevoir ces champs optionnels, une fois les correspondances vérifiées :

```json
{
  "id": 1,
  "name": "Nom du paramètre vérifié",
  "feedbackAddress": "/adresse/osc/verifiee",
  "midi": {
    "message": "controlChange",
    "channel": 1,
    "number": 0,
    "encoding": "relativeTwosComplement"
  }
}
```

Les numéros ci-dessus sont un exemple de syntaxe, **pas le mapping du X-Touch Mini**. Les canaux utilisent 1…16 et les numéros 0…127. Il faudra relever le mode réel du contrôleur (standard/MC, couche A/B et encodage relatif), les correspondances LiveProfessor et les retours OSC d’une instance précise.

`ControllerCore/Transports.swift` prépare les interfaces de réception MIDI/OSC et l’état des paramètres. En mode réel, une entrée CoreMIDI reçoit les octets des sources dont le nom identifie le X-Touch Mini, avec reconnexion automatique. Le matériel est configuré en mode MC par l’utilisateur ; ce mode n’est pas détecté automatiquement. Le diagnostic affiche le nombre d’octets reçus et les 24 derniers octets en hexadécimal. Les messages émis par la source virtuelle portent un horodatage `mach_absolute_time()` : pour `MIDIReceived`, un horodatage nul ne signifie pas « maintenant » ([documentation Apple](https://developer.apple.com/documentation/coremidi/midireceived(_:_:))). Le flux MIDI est assemblé, y compris les messages fragmentés, le running status et les horloges intercalées. Les encodeurs E1 à E8 sont transmissibles seulement si leur affectation MIDI est déclarée dans le profil actif. Ils utilisent le mode MC standard, canal 1 / CC16 à CC23, avec encodage `relativeSignMagnitude`. Pour E1, les messages observés `B0 10 01` et `B0 10 41` correspondent aux déplacements +1 et −1 ; `42` vaut −2. Les six boutons appris sont consommés localement pour choisir une banque ; les autres boutons sont uniquement observés. Les messages hors de ces huit encodeurs, les autres canaux et les commandes non affectées ne sont pas transmis. La source MIDI virtuelle `PluginLib Controller E1` expose ces messages à LiveProfessor ; aucun message n’est envoyé au matériel. La liaison est désactivée au démarrage. Après activation par Options, elle ne transmet que si le profil F6 est reconnu, si LP est au premier plan et si la lecture AX date de moins de 0,8 seconde. Un changement de fenêtre/profil suspend la transmission sans annuler l’activation demandée : elle reprend uniquement quand F6 est à nouveau reconnu au premier plan avec une lecture AX récente. Un masquage, une déconnexion ou un arrêt désactive la liaison. Le récepteur OSC écoute exclusivement sur `127.0.0.1`, port 9001 par défaut (modifiable dans Options → Configurer les encodeurs). Aucun message OSC n’est envoyé. La démo ne connecte pas le MIDI ; masquer la fenêtre suspend aussi sa réception. Les retours OSC sont routés vers le profil dont l’adresse est explicitement affectée, même si ce plugin n’est pas au premier plan. Une adresse inconnue ou partagée par plusieurs profils est ignorée. L’affichage courant ne consulte que les valeurs du profil actif. Les nombres reçus restent bruts ; aucune conversion arbitraire en Hz, dB, pourcentage ou position d’anneau n’est appliquée. Un domaine explicite sera nécessaire, et une conversion vers des unités physiques devra être documentée par paramètre.

## Conservation des valeurs entre plugins

Le changement de fenêtre n’efface pas les retours OSC. Exemple : F6 reçoit +6 dB, kHs passe au premier plan, puis F6 revient ; E1 affiche à nouveau +6 dB sans attendre un nouveau mouvement. Si un retour F6 arrive pendant que kHs est affiché, il actualise uniquement la mémoire F6. Un profil jamais renseigné affiche toujours **—**.

Il s’agit de la **dernière valeur reçue**, pas d’une interrogation du plugin au retour : si LP ne transmet pas un changement, Controller ne peut pas l’inventer. La mémoire est vidée quand le suivi est arrêté/masqué, quand le récepteur OSC est reconnecté, quand les profils sont rechargés ou lorsque le processus LiveProfessor disparaît/change. Elle n’est pas enregistrée sur disque. Les affectations restent limitées à l’instance LP définie dans le mapping, identifiée par son adresse OSC unique.

## Affichage des unités

Les valeurs OSC restent conservées brutes. Un contrôle peut déclarer une `valueScale` avec domaine d’entrée, domaine physique, courbe (`linear` ou `logarithmic`), unité, nombre de décimales et affichage du signe. Aucune unité ni courbe n’est appliquée par défaut aux autres commandes. Un texte déjà formaté par l’hôte est conservé. Un nombre hors du domaine déclaré est affiché avec la mention « brut » plutôt qu’extrapolé.

Le contrôle Gain de F6 (maintenant E2) est configuré en dB, à un chiffre après la virgule : `dB = −18 + 36 × valeurOSC`. La plage −18/+18 dB vient du [guide Waves F6, Band Controls](https://www.waves.com/1lib/pdf/plugins/f6.pdf). Les mesures relevées avec l’utilisateur le 16 novembre 2026 sont :

| Gain affiché dans F6 | Retour OSC relevé | Affichage Controller |
| --- | --- | --- |
| 0,0 dB | 0,5 | 0,0 dB |
| +6,0 dB | 0,66571 | +6,0 dB |
| −6,0 dB | 0,33429 | −6,0 dB |

La cohérence est vérifiée à la précision d’affichage de 0,1 dB ; les retours ±6 donnent ±5,96556 dB avant arrondi. Les bornes OSC 0/1 correspondent aux bornes physiques documentées dans cette conversion linéaire, sans avoir été mesurées lors de cette séance. Refaire les mesures si le mapping, ses transformations ou l’encodage du plugin changent. Ne pas réutiliser cette échelle pour une fréquence, un temps, un Q ou un autre plugin sans vérifier sa propre correspondance. Les échelles des sept autres commandes ont ensuite été vérifiées sur les conversions natives de F6 AU : Hz pour la fréquence, Q sans unité, dB pour plage/seuil/sortie, ms pour attaque/relâchement. Les preuves et la méthode sont détaillées dans AUTOMATION.md.

## Huit encodeurs F6 · bande 1

Le choix retenu par l’utilisateur est une banque des paramètres de la bande 1, avec gain de sortie sur E8. Le trajet E1 et son adresse OSC restent identiques. Le port MIDI garde son nom **PluginLib Controller E1** pour conserver le routage LP, même s’il transporte désormais huit encodeurs.

| Encodeur MCU | Paramètre F6 à affecter dans LP | Retour du Knob PluginLib OSC |
| --- | --- | --- |
| Encoder 1 | Band 1 Freq | `/pluginlib/waves-f6/e2` |
| Encoder 2 | Band 1 Gain | `/pluginlib/waves-f6/e1` |
| Encoder 3 | Band 1 Q | `/pluginlib/waves-f6/e3` |
| Encoder 4 | Band 1 Range | `/pluginlib/waves-f6/e4` |
| Encoder 5 | Band 1 Threshold | `/pluginlib/waves-f6/e5` |
| Encoder 6 | Band 1 Attack | `/pluginlib/waves-f6/e6` |
| Encoder 7 | Band 1 Release | `/pluginlib/waves-f6/e7` |
| Encoder 8 | Gain de sortie (Out / Output Gain, selon le libellé LP) | `/pluginlib/waves-f6/e8` |

Pour chaque ligne, affecter le contrôle MCU et le contrôle OSC au même paramètre de la même instance F6. Conserver le contrôleur MCU existant, son entrée `pluginlib`, la sortie MIDI vide, et les ports OSC 9000/9001. Ajouter seulement les sept affectations manquantes. **Options → Configurer les encodeurs** rappelle la table dans Controller. Le diagnostic et le rapport JSON distinguent les compteurs de transmission E1…E8.

Après configuration, vérifier chaque encodeur physique dans les deux sens, puis modifier chaque paramètre à la souris et vérifier son retour OSC. Une valeur inconnue reste **—**. Les huit échelles du profil F6 mono ont été vérifiées sur les conversions natives de F6 AU ; elles affichent désormais dB, Hz, ms ou Q sans unité. La mention **brut** reste le repli pour un contrôle sans échelle explicite. Les plages constructeur seules ne permettent pas de déduire la courbe de normalisation d’un AU dans LP. Étalonner les paramètres séparément, puis modifier `valueScale` dans le profil source et recharger les profils. Les transformations MCU/OSC et le projet LP restent à enregistrer côté LP.

Référence de l’encodage standard : [documentation du protocole MCU par le projet TouchMCU](https://github.com/NicoG60/TouchMCU/blob/main/doc/mackie_control_protocol.md). Les huit voies ont été testées synthétiquement sur CoreMIDI ; leur fonctionnement avec les sept nouvelles affectations dans la session LP doit être validé sur le matériel.

## Vérifications

Command Line Tools seuls ne fournissent pas nécessairement XCTest. Les contrôles du cœur s’exécutent sans bibliothèque de test externe :

```sh
swift run --package-path controller --disable-sandbox ControllerChecks
"controller/dist/PluginLib Controller.app/Contents/MacOS/PluginLibController" --smoke-test
"controller/dist/PluginLib Controller.app/Contents/MacOS/PluginLibController" --probe
"controller/dist/PluginLib Controller.app/Contents/MacOS/PluginLibController" --transport-checks
"controller/dist/PluginLib Controller.app/Contents/MacOS/PluginLibController" --activation-check
```

`--smoke-test` ouvre brièvement une fenêtre de démonstration, vérifie les propriétés natives et les changements de mode, puis quitte. `--probe` effectue une lecture unique sans demander d’autorisation ni envoyer de commande. La démo ne valide pas la détection réelle dans LiveProfessor. `--transport-checks` transmet les deux sens de chacun des huit encodeurs à un observateur connecté à une source virtuelle de test dédiée, et un paquet OSC float à un port UDP local éphémère ; il vérifie aussi les horodatages CoreMIDI reçus et tous les paquets du callback, sans configurer LP ni émettre sur les ports physiques.

Dans une session LiveProfessor :

1. Autoriser le Controller, le lancer hors démo et ouvrir son diagnostic.
2. Ouvrir F6 : contrôler le titre `F6 (m)UI` et le profil Waves F6.
3. Ouvrir kHs Compressor, puis cliquer alternativement dans les deux fenêtres : le profil doit suivre la première fenêtre exposée par AXWindows. Au retour sur F6, son gain doit retrouver le dernier retour en dB sans devoir tourner le X-Touch. Vérifier aussi une mise à jour OSC reçue pendant qu’un autre plugin est affiché.
4. Fermer la fenêtre active, ouvrir un plugin sans profil ou un dialogue LP : aucune ancienne affectation ne doit rester active si la première fenêtre ne correspond plus.
5. Cliquer dans une autre application, puis revenir à LP : vérifier la désactivation et la reprise. Vérifier que cliquer Compact/Complet ne vole pas le premier plan à LP.
6. Placer la fenêtre sur l’écran externe, changer de mode, redimensionner et relancer. Tester aussi un débranchement de l’écran puis « Afficher le Controller » depuis PLC.
7. Tester les Spaces et le plein écran LP : le comportement final dépend aussi de macOS et des niveaux des fenêtres de l’hôte.
8. Sur une session de test audio, comparer la charge et les éventuels décrochages avec/sans Controller. Bouger le X-Touch Mini ne doit encore rien modifier : la transmission reste désactivée tant que la liaison E1 n’est pas activée ; une fois activée, seuls les mouvements E1 doivent atteindre le gain affecté dans LP.

### Essai E1 → gain bande 1 de F6

1. Dans LP, ouvrir **Controllers → Hardware Controllers Setup** et ajouter un contrôleur **MCU**. Choisir **PluginLib Controller E1** comme entrée ; ne pas choisir directement X-Touch Mini pour ce trajet. Laisser la sortie désactivée. Le premier encodeur MCU utilise les messages relevés sur le matériel. Les suivants utilisent le même encodage MC, avec CC17 à CC23 ; vérifier leurs identifiants sur le matériel dans le diagnostic.
2. Dans **Controller Maps**, affecter ce premier encodeur au **gain de la bande 1** de l’instance F6 de test. Ne pas créer simultanément un second mapping depuis l’entrée physique vers ce même paramètre : cela doublerait les déplacements.
3. Pour le retour, ajouter un contrôleur **OSC** dans LP : IP **127.0.0.1**, sortie **9001** (ou le port choisi dans Controller), entrée distincte et libre, par exemple **9000**. Ces ports constituent notre configuration de test ; ils ne sont pas lus automatiquement dans LP. Pas de ping nécessaire.
4. Définir un knob OSC dont l’adresse est **/pluginlib/waves-f6/e1**, puis l’affecter au même gain de la bande 1. Cette adresse appartient à notre configuration ; il ne s’agit pas d’une commande native Waves ou LP. Vérifier les réglages de feedback du contrôle. Les commandes OSC globales de projet ne remplacent pas ce Hardware Controller.
5. Refermer les fenêtres de configuration LP et revenir dans F6. Dans Controller, **Options → Activer les encodeurs → LiveProfessor**. Faire un petit mouvement dans chaque sens : le gain de la bande 1 doit changer. Le diagnostic distingue mouvements E1 et messages réellement transmis.
6. Déplacer aussi le gain à la souris dans F6. La valeur reçue doit apparaître dans E1 et l’adresse dans le diagnostic OSC. Sans retour, la valeur reste **—** ; les pas MIDI ne servent pas à inventer une position.
7. Passer sur un autre plugin/application : les mouvements ne doivent plus être transmis. Au retour dans F6, la liaison activée doit reprendre automatiquement. Les profils restent associés à des types de plugins, sans identification d’instance : limiter ce premier essai à une seule instance F6 affectée dans LP.

Le trajet complet dans LP nécessite cette configuration et une validation manuelle. Les essais automatisés valident le décodage, la source virtuelle, le récepteur UDP et les barrières de transmission ; ils ne prouvent pas que le mapping utilisateur dans LP soit correct. Le port virtuel disparaît quand Controller est masqué/quitté et conserve son identifiant CoreMIDI local dans les préférences pour sa réapparition. Après remplacement du processus, LP peut conserver une connexion périmée même si le nom du port reste affiché. Dans MIDI Devices, sélectionner temporairement No Device sur la ligne pluginlib, puis de nouveau PluginLib Controller E1 : cette réassociation a rétabli le trajet lors du test réel. Le simple décochage de Use n’avait pas suffi.

Le récepteur accepte les messages OSC avec valeurs `i`, `f`, `d`, `s`, `T`, `F`, ainsi que les bundles immédiats. Un seul argument est utilisé comme valeur d’un contrôle ; plusieurs arguments restent visibles dans le diagnostic, sans attribution automatique. Les paquets tronqués, types inconnus, valeurs non finies et bundles planifiés sont rejetés. Aucun choix arbitraire d’échelle ou d’unité.

Références : [définir un contrôleur LP](https://intercom.help/audiostrom/en/articles/8319060-defining-a-new-controller), [Controller Maps](https://intercom.help/audiostrom/en/articles/8318601-controller-maps), [spécification OSC](https://opensoundcontrol.stanford.edu/spec-1_0.html).

### Diagnostic d’une autorisation incohérente

Le résultat de la lecture AX réelle fait autorité : un précontrôle d’autorisation
n’empêche plus d’interroger la fenêtre. Un refus réel est affiché avec la mention
« lecture AX refusée ». Le diagnostic affiche un compteur de cycles pour vérifier
que le suivi continue après le lancement.

Le script de construction refuse désormais de remplacer un Controller ouvert,
ou de continuer s’il ne peut pas vérifier les processus. Il faut quitter par
**Options → Quitter**, et non masquer la fenêtre avec le bouton rouge, avant de
reconstruire. Avec la signature locale ad hoc, chaque binaire modifié peut nécessiter
une nouvelle autorisation. Un certificat de développement sera nécessaire pour
stabiliser l’identité entre différentes versions distribuées.

Si une ancienne entrée reste cochée sans accorder l’accès à la version actuelle,
on peut réinitialiser uniquement le Controller, jamais toutes les applications :

```sh
tccutil reset Accessibility fr.regieface.pluginlib.controller
```

Ensuite utiliser **Options → Autoriser l’accessibilité…** et activer cette version.
Le reset révoque l’ancienne autorisation ; il n’accorde aucun accès automatiquement.
Pour diagnostiquer sans capture d’écran, lancer avec
`--diagnostics-file /private/tmp/pluginlib-controller-live-status.json` : ce fichier
temporaire contient le statut, le compteur de cycles, le titre lu et le profil actif.
Il inclut aussi le statut MIDI, les derniers octets reçus, l’activation de la liaison et le nombre de messages transmis, ainsi que le statut, le compteur et le dernier retour OSC. Le supprimer après vérification. Il ne contient pas de données audio.

## Préparation automatique et couleurs

Voir [AUTOMATION.md](AUTOMATION.md) pour générer une copie de projet F6 avec les huit affectations MIDI/OSC, les métadonnées AU et les couleurs par profil. Le menu **Préparer les affectations F6…** automatise les étapes manuelles ci-dessus pour le projet de référence.

La version 0.6 ajoute six banques F6, les noms anglais exacts et l’apprentissage local des six boutons de sélection. Le générateur prépare les 86 affectations ; consulter [AUTOMATION.md](AUTOMATION.md) pour le routage, les couleurs et la sélection visuelle F6 par clic simple repéré.

La version 0.6.1 synchronise les boutons de banque vers les sélecteurs visibles de F6 (m), avec un repérage lié à la taille de sa fenêtre. Les clics dans F6 à la souris ne sont pas encore suivis dans l’autre sens.

## Recette du pilote F6

Le profil reste non vérifié (`draft`) jusqu’à la recette complète dans LiveProfessor.
Inventaire, prérequis et procédure exacte : [F6_VALIDATION.md](F6_VALIDATION.md).

Après inversion Freq/Gain, E1 physique est routé vers CC17 et E2 vers CC16
(en Band 1), afin de conserver les affectations LP existantes. Le clic visuel suit
les proportions déclarées du profil F6 ; limites et recette dans F6_VALIDATION.md.
