# PRODUCT_VISION — PluginLib & PluginLib Controller (PLC)

> **Version :** 0.1 — Première synthèse de conception  
> **Date :** 17 novembre 2026  
> **Statut :** document de travail évolutif, **pas** un cahier des charges technique figé  
> **Noms :** « PluginLib » et « PluginLib Controller / PLC » sont des **noms provisoires**.

## 0. Comment lire ce document

Les points sont qualifiés de la manière suivante :

- **✅ Décidé** : besoin ou comportement souhaité explicitement validé. Il ne préjuge **pas** de sa faisabilité technique.
- **🎯 Objectif** : résultat idéal retenu, dont les conditions de réalisation restent à valider.
- **🟡 À étudier** : idée ou modalité non tranchée, ou dépendant d'une expérimentation.
- **🔵 Plus tard** : évolution souhaitable, non prioritaire.
- **⛔ Écarté / remplacé** : orientation abandonnée au cours des échanges.

**Règle de méthode :** ne pas confondre la vision produit, les choix d'architecture logicielle et l'état du code existant. Un élément décrit ici n'est pas nécessairement développé. Les décisions techniques antérieures restent révisables. Les questions sont traitées par thème, de préférence via QCM, sans vouloir tout trancher avant de reprendre le développement.

---

## 1. Origine du besoin et proposition de valeur

### 1.1 Contexte professionnel

Le créateur du projet est un **sonorisateur live basé en France**, non développeur de métier. Il accompagne certains groupes régulièrement et sonorise d'autres groupes pour des concerts ponctuels.

Il **ne possède pas de console de mixage personnelle** : il travaille sur les consoles fournies par les salles ou les productions. Sa solution de mixage nomade repose sur **LiveProfessor (LP)** et sa collection de plugins, avec des connexions audio selon les contextes (**USB, Dante, MADI**, etc.). La console d'accueil sert principalement au transit audio et au mixage des niveaux ; la logique des traitements est conservée dans LP.

Une session LP est généralement préparée pour chaque groupe et demeure **largement identique d'un concert à l'autre**. Peuvent varier selon le concert : le raccordement LP↔console, le transport audio, certaines communications MIDI avec la console, et le nombre ou l'ordre des morceaux (donc les cues LP).

Chaque groupe peut nécessiter une architecture très différente : nombre d'artistes et d'instruments, style musical, niveau des musiciens, temps disponible pour les balances, et stratégie de traitement. Le point de départ habituel est **une session LP vierge**, même si la conception commence avec une intention de mixage réfléchie et évolue ensuite pendant la construction et l'écoute.

### 1.2 Les trois difficultés que le produit doit réduire

1. **Concevoir l'architecture audio** : traitements par entrée ou par bus, chaînes d'inserts, effets, routings, sidechains, chemins parallèles et compensations de délai.
2. **Choisir les bons plugins** : comparer la latence, la charge CPU, les caractéristiques des traitements (attaque/release, topologie, détecteur, coloration, sidechain, mix, M/S, etc.), la stabilité et l'ergonomie.
3. **Configurer et maintenir le contrôle physique** : affecter les commandes MIDI de chaque plugin, puis devoir les refaire après des ajouts, suppressions ou remplacements. Cette charge pousse parfois à mixer à la souris, ce qui est inconfortable en live.

### 1.3 Ambition

**PluginLib** : connaissance des plugins, gestion de la collection, aide au choix et **conception de structures de mixage** pouvant idéalement être transférées vers LiveProfessor.

**PLC** : **contrôle matériel des plugins**, fluide et immédiatement utilisable en live, à partir de profils réutilisables ; **pas** un contrôleur général des cues et ViewSets.

**Principe directeur :** automatiser le travail technique répétitif, sans automatiser silencieusement les changements qui pourraient perturber une configuration live. Les interventions structurelles sont explicites, prévisualisées lorsque possible, sauvegardées et réversibles.

---

## 2. PluginLib — Catalogue et connaissance des plugins

### 2.1 Périmètre et qualité des données

