# PluginLib

Bibliothèque personnelle de plugins **mix & mastering** (pas d'instruments ni de synthés), consultable dans le navigateur, avec des données mises à jour automatiquement chaque nuit.

## Comment ça marche

| Élément | Rôle |
|---|---|
| `index.html`, `app.js`, `styles.css` | L'application (site statique, hébergé par GitHub Pages) |
| `data/plugins.json` | Le catalogue — **régénéré automatiquement**, ne pas éditer à la main |
| `data/meta.json` | Date de mise à jour, état de chaque source, libellés des filtres |
| `data/overrides.json` | **Tes corrections manuelles** (conservées à chaque mise à jour) |
| `sources/vendors.json` | La liste des constructeurs collectés |
| `scripts/update.mjs` | Le script de collecte (Node 22, aucune dépendance) |
| `.github/workflows/update-data.yml` | Lance la collecte chaque nuit (03:17 UTC) et publie le résultat |

### D'où viennent les données

- **Fiches et visuels** : lus directement sur le site de chaque constructeur (API de boutique Shopify / WooCommerce, ou sitemap + balises de la page produit). Un lien n'est publié que si la page a répondu correctement lors de la collecte, sans rediriger vers l'accueil.
- **Latences** : tableau officiel Waves (<https://www.waves.com/support/tech-specs/plugin-latency>). Les autres constructeurs ne publient pas de tableau équivalent : leur latence reste vide plutôt qu'estimée.
- **Catégories et critères** (FET, VCA, EQ dynamique, side-chain…) : déduits des mots employés par le constructeur. C'est automatique, donc imparfait → corrige via `data/overrides.json`.
- Si une source tombe en panne une nuit, les données de la veille sont conservées et l'échec est indiqué en bas de l'application.

### Ta collection (« Les miens »)

L'étoile sur chaque fiche marque un plugin comme possédé. C'est enregistré dans ton navigateur ; utilise **Exporter / Importer** pour la sauvegarder ou la passer sur un autre ordinateur.

## Corriger une fiche

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

Ajoute une ligne dans `sources/vendors.json` (`"mode": "auto"` suffit souvent), puis lance l'action **Mise à jour des données** depuis l'onglet *Actions* (champ « vendor » pour ne tester que celui-là).

## Lancer en local

```bash
node scripts/update.mjs            # collecte complète
ONLY_VENDOR=Waves node scripts/update.mjs
node --test scripts/parsers.test.mjs
python -m http.server              # puis http://localhost:8000
```
# pluginlib
