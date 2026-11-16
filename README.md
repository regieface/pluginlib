# PluginLib

Bibliothèque personnelle de plugins **mix & mastering** (pas d'instruments ni de synthés), consultable dans le navigateur, avec des données mises à jour automatiquement toutes les deux semaines.

Le catalogue couvre Windows, macOS et Linux. Par défaut, **Toutes les plateformes**
inclut aussi les compatibilités encore inconnues. Les produits abandonnés,
les anciennes versions remplacées et les sorties encore à venir restent masqués.
Les filtres permettent de choisir un système et de consulter les anciens produits.

Les familles, fabricants, plateformes, disponibilités, fonctions et critères
acceptent plusieurs choix. Cocher une case inclut ce choix ; le bouton **−**
l'exclut. Sans inclusion, tous les choix restent affichés sauf les exclus.
Les choix d'un même critère se combinent avec OU ; les critères différents se
combinent avec ET. Les pastilles sous les filtres permettent de retirer chaque
sélection ou exclusion. Réinitialiser rétablit toutes les plateformes et masque
Airwindows, les anciennes versions, produits abandonnés et sorties à venir.
Airwindows reste consultable en retirant son exclusion du filtre Fabricants.
Les critères et les nombres proposés s'adaptent aux autres filtres actifs.
Une famille Délai / Écho masque notamment Attaque et Technologie de compression.
Lors d'un changement de famille, un critère technique devenu sans objet est
retiré, avec un message explicite. Les choix actifs restent accessibles pour
être décochés même lorsqu'une combinaison ne donne plus de résultat. Dans un
même menu, les autres choix compatibles restent proposés pour ajouter un OU.

L'interface utilise un thème sombre avec des bordures contrastées et un relief
léger. Le cadre vert identifie les licences possédées ou abonnements actifs.
Le fond avec les initiales du fabricant n'apparaît que lorsqu'aucun visuel
n'est disponible ; il ne se superpose jamais à une image transparente.

## Comment ça marche

| Élément | Rôle |
|---|---|
| `index.html`, `app.js`, `styles.css` | L'application (site statique, hébergé par GitHub Pages) |
| `filters.mjs`, `multi-select.mjs` | Sélections multiples, exclusions et contrôles à cases à cocher |
| `coloration.mjs` | Sépare technologie et coloration sonore ; exige une preuve vérifiée pour la transparence |
| `data/plugins.json` | Le catalogue — **régénéré automatiquement**, ne pas éditer à la main |
| `data/meta.json` | Date de mise à jour, état de chaque source, libellés des filtres |
| `data/overrides.json` | **Tes corrections manuelles** (conservées à chaque mise à jour) |
| `sources/vendors.json` | La liste des constructeurs collectés |
| `sources/retailer-links.json` | Revendeurs et liens de repli vérifiés pour les prix |
| `scripts/update.mjs` | Le script de collecte (Node 22, aucune dépendance) |
| `scripts/retailer-prices.mjs` | Recherche les prix manquants chez les revendeurs référencés |
| `.github/workflows/update-data.yml` | Lance la collecte toutes les deux semaines (03:17 UTC) et publie le résultat |

La collecte a lieu un dimanche sur deux, avec pour ancrage le 15 novembre 2026
(puis le 29 novembre, le 13 décembre, etc.). GitHub Actions vérifie le calendrier
chaque dimanche et saute la collecte les semaines intermédiaires. Les pushs ne
déclenchent pas de collecte. Un lancement manuel reste disponible dans l’onglet Actions.

### D'où viennent les données

- **Fiches et visuels** : lus directement sur le site de chaque constructeur (API de boutique Shopify / WooCommerce, ou sitemap + balises de la page produit). Un lien n'est publié que si la page a répondu correctement lors de la collecte, sans rediriger vers l'accueil.
- **Latences** : tableau officiel Waves (<https://www.waves.com/support/tech-specs/plugin-latency>), fiches et manuels officiels des autres constructeurs. Une valeur non publiée reste vide.
- **Familles** : fonction principale explicite dans le nom ou la définition du produit, ou correction sourcée. Une description ambiguë laisse la fiche dans « Famille à vérifier » plutôt que de lui attribuer une famille arbitraire. Les preuves automatiques et les vérifications de sources restent distinguées.
- **Critères techniques** (FET, VCA, EQ dynamique, side-chain…) : chaque critère actif doit avoir une preuve dans le nom ou la description du produit précis, ou une vérification documentée dans `data/overrides.json`. Les mots des menus, catalogues masqués et suggestions ne servent pas de preuve. Les anciens critères non confirmés passent dans `unverifiedTags` et sont exclus des filtres.
- **Audit global** : `node scripts/audit-catalog.mjs` produit `data/quality-report.json` et `data/quality-report.md`, avec une file de vérification par fabricant. Il tourne aussi à chaque collecte programmée. Le rapport distingue preuves textuelles et vérifications manuelles ; il ne certifie pas l'intégralité des familles, prix et compatibilités.
- **Cohérence de toutes les fiches** : `node scripts/audit-integrity.mjs --cache /tmp/pluginlib-http --fetch-missing` contrôle les identités, familles, critères, latences, sources, statuts, systèmes, prix, visuels et types de fiches. `data/integrity-report.json` détaille les constats et distingue cache, requêtes actuelles, données mises à l'écart et vérifications restantes. Une source inaccessible ou une suspicion n'est pas une erreur confirmée. Ce contrôle tourne chaque quinzaine après la collecte.
- Une side-chain interne n'implique pas une entrée externe. Des lampes dans le chemin audio n'impliquent pas une réduction de gain Vari-Mu. Une fonction non confirmée ne devient pas une absence : une absence explicite est conservée séparément dans `featureEvidence`.
- **Coloration** : l'ancienne étiquette « Numérique / transparent » est supprimée. Numérique, clean, look-ahead, suréchantillonnage et faible aliasing ne prouvent pas la transparence sonore. Le filtre distingue « Transparent (documenté) », « Coloration / harmoniques » et « Modes neutres et colorés ». Les deux derniers ne sont jamais inclus implicitement dans le premier.
- La transparence est attribuée seulement après vérification d'une fiche ou d'un manuel officiel, avec une note précisant le comportement et une URL. Elle décrit une conception visant la neutralité, pas une mesure garantissant zéro distorsion à tous les réglages. Une simple promesse commerciale contredite par une coloration harmonique documentée ne suffit pas.
- Les descriptions mentionnant explicitement saturation, clipping ou génération d'harmoniques peuvent recevoir le critère de coloration automatiquement. Cela peut concerner un étage optionnel ; la présence d'un mode réellement neutre doit être vérifiée séparément. Une information absente reste non renseignée, sans être assimilée à transparente.
- Si une source tombe en panne lors d’une collecte, les données de la collecte précédente sont conservées et l'échec est indiqué en bas de l'application.
- Une collecte partielle conserve aussi les fiches antérieures et leurs identifiants. Une disparition d'un sitemap ou une erreur HTTP ne constitue pas une preuve d'abandon.

### Plateformes et disponibilité

Le filtre « Type de fiche » distingue effets/utilitaires, instruments, packs,
applications et modules. Les types hors effets sont exclus au départ, mais
restent consultables en retirant les exclusions ; aucune fiche ni licence n'est
supprimée. Les doublons explicitement confirmés sont regroupés à l'affichage,
avec reprise des anciens identifiants de collection, sans fusionner des versions différentes.

Les champs `platforms` et `catalogStatus` sont accompagnés de `platformEvidence`
et `statusEvidence` (URL officielle, extrait et date de vérification).
Les systèmes viennent des exigences publiées, des données structurées ou des
téléchargements explicitement proposés pour chaque produit. VST et AAX ne sont
pas interprétés comme une preuve de compatibilité avec un système.

- `commercial` : prix ou achat annoncé sur la fiche officielle.
- `free` : gratuité annoncée et téléchargement actuellement distribué par l'éditeur. Pour les catalogues dédiés, seules les entrées de la liste actuelle sont concernées. Cela ne garantit pas de futures mises à jour.
- `superseded` : version remplacée par un nouveau produit, avec un lien `replacedBy` vers son successeur lorsqu'il est identifié. Ce statut ne signifie pas que le support a cessé : certaines anciennes versions sont encore mises à jour.
- `upcoming` : produit annoncé mais pas encore disponible. Les annonces datées sont réévaluées après la date de sortie ; elles ne deviennent pas automatiquement une preuve de commercialisation.
- `beta` : préversion explicitement annoncée, sans l'assimiler à une version commerciale finale.
- `discontinued` : mention explicite d'abandon, d'arrêt du support ou rubrique « Legacy / Discontinued ». L'ancienneté seule ne suffit pas.
- `unknown` : informations insuffisantes. La fiche reste consultable, sans inventer de prix, de système ni de statut.

Les menus globaux sont retirés du texte d'analyse pour éviter d'attribuer à un
produit les caractéristiques d'un autre. Les extractions restent automatiques :
les corrections par produit dans `data/overrides.json` priment sur la collecte.
Les familles mono/stéréo ou les multiples formats ne sont pas comptés comme des
plugins supplémentaires. Le nombre de fiches ne mesure pas une couverture exhaustive du marché.
Les anciennes fiches conservent leur identifiant et leurs licences : posséder
l'ancienne version ne marque pas automatiquement le nouveau produit comme acquis.

### Prix, visuels et latences

Les cartes affichent séparément le **prix normal** et le **prix promotionnel**
lorsqu'ils sont publiés par le fabricant ou un revendeur référencé. La devise d'origine est conservée ;
aucune conversion, taxe ou réduction n'est estimée. Une date et un lien permettent
de vérifier le tarif. Les prix de versions ou éditions différentes peuvent être
indiqués « à partir de ». Un prix absent n'est pas remplacé par zéro.

L'éditeur reste prioritaire. Si son prix manque ou n'a pas pu être reconfirmé,
la collecte essaie **Thomann**, puis **Plugin Boutique**,
pour la même version et la même édition du plugin. La carte nomme le revendeur
et donne son lien et la date de vérification. Les upgrades, bundles, abonnements
et éditions scolaires ne sont pas assimilés à une licence complète.
Les liens produits validés sont enregistrés dans `sources/retailer-links.json`
et réutilisés directement lors des collectes suivantes. Pour Plugin Boutique,
l'annuaire des marques et les catalogues fabricants servent à découvrir ces
liens ; une fiche produit doit ensuite confirmer l'identité et le tarif.
Prix normal et promo sont toujours relevés chez le même vendeur.
Le « meilleur prix sur 30 jours » n'est pas un prix normal : si une promotion
est annoncée sans tarif normal identifiable, seul le champ Promo est renseigné.
En cas d'échec, le dernier prix connu et sa date sont conservés avec la mention
« Dernier tarif connu · à revérifier ». Cette mention apparaît aussi après
14 jours ou après une date d'expiration publiée. Une promotion est présentée
comme un relevé daté, sans garantie qu'elle reste disponible entre deux collectes.
Les correspondances non confirmées restent sans prix. Tous les liens de repli
connus sont revérifiés à chaque quinzaine. La découverte traite en plus
jusqu'à 200 fiches par collecte, en faisant tourner les fiches à vérifier, et
interrompt les recherches si le revendeur limite les accès, puis essaie le
revendeur suivant. Les pages d'annuaire et de catalogue sont partagées entre
les recherches d'une même collecte pour limiter le nombre de requêtes.

Les captures d'interface sont privilégiées aux images de panier, logos, portraits
et pochettes. Les plugins sans interface graphique propre, comme Airwindows,
restent identifiés par leur nom plutôt que par une illustration trompeuse.

L'enrichissement cherche les latences sur les fiches officielles de **tous les
fabricants**. Le compteur du haut compte une fois chaque fiche documentée.
Les valeurs en samples ou millisecondes restent associées aux modes et fréquences
publiés : aucune valeur à 44,1 kHz n'est extrapolée à 48 ou 96 kHz. Une option
zéro latence ne transforme pas tous les modes du plugin en zéro latence. Les
tampons de pilotes audio et le monitoring d'interfaces ne sont pas des latences
de plugin. Le tableau Waves reste prioritaire pour les produits qu'il documente.
Les modes documentés dans des manuels peuvent être ajoutés à `data/overrides.json`
avec `latencyInfo`, une URL de source et une date de vérification.

### Ta collection (« Les miens »)

Le menu « Ma licence » distingue licence perpétuelle, abonnement, ancien abonnement et démo. C'est enregistré dans ton navigateur ; utilise **Exporter / Importer** pour sauvegarder la collection ou la passer sur un autre ordinateur.

L'import conserve également les abonnements déclarés, les noms exacts des licences
et les licences encore sans fiche. « Mes abonnements » permet d'activer ou de
désactiver Waves Ultimate. Son périmètre vient de la liste officielle
`data/subscriptions.json`, mise à jour par `scripts/subscription-plans.mjs` chaque
quinzaine ; il n'attribue pas indistinctement toute la marque Waves. Les droits
de licence perpétuelle restent prioritaires. L'export v3 contient aussi les
statuts calculés pour les lecteurs du format v2.

Dans « Ma collection », les licences sans correspondance restent consultables
sous les cartes avec leur nom et leur édition iLok. `scripts/reconcile-ilok.py`
audite chaque ligne d'un CSV sans modifier la source, produit un relevé privé et
applique seulement les rapprochements exacts ou documentés avec `--apply`.
Le dossier `collection-privee/` reste exclu de Git.

## Corriger une fiche

Les présentations des cartes viennent de `data/descriptions-fr.json` : une
synthèse propre au produit, son URL officielle et l’empreinte de l’extrait utilisé.
Aucune définition générique n’est déduite de la famille du plugin. Les cartes
affichent quatre lignes, puis « Lire la suite », avec un lien vers l’éditeur.
`scripts/description-coverage.mjs` recense les textes manquants et les extraits
sources qui ont changé. `scripts/prepare-presentations.mjs` lit les pages mises
en cache sans remplacer les synthèses françaises par du texte anglais.

Le contrôle des 57 éditeurs des captures du 16 novembre se trouve dans
`data/vendor-coverage.md`. La présence d’une référence ne signifie pas que tout
le catalogue de l’éditeur a été vérifié.

Dans `data/overrides.json`, la clé est l'`id` du plugin (visible dans `data/plugins.json`) :

```json
{
  "waves--cla-76-compressor-limiter": { "category": "comp", "tags": ["techno:fet", "vitesse:rapide", "opt:sidechain"] },
  "slate-digital--un-produit-a-masquer": { "exclude": true },
  "acustica-audio--un-plugin": { "url": "https://…/la-bonne-fiche" }
}
```

Une fiche corrigée affiche « ✔ vérifié ».

## Ajouter un constructeur

Ajoute une ligne dans `sources/vendors.json`, puis lance l'action **Mise à jour des données** depuis l'onglet *Actions* (champ « vendor » pour ne tester que celui-là, ou plusieurs noms séparés par des virgules).
Les modes `sitemap`, `shopify` et `woocommerce` lisent les catalogues structurés.
Le mode `links` découvre les fiches depuis les pages `start` et doit avoir des
motifs `include` précis. Les modes `download-table`, `lsp`, `chow` et `airwindows`
traitent les catalogues officiels qui ne présentent pas de fiches standard.

## Lancer en local

```bash
node scripts/update.mjs            # collecte complète
ONLY_VENDOR=Waves node scripts/update.mjs
node scripts/enrich-catalog.mjs     # complète les métadonnées des fiches existantes
node scripts/free-products.mjs      # vérifie les listes gratuites officielles
node scripts/sync-free-products.mjs # ajoute les membres manquants de ces listes
node scripts/prepare-presentations.mjs # relève les présentations propres aux produits
node scripts/description-coverage.mjs # signale les textes français à compléter/revoir
node scripts/retailer-prices.mjs    # prix manquants, éditeur prioritaire
node scripts/review-coloration.mjs  # réapplique les preuves de coloration sans nouvelle collecte
node scripts/audit-catalog.mjs      # isole les critères sans preuve et produit le rapport global
node --test scripts/*.test.mjs
python -m http.server              # puis http://localhost:8000
```