- ✅ **Catalogue aussi exhaustif que possible** des plugins de **mixage et mastering** qui traitent un signal audio existant ; **exclusion des instruments virtuels, synthétiseurs et samplers**.
- ✅ Référencer un plugin même si certaines informations ne sont pas encore disponibles ; **enrichissement progressif**.
- ✅ Ne jamais inventer de données manquantes : **vérifié / à confirmer / inconnu**, avec sources et contexte lorsque possible.
- 🎯 Pour chaque plugin : véritable fabricant, fiche officielle, image de l'interface, catégorie, fonctions et caractéristiques détaillées. Exemples de métadonnées utiles : technologie (opto, VCA, FET, variable-mu…), circuits actifs/passifs, détecteur, valeurs d'attaque/release, coloration, contrôle M/S, sidechain externe, fonctions du sidechain, mix dry/wet, plage de réglage, latence à 48/96 kHz, etc.
- ✅ Distinguer les **faits objectifs** des **observations sonores subjectives**, des hypothèses et des approximations.

### 2.2 Cycle de vie des produits

- ✅ Le **catalogue actif** privilégie les plugins encore commercialisés/maintenus ; les produits abandonnés ne doivent pas encombrer la recherche normale.
- ✅ Identifier les produits **remplacés par un successeur** et expliciter le remplacement quand il est confirmé.
- ✅ Si un plugin **déjà présent dans la collection** devient abandonné ou non maintenu, **le conserver visible dans la collection**, avec un avertissement « Abandonné » ; préserver fiche, rapports et profils PLC.
- 🟡 Définir des critères fiables de fin de support, et la politique de conservation technique des références historiques hors catalogue actif (pour éviter les liens brisés).

### 2.3 Recherche, découverte et comparaison

- ✅ Deux méthodes complémentaires : **filtres techniques avancés** et **recherche en langage naturel** à partir d'une intention de mixage.
- ✅ Rechercher **d'abord dans la collection personnelle** ; étendre au catalogue global **uniquement à la demande**, en conservant les critères.
- ✅ Fiches individuelles détaillées avec alternatives suggérées.
- ✅ **Comparateur côte à côte** de plusieurs plugins, adaptable à leur famille et à leurs caractéristiques.
  - **État actuel** — Comparateur implémenté avec les données documentées du catalogue et les droits de la collection. Le mode « Différences uniquement » conserve les informations incertaines ou manquantes. Parcours et affichage sur fenêtres étroites validés manuellement dans Live Server. Les mesures CPU et les résultats de tests de stabilité restent à renseigner.
- 🎯 Recommandations motivées, qui prennent en compte les exigences de latence, CPU et stabilité live ; les incertitudes restent affichées.
- 🟡 Une recherche en langage naturel pourrait renseigner des filtres techniques modifiables ; modalité non décidée.

### 2.4 Collection personnelle et droits d'utilisation

- ✅ La collection active contient **uniquement les plugins réellement utilisables sous licence**, et non tout ce qui est installé sur le Mac.
- ✅ Distinguer **licences perpétuelles** et **abonnements actifs**.
- ✅ À expiration d'un abonnement sans autre licence valide : **archiver** les plugins concernés, sans effacer fiches, observations, rapports ou profils PLC. Une réactivation permet leur retour dans la collection active.
- ✅ Les plugins abandonnés mais **toujours licenciés** restent dans la collection active avec avertissement : l'abandon commercial et l'expiration de licence sont deux situations distinctes.
- ✅ Détection des licences **lorsque c'est possible**, puis gestion manuelle en complément ; une installation seule ne vaut pas preuve de licence.
- ✅ Après import/synchronisation, **présenter les nouveaux plugins pour validation avant ajout**. Pas d'ajout silencieux.
- 🟡 Étudier l'import **CSV iLok** et, si une interface appropriée existe, la synchronisation de compte iLok ; ne présumer d'aucune API publique exploitable.
- ✅ Conserver les **bundles** et leurs plugins individuels, suivre l'évolution du contenu des bundles lorsqu'elle est connue ; distinguer **contenu commercial actuel** et **droits effectivement détenus** par l'utilisateur.
- 🟡 Déterminer les méthodes adaptées aux autres gestionnaires de licences et au suivi des expirations.

