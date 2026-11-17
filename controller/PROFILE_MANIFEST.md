# Manifeste PluginLib ↔ Controller

`profile-manifest.json` relie une fiche du catalogue PluginLib à un ou plusieurs profils Controller sans recopier la fiche ni le contenu du profil. Il s’agit d’un contrat de données validé hors ligne. Le site le lit pour présenter un statut; Controller peut le résoudre explicitement avec `CollectionProfileLoader.load` (et `ControllerModel.loadCollectionConfiguration`), sans activer de transport.

PluginLib le charge désormais pour afficher un statut uniquement dans « Ma collection ». Cette vue reste fondée sur `collectionStatus` : seules une licence `owned` ou une appartenance `subscription` active sont éligibles. Le manifeste ne constitue jamais une preuve de possession. Un profil n’est présenté comme vérifié que si le profil et au moins une de ses variantes portent explicitement `verified`; sa simple présence produit « Profil non vérifié ». Quitter la collection ne supprime aucune donnée de profil.

## Format version 1

- `schemaVersion` versionne la structure du manifeste, indépendamment des profils.
- `links[].pluginId` reprend exactement l’identifiant de `data/plugins.json`.
- `profiles[].profileId` reprend exactement `id` dans le fichier désigné par `profilePath`.
- `profilePath` est relatif à `controller/` et doit rester dans `controller/Profiles/`.
- `status` vaut `draft` ou `verified`. `verified` signifie que la liaison décrite a été vérifiée; il ne certifie pas les variantes absentes.
- `variants` distingue les configurations effectivement connues par `format`, `channelLayout` et les informations de l’hôte. Plusieurs variantes peuvent référencer le même profil si celui-ci les couvre réellement.
- `metadataPath`, lorsqu’il existe, est relatif à `controller/Metadata/`.
- `unresolved` rend explicites les informations manquantes sous forme de couples `field`/`reason`; une absence n’est jamais interprétée comme une valeur par défaut.

Les champs supplémentaires sont autorisés afin de permettre une extension compatible. Une évolution qui change la signification ou les champs obligatoires doit incrémenter `schemaVersion`.

## Résolution

1. Chercher `pluginId` par égalité exacte dans `data/plugins.json`.
2. Pour chaque entrée de `profiles`, ouvrir `profilePath` et vérifier que son `id` est exactement `profileId`.
3. Sélectionner une variante uniquement par correspondance explicite avec le format, la disposition de canaux et l’hôte disponibles. Ne pas déduire une variante mono/stéréo du nom commercial du catalogue.
4. Considérer `draft` comme non validé pour un usage automatique. Une entrée `verified` peut garder des champs `unresolved` si ceux-ci ne remettent pas en cause la liaison décrite.

L’exemple F6 utilise les deux identifiants déjà présents : `waves--f6-floating-band-dynamic-eq` et `waves-f6`. Seuls Audio Unit mono, `F6 (m)` et LiveProfessor 2026.1.0 sont étayés par `Metadata/waves-f6-au.json`. La version du plugin, une révision propre au profil et la variante stéréo restent explicitement non résolues.

## Validation

```sh
python3 scripts/validate_controller_manifest.py
python3 -m unittest discover -s scripts -p 'validate_controller_manifest_test.py'
```

Le validateur utilise uniquement la bibliothèque standard Python et ne modifie aucun fichier. Il contrôle la version du schéma, l’unicité des références, l’existence des plugins et profils, la concordance des identifiants, les chemins autorisés, les statuts, les variantes et la forme des informations non résolues.


## Chargement Controller depuis Ma collection

L’appelant transmet `pluginId`, le résultat courant de `collectionStatus` (`owned` ou `subscription`) et un `ProfileVariantRequest`. Aucun inventaire Swift ni index du catalogue n’est créé. Les identifiants du catalogue restent contrôlés par le validateur hors ligne.

Le format, la disposition de canaux, l’application hôte et le nom de l’instance doivent être fournis explicitement, même si une seule variante est connue. `testedVersion` est un filtre exact facultatif. Aucune variante stéréo n’est déduite de F6 mono. Plusieurs correspondances ou un contexte incomplet produisent `ambiguousVariant`; aucune correspondance produit `variantUnavailable`.

Le résultat contient le `Profile` décodé et validé par le chargeur existant, la variante, les champs non résolus et le statut `verified` seulement si l’entrée et la variante le sont; sinon `draft` indique une configuration non vérifiée, sans autorisation d’usage automatique. Les erreurs distinguent aussi `outsideCollection`, `profileAbsent`, `manifestUnavailable` et `invalidReference` (schéma, chemin, fichier, identifiant ou métadonnées invalides). Les liens symboliques sortant des répertoires autorisés sont refusés.

Le manifeste est embarqué à la construction à côté de `Profiles/`. Avec un répertoire de profils personnalisé, il est recherché dans son parent. Son absence ne bloque pas le chargement historique par titres AX, y compris F6 et kHs. Cette API ne sélectionne pas de profil actif, ne lance pas LiveProfessor et n’active ni MIDI ni OSC. Une passerelle explicite par fichier est décrite ci-dessous.

## Demande locale version 1

```json
{
  "schemaVersion": 1,
  "pluginId": "waves--f6-floating-band-dynamic-eq",
  "licenseStatus": "owned",
  "variant": {
    "format": "AudioUnit",
    "channelLayout": "mono",
    "application": "LiveProfessor",
    "pluginName": "F6 (m)",
    "testedVersion": "2026.1.0"
  }
}
```

La version de demande est indépendante de celle du manifeste. `licenseStatus`
est nécessaire pour transmettre le résultat de `collectionStatus`; seuls `owned`
et `subscription` sont acceptés. Ce fichier local n’est pas une preuve de licence
et ne reflète pas les changements ultérieurs dans le navigateur.
Les quatre champs d’identité de variante sont obligatoires, `testedVersion` est
facultatif et exact. Aucune sélection mono/stéréo implicite n’est permise.

Le site propose une action par variante vérifiée dans Ma collection uniquement.
Controller importe explicitement le fichier depuis Options, valide et résout les
références locales, exige un résultat vérifié et affiche la configuration chargée.
L’import suspend le routage sans sélectionner de profil actif ni démarrer de
transport. La reconnaissance AX historique reste indépendante, notamment pour kHs
qui n’est pas proposé à l’export tant qu’aucune liaison vérifiée n’existe.
