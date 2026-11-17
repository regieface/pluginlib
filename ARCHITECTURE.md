# Architecture

## Vue d’ensemble

PluginLib et PluginLib Controller partagent le même dépôt et pourront partager des descriptions de contrôles, mais restent deux exécutables indépendants.

```text
Sources éditeurs ──> scripts Node ──> data/*.json ──> site statique

Profils Controller ──> cœur Swift ──> UI macOS / MIDI / OSC / AX
         │
         └──> catalogue AU + outil Python ──> copie de projet LiveProfessor
```

## PluginLib

- `index.html`, `styles.css`, `app.js` : interface statique.
- `catalog.mjs`, `filters.mjs`, `multi-select.mjs`, `collection.mjs`, `descriptions.mjs` et modules voisins : lecture, filtres, collection locale et présentation.
- `data/plugins.json` : catalogue généré, non éditable manuellement.
- `data/overrides.json`, `data/descriptions-fr.json` : corrections et synthèses durables.
- `sources/vendors.json`, `sources/retailer-links.json` : sources de collecte.
- `scripts/*.mjs` : collecte, enrichissement, audits et tests Node.
- `.github/workflows/update-data.yml` : tests puis collecte sur déclenchement manuel et publication des données.
- `collection-privee/` : données personnelles ignorées par Git; hors architecture publiée.

Le site n’a pas de serveur applicatif ni de dépendance d’exécution distante. Les informations collectées sont matérialisées dans les JSON du dépôt.

## PluginLib Controller

Le package Swift `controller/Package.swift` contient trois cibles :

- `ControllerCore` : modèles de profils, validation, sélection de fenêtre, décodage MIDI/OSC, échelles de valeurs, couleurs et géométrie des sélecteurs.
- `PluginLibController` : fenêtre AppKit/SwiftUI, modèle d’état, CoreMIDI, réception UDP/OSC locale, lecture macOS Accessibility et sélection visuelle F6.
- `ControllerChecks` : assertions sans dépendance XCTest.

Les profils JSON de `controller/Profiles/` sont le contrat réutilisable entre l’interface, le routage et la préparation LiveProfessor. Un profil décrit les titres de fenêtre reconnus, 8 encodeurs, 16 boutons, les banques éventuelles, les messages MIDI, les adresses OSC, les échelles et les couleurs.

### Flux en fonctionnement

1. `AccessibilityProbe` lit l’ordre `AXWindows` de LiveProfessor quand il est au premier plan.
2. Le premier titre est comparé exactement aux profils; aucune ancienne fenêtre reconnue derrière une fenêtre inconnue n’est retenue.
3. `MIDIReceiver` reçoit le X-Touch Mini en mode MC. Le modèle route les CC des huit encodeurs vers la source virtuelle CoreMIDI seulement si les gardes sont satisfaites.
4. `OSCReceiver` écoute uniquement `127.0.0.1` et conserve les derniers retours par profil/adresse. `ValueScale` ne formate une unité que lorsqu’une conversion est déclarée et vérifiée.
5. Pour F6, les boutons appris choisissent une banque. Un clic simple protégé peut synchroniser le sélecteur visible du plugin; ce trajet est unidirectionnel.

### Préparation LiveProfessor

- `controller/tools/lp_project.py` lit et réécrit le format ValueTree binaire en préservant les variantes opaques.
- `prepare_lp_project.py` ajoute les contrôles et affectations à une nouvelle copie `.rack2`, à partir d’un profil et d’un catalogue vérifié.
- `controller/Metadata/waves-f6-au.json` contient les paramètres AU et preuves de conversion propres à F6 (m).
- `LPPreparation.swift` expose cette préparation depuis l’application sans charger le projet dans LiveProfessor.

## Frontière actuelle entre les composants

`controller/profile-manifest.json` relie désormais les identifiants du catalogue aux profils Controller et à leurs variantes vérifiées, sans recopier les fiches ni les mappings. Le manifeste est validé hors ligne et lu par le site pour le statut et les variantes exportables; Controller le résout explicitement via `CollectionProfileLoader`, sans activation du routage. Sa résolution et ses limites sont décrites dans `controller/PROFILE_MANIFEST.md`.

PluginLib charge ce manifeste pour présenter un statut et une action d’export dans la vue « Ma collection ». L’appartenance reste calculée par `collectionStatus` à partir des statuts du navigateur et des abonnements actifs : aucun second inventaire n’est créé. `controller-status.mjs` ne rend un statut que pour `owned` ou `subscription`; il distingue un profil réellement vérifié, un profil présent mais non vérifié et l’absence de profil. Retirer une licence ne modifie ni les profils ni le manifeste.

## Hors périmètre

- Traitement ou routage audio.
- Détection du plugin seulement sélectionné dans la chaîne sans fenêtre ouverte.
- Conversion générique des valeurs OSC en unités.
- Intégration Yamaha DM7.


## Passerelle locale par fichier

`controller-request.mjs` exporte une demande JSON version 1 depuis « Ma collection » :
`schemaVersion`, `pluginId`, `licenseStatus` calculé par `collectionStatus` et `variant`
(format, channelLayout, application, pluginName, testedVersion facultatif).
La variante reste toujours explicite conformément au résolveur existant; chaque variante
vérifiée possède sa propre action. Aucun catalogue, profil ou mapping n’est exporté.
Seuls les profils et variantes vérifiés sont proposés aux plugins owned/subscription.

Options → « Importer une demande PluginLib… » ouvre un sélecteur de fichier local.
`CollectionLoadRequest` contrôle le format et délègue à `CollectionProfileLoader` :
version inconnue, fichier absent/invalide, statut non éligible, référence absente,
variante incomplète, indisponible ou ambiguë et profil non vérifié sont refusés.
La configuration résolue est conservée pour consultation et son nom affiché;
la sélection active reste déterminée par AX. Toute tentative d’import suspend le
routage, sans lancer LiveProfessor, créer de profil ou démarrer de transport.

Le statut du fichier est une déclaration locale du navigateur, modifiable par
l’utilisateur : Controller n’a aucun accès à la collection courante du navigateur
et ne peut détecter une licence retirée après l’export. Réexporter après tout
changement. Aucun serveur, service cloud, inventaire parallèle ou dépendance ajouté.