### 2.5 Informations personnelles, mesures et fiabilité

- ✅ **Étiquettes personnelles libres**, sans familles obligatoires.
- ✅ Ajouter observations, avis, notes et **mesures personnelles** aux fiches (ex. latence, CPU, coloration sur une source donnée).
- ✅ Ne pas confondre mesures personnelles, données fabricant et appréciations subjectives ; conserver les **conditions de mesure** (ordinateur, fréquence d'échantillonnage, version, contexte pertinent).
- ✅ **Rapports d'incident de fiabilité live** : type de problème (dropouts, rappel de snapshots, etc.), description, versions et contexte, statut et historique.
- ✅ Possibilité d'étiqueter un plugin **« À éviter en live »** tant qu'un problème n'a pas été personnellement résolu/validé.
- ✅ Une nouvelle version potentiellement corrective peut donner lieu à une **alerte de retest** ; elle **ne retire jamais à elle seule l'avertissement**. La résolution est confirmée après un test personnel satisfaisant ; l'historique est conservé.
- 🔵 Surveillance générale des mises à jour de **toute** la collection : évolution future. Priorité au suivi des incidents et aux versions qui peuvent les corriger.

---

## 3. PluginLib — Conception d'architectures de mixage

### 3.1 Une conception libre, liée à une intention sonore

- ✅ Les architectures ne doivent **pas** être déduites automatiquement d'un patch ou d'une fiche technique : le même patch peut conduire à un traitement par canal, sous-groupe, effets seuls, voix lead seule, etc.
- ✅ Le créateur commence généralement avec une **stratégie préétablie**, mais doit rester libre de la modifier dans PluginLib et directement dans LP.
- ⛔ L'import de patch **n'est pas une fonctionnalité prioritaire** ; son intérêt devra être justifié avant un éventuel retour dans le périmètre.
- ✅ **Deux vues du même modèle** : une vue graphique globale des routings et une vue détaillée des chaînes et plugins. Ne pas créer deux architectures indépendantes.
- 🎯 Concevoir les chaînes, bus, inserts, auxiliaires, traitements parallèles, routings et sidechains ; les détails du modèle restent à définir.

### 3.2 Interopérabilité souhaitée avec LiveProfessor

- 🎯 Pouvoir **créer une nouvelle session LP** à partir de l'architecture préparée.
- 🎯 Pouvoir **modifier de façon ciblée une session LP existante**, sans toucher aux parties non concernées.
- ✅ Conserver la possibilité de modifier librement dans LP après export.
- 🎯 **Synchronisation bidirectionnelle contrôlée** de la **structure** : comparaison des deux états, visualisation des différences, sélection des changements à importer ou exporter et validation manuelle. Aucune synchronisation structurelle silencieuse.
- ✅ **Périmètre de cette synchronisation** : chaînes, noms, plugins utilisés, ordre, connexions et routings. **Hors périmètre** : réglages internes, presets, états de plugins, snapshots et cues.
- ✅ Avant toute opération qui modifie une configuration existante : **sauvegarde préalable**, revue/validation des modifications et objectif de retour arrière. Les détails de la sauvegarde/restauration restent à spécifier.
- 🟡 La capacité réelle de création, lecture, modification et comparaison de sessions dépend des interfaces offertes par LP et, potentiellement, de sa version 2027.

### 3.3 Blocs de traitement réutilisables

- ✅ Sauvegarder et réutiliser **une chaîne simple** ou **un ensemble complexe de chaînes/routings**, sans modèle imposé.
- 🎯 Principe **« Save All, Recall Partial »** : lors de la sauvegarde, conserver tout ce qui est **techniquement récupérable**, y compris les états et réglages des plugins **si possible** ; **au chargement**, choisir les éléments à rappeler.
- ⚠️ **Ne pas confondre** ce rappel sélectif avec la synchronisation structurelle PluginLib↔LP, volontairement limitée à la structure.
- 🟡 Déterminer comment capturer/restaurer fidèlement les états des plugins, avec quoi les versionner, et ce qui se passe quand un plugin manque ou diffère de version.

### 3.4 Sidechains et continuité du signal

- ✅ Représenter les sidechains provenant d'**une autre chaîne LP** ou d'**une source externe à LP** ; prendre en compte, lorsque pertinent, les chemins de détection au sein d'une chaîne.
- 🎯 Détecter les risques de **rupture de transmission des canaux de sidechain** à travers certains plugins intermédiaires.
- ✅ Lorsque le risque ou l'erreur est identifié : **avertissement compréhensible + proposition de solutions alternatives** ; **pas de correction automatique**.
- 🟡 La détection doit tenir compte des particularités de LP, du format des plugins, des canaux réellement exposés et des preuves disponibles ; ne pas affirmer un blocage non vérifié.

### 3.5 Latences

- ✅ Analyse limitée aux **latences et décalages internes à LiveProfessor** : plugins, chaînes, bus, chemins parallèles, sidechains internes et compensation appliquée par LP.
- ✅ Afficher les cumuls, détecter les problèmes potentiels et **proposer des corrections** ; **ne pas appliquer automatiquement**.
- ✅ Éviter les **doubles compensations** ; calculs adaptés notamment aux fréquences 48 et 96 kHz et à la fiabilité des données disponibles.
- ⛔ Les latences d'interface audio, de console et de réseau/transport audio **ne font pas partie de cette analyse**.

### 3.6 CPU et profils matériels

- ✅ Afficher les données CPU **par plugin**, avec conditions de mesure et niveau de fiabilité.
- ✅ Estimer la charge d'une architecture ou d'une session, identifier les traitements et chemins potentiellement coûteux.
- ✅ Utiliser si nécessaire des **approximations identifiées comme telles** pour les plugins non mesurés, sans fausse précision.
- ✅ Offrir à la fois un **indicateur général du coût CPU** et des **estimations par profil d'ordinateur** (processeur, fréquence d'échantillonnage, etc.).
- ✅ Les mesures personnelles peuvent enrichir les fiches ; la **récupération automatique des mesures CPU depuis LP** n'est **pas retenue pour le moment**.
- ⚠️ Ne pas assimiler somme de pourcentages CPU et fiabilité live : la répartition des charges et les chemins critiques peuvent compter davantage.

### 3.7 Préparation du raccordement avec la console d'accueil

- ✅ Produire une **synthèse de routing LP↔console** pour accélérer la configuration du matériel d'accueil.
- ✅ **Format tableau uniquement** ; **pas** de schéma graphique nécessaire pour cette synthèse.
- 🟡 **Contenu, ordre des colonnes, niveau de détail et présentation à redéfinir de zéro** : les premiers exemples proposés ne convenaient pas à l'utilisateur.
- 🟡 La gestion de plusieurs configurations de raccordement selon console ou interface est une piste utile, **non encore validée dans ses modalités**.
- ⚠️ Cette fiche de raccordement n'implique pas que PluginLib impose un patch musical ou une architecture de traitement.

---

## 4. PLC — Contrôle physique des plugins

### 4.1 Positionnement et indépendance matérielle

- ✅ PLC est **entièrement dédié au contrôle des plugins**, et non aux cues/ViewSets ou aux commandes générales LP.
- ✅ **Contrôleur MIDI agnostique** : le **Behringer X-Touch Mini** (actuellement en mode **MC/Mackie Control**) est l'équipement de test et d'utilisation actuel, **pas** la finalité du produit.
- 🎯 Séparer conceptuellement : **description des paramètres/fonctions du plugin**, **profil de contrôle du plugin**, **description et mapping du contrôleur**, **liaison à une instance LP**. Le détail de l'architecture demeure ouvert.
- ✅ Cues et ViewSets restent gérés séparément, par **Stream Deck** ou par la **console via MIDI**, selon les moyens disponibles.

### 4.2 Ciblage et activation des instances

- ✅ La **GUI ouverte, affichée et actuellement active** dans LP détermine la cible PLC. **Sélectionner un plugin dans la liste d'une chaîne ne suffit pas**.
- ✅ Lorsque plusieurs GUI sont affichées simultanément dans un ViewSet, PLC contrôle **uniquement celle qui est active**, déterminée par un clic sur son interface ou sa fenêtre.
- ✅ Le rappel du profil de contrôle est **automatique, immédiat et fluide**, sans action dans PLC.
- ✅ Lorsque plusieurs instances d'un même plugin existent, **seule l'instance active** reçoit les commandes ; ne jamais contrôler toutes les instances par inadvertance.
- ✅ Les modifications doivent être **visibles sur la GUI** que l'utilisateur regarde.
- ⚠️ Séparer le **changement automatique de cible/profil existant** de la **création ou reconfiguration des mappings**, qui nécessite une action volontaire et sécurisée.
- 🟡 Les moyens fiables d'identifier la GUI active, une instance unique et ses paramètres via LP doivent être vérifiés.

### 4.3 Création et gestion des profils de contrôle

- ✅ Un **profil de contrôle réutilisable par plugin**, partagé entre différentes sessions et instances.
- ✅ Création et modification possibles **depuis PluginLib et depuis PLC**, sur une bibliothèque cohérente de profils.
- 🎯 Une **proposition initiale de mapping intelligente et personnalisable**, proche autant que possible de la **disposition visuelle du plugin**, et priorisant les commandes les plus utiles lorsque le matériel est limité.
- ✅ Certains paramètres rares peuvent rester **uniquement à la souris**.
- ✅ **Plusieurs pages** par plugin, éventuellement organisées par bandes, modules ou fonctions ; liberté d'affiner l'organisation facilement.
- 🟡 Décider plus tard si les profils partent de gabarits par famille de traitement, de mappings spécifiques ou d'une combinaison adaptative.
- ✅ Les reconfigurations de profil/mapping sont **déclenchées manuellement**, avec **sauvegarde préalable** ; envisager un aperçu des changements avant validation.

### 4.4 Ergonomie actuelle du X-Touch Mini

- ✅ **8 encodeurs** réservés aux paramètres du plugin actif.
- ✅ **16 boutons inférieurs** réservés aux fonctions des plugins.
- ✅ **Bouton A : page précédente** ; **bouton B : page suivante** du profil du plugin actif.
- 🟡 Rôle des **poussoirs des encodeurs**, du **fader** et de certains retours visuels encore à définir.
- ⚠️ Vérifier la disponibilité et les messages réels de toutes ces commandes en mode **MC** ; ne pas supposer le fonctionnement des layers A/B de la même manière qu'en mode MIDI classique.
- ⛔ Abandonné : partager les 16 boutons entre un mode « Plugin » et un mode « LiveProfessor », réserver le bouton 16 à une bascule, ou utiliser A/B pour les cues.

### 4.5 Bandes et contrôles dynamiques

- ✅ Pour des plugins comme **Waves F6**, privilégier un profil avec **une page par bande** afin de disposer de nombreux paramètres.
- 🎯 Pour des EQ à nombre variable de bandes, comme **FabFilter Pro-Q 4**, générer/afficher les pages des **bandes effectivement présentes**, puis une page spéciale **« Nouvelle bande »**.
- ✅ La navigation A/B **saute les emplacements non utilisés** : pas de défilement de pages vides.
- 🟡 **Solution de repli** si le nombre de bandes ne peut pas être interrogé : préparer un nombre suffisant d'emplacements contrôlables (par exemple 15), sans garantie qu'ils seront tous accessibles par le plugin.
- 🎯 Pouvoir **créer une bande depuis la page spéciale**, après sélection des options pertinentes et validation explicite.
- 🎯 Pouvoir **supprimer une bande depuis PLC**, uniquement via **appui long puis confirmation explicite distincte**, avec annulation possible.
- ⚠️ Ces actions structurelles dépendent de ce que le plugin expose comme paramètres/commandes et de ce que LP permet de transmettre ; **aucune capacité universelle ne doit être présumée**.
- 🟡 Gérer la stabilité des identifiants de bandes si une bande intermédiaire est supprimée ou réordonnée : aucune commande ne doit cibler silencieusement une mauvaise bande.

---

## 5. Relations entre PluginLib, PLC et LiveProfessor

### 5.1 Principes communs

- ✅ **Approche hybride** : on peut préparer dans PluginLib et continuer à construire/modifier directement dans LiveProfessor.
- ✅ Les **profils PLC** existent indépendamment d'une session LP et sont réutilisables entre instances, mais l'exécution vise une **instance précise**.
- ✅ Distinguer : **données du catalogue**, **collection/licences**, **projets et architectures**, **configurations enregistrées**, **profils de contrôle**, **état courant de LP** et **routings vers le matériel**.
- ✅ Ne pas déclencher de changements structurels non sollicités ; privilégier **demande explicite → comparaison → sauvegarde → validation → application**.
- 🟡 Une même base partagée ou des services de données communs pourraient limiter les doublons entre applications, sans figer l'architecture de déploiement à ce stade.

### 5.2 LiveProfessor 2027 : dépendance externe importante

Le 17 novembre 2026, AudioStröm a indiqué travailler sur une **refonte majeure « LiveProfessor 2027 »** comprenant des modifications significatives de l'API OSC. Son développeur a proposé d'envisager le ciblage de cette version et a demandé davantage de détails sur le projet. Il a aussi signalé que, dans la version actuelle, les valeurs des paramètres devraient être envoyées lors des changements/rappels de snapshots, mais pas nécessairement à la sélection d'un plugin, sauf éventuellement selon l'option **« Only when selected »** des mappings.

Un email détaillant les besoins de PluginLib et PLC a été envoyé, en précisant le contexte de sonorisation live, le caractère provisoire des noms et le fait que le X-Touch Mini n'est qu'un premier contrôleur de référence. **Réponse technique détaillée en attente.**

**Questions à poser/vérifier en priorité :**

1. La nouvelle API notifie-t-elle l'activation d'une **GUI de plugin**, avec un **identifiant unique de l'instance** ?
2. Permet-elle d'énumérer les paramètres, leurs identifiants, noms et valeurs, puis de **contrôler une instance précise** et de recevoir le feedback après changements à la souris/snapshots ?
3. Permet-elle de **lire et modifier l'organisation des chaînes, plugins et routings**, y compris les sidechains ?
4. Quelles sont les contraintes de version, calendrier, stabilité, documentation et accès préliminaire ?

**Ne pas rendre toute l'application dépendante d'une API future non vérifiée.** Prévoir un découplage de l'intégration LP, avec capacités explicites et dégradations propres lorsque certaines fonctions ne sont pas disponibles.

---

## 6. Garde-fous produit et techniques

1. **Fiabilité live avant magie apparente** : un mapping vers la mauvaise instance, une modification silencieuse de routing ou une suppression accidentelle est inacceptable.
2. **Informations incertaines clairement signalées** : données manquantes ≠ valeurs nulles ; inconnue de latence ≠ zero latency.
3. **Aucune hypothèse sur les capacités d'automatisation LP** sans test ou documentation du développeur.
4. **Préserver les données personnelles et les configurations** : pas de retrait silencieux de licence, d'incident ou de profil ; séparer catalogue actif et historique utile.
5. **Évolutivité sans lourdeur** : l'application doit être plus rapide et simple à utiliser que les tâches qu'elle remplace.
6. **Pas de surconception** : éviter de détailler à l'excès les interactions mineures avant de valider les dépendances techniques structurantes.

---

## 7. Points ouverts à traiter progressivement

### 7.1 Priorité élevée (décisions structurantes)

- **Faisabilité LP / OSC :** résultat de l'échange AudioStröm, tests de sélection de GUI et d'identification d'instance, inventaire des commandes disponibles dans la version actuelle puis 2027.
- **Modèle d'architecture audio :** représentation des chaînes, ports, canaux, connexions et sidechains ; possibilité d'export et de comparaison sans ambiguïté.
- **Sauvegardes et synchronisation contrôlée :** granularité des modifications, résolution des conflits, garanties de restauration et fonctionnement quand la session LP diffère de la représentation PluginLib.
- **Profils PLC universels :** séparation paramètres/fonctions du plugin, mapping matériel et ciblage des instances ; retour de valeurs et comportements sûrs lors d'un changement de focus.
- **« Save All, Recall Partial » :** quelles données capturer, quels états de plugin sont réellement accessibles et comment éviter d'écraser les paramètres non souhaités.

### 7.2 À approfondir ensuite

- **Synthèse de routing console↔LP :** forme du tableau et informations réellement utiles en accueil ; anciens exemples rejetés.
- **Ergonomie détaillée de PLC** : retour visuel, poussoirs, fader, variations selon contrôleurs, comportement sans plugin actif, sans profil ou avec profils multiples.
- **Interface du concepteur** : organisation pratique de la vue globale et de la vue en chaîne, sélection, édition et représentation de la latence/CPU.
- **Fiabilité de la collecte des données** : pipeline d'enrichissement, sources officielles, visuels, versions, informations inconnues et correction des erreurs.
- **Licences et bundles** : formats d'import, portée de la synchronisation iLok, détection des droits effectifs, statuts d'abonnement.
- **Priorités de livraison** : distinguer un premier produit utile des objectifs plus avancés, puis planifier les tests de faisabilité.

### 7.3 Évolutions possibles, non promises

- Surveillance des versions de tous les plugins.
- Reconnaissance dynamique des structures internes de plugins complexes, notamment bandes et modules.
- Intégration plus profonde avec d'autres contrôleurs matériels et d'autres environnements, selon besoins constatés.

---

## 8. Décisions remplacées ou expressément non retenues

- ⛔ PLC comme outil de rappel des cues/ViewSets : ces opérations reviennent au Stream Deck ou à la console.
- ⛔ Bouton 16 du X-Touch comme bascule de modes, ou A/B comme commande de cues : remplacés par une affectation entièrement orientée plugins, avec A/B pour les pages.
- ⛔ Imposer une session LP type pour chaque groupe ou déduire son architecture d'un patch : chaque groupe commence généralement d'une structure libre.
- ⛔ Synchroniser automatiquement les **états sonores** et les **cues** lors de la comparaison PluginLib↔LP : la synchronisation convenue concerne la **structure** seulement.
- ⛔ Corriger automatiquement le routing sidechain ou la compensation des délais : **proposer**, sans appliquer.
- ⛔ Intégrer d'emblée les latences de l'interface/console au calcul des latences internes LP.
- ⛔ Une estimation CPU présentée comme mesure exacte quand la donnée est approximative.

---

## 9. Prochain cycle de travail recommandé

**Ne pas relancer immédiatement un questionnaire exhaustif.**

1. Faire relire cette version 0.1 et corriger les éventuels contresens.
2. Attendre/analyser la réponse technique d'AudioStröm ; valider en priorité la détection de l'instance active et les capacités d'édition structurelle de LP.
3. Faire un inventaire **distinct** du code déjà fonctionnel, partiellement développé ou non commencé, dans la discussion de développement ; ne pas l'inférer de ce document.
4. Prioriser un premier sous-ensemble de fonctionnalités réellement utile en live, sans renoncer à la vision globale.
5. Mettre à jour ce document par versions datées, avec un journal de décisions et leurs conséquences.

### Journal initial

- **2026-11-17 — v0.1 :** synthèse des décisions de conception prises dans la discussion dédiée, et séparation explicite entre besoins validés, ambitions et faisabilité technique.
